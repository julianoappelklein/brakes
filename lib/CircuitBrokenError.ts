import consts from './consts';

export default class CircuitBrokenError extends Error {
  
  totals: any;

  constructor(name: string, totals: any, threshold: number) {
    super();

    let prefix = '';

    if (name) {
      prefix = `[Breaker: ${name}] `;
    }

    this.message = `${prefix}${consts.CIRCUIT_OPENED} - The percentage of failed requests (${Math.floor((1 - totals.successful / totals.total) * 100)}%) is greater than the threshold specified (${threshold * 100}%)`;
    this.totals = totals;
    this.name = name;
  }
}