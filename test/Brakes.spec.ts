"use strict";

import { describe, it, afterEach } from "mocha";
import { expect } from 'chai';
import Brakes from "../lib/Brakes";
import Circuit from "../lib/Circuit";
import globalStats from "../lib/globalStats";

import sinon from "sinon";
import TimeOutError from "../lib/TimeOutError";
import CircuitBrokenError from "../lib/CircuitBrokenError";
import EventEmitter from "events";

let brake: any;

const defaultOptions = {
  bucketSpan: 1000,
  bucketNum: 60,
  name: "defaultBrake",
  group: "defaultBrakeGroup",
  registerGlobal: true,
  circuitDuration: 30000,
  statInterval: 1200,
  waitThreshold: 100,
  threshold: 0.5,
  timeout: 15000,
  healthCheckInterval: 5000,
  healthCheck: undefined,
  fallback: undefined,
  isFunction: false,
  isPromise: false,
  modifyError: true,
};

const modifyError = function modifyError() {
  throw new Error("Not found");
};

const noop = function noop(foo, err, cb) {
  if (typeof err === "function") {
    cb = err;
    err = null;
  }
  cb(err ? new Error(err) : null, foo);
};
const nopr = function nopr(foo, err) {
  return new Promise((resolve, reject) => {
    if (err) {
      reject(new Error(err));
    } else {
      resolve(foo);
    }
  });
};
const slowpr = function slowpr(foo) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(foo);
    }, 50);
  });
};
const fbpr = function fallback(foo, err) {
  return new Promise((resolve) => {
    resolve(foo || err);
  });
};
const hc = function healthCheck(foo, err) {
  return new Promise((resolve) => {
    resolve(foo || err);
  });
};
describe("Brakes Class", () => {
  afterEach(() => {
    if (brake instanceof Brakes) {
      brake.destroy();
      brake = undefined;
    }
  });
  it("Should be an instance of EventEmitter", () => {
    brake = new Brakes(noop);
    expect(brake).to.be.instanceof(EventEmitter);
  });
  it("Should be instantiated with default options", () => {
    brake = new Brakes(noop);
    // const snapshotSpy = sinon.spy(brake._stats, 'startSnapshots');
    // const statsSpy = sinon.spy(brake, '_startStatsCheck');
    // expect(snapshotSpy.calledOnce).to.equal(true);
    // expect(statsSpy.calledOnce).to.equal(true);
    // expect(brake._stats).to.be.instanceof(Stats);
    expect(brake._opts).to.deep.equal(defaultOptions);
  });
  it("Should accept no function with opts", () => {
    brake = new Brakes({
      name: "foo",
    });
    expect(brake._mainCircuit).to.equal(undefined);
    expect(brake._opts.name).to.equal("foo");
    try {
      brake.fallback();
    } catch (e) {
      expect(e).to.be.an("error");
    }
    return brake.exec("test").then(null, (err) => {
      expect(err).to.be.an("error");
    });
  });
  it("Should promisify the service func", () => {
    brake = new Brakes(noop);
    return brake.exec("test").then((result) => {
      expect(result).to.equal("test");
    });
  });
  it("Should promisify and reject service func", () => {
    brake = new Brakes(noop);
    return brake.exec(null, "err").then(null, (err) => {
      expect(err).to.be.instanceof(Error);
      expect(err.message).to.equal("[Breaker: defaultBrake] err");
    });
  });
  it("Should not prefix error messages", () => {
    brake = new Brakes(modifyError, { modifyError: false });
    return brake.exec(null).then(null, (err) => {
      expect(err.message).to.equal("Not found");
    });
  });

  it("Should accept a promise", () => {
    brake = new Brakes(nopr);
    return brake.exec("test").then((result) => {
      expect(result).to.equal("test");
    });
  });
  it("Should reject a promise", () => {
    brake = new Brakes(nopr);
    return brake.exec(null, "err").then(null, (err) => {
      expect(err).to.be.instanceof(Error);
      expect(err.message).to.equal("[Breaker: defaultBrake] err");
    });
  });
  it("Throw an error if not passed a function", () => {
    expect(() => {
      brake = new (Brakes as any)();
      brake.test();
    }).to.throw();
  });
  it("Should be instantiated with a name", () => {
    const overrides = {
      name: "allYourNameAreBelongToUs",
    };
    brake = new Brakes(noop, overrides);
    expect(brake.name).to.deep.equal(overrides.name);
  });
  it("Should be instantiated with a group", () => {
    const overrides = {
      group: "allYourGroupAreBelongToUs",
    };
    brake = new Brakes(noop, overrides);
    expect(brake.group).to.deep.equal(overrides.group);
  });
  it("Should be instantiated with override options", () => {
    const overrides = {
      bucketSpan: 10001,
      bucketNum: 601,
      circuitDuration: 300001,
      statInterval: 1,
      registerGlobal: false,
      name: "PUT:/path",
      group: "fakeGroup",
      waitThreshold: 1000,
      threshold: 0.3,
      timeout: 100,
      healthCheckInterval: 1000,
      healthCheck: () => Promise.resolve(),
      fallback: () => Promise.resolve(),
      isFunction: false,
      isPromise: false,
      modifyError: true,
    };
    brake = new Brakes(noop, overrides);
    expect(brake._opts).to.deep.equal(overrides);
  });
  it("Should Resolve a service call and trigger event", () => {
    brake = new Brakes(nopr);
    const spy = sinon.spy(() => {});
    brake.on("success", spy);
    return brake.exec("foo").then((result) => {
      expect(result).to.equal("foo");
      expect(spy.calledOnce).to.equal(true);
    });
  });
  it("Should Reject a service call and trigger event", () => {
    brake = new Brakes(noop);
    const spy = sinon.spy(() => {});
    brake.on("failure", spy);
    return brake.exec(null, "err").then(null, (err) => {
      expect(err).to.be.instanceof(Error);
      expect(err.message).to.equal("[Breaker: defaultBrake] err");
      expect(spy.calledOnce).to.equal(true);
    });
  });
  it("Should timeout a service call and trigger event", () => {
    brake = new Brakes(slowpr, {
      timeout: 1,
    });
    const spy = sinon.spy(() => {});
    brake.on("timeout", spy);
    return brake.exec(null, "err").then(null, (err) => {
      expect(err).to.be.instanceof(TimeOutError);
      expect(spy.calledOnce).to.equal(true);
    });
  });
  it("Should auto reject if circuit is broken", () => {
    brake = new Brakes(nopr);
    brake._circuitOpen = true;
    return brake.exec(null, "err").then(null, (err) => {
      expect(err).to.be.instanceof(CircuitBrokenError);
    });
  });
  it("Should call fallback if circuit is broken", () => {
    brake = new Brakes(nopr);
    brake.fallback(fbpr);
    brake._circuitOpen = true;
    return brake.exec("test").then((result) => {
      expect(result).to.equal("test");
    });
  });
  it("Fallback should cascade fail", () => {
    brake = new Brakes(nopr);
    brake.fallback(noop);
    return brake.exec(null, "err").then(null, (err) => {
      expect(err).to.be.instanceof(Error);
      expect(err.message).to.equal("err");
    });
  });
  it("Fallback should succeed", () => {
    brake = new Brakes(nopr);
    brake.fallback(fbpr);
    return brake.exec(null, "thisShouldFailFirstCall").then((result) => {
      expect(result).to.equal("thisShouldFailFirstCall");
    });
  });
  it("Should accept health check & fallback function from options", () => {
    brake = new Brakes(nopr, {
      healthCheck: hc,
      fallback: fbpr,
    });
    expect(brake._healthCheck).to.equal(hc);
    expect(brake._mainCircuit._fallback).to.equal(fbpr);
  });
  it("Should accept a health check function that is async", () => {
    brake = new Brakes(nopr, {
      healthCheck: noop,
    });
    expect(brake._healthCheck("foo").then).to.not.equal(undefined);
  });
  it("_setHealthInterval should close", (done) => {
    const clock = sinon.useFakeTimers();
    brake = new Brakes(nopr, {
      healthCheck: hc,
      healthCheckInterval: 15,
    });
    const statsResetSpy = sinon.spy(brake._stats, "reset");
    const closeSpy = sinon.spy(brake, "_close");
    // check normal behavior
    brake._circuitOpen = true;
    brake._setHealthInterval();

    brake.on("circuitClosed", () => {
      expect(statsResetSpy.calledOnce).to.equal(true);
      expect(closeSpy.calledOnce).to.equal(true);
      clearInterval(brake._healthInterval);
      done();
    });

    clock.tick(15);
    clock.restore();
  });
  it("_setHealthInterval should emit error", (done) => {
    brake = new Brakes(nopr, {
      healthCheck: nopr.bind(null, null, "thisisanerror"),
      healthCheckInterval: 5,
    });

    const eventSpy = sinon.spy(() => {});
    brake.on("healthCheckFailed", eventSpy);

    // check normal behavior
    brake._circuitOpen = true;
    brake._setHealthInterval();
    brake.once("healthCheckFailed", () => {
      expect(eventSpy.called).to.equal(true);
      brake._close();
      clearInterval(brake._healthInterval);
      done();
    });
  });
  it("_setHealthInterval should do nothing if interval is already set", () => {
    brake = new Brakes(nopr, {
      healthCheck: nopr.bind(null, null, "thisisanerror"),
      healthCheckInterval: 0,
    });
    brake._healthInterval = "foo";
    brake._setHealthInterval();
    expect(brake._healthInterval).to.equal("foo");
  });
  it("_setHealthInterval should clearInterval, if circuit is opened", (done) => {
    brake = new Brakes(nopr, {
      healthCheck: hc,
      healthCheckInterval: 0,
    });
    brake._circuitOpen = false;
    brake._setHealthInterval();
    setTimeout(() => {
      expect(brake._healthInterval).to.equal(undefined);
      done();
    }, 3);
  });
  it("_open should open", () => {
    const clock = sinon.useFakeTimers();
    brake = new Brakes(nopr, {
      circuitDuration: 5,
    });

    const statsResetSpy = sinon.spy(brake._stats, "reset");
    const openSpy = sinon.spy(brake, "_close");
    const eventSpy = sinon.spy(() => {});
    brake.on("circuitOpen", eventSpy);

    // test if check is made properly
    brake._circuitOpen = true;
    brake._open();
    expect(eventSpy.calledOnce).to.equal(false);

    // test actual opening
    brake._circuitOpen = false;
    brake._open();

    expect(brake._circuitGeneration).to.equal(2);
    expect(brake._circuitOpen).to.equal(true);
    expect(eventSpy.calledOnce).to.equal(true);

    clock.tick(6);
    expect(statsResetSpy.calledOnce).to.equal(true);
    expect(openSpy.calledOnce).to.equal(true);
    clock.restore();
  });
  it("_open should start healthCheckInterval", () => {
    brake = new Brakes(nopr, {
      circuitDuration: 5,
      healthCheck: hc,
    });

    const hcSpy = sinon.spy(brake, "_setHealthInterval");

    // test actual opening
    brake._circuitOpen = false;
    brake._open();

    expect(brake._circuitOpen).to.equal(true);
    expect(hcSpy.calledOnce).to.equal(true);
  });
  it("_close should close", () => {
    brake = new Brakes(nopr);
    brake._circuitOpened = true;
    const eventSpy = sinon.spy(() => {});
    brake.on("circuitClosed", eventSpy);
    brake._close();
    expect(brake._circuitOpen).to.equal(false);
    expect(eventSpy.calledOnce).to.equal(true);
  });
  it("_snapshotHandler should transform stats object and emit", (done) => {
    brake = new Brakes(nopr, {
      name: "brake1",
      group: "brakeGroup1",
      registerGlobal: false,
    });
    const eventSpy = sinon.spy(() => {});
    brake.on("snapshot", eventSpy);
    brake._snapshotHandler({
      foo: "bar",
    });
    setTimeout(() => {
      expect(eventSpy.calledOnce).to.equal(true);
      const statsObj = eventSpy.firstCall.args[0];
      expect(statsObj.name).to.equal("brake1");
      expect(statsObj.group).to.equal("brakeGroup1");
      expect(statsObj.time).to.be.a("number");
      expect(statsObj.threshold).to.equal(defaultOptions.threshold);
      expect(statsObj.circuitDuration).to.equal(defaultOptions.circuitDuration);
      expect(statsObj.stats).to.deep.equal({
        foo: "bar",
      });
      done();
    }, 5);
  });
  it("destroy() should remove all references", () => {
    brake = new Brakes(nopr);

    // first test that we are handling all appropriate events
    const expectedEvents = ["success", "timeout", "failure", "snapshot"];
    const actualEvents = Object.keys(brake._events);
    expect(actualEvents).to.have.members(expectedEvents);
    expect(Object.keys(brake._events).length).to.equal(expectedEvents.length);

    const _globalStats = globalStats as any;

    const deregisterStub = sinon.stub(_globalStats, "deregister");
    const removeEventStub = sinon
      .stub(brake, "removeAllListeners")
      .callsFake(() => true);
    brake.destroy();
    expect(deregisterStub.calledOnce).to.equal(true);
    expect(removeEventStub.callCount).to.equal(actualEvents.length);
    brake.removeAllListeners.restore();
    _globalStats.deregister.restore();
  });
  it("getGlobalStats should return instance of globalStats", () => {
    brake = new Brakes(nopr);
    expect(brake.getGlobalStats()).to.equal(globalStats);
    expect(Brakes.getGlobalStats()).to.equal(globalStats);
  });
  it("_failureHandler should not register a stats failure if generations do not match", () => {
    brake = new Brakes(nopr);
    sinon.stub(brake._stats, "failure");
    brake._circuitGeneration = 20;
    brake._failureHandler(100, 19);
    expect(brake._stats.failure.callCount).to.equal(0);
    brake._stats.failure.restore();
  });
  it("_timeoutHandler should not register a stats timeout if generations do not match", () => {
    brake = new Brakes(nopr);
    sinon.stub(brake._stats, "timeout");
    brake._circuitGeneration = 20;
    brake._timeoutHandler(100, 19);
    expect(brake._stats.timeout.callCount).to.equal(0);
    brake._stats.timeout.restore();
  });
  it("_checkStats should not check when threshold isn't met", () => {
    brake = new Brakes(nopr);
    const spy = sinon.spy(brake, "_close");
    brake._checkStats({
      total: 50,
    });
    expect(spy.calledOnce).to.equal(false);
  });
  it("_checkStats should not check when total is 0", () => {
    brake = new Brakes(nopr);
    brake._checkingStatus = true;
    const spy = sinon.spy(brake, "_open");
    brake._checkStats({
      total: 0,
    });
    expect(spy.calledOnce).to.equal(false);
  });
  it("_checkStats should not check when circuit is broken is 0", () => {
    brake = new Brakes(nopr);
    brake._checkingStatus = true;
    brake._closed = true;
    const spy = sinon.spy(brake, "_open");
    brake._checkStats({
      total: 1,
    });
    expect(spy.calledOnce).to.equal(false);
  });
  it("isOpen should return whether or not circuit is open", () => {
    brake = new Brakes(nopr);
    brake._circuitOpen = true;
    expect(brake.isOpen()).to.equal(true);
    brake._circuitOpen = false;
    expect(brake.isOpen()).to.equal(false);
  });
  it("_checkStats should check and not close", () => {
    brake = new Brakes(nopr);
    const spy = sinon.spy(brake, "_open");
    brake._checkStats({
      successful: 450,
      total: 500,
    });
    expect(spy.calledOnce).to.equal(false);
  });
  it("_checkStats should check and close", () => {
    brake = new Brakes(nopr);
    brake._checkingStatus = true;
    const spy = sinon.spy(brake, "_open");
    brake._checkStats({
      successful: 1,
      total: 200,
    });
    expect(spy.calledOnce).to.equal(true);
  });
  it("Should be able to create Sub Circuit", () => {
    brake = new Brakes(noop);
    const circuit = brake.subCircuit(noop);
    expect(circuit).to.be.instanceof(Circuit);
  });
});
