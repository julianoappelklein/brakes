"use strict";

import consts from "./consts";

export interface CummulativeStats {
  countTotal: number;
  countTotalDeriv: number;
  countFailure: number;
  countFailureDeriv: number;
  countSuccess: number;
  countSuccessDeriv: number;
  countShortCircuited: number;
  countShortCircuitedDeriv: number;
  countTimeout: number;
  countTimeoutDeriv: number;
  latencyMean: number;
  percentiles: { [key: number]: number };
}

export default class Bucket {
  failed: number;
  successful: number;
  total: number;
  shortCircuited: number;
  timedOut: number;
  requestTimes: Array<number>;
  latencyMean: number;
  percentiles: { [key: string]: number };

  cummulativeStats: CummulativeStats;

  constructor(cumStats: CummulativeStats) {
    this.failed = 0;
    this.successful = 0;
    this.total = 0;
    this.shortCircuited = 0;
    this.timedOut = 0;
    this.requestTimes = [];
    this.cummulativeStats = cumStats;
  }

  /* Calculate % of a given field */
  percent(field: string) {
    // eslint-disable-next-line no-prototype-builtins
    if (!Object(this).hasOwnProperty(field)) {
      throw new Error(consts.INVALID_BUCKET_PROP);
    }

    if (!this.total) {
      return 0;
    }

    return this[field] / this.total;
  }

  /* Register a failure */
  failure(runTime: number) {
    this.total++;
    this.cummulativeStats.countTotal++;
    this.cummulativeStats.countTotalDeriv++;
    this.failed++;
    this.cummulativeStats.countFailure++;
    this.cummulativeStats.countFailureDeriv++;
    this.requestTimes.push(runTime);
  }

  /* Register a success */
  success(runTime: number) {
    this.total++;
    this.cummulativeStats.countTotal++;
    this.cummulativeStats.countTotalDeriv++;
    this.successful++;
    this.cummulativeStats.countSuccess++;
    this.cummulativeStats.countSuccessDeriv++;
    this.requestTimes.push(runTime);
  }

  /* Register a short circuit */
  shortCircuit() {
    this.shortCircuited++;
    this.cummulativeStats.countShortCircuited++;
    this.cummulativeStats.countShortCircuitedDeriv++;
  }

  /* Register a timeout */
  timeout(runTime: number) {
    this.total++;
    this.cummulativeStats.countTotal++;
    this.cummulativeStats.countTotalDeriv++;
    this.timedOut++;
    this.cummulativeStats.countTimeout++;
    this.cummulativeStats.countTimeoutDeriv++;
    this.requestTimes.push(runTime);
  }
}
