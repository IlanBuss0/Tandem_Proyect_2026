import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import CircuitBreaker, { CIRCUIT_BREAKER_STATES } from '../src/providers/ai/CircuitBreaker.js';
import CircuitBreakerError from '../src/providers/ai/CircuitBreakerError.js';
import AiPictogramService from '../src/services/AiPictogramService.js';
import { envConfig } from '../src/configs/env.config.js';

function providerError(status) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

function networkError(code) {
  return Object.assign(new Error(code), { code });
}

function buildBreaker({ now = () => 0, logger = { warn: () => {} } } = {}) {
  return new CircuitBreaker({
    name: 'test-provider',
    failureThreshold: 5,
    openTimeoutMs: 30000,
    now,
    logger,
  });
}

test('CircuitBreaker: CLOSED permite ejecutar normalmente y resetea fallos', async () => {
  const breaker = buildBreaker();
  await assert.rejects(() => breaker.execute(async () => { throw providerError(500); }));

  const result = await breaker.execute(async () => 'ok');

  assert.equal(result, 'ok');
  assert.equal(breaker.getState().state, CIRCUIT_BREAKER_STATES.CLOSED);
  assert.equal(breaker.getState().consecutiveFailures, 0);
});

test('CircuitBreaker: abre despues de 5 fallos validos consecutivos', async () => {
  const breaker = buildBreaker();

  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => breaker.execute(async () => { throw providerError(503); }));
  }

  assert.equal(breaker.getState().state, CIRCUIT_BREAKER_STATES.OPEN);
});

test('CircuitBreaker: OPEN no ejecuta la funcion externa', async () => {
  const breaker = buildBreaker();
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => breaker.execute(async () => { throw providerError(500); }));
  }

  let calls = 0;
  await assert.rejects(
    () => breaker.execute(async () => { calls += 1; }),
    CircuitBreakerError,
  );

  assert.equal(calls, 0);
});

test('CircuitBreaker: despues del cooldown pasa a HALF_OPEN', async () => {
  let currentTime = 0;
  const breaker = buildBreaker({ now: () => currentTime });
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => breaker.execute(async () => { throw providerError(502); }));
  }

  currentTime = 30000;
  breaker.refreshOpenState();

  assert.equal(breaker.getState().state, CIRCUIT_BREAKER_STATES.HALF_OPEN);
});

test('CircuitBreaker: probe exitoso en HALF_OPEN cierra el circuito', async () => {
  let currentTime = 0;
  const breaker = buildBreaker({ now: () => currentTime });
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => breaker.execute(async () => { throw providerError(504); }));
  }

  currentTime = 30000;
  const result = await breaker.execute(async () => 'recovered');

  assert.equal(result, 'recovered');
  assert.equal(breaker.getState().state, CIRCUIT_BREAKER_STATES.CLOSED);
  assert.equal(breaker.getState().consecutiveFailures, 0);
});

test('CircuitBreaker: probe fallido en HALF_OPEN vuelve a OPEN', async () => {
  let currentTime = 0;
  const breaker = buildBreaker({ now: () => currentTime });
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => breaker.execute(async () => { throw providerError(500); }));
  }

  currentTime = 30000;
  await assert.rejects(() => breaker.execute(async () => { throw providerError(503); }));

  assert.equal(breaker.getState().state, CIRCUIT_BREAKER_STATES.OPEN);
  assert.equal(breaker.getState().openedAt, 30000);
});

test('CircuitBreaker: en HALF_OPEN solo permite una llamada de prueba concurrente', async () => {
  let currentTime = 0;
  const breaker = buildBreaker({ now: () => currentTime });
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(() => breaker.execute(async () => { throw providerError(500); }));
  }
  currentTime = 30000;

  let calls = 0;
  let releaseProbe;
  const probe = new Promise((resolve) => { releaseProbe = resolve; });
  const requests = Array.from({ length: 10 }, () => breaker.execute(async () => {
    calls += 1;
    await probe;
    return 'ok';
  }).catch((error) => error));

  await new Promise((resolve) => setImmediate(resolve));
  releaseProbe();
  const results = await Promise.all(requests);

  assert.equal(calls, 1);
  assert.equal(results.filter((result) => result === 'ok').length, 1);
  assert.equal(results.filter((result) => result instanceof CircuitBreakerError).length, 9);
});

test('CircuitBreaker: 400, 401, 403, 404 y 429 no abren automaticamente', async () => {
  const breaker = buildBreaker();

  for (const status of [400, 401, 403, 404, 429]) {
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => breaker.execute(async () => { throw providerError(status); }));
    }
    assert.equal(breaker.getState().state, CIRCUIT_BREAKER_STATES.CLOSED);
  }
});

test('CircuitBreaker: 500/502/503/504, timeout y red cuentan como fallos', async () => {
  for (const error of [providerError(500), providerError(502), providerError(503), providerError(504), networkError('ETIMEDOUT'), networkError('ECONNRESET')]) {
    const breaker = buildBreaker();
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(() => breaker.execute(async () => { throw error; }));
    }
    assert.equal(breaker.getState().state, CIRCUIT_BREAKER_STATES.OPEN);
  }
});

test('CircuitBreaker: groq-text OPEN no afecta fal-images ni pollinations-images', async () => {
  const groq = new CircuitBreaker({ name: 'groq-text', failureThreshold: 1, openTimeoutMs: 30000, logger: { warn: () => {} } });
  const fal = new CircuitBreaker({ name: 'fal-images', failureThreshold: 1, openTimeoutMs: 30000, logger: { warn: () => {} } });
  const pollinations = new CircuitBreaker({ name: 'pollinations-images', failureThreshold: 1, openTimeoutMs: 30000, logger: { warn: () => {} } });

  await assert.rejects(() => groq.execute(async () => { throw providerError(500); }));

  assert.equal(groq.getState().state, CIRCUIT_BREAKER_STATES.OPEN);
  assert.equal(await fal.execute(async () => 'fal-ok'), 'fal-ok');
  assert.equal(await pollinations.execute(async () => 'pollinations-ok'), 'pollinations-ok');
  assert.equal(fal.getState().state, CIRCUIT_BREAKER_STATES.CLOSED);
  assert.equal(pollinations.getState().state, CIRCUIT_BREAKER_STATES.CLOSED);
});

test('AiPictogramService: fal abierto salta a Pollinations', async () => {
  const previousFalKey = envConfig.falKey;
  envConfig.falKey = 'test-fal-key';
  try {
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
      prompt: 'prompt',
      referenceUrls: [],
      name: 'agua',
      description: 'tomar agua',
    });

    assert.equal(falCalls, 1);
    assert.equal(pollinationsCalls, 1);
    assert.ok(Buffer.isBuffer(result.imageBuffer));
    assert.equal(result.providerRequestId, null);
  } finally {
    envConfig.falKey = previousFalKey;
  }
});

test('AiPictogramService: fal y Pollinations abiertos terminan en fallback local', async () => {
  const previousFalKey = envConfig.falKey;
  envConfig.falKey = 'test-fal-key';
  try {
    const service = new AiPictogramService();
    service.falImageProvider = {
      generateImage: async () => {
        throw new CircuitBreakerError('fal open', { state: CIRCUIT_BREAKER_STATES.OPEN });
      },
    };
    service.pollinationsImageProvider = {
      generateImage: async () => {
        throw new CircuitBreakerError('pollinations open', { state: CIRCUIT_BREAKER_STATES.OPEN });
      },
    };

    const result = await service.createImageBufferAsync({
      model: 'fal-ai/flux/schnell',
      prompt: 'prompt',
      referenceUrls: [],
      name: 'agua',
      description: 'tomar agua',
    });

    assert.ok(Buffer.isBuffer(result.imageBuffer));
    assert.equal(result.providerRequestId, null);
  } finally {
    envConfig.falKey = previousFalKey;
  }
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
