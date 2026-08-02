import assert from 'node:assert/strict';
import test from 'node:test';

import { simplifyToLecturaFacilAsync } from '../src/modules/pictograms/lectura-facil.js';
import { envConfig } from '../src/configs/env.config.js';

// Item 15 "explicame esto": simplificar un texto a lectura facil. Estos
// tests corren SIN GROQ_API_KEY (heuristico), igual que el resto del motor
// de pictogramizacion — nunca debe tirar ni quedar colgado sin la key.

test('simplifyToLecturaFacilAsync: texto vacio no llama a nada, devuelve vacio', async () => {
  const result = await simplifyToLecturaFacilAsync('');
  assert.deepEqual(result.sentences, []);
  assert.equal(result.usedGroq, false);
  assert.equal(result.degraded, false);
});

test('simplifyToLecturaFacilAsync: sin GROQ_API_KEY, parte por oraciones existentes (heuristico), degraded true', async () => {
  const previous = envConfig.groqApiKey;
  envConfig.groqApiKey = null;
  try {
    const result = await simplifyToLecturaFacilAsync('Hola. Como estas? Todo bien.');
    assert.equal(result.usedGroq, false);
    assert.equal(result.degraded, true);
    assert.equal(result.sentences.length, 3);
  } finally {
    envConfig.groqApiKey = previous;
  }
});

test('simplifyToLecturaFacilAsync: heuristico sin puntuacion devuelve el texto entero como una oracion, nunca vacio', async () => {
  const previous = envConfig.groqApiKey;
  envConfig.groqApiKey = null;
  try {
    const result = await simplifyToLecturaFacilAsync('un texto sin puntuacion');
    assert.equal(result.sentences.length, 1);
    assert.equal(result.sentences[0], 'un texto sin puntuacion');
  } finally {
    envConfig.groqApiKey = previous;
  }
});
