import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectEventTypePatterns, evaluateAnticipationSupport } from '../src/modules/usage/pattern-detection.js';

function event(id, date, type) {
  return { id, date, type };
}
function emotion(date, emotion) {
  return { date, emotion };
}

test('detectEventTypePatterns: no reporta nada por debajo del piso minimo (2 observaciones)', () => {
  const events = [event(1, '2026-08-01', 'medico'), event(2, '2026-08-08', 'medico')];
  const emotions = [emotion('2026-08-01', 'Ansioso'), emotion('2026-08-08', 'Ansioso')];
  assert.deepEqual(detectEventTypePatterns(events, emotions), []);
});

test('detectEventTypePatterns: reporta un tipo con piso minimo y >=60% negativo', () => {
  const events = [event(1, '2026-08-01', 'medico'), event(2, '2026-08-08', 'medico'), event(3, '2026-08-15', 'medico')];
  const emotions = [
    emotion('2026-08-01', 'Ansioso'),
    emotion('2026-08-08', 'Ansioso'),
    emotion('2026-08-15', 'Contento'),
  ];
  const patterns = detectEventTypePatterns(events, emotions);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].type, 'medico');
  assert.equal(patterns[0].sampleSize, 3);
});

test('detectEventTypePatterns: no reporta un tipo mayormente positivo', () => {
  const events = [event(1, '2026-08-01', 'futbol'), event(2, '2026-08-08', 'futbol'), event(3, '2026-08-15', 'futbol')];
  const emotions = [
    emotion('2026-08-01', 'Contento'),
    emotion('2026-08-08', 'Contento'),
    emotion('2026-08-15', 'Ansioso'),
  ];
  assert.deepEqual(detectEventTypePatterns(events, emotions), []);
});

test('evaluateAnticipationSupport: null si falta piso minimo en algun grupo', () => {
  const events = [event(1, '2026-08-01', 'medico'), event(2, '2026-08-08', 'medico')];
  const emotions = [emotion('2026-08-01', 'Contento'), emotion('2026-08-08', 'Contento')];
  const result = evaluateAnticipationSupport(events, emotions, new Set([1]));
  assert.equal(result, null);
});

test('evaluateAnticipationSupport: detecta que anticipar ayuda cuando hay diferencia clara', () => {
  const events = [
    event(1, '2026-08-01', 'medico'), event(2, '2026-08-08', 'medico'), event(3, '2026-08-15', 'medico'),
    event(4, '2026-08-02', 'medico'), event(5, '2026-08-09', 'medico'), event(6, '2026-08-16', 'medico'),
  ];
  const emotions = [
    emotion('2026-08-01', 'Contento'), emotion('2026-08-08', 'Contento'), emotion('2026-08-15', 'Contento'),
    emotion('2026-08-02', 'Ansioso'), emotion('2026-08-09', 'Ansioso'), emotion('2026-08-16', 'Contento'),
  ];
  const viewedIds = new Set([1, 2, 3]);
  const result = evaluateAnticipationSupport(events, emotions, viewedIds);
  assert.ok(result);
  assert.equal(result.viewedPositiveRatio, 1);
  assert.ok(result.helps);
});
