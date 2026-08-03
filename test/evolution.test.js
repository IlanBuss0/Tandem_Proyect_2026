import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvolutionReport } from '../src/modules/usage/evolution.js';

function event(tipo, ocurridoEn, valor) {
  return { tipo_evento: tipo, ocurrido_en: ocurridoEn, valor };
}

test('buildEvolutionReport: sin eventos, devuelve lista vacia', () => {
  assert.deepEqual(buildEvolutionReport([]), []);
});

test('buildEvolutionReport: cuenta pasos completados por semana', () => {
  const events = [
    event('rutina_paso_completado', '2026-07-06T10:00:00.000Z'),
    event('rutina_paso_completado', '2026-07-07T10:00:00.000Z'),
    event('rutina_paso_completado', '2026-07-13T10:00:00.000Z'),
  ];
  const report = buildEvolutionReport(events);
  assert.equal(report.length, 2);
  assert.equal(report[0].routineCompletions, 2);
  assert.equal(report[1].routineCompletions, 1);
});

test('buildEvolutionReport: calcula proporcion positiva de emociones por semana', () => {
  const events = [
    event('emocion_registrada', '2026-07-06T10:00:00.000Z', { emotion: 'Contento' }),
    event('emocion_registrada', '2026-07-07T10:00:00.000Z', { emotion: 'Ansioso' }),
  ];
  const report = buildEvolutionReport(events);
  assert.equal(report.length, 1);
  assert.equal(report[0].positiveEmotionRatio, 0.5);
  assert.equal(report[0].emotionSampleSize, 2);
});

test('buildEvolutionReport: semana sin emociones relevantes tiene positiveEmotionRatio null', () => {
  const events = [event('rutina_paso_completado', '2026-07-06T10:00:00.000Z')];
  const report = buildEvolutionReport(events);
  assert.equal(report[0].positiveEmotionRatio, null);
  assert.equal(report[0].emotionSampleSize, 0);
});

test('buildEvolutionReport: ignora eventos con fecha invalida sin romper', () => {
  const events = [event('rutina_paso_completado', 'no-es-fecha'), event('rutina_paso_completado', '2026-07-06T10:00:00.000Z')];
  const report = buildEvolutionReport(events);
  assert.equal(report.length, 1);
  assert.equal(report[0].routineCompletions, 1);
});

test('buildEvolutionReport: recorta a las ultimas maxWeeks semanas', () => {
  const events = [
    event('rutina_paso_completado', '2026-01-06T10:00:00.000Z'),
    event('rutina_paso_completado', '2026-07-06T10:00:00.000Z'),
  ];
  const report = buildEvolutionReport(events, { maxWeeks: 1 });
  assert.equal(report.length, 1);
  assert.ok(report[0].week.startsWith('2026-W2') || report[0].week.startsWith('2026-W3'));
});

test('buildEvolutionReport: ordena semanas cronologicamente', () => {
  const events = [
    event('rutina_paso_completado', '2026-07-13T10:00:00.000Z'),
    event('rutina_paso_completado', '2026-07-06T10:00:00.000Z'),
  ];
  const report = buildEvolutionReport(events);
  assert.ok(report[0].week < report[1].week);
});
