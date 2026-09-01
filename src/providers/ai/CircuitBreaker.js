import CircuitBreakerError from './CircuitBreakerError.js';

export const CIRCUIT_BREAKER_STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

const NETWORK_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
]);

export function isDefaultProviderFailure(error) {
  const sourceError = error?.cause || error;
  const status = Number(sourceError?.response?.status);
  if (status === 429) return false;
  if (status >= 500 && status <= 599) return true;
  if (NETWORK_ERROR_CODES.has(sourceError?.code)) return true;
  return /timeout|timed?\s*out|socket|network|econnreset|econnrefused/i.test(sourceError?.message || '');
}

export default class CircuitBreaker {
  constructor({
    name,
    failureThreshold = 5,
    openTimeoutMs = 30000,
    isFailure = isDefaultProviderFailure,
    now = () => Date.now(),
    logger = console,
  }) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.openTimeoutMs = openTimeoutMs;
    this.isFailure = isFailure;
    this.now = now;
    this.logger = logger;
    this.state = CIRCUIT_BREAKER_STATES.CLOSED;
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.halfOpenProbeInFlight = false;
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      nextRetryAt: this.openedAt !== null ? this.openedAt + this.openTimeoutMs : null,
    };
  }

  async execute(operation) {
    this.refreshOpenState();

    if (this.state === CIRCUIT_BREAKER_STATES.OPEN) {
      throw new CircuitBreakerError(`Circuit breaker ${this.name} is OPEN`, this.getState());
    }

    if (this.state === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
      if (this.halfOpenProbeInFlight) {
        throw new CircuitBreakerError(`Circuit breaker ${this.name} is HALF_OPEN`, this.getState());
      }
      this.halfOpenProbeInFlight = true;
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    } finally {
      this.halfOpenProbeInFlight = false;
    }
  }

  refreshOpenState() {
    if (
      this.state === CIRCUIT_BREAKER_STATES.OPEN
      && this.openedAt !== null
      && this.now() - this.openedAt >= this.openTimeoutMs
    ) {
      this.transitionTo(CIRCUIT_BREAKER_STATES.HALF_OPEN);
    }
  }

  recordSuccess() {
    if (this.state !== CIRCUIT_BREAKER_STATES.CLOSED) {
      this.transitionTo(CIRCUIT_BREAKER_STATES.CLOSED);
    }
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  recordFailure(error) {
    const countsAsProviderFailure = this.isFailure(error);

    if (this.state === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
      if (countsAsProviderFailure) this.open();
      else this.transitionTo(CIRCUIT_BREAKER_STATES.CLOSED);
      return;
    }

    if (!countsAsProviderFailure) return;

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) this.open();
  }

  open() {
    this.openedAt = this.now();
    this.transitionTo(CIRCUIT_BREAKER_STATES.OPEN);
  }

  transitionTo(nextState) {
    if (this.state === nextState) return;
    const previous = this.state;
    this.state = nextState;
    if (nextState === CIRCUIT_BREAKER_STATES.CLOSED) {
      this.consecutiveFailures = 0;
      this.openedAt = null;
    }
    this.logger?.warn?.(`[CircuitBreaker:${this.name}] ${previous} -> ${nextState} timestamp=${new Date(this.now()).toISOString()}`);
  }
}
