import { envConfig } from '../../configs/env.config.js';
import CircuitBreaker from './CircuitBreaker.js';
import GroqProvider from './GroqProvider.js';
import FalImageProvider from './FalImageProvider.js';
import PollinationsImageProvider from './PollinationsImageProvider.js';

const breakerDefaults = {
  failureThreshold: envConfig.aiCircuitBreakerFailureThreshold,
  openTimeoutMs: envConfig.aiCircuitBreakerOpenTimeoutMs,
};

export const groqCircuitBreaker = new CircuitBreaker({ name: 'groq-text', ...breakerDefaults });
export const falImageCircuitBreaker = new CircuitBreaker({ name: 'fal-images', ...breakerDefaults });
export const pollinationsImageCircuitBreaker = new CircuitBreaker({ name: 'pollinations-images', ...breakerDefaults });

export const groqProvider = new GroqProvider({ breaker: groqCircuitBreaker });
export const falImageProvider = new FalImageProvider({ breaker: falImageCircuitBreaker });
export const pollinationsImageProvider = new PollinationsImageProvider({ breaker: pollinationsImageCircuitBreaker });
