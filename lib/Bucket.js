'use strict';

const consts = require('./consts');

module.exports = Bucket;

class Bucket {
  constructor() {
    this.failed = 0;
    this.successful = 0;
    this.total = 0;
    this.timedOut = 0;
  }

  /* Calculate % of a given field */
  percent(field) {
    if (!this[field]) {
      throw new Error(consts.INVALID_BUCKET_PROP);
    }

    if (!this.total) {
      return 0;
    }

    return this[field] / this.total;
  }

  /* Register a failure */
  failure() {
    this.total++;
    this.failed++;
  }

  /* Register a success */
  successful() {
    this.total++;
    this.successful++;
  }

  /* Register a timeout */
  timeout() {
    this.total++;
    this.failed++;
  }
}