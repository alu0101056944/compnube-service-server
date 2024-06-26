/**
 * Universidad de La Laguna
 * Computación en la nube
 * @author Marcos Barrios
 * @since 26_06_2024
 *
 */

'use strict';

module.exports =  class Queue {
  /** @private @constant */
  #queue = undefined
  #latestJob = undefined

  constructor() {
    this.#queue = [];
    this.#latestJob = null;
  }

  add(job) {
    this.#queue.push(job);
  }

  next() {
    if (this.#queue.length > 0) {
      const job = this.#queue.unshift();
      this.#latestJob = job;
      job.execute();
      return job;
    } else {
      return null;
    }
  }
}
