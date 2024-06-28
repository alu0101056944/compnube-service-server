/**
 * Universidad de La Laguna
 * Computación en la nube
 * @author Marcos Barrios
 * @since 26_06_2024
 *
 */

'use strict';

const { chmod } = require('fs/promises');

const config = require('./config.js');

const { exec } = require('child_process');

module.exports = class Job {
  /** @constant @private **/ 
  #info = undefined;
  #command = undefined;
  
  /** @private  */
  #executionStatus = undefined;

  /**
   * 
   * @param {object} info Contiene la configuración del servicio, la id y
   *    los argumentos
   */
  constructor(info) {
    this.#info = info;
    this.#executionStatus = 'execution pending';

    let cli = this.#info.config.cli;
    for (const cliArgName of Object.getOwnPropertyNames(this.#info.cliArgs)) {
      cli = cli.replace(`<${cliArgName}>`, this.#info.cliArgs[cliArgName]);
    }
    cli = cli.replace('{binary}', './{binary} ' +
          Object.values(this.#info.args).join(' ') + ' ');
    cli = cli.replace('{binary}', this.#info.config.binaryName);
    this.#command = cli;

    console.log('Command to execute: ' + this.#command);
  }

  /**
   * 
   * @param {function} finishedCallback Used by the job queue to know when a
   *    service has finished execution.
   */
  async execute(finishedCallback) {
    this.#executionStatus = 'Executing';

    const EXECUTABLE_PATH =
        `serviceFiles/${this.#info.id}/${this.#info.config.binaryName}`;
    try {
      await chmod(EXECUTABLE_PATH, '755');
    } catch (error) {
      console.error('Could not give the binary file executable permissions.');
    }

    const sendUpdate = () => {
      fetch(`http://${this.#info.config.originAddress}/pushupdate/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ executionState: this.#executionStatus,
          id: this.#info.id }),
      });
    }

    const options = {
      cwd: config.serviceFilesPath + this.#info.id + '/output/'
    };

    exec(`bash -c "${this.#command}"`, options, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        this.#executionStatus = 'execution failed';
        sendUpdate();
        finishedCallback(this.#info.id);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
        this.#executionStatus = 'execution failed';
        sendUpdate();
        finishedCallback(this.#info.id);
        return;
      }
      console.log(`stdout: \n${stdout}`);
      this.#executionStatus = 'Finished execution sucessfully';
      sendUpdate();
      finishedCallback(this.#info.id);
    });
  }

  getExecutionStatus() {
    return this.#executionStatus;
  }
}
