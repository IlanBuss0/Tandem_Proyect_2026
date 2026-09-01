import axios from 'axios';
import AppError from '../../modules/errors/AppError.js';
import { envConfig } from '../../configs/env.config.js';

export default class PollinationsImageProvider {
  constructor({ breaker, request = axios.get } = {}) {
    this.breaker = breaker;
    this.request = request;
  }

  generateImage = async ({ prompt, referenceUrls = [] }) => {
    return await this.breaker.execute(() => this.generateImageWithRetries({ prompt, referenceUrls }));
  };

  generateImageWithRetries = async ({ prompt, referenceUrls = [] }) => {
    const prompts = Array.from(new Set([buildCompactPrompt(prompt), prompt].filter(Boolean)));
    const referenceUrl = referenceUrls.find(Boolean);

    let lastError = null;
    for (const currentPrompt of prompts) {
      for (const model of envConfig.pollinationsImageModels) {
        const params = new URLSearchParams({
          width: '1024',
          height: '1024',
          model,
          private: 'true',
          enhance: 'true',
          seed: String(Math.floor(Math.random() * 1_000_000_000)),
        });
        if (referenceUrl) params.set('image', referenceUrl);

        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(currentPrompt)}?${params.toString()}`;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const response = await this.request(url, {
              responseType: 'arraybuffer',
              timeout: envConfig.pollinationsTimeoutMs,
              headers: { Accept: 'image/png,image/jpeg,image/webp,*/*' },
            });
            const contentType = String(response.headers?.['content-type'] || '');
            if (contentType.includes('application/json')) {
              throw Object.assign(new Error(Buffer.from(response.data).toString('utf8')), { response });
            }
            return Buffer.from(response.data);
          } catch (error) {
            lastError = error;
            console.warn(`Pollinations ${model} attempt ${attempt} failed:`, getTechnicalErrorDetails(error));
            if (!isRetryablePollinationsError(error)) break;
          }
        }
      }
    }

    const providerError = getProviderError(lastError);
    const error = new AppError(`Pollinations AI no pudo generar la imagen (${providerError.status || 'sin estado'}): ${providerError.message}`, 502);
    error.cause = lastError;
    throw error;
  };
}

function cleanText(value, max) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function buildCompactPrompt(prompt) {
  return cleanText(prompt, 650)
    .replace(/\baugmentative and alternative communication\b/gi, 'AAC')
    .replace(/\btransparent-looking\b/gi, 'plain')
    .replace(/\s+/g, ' ');
}

function getProviderError(error) {
  const status = error?.response?.status;
  let message = error?.message || 'Error desconocido';
  const data = error?.response?.data;

  if (Buffer.isBuffer(data)) {
    try {
      const parsed = JSON.parse(data.toString('utf8'));
      message = parsed?.message || parsed?.error || message;
    } catch {
      message = data.toString('utf8').slice(0, 180) || message;
    }
  } else if (data && typeof data === 'object') {
    message = data.message || data.error || message;
  } else if (typeof data === 'string') {
    message = data.slice(0, 180);
  }

  return { status, message };
}

function getTechnicalErrorDetails(error) {
  return {
    timestamp: new Date().toISOString(),
    status: error?.response?.status || 'sin estado',
    code: error?.code || error?.name || 'Error',
  };
}

function isRetryablePollinationsError(error) {
  const providerError = getProviderError(error);
  return !providerError.status
    || providerError.status >= 500
    || /queue\s*full|timeout|timed?\s*out|network|socket|econn/i.test(providerError.message || '');
}
