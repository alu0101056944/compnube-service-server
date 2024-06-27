/**
 * Universidad de La Laguna
 * Computación en la nube
 * @author Marcos Barrios
 * @since 26_06_2024
 *
 */

'use strict';

const { writeFileSync } = require('fs');

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
    cli = cli.replace('{program}', './{program} ' +
          Object.values(this.#info.args).join(' ') + ' ');
    cli = cli.replace('{program}', this.#info.config.binaryName);
    this.#command = cli;
  }

  /**
   * 
   * @param {function} finishedCallback Used by the job queue to know when a
   *    service has finished execution.
   */
  async execute(finishedCallback) {
    this.#executionStatus = 'Executing';

    // for temporarily testing the downloading stuff from the client.
    writeFileSync(`${config.serviceFilesPath}${this.#info.id}/output/test.txt`,
        'xyzz');
    await fetch(`http://${this.#info.config.originAddress}/pushupdate/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ executionState: 'Finished execution sucessfully',
        id: this.#info.id }),
    });
    finishedCallback(this.#info.id);

    // function sendUpdate() {
    //   fetch(`http://${this.#info.config.originAddress}/pushupdate/`, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json'
    //     },
    //     body: JSON.stringify({ executionState: this.#executionStatus,
    //       id: this.#info.id }),
    //   });
    // }

    // const options = {
    //   cwd: config.serviceFilesPath + this.#info.id + '/'
    // };

    // exec(`bash -c "${this.#command}"`, options, (error, stdout, stderr) => {
    //   if (error) {
    //     console.error(`Error: ${error.message}`);
    //     this.#executionStatus = 'execution failed';
    //     sendUpdate();
    //     this.#next();
    //     return;
    //   }
    //   if (stderr) {
    //     console.error(`stderr: ${stderr}`);
    //     this.#executionStatus = 'execution failed';
    //     sendUpdate();
    //     this.#next();
    //     return;
    //   }
    //   console.log(`stdout: ${stdout}`);
    //   this.#executionStatus = 'Finished execution sucessfully';
    //   sendUpdate();
    //   this.#next();
    // });
  }

  getExecutionStatus() {
    return this.#executionStatus;
  }
}
