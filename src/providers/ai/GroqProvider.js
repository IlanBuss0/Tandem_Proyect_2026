import axios from 'axios';
import { envConfig } from '../../configs/env.config.js';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default class GroqProvider {
  constructor({ breaker, request = axios.post } = {}) {
    this.breaker = breaker;
    this.request = request;
  }

  chatCompletion = async ({ model, messages, temperature, responseFormat, timeoutMs = 30000 }) => {
    return await this.breaker.execute(async () => {
      const body = {
        model,
        messages,
        temperature,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      };

      return await this.request(GROQ_CHAT_URL, body, {
        headers: { Authorization: `Bearer ${envConfig.groqApiKey}`, 'Content-Type': 'application/json' },
        timeout: timeoutMs,
      });
    });
  };
}
