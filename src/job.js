/**
 * Universidad de La Laguna
 * Computación en la nube
 * @author Marcos Barrios
 * @since 26_06_2024
 *
 */

'use strict';

const { chmod } = require('fs/promises');
const { performance } = require('perf_hooks');

const config = require('./config.js');

const { spawn } = require('child_process');

const kill = require('tree-kill');
const pidusage = require('pidusage');

module.exports = class Job {
  /** @constant @private **/ 
  #info = undefined;
  #command = undefined;
  #updateQueue = undefined;
  
  /** @private  */
  #executionStatus = undefined;
  #childProcess = undefined;
  #timesCalledForTerminate = undefined;
  #stdout = undefined;
  #isSendingUpdate = undefined;

  #cpuUsages = undefined;
  #startTime = undefined;
  #endTime = undefined;
  #execTime = undefined;
  #maxCpuLoad = undefined;
  #avgCpuLoad = undefined;

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
    this.#stdout = '';
    this.#updateQueue = [];
    this.#isSendingUpdate = false;
    this.#cpuUsages = [];

    let cli = this.#info.config.cli;
    for (const cliArgName of Object.getOwnPropertyNames(this.#info.cliArgs)) {
      cli = cli.replace(`<${cliArgName}>`, this.#info.cliArgs[cliArgName]);
    }
    cli = cli.replace('{binary}', './{binary} ' +
          Object.values(this.#info.args).join(' ') + ' ');
    cli = cli.replace('{binary}', this.#info.config.binaryName);
    this.#command = cli;

    console.log('Command to execute for ' + this.#info.id + ': ' + this.#command);
  }

  /**
   * 
   * @param {function} finishedCallback Used by the job queue to know when a
   *    service has finished execution.
   */
  async execute(finishedCallback) {
    this.#executionStatus = 'Executing';
    this.#processUpdateIntoUpdateQueue();

    this.#startTime = performance.now();

    const EXECUTABLE_PATH =
        `serviceFiles/${this.#info.id}/${this.#info.config.binaryName}`;
    try {
      await chmod(EXECUTABLE_PATH, '755');
    } catch (error) {
      console.error('Could not give the binary file executable permissions.');
    }

    const options = {
      cwd: config.serviceFilesPath + this.#info.id + '/',
      shell: true
    };

    console.log('Execution of ' + this.#info.id + ' started.');

    this.#childProcess = spawn('bash', ['-c', `'${this.#command}'`], options);

    // every second push cpu usage or stop checking if process is off.
    const cpuMonitorInterval = setInterval(async () => {
      try {
        console.log('Measuring CPU load');
        const usage = await pidusage(this.#childProcess.pid);
        this.#cpuUsages.push(usage.cpu);
      } catch (error) {
        console.log('Finished measuring CPU load or there was an error: ' + error);
        clearInterval(cpuMonitorInterval);
      }
    }, 1000);

    this.#childProcess.stdout.on('data', (data) => {
      this.#stdout += data.toString();
      this.#processUpdateIntoUpdateQueue();
    });

    this.#childProcess.stderr.on('data', (data) => {
      this.#stdout += data.toString();
      this.#processUpdateIntoUpdateQueue();
    });

    this.#childProcess.on('exit', (code, signal) => {
      console.log(`Exited service run ${this.#info.id} with code ${code} ` +
          `and signal ${signal}.`);
    });

    this.#childProcess.on('close', (code) => {
      clearInterval(cpuMonitorInterval);
      this.#endTime = performance.now();

      this.#execTime = (this.#endTime - this.#startTime) / 1000; // seconds
      this.#maxCpuLoad = Math.max(...this.#cpuUsages).toFixed(2);
      this.#avgCpuLoad = 
          (this.#cpuUsages.reduce((sum, value) => {
            return sum + value;
          }, 0)
          / this.#cpuUsages.length).toFixed(2);

      if (code !== 0) {
        console.error(`execution failed with code ${code}`);
        this.#executionStatus = 'execution failed';
      } else {
        console.log('Finished execution successfully');
        this.#executionStatus = 'Finished execution successfully';
      }
      console.log(this.#stdout);
      this.#processUpdateIntoUpdateQueue();
      finishedCallback(this.#info.id);
    });
  }

  async kill() {
    ++this.#timesCalledForTerminate;
    return new Promise((resolve, reject) => {
      if (this.#executionStatus !== 'Executing' || !this.#childProcess) {
        reject(new Error('No job process to kill or not in execution.'));
        return;
      }
      if (this.#timesCalledForTerminate > 1) {
        reject(new Error('Already sent request to kill process ' + this.#info.id + '.'));
        return;
      }
  
      this.#childProcess.on('close', (code, signal) => {
        console.log(`Closed service run ${this.#info.id} with code ${code} ` +
            `and signal ${signal}.`);
        this.#executionStatus = 'Terminated by user';
        this.#processUpdateIntoUpdateQueue();
        resolve();
      });
  
      try {
        kill(this.#childProcess.pid);
      } catch (error) {
        if (error.code === 'ESRCH') {
          console.log(`Job ${this.#info.id} (Process ` +
              `${-this.#childProcess.pid}) has already terminated.`);
          resolve();
        } else {
          reject(error);
        }
      }
    });
  }

  // This is called when not all the required input files have been sucessfuly
  // sent.
  async abort() {
    if (this.#childProcess) {
      // If the process has started, kill it
      try {
        await this.kill();
      } catch (error) {
        console.error('Error killing ' + this.#info.id + ' during abort:',
            error);
      }
    }
    this.#executionStatus = 'execution failed';
    await this.#sendUpdate();
  }

  #processUpdateIntoUpdateQueue() {
    this.#updateQueue.push({
      executionState: this.#executionStatus,
      id: this.#info.id,
      stdout: this.#stdout,
      maxCpuLoad: this.#maxCpuLoad ?? null,
      avgCpuLoad: this.#avgCpuLoad ?? null,
      execTime: this.#execTime ?? null,
    });
    this.#processUpdateQueue();
  }

  async #processUpdateQueue() {
    if (this.#isSendingUpdate || this.#updateQueue.length === 0) {
      return;
    }

    this.#isSendingUpdate = true;

    while (this.#updateQueue.length > 0) {
      try {
        await this.#sendUpdate();
      } catch (error) {
        console.error('Failed to send update for ' + this.#info.id +
            ': ', error);
        break;
      }
    }

    this.#isSendingUpdate = false;

    // Check if more updates were queued while we were sending
    if (this.#updateQueue.length > 0) {
      this.#processUpdateQueue();
    }
  }

  // auxiliar method
  async #sendUpdate() {
    await fetch(`http://${this.#info.config.originAddress}/pushupdate/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(this.#updateQueue.shift()),
    });
  }

  getExecutionStatus() {
    return this.#executionStatus;
  }
}
