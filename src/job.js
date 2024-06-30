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
  #childProcess = undefined;
  #timesCalledForTerminate = undefined;

  /**
   * 
   * @param {object} info Contiene la configuración del servicio, la id y
   *    los argumentos
   */
  constructor(info) {
    this.#info = info;
    this.#childProcess = null;
    this.#executionStatus = 'Job created, execution pending';
    this.#timesCalledForTerminate = 0;

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
    this.#sendUpdate();

    const EXECUTABLE_PATH =
        `serviceFiles/${this.#info.id}/${this.#info.config.binaryName}`;
    try {
      await chmod(EXECUTABLE_PATH, '755');
    } catch (error) {
      console.error('Could not give the binary file executable permissions.');
    }

    const options = {
      cwd: config.serviceFilesPath + this.#info.id + '/'
    };

    console.log('Execution of ' + this.#info.id + ' started.');
    this.#childProcess = exec(`bash -c "${this.#command}"`, options,
        (error, stdout, stderr) => {
          if (error) {
            console.error(`Error: ${error.message}`);
            this.#executionStatus = 'execution failed';
            this.#sendUpdate();
            finishedCallback(this.#info.id);
            return;
          }
          if (stderr) {
            console.error(`stderr: ${stderr}`);
            this.#executionStatus = 'execution failed';
            this.#sendUpdate();
            finishedCallback(this.#info.id);
            return;
          }
          console.log(`stdout: \n${stdout}`);
          this.#executionStatus = 'Finished execution sucessfully';
          this.#sendUpdate();
          finishedCallback(this.#info.id);
        });
  }

  async kill() {
    ++this.#timesCalledForTerminate;
    return new Promise((resolve, reject) => {
      if (!this.#executionStatus === 'Executing' || !this.#childProcess) {
        reject(new Error('No job process to kill or not in execution.'));
        return;
      }
      if (this.#timesCalledForTerminate > 1) {
        reject(new Error('Already sent request to kill process ' + this.#info.id + '.'));
        return;
      }
  
      this.#childProcess.on('close', (code, signal) => {
        console.log(`Killed service run ${this.#info.id} with code ${code} ` +
            `and signal ${signal}.`);
        this.#executionStatus = 'Terminated by user';
        this.#sendUpdate()
        resolve();
      });
  
      this.#childProcess.kill();
    });
  }

  // auxiliar method
  async #sendUpdate() {
    fetch(`http://${this.#info.config.originAddress}/pushupdate/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ executionState: this.#executionStatus,
        id: this.#info.id }),
    });
  }

  getExecutionStatus() {
    return this.#executionStatus;
  }
}
