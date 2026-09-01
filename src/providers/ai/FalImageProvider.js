import axios from 'axios';
import AppError from '../../modules/errors/AppError.js';
import { envConfig } from '../../configs/env.config.js';

export default class FalImageProvider {
  constructor({ breaker, request = axios.post } = {}) {
    this.breaker = breaker;
    this.request = request;
  }

  generateImage = async ({ model, prompt, referenceUrls = [] }) => {
    if (!envConfig.falKey) throw new AppError('La generacion IA no esta configurada.', 503);

    const imageUrls = referenceUrls.filter(Boolean);
    const input = {
      prompt,
      image_size: 'square_hd',
      num_images: 1,
      output_format: 'png',
      enable_safety_checker: true,
      safety_tolerance: '1',
      ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
    };

    let response;
    try {
      response = await this.breaker.execute(() => this.request(`https://fal.run/${model}`, input, {
        headers: { Authorization: `Key ${envConfig.falKey}`, 'Content-Type': 'application/json' },
        timeout: envConfig.falRequestTimeoutMs,
      }));
    } catch (error) {
      const providerError = getProviderError(error);
      if (providerError.status === 401 || providerError.status === 403) {
        throw new AppError(`fal.ai rechazo la solicitud (${providerError.status}). Se intentara el proveedor gratuito.`, 502);
      }
      throw new AppError(`fal.ai no pudo generar la imagen (${providerError.status || 'sin estado'}): ${providerError.message}`, 502);
    }

    if (response.data?.has_nsfw_concepts?.some(Boolean)) {
      throw new AppError('La imagen fue bloqueada por el control de seguridad.', 422);
    }
    const image = response.data?.images?.[0];
    if (!image?.url) throw new Error('fal.ai no devolvio una imagen.');
    return { image, requestId: response.headers?.['x-fal-request-id'] || null, seed: response.data?.seed ?? null };
  };
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
