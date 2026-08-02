import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVocabularyReport } from '../src/modules/usage/vocabulary-report.js';

// Item 42 "informe de vocabulario": que palabras del nucleo se usaron y
// cuales no, a partir de los enunciados hablados guardados.

test('buildVocabularyReport: sin eventos, todo el nucleo aparece como no usado', () => {
  const report = buildVocabularyReport([]);
  assert.equal(report.used.length, 0);
  assert.ok(report.neverUsed.length > 50);
  assert.equal(report.totalUtterances, 0);
});

test('buildVocabularyReport: cuenta palabras repetidas entre enunciados', () => {
  const events = [
    { valor: { text: 'yo querer agua' } },
    { valor: { text: 'yo querer comer' } },
  ];
  const report = buildVocabularyReport(events);
  const yo = report.used.find((u) => u.word === 'yo');
  const querer = report.used.find((u) => u.word === 'querer');
  assert.equal(yo.count, 2);
  assert.equal(querer.count, 2);
});

test('buildVocabularyReport: palabras que no son del nucleo no aparecen en used', () => {
  const events = [{ valor: { text: 'yo quiero pizza' } }];
  const report = buildVocabularyReport(events);
  assert.ok(!report.used.some((u) => u.word === 'pizza'));
});

test('buildVocabularyReport: ordena used de mas a menos usado', () => {
  const events = [
    { valor: { text: 'si si si' } },
    { valor: { text: 'no' } },
  ];
  const report = buildVocabularyReport(events);
  assert.equal(report.used[0].word, 'si');
  assert.ok(report.used[0].count >= report.used[1].count);
});

test('buildVocabularyReport: eventos sin texto valido no rompen nada', () => {
  const events = [{ valor: {} }, { valor: null }, {}];
  const report = buildVocabularyReport(events);
  assert.equal(report.used.length, 0);
});
