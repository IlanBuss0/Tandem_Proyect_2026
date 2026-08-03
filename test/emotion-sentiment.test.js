import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentimentScore } from '../src/modules/usage/emotion-sentiment.js';

test('sentimentScore: null sin emociones relevantes', () => {
  assert.equal(sentimentScore([]), null);
  assert.equal(sentimentScore([{ emotion: 'Cansado' }]), null);
});

test('sentimentScore: calcula la proporcion positiva ignorando emociones neutras', () => {
  const result = sentimentScore([{ emotion: 'Contento' }, { emotion: 'Ansioso' }, { emotion: 'Cansado' }]);
  assert.equal(result.positiveRatio, 0.5);
  assert.equal(result.sampleSize, 2);
});

test('sentimentScore: 100% positivo si todas son positivas', () => {
  const result = sentimentScore([{ emotion: 'Feliz' }, { emotion: 'Tranquilo' }]);
  assert.equal(result.positiveRatio, 1);
});
