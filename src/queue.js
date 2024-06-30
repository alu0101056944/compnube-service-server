/**
 * Universidad de La Laguna
 * Computación en la nube
 * @author Marcos Barrios
 * @since 26_06_2024
 *
 */

'use strict';

const EventEmitter = require('events');

module.exports = class Queue {
  /** @private @constant */
  #queue = undefined
  #idToIsWaitingFiles = undefined
  #eventEmitter = undefined;
  #maxSimultaneousServices = undefined;
  #currentlyExecutingServices = undefined;

  constructor() {
    this.#queue = [];
    this.#idToIsWaitingFiles = Set;
    this.#maxSimultaneousServices = 2;
    this.#currentlyExecutingServices = 0;
    this.#eventEmitter = new EventEmitter();
    this.#eventEmitter.on('executionFinish', (id) => {

      // reduce executing counter or give next execution
      if (this.#currentlyExecutingServices === this.#maxSimultaneousServices) {
        if (this.#queue.length > 0) {
          this.#queue.unshift().execute(() => {
            this.#eventEmitter.emit('executionFinish', id);
          });
        } else {
          --this.#currentlyExecutingServices;
        }
      } else if (this.#currentlyExecutingServices > this.#maxSimultaneousServices) {
        // in this case there probably was discoorddination between processes.
        // There may be two requests finding less than maximum at the same time.
        if (this.#queue.length > 0) {
          this.#queue.unshift().execute(() => {
            this.#eventEmitter.emit('executionFinish', id);
          });
        }
        --this.#currentlyExecutingServices;
      } else {
        --this.#currentlyExecutingServices;
      }
    });
  }

  start(id) {
    console.log('Marked as ready the service run ' + id);
    const finishedCallback = (id) => {
      this.#eventEmitter.emit('executionFinish', id);
    }
    const job = this.#idToIsWaitingFiles[id];

    if (this.#currentlyExecutingServices < this.#maxSimultaneousServices) {
      job.execute(finishedCallback);
      ++this.#currentlyExecutingServices;
    } else {
      this.#queue.push(job);
    }
    delete this.#idToIsWaitingFiles[id];
  }

  get(id) {
    for (let i = 0; i < this.#queue.length; i++) {

    }
  }

  addToWaitingForFiles(job, id) {
    console.log('Registered service run as waiting for files: ' + id);
    this.#idToIsWaitingFiles[id] = job; 
  }
}
