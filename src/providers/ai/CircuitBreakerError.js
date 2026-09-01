export default class CircuitBreakerError extends Error {
  constructor(message, state) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.state = state;
    this.isCircuitBreakerOpen = true;
  }
}
