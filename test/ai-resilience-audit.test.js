import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import AppError from '../src/modules/errors/AppError.js';
import AiReportService from '../src/services/AiReportService.js';
import AiPictogramService from '../src/services/AiPictogramService.js';
import { simplifyToLecturaFacilAsync } from '../src/modules/pictograms/lectura-facil.js';
import { extractConceptsAsync } from '../src/modules/pictograms/concept-extraction.js';
import { translatePendingLabelsAsync } from '../src/services/PictogramTranslationService.js';
import { envConfig } from '../src/configs/env.config.js';
import BD from '../src/db/BD.js';
import { cacheService } from '../src/services/CacheService.js';
import { groqProvider } from '../src/providers/ai/aiProviders.js';
import CircuitBreaker, { CIRCUIT_BREAKER_STATES } from '../src/providers/ai/CircuitBreaker.js';
import GroqProvider from '../src/providers/ai/GroqProvider.js';
import FalImageProvider from '../src/providers/ai/FalImageProvider.js';
import PollinationsImageProvider from '../src/providers/ai/PollinationsImageProvider.js';
import CircuitBreakerError from '../src/providers/ai/CircuitBreakerError.js';

function withEnvConfig(key, value, fn) {
  return async () => {
    const previous = envConfig[key];
    envConfig[key] = value;
    try {
      return await fn();
    } finally {
      envConfig[key] = previous;
    }
  };
}

async function withGroqStub(stub, fn) {
  const previous = groqProvider.chatCompletion;
  groqProvider.chatCompletion = stub;
  try {
    return await fn();
  } finally {
    groqProvider.chatCompletion = previous;
  }
}

function groqResponse(content) {
  return { data: { choices: [{ message: { content } }] } };
}

function providerError(status, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { response: { status, data: { error: { message } } } });
}

function timeoutError() {
  return Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
}

test('Auditoria Groq: Lectura Facil cae al fallback cuando el breaker esta OPEN', withEnvConfig('groqApiKey', 'test-groq-key', async () => {
  let calls = 0;
  await withGroqStub(async () => {
    calls += 1;
    throw new CircuitBreakerError('groq open', { state: CIRCUIT_BREAKER_STATES.OPEN });
  }, async () => {
    const startedAt = Date.now();
    const result = await simplifyToLecturaFacilAsync('Hola. Como estas?');

    assert.equal(calls, 1);
    assert.equal(result.usedGroq, false);
    assert.equal(result.degraded, true);
    assert.deepEqual(result.sentences, ['Hola.', 'Como estas?']);
    assert.ok(Date.now() - startedAt < 250, 'el fallback debe ser inmediato con el breaker OPEN');
  });
}));

test('Auditoria Groq: Concept Extraction usa heuristico ante timeout/500/503', withEnvConfig('groqApiKey', 'test-groq-key', async () => {
  for (const error of [timeoutError(), providerError(500), providerError(503)]) {
    await withGroqStub(async () => { throw error; }, async () => {
      const result = await extractConceptsAsync(['Lavarse las manos']);

      assert.equal(result.usedGroq, true);
      assert.equal(result.degraded, true);
      assert.deepEqual(result.concepts[0], ['lavarse manos', 'lavarse manos', 'manos'].filter((item, index, arr) => arr.indexOf(item) === index));
    });
  }
}));

test('Auditoria Groq: AiReportService devuelve error controlado sin inventar contenido', withEnvConfig('groqApiKey', 'test-groq-key', async () => {
  await withGroqStub(async () => { throw providerError(500); }, async () => {
    const service = new AiReportService();

    await assert.rejects(
      () => service.generatePatientSummaryAsync({ pacienteNombre: 'Juan', nivelApoyoNombre: null, sesiones: [] }),
      (error) => error instanceof AppError
        && error.statusCode === 502
        && /No se pudo generar/.test(error.message),
    );
  });
}));

test('Auditoria Groq: 429 diario conserva cambio de modelo y no abre circuito', withEnvConfig('groqApiKey', 'test-groq-key', async () => {
  const previousQuery = BD.query;
  const previousTransaction = BD.transaction;
  const previousDelByPattern = cacheService.delByPattern;
  const models = [];
  let updated = 0;

  BD.query = async () => [{
    id: 1,
    origen_id: 'apple',
    titulo: 'apple',
    etiquetas: [],
    metadata: {},
  }];
  BD.transaction = async (callback) => callback({
    query: async () => {
      updated += 1;
      return { rowCount: 1 };
    },
  });
  cacheService.delByPattern = async () => {};

  await withGroqStub(async ({ model }) => {
    models.push(model);
    if (models.length === 1) throw providerError(429, 'rate limit reached: TPD per day');
    return groqResponse(JSON.stringify({ traducciones: ['manzana'] }));
  }, async () => {
    try {
      const result = await translatePendingLabelsAsync({ limit: 1, log: () => {} });

      assert.deepEqual(models, ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);
      assert.equal(result.translated, 1);
      assert.equal(result.failedBatches, 0);
      assert.equal(updated, 1);
    } finally {
      BD.query = previousQuery;
      BD.transaction = previousTransaction;
      cacheService.delByPattern = previousDelByPattern;
    }
  });
}));

test('Auditoria Groq: 429 por minuto conserva retry acotado', withEnvConfig('groqApiKey', 'test-groq-key', async () => {
  const calls = [];
  await withGroqStub(async ({ model }) => {
    calls.push({ model, at: Date.now() });
    if (calls.length === 1) throw providerError(429, 'rate limit reached: RPM');
    return groqResponse(JSON.stringify({ conceptos: [['lavarse las manos']] }));
  }, async () => {
    const result = await extractConceptsAsync(['Lavarse las manos']);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].model, 'openai/gpt-oss-20b');
    assert.equal(calls[1].model, 'openai/gpt-oss-20b');
    assert.ok(calls[1].at - calls[0].at >= 14000, 'el retry por minuto debe esperar antes de reintentar');
    assert.equal(result.degraded, false);
    assert.deepEqual(result.concepts, [['lavarse las manos']]);
  });
}));

test('Auditoria providers: 401 de Groq no abre breaker', async () => {
  const breaker = new CircuitBreaker({ name: 'groq-text', failureThreshold: 1, logger: { warn: () => {} } });
  const provider = new GroqProvider({
    breaker,
    request: async () => { throw providerError(401); },
  });

  await assert.rejects(() => provider.chatCompletion({ model: 'x', messages: [], temperature: 0 }));

  assert.equal(breaker.getState().state, CIRCUIT_BREAKER_STATES.CLOSED);
  assert.equal(breaker.getState().consecutiveFailures, 0);
});

test('Auditoria providers: Fal OPEN evita request HTTP y el service usa Pollinations', withEnvConfig('falKey', 'test-fal-key', async () => {
  const service = new AiPictogramService();
  let falCalls = 0;
  let pollinationsCalls = 0;
  service.falImageProvider = {
    generateImage: async () => {
      falCalls += 1;
      throw new CircuitBreakerError('fal open', { state: CIRCUIT_BREAKER_STATES.OPEN });
    },
  };
  service.pollinationsImageProvider = {
    generateImage: async () => {
      pollinationsCalls += 1;
      return await createTestImageBuffer();
    },
  };

  const result = await service.createImageBufferAsync({
    model: 'fal-ai/flux/schnell',
    prompt: 'prompt sintetico',
    referenceUrls: [],
    name: 'agua',
    description: 'tomar agua',
  });

  assert.equal(falCalls, 1);
  assert.equal(pollinationsCalls, 1);
  assert.ok(Buffer.isBuffer(result.imageBuffer));
}));

test('Auditoria providers: Fal 503 cuenta como fallo y abre su breaker sin afectar Pollinations', withEnvConfig('falKey', 'test-fal-key', async () => {
  const falBreaker = new CircuitBreaker({ name: 'fal-images', failureThreshold: 1, logger: { warn: () => {} } });
  const pollinationsBreaker = new CircuitBreaker({ name: 'pollinations-images', failureThreshold: 1, logger: { warn: () => {} } });
  const fal = new FalImageProvider({
    breaker: falBreaker,
    request: async () => { throw providerError(503); },
  });
  const pollinations = new PollinationsImageProvider({
    breaker: pollinationsBreaker,
    request: async () => ({ headers: { 'content-type': 'image/png' }, data: await createTestImageBuffer() }),
  });

  await assert.rejects(() => fal.generateImage({ model: 'fal-ai/flux/schnell', prompt: 'x' }));
  const image = await pollinations.generateImage({ prompt: 'x' });

  assert.equal(falBreaker.getState().state, CIRCUIT_BREAKER_STATES.OPEN);
  assert.equal(pollinationsBreaker.getState().state, CIRCUIT_BREAKER_STATES.CLOSED);
  assert.ok(Buffer.isBuffer(image));
}));

test('Auditoria providers: Pollinations timeout/503 terminan en fallback local', withEnvConfig('falKey', null, async () => {
  for (const error of [timeoutError(), providerError(503)]) {
    const service = new AiPictogramService();
    let pollinationsCalls = 0;
    service.pollinationsImageProvider = {
      generateImage: async () => {
        pollinationsCalls += 1;
        throw error;
      },
    };

    const result = await service.createImageBufferAsync({
      model: 'pollinations-flux',
      prompt: 'prompt sintetico',
      referenceUrls: [],
      name: 'agua',
      description: 'tomar agua',
    });

    assert.equal(pollinationsCalls, 1);
    assert.ok(Buffer.isBuffer(result.imageBuffer));
  }
}));

test('Auditoria providers: Pollinations OPEN evita request HTTP y usa local rapido', withEnvConfig('falKey', null, async () => {
  const service = new AiPictogramService();
  let pollinationsCalls = 0;
  service.pollinationsImageProvider = {
    generateImage: async () => {
      pollinationsCalls += 1;
      throw new CircuitBreakerError('pollinations open', { state: CIRCUIT_BREAKER_STATES.OPEN });
    },
  };

  const startedAt = Date.now();
  const result = await service.createImageBufferAsync({
    model: 'pollinations-flux',
    prompt: 'prompt sintetico',
    referenceUrls: [],
    name: 'agua',
    description: 'tomar agua',
  });

  assert.equal(pollinationsCalls, 1);
  assert.ok(Buffer.isBuffer(result.imageBuffer));
  assert.ok(Date.now() - startedAt < 500, 'el fallback local debe activarse rapido con Pollinations OPEN');
}));

test('Auditoria logs: transiciones del breaker incluyen proveedor, estados y timestamp', async () => {
  const logs = [];
  const breaker = new CircuitBreaker({
    name: 'groq-text',
    failureThreshold: 1,
    now: () => 1000,
    logger: { warn: (message) => logs.push(message) },
  });

  await assert.rejects(() => breaker.execute(async () => { throw providerError(500); }));

  assert.match(logs[0], /\[CircuitBreaker:groq-text\] CLOSED -> OPEN timestamp=1970-01-01T00:00:01\.000Z/);
});

async function createTestImageBuffer() {
  return await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: '#ffffff',
    },
  }).png().toBuffer();
}
