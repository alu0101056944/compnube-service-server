/**
 * Universidad de La Laguna
 * Computación en la nube
 * @author Marcos Barrios
 * @since 26_06_2024
 *
 */

'use strict';

const { exec } = require('child_process');

module.exports = class Job {
  /** @constant @private **/ 
  #info = undefined;
  #command = undefined;
  #next = undefined;
  
  /** @private  */
  #executionStatus = undefined;

  /**
   * 
   * @param {object} info Contiene la configuración del servicio, la id y
   *    los argumentos
   * @param {function} next what to call when the queue should move to the
   *    next job.
   */
  constructor(info, next) {
    this.#info = info;
    this.#executionStatus = 'pending';
    this.#next = next;

    let cli = this.#info.config.cli;
    for (const cliArgName of Object.getOwnPropertyNames(this.#info.cliArgs)) {
      cli = cli.replace(`<${cliArgName}>`, this.#info.cliArgs[cliArgName]);
    }
    cli = cli.replace('{program}', './{program} ' +
          Object.values(this.#info.args).join(' ') + ' ');
    cli = cli.replace('{program}', this.#info.config.binaryName);
    this.#command = cli;
  }

  execute() {
    this.#executionStatus = 'in progress';

    function sendUpdate() {
      fetch(`http://${this.#info.config.originIP}:8080/pushupdate/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ executionState: this.#executionStatus,
          id: this.#info.id }),
      });
    }

    exec(`bash -c "${this.#command}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        this.#executionStatus = 'execution failed';
        sendUpdate();
        this.#next();
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
        this.#executionStatus = 'execution failed';
        sendUpdate();
        this.#next();
        return;
      }
      console.log(`stdout: ${stdout}`);
      this.#executionStatus = 'Finished execution sucessfully';
      sendUpdate();
      this.#next();
    });
  }

  getExecutionStatus() {
    return this.#executionStatus;
  }
}
