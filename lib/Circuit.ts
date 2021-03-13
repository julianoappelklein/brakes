"use strict";

import { EventEmitter } from "events";
import { promisifyIfFunction } from "./utils";
import Brakes, { BrakesOptions } from "./Brakes";

import TimeOutError from "./TimeOutError";
import CircuitBrokenError from "./CircuitBrokenError";
import consts from "./consts";

// export interface CircuitOptions {
//   isFailure: (err: Error | null) => boolean;
//   isPromise?: boolean;
//   isFunction?: boolean;
//   timeout?: number;
// }

const defaultOptions: BrakesOptions = {
  isFailure: () => true,
};

/**
 * Class that can sit on top of a Brakes. It's basically just a pair of primary and fallback Promises you can put on
 * top of a Brake that monitors a common Service (eg: ).
 */
export default class Circuit extends EventEmitter {
  _brakes: Brakes;
  _this: any;
  _opts: BrakesOptions & { this?: any };
  _serviceCall: Function;
  _fallback: Function;

  constructor(brakes: Brakes);
  constructor(brakes: Brakes, main: Function);
  constructor(brakes: Brakes, main: Function, fallback: Function);
  constructor(brakes: Brakes, main: Function, options?: BrakesOptions);
  constructor(
    brakes: Brakes,
    main: Function,
    fallback: Function,
    options?: BrakesOptions
  );
  constructor(
    brakes: Brakes,
    main?: Function,
    fallback?: any,
    options?: BrakesOptions
  ) {
    super();

    if (!(brakes instanceof EventEmitter)) {
      throw new Error(consts.NO_BRAKES);
    }
    this._brakes = brakes;

    if (!main || typeof main !== "function") {
      throw new Error(consts.NO_FUNCTION);
    } else if (fallback) {
      if (typeof fallback !== "function") {
        if (options) {
          throw new Error(consts.NO_FUNCTION);
        }
        options = fallback;
        fallback = undefined;
      }
    }
    this._opts = Object.assign({}, defaultOptions, options);
    this._this = this._opts.this || this;

    this._serviceCall = promisifyIfFunction(
      main,
      this._opts.isPromise,
      this._opts.isFunction
    );

    if (fallback) {
      this.fallback(fallback, this._opts.isPromise, this._opts.isFunction);
    }
  }

  exec() {
    this._brakes.emit("exec");

    // Save circuit generation to scope so we can compare it
    // to the current generation when a request fails.
    // This prevents failures from bleeding between circuit generations.
    const execGeneration = this._brakes._circuitGeneration;

    if (this._brakes._circuitOpen) {
      this._brakes._stats.shortCircuit();
      if (this._fallback) {
        return this._fallback.apply(this, arguments);
      } else if (this._brakes._fallback) {
        return this._brakes._fallback.apply(this, arguments);
      }
      return Promise.reject(
        new CircuitBrokenError(
          this._brakes.name,
          this._brakes._stats._totals,
          this._brakes._opts.threshold
        )
      );
    }

    const startTime = Date.now();

    // we use _execPromise() wrapper on the service call promise
    // to allow us to more easily hook in stats reporting
    return this._execPromise
      .apply(this, arguments)
      .tap(() => this._brakes.emit("success", Date.now() - startTime))
      .catch((err: Error | null) => {
        const endTime = Date.now() - startTime;

        // trigger hook listeners
        if (err instanceof TimeOutError) {
          this._brakes.emit("timeout", endTime, err, execGeneration);
        } else if (this._opts.isFailure(err)) {
          this._brakes.emit("failure", endTime, err, execGeneration);
        }
        // if fallback exists, call it upon failure
        // there are no listeners or stats collection for
        // the fallback function. The function is fire-and-forget
        // as far as `Brakes` is concerned
        if (this._fallback) {
          return this._fallback.apply(this, arguments);
        } else if (this._brakes._fallback) {
          return this._brakes._fallback.apply(this, arguments);
        }

        if (
          err &&
          err.message &&
          this._brakes.name &&
          this._brakes._opts.modifyError
        ) {
          err.message = `[Breaker: ${this._brakes.name}] ${err.message}`;
        }

        return Promise.reject(err);
      });
  }

  /*
   Execute main service call
   */
  _execPromise() {
    return new Promise((resolve, reject) => {
      // start timeout timer
      const timeoutTimer = setTimeout(() => {
        reject(new TimeOutError(consts.TIMEOUT));
      }, this._opts.timeout || this._brakes._opts.timeout);

      this._serviceCall
        .apply(this._this, arguments)
        .then((result) => {
          clearTimeout(timeoutTimer);
          resolve(result);
        })
        .catch((err: Error) => {
          clearTimeout(timeoutTimer);
          reject(err);
        });

      timeoutTimer.unref();
    });
  }

  fallback(func: Function, isPromise: boolean, isFunction: boolean) {
    this._fallback = promisifyIfFunction(func, isPromise, isFunction);
    return this._fallback;
  }
}

module.exports = Circuit;
