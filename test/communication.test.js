import assert from 'node:assert/strict';
import test from 'node:test';

import { createUtterance, utteranceToText, serializeUtterance, deserializeUtterance } from '../src/modules/communication/utterance.js';
import { NUCLEO_VOCABULARIO, getAllNucleoWords, getNucleoCategories } from '../src/modules/communication/nucleo-vocabulario.js';

// Modelo de enunciado (Sesion 11): "frase = lista ordenada de tokens de
// pictograma o texto". Lo necesitan el comunicador, el modo "no puedo
// hablar" y el historial de lo dicho — todos tienen que poder reconstruir
// la misma frase a partir de lo guardado.

test('createUtterance: arma el texto uniendo los tokens en orden', () => {
  const u = createUtterance([
    { type: 'pictogram', pictogramId: 'p1', text: 'yo' },
    { type: 'pictogram', pictogramId: 'p2', text: 'querer' },
    { type: 'pictogram', pictogramId: 'p3', text: 'agua' },
  ]);
  assert.equal(u.text, 'yo querer agua');
  assert.equal(u.tokens.length, 3);
});

test('createUtterance: descarta tokens sin texto', () => {
  const u = createUtterance([{ type: 'text', text: 'hola' }, { type: 'text', text: '' }, { type: 'text', text: '   ' }]);
  assert.equal(u.tokens.length, 1);
});

test('createUtterance: lista vacia da texto vacio, no tira', () => {
  const u = createUtterance([]);
  assert.equal(u.text, '');
  assert.deepEqual(u.tokens, []);
});

test('utteranceToText: recorta espacios de cada token', () => {
  const text = utteranceToText([{ text: '  hola  ' }, { text: 'mundo' }]);
  assert.equal(text, 'hola mundo');
});

test('serializeUtterance + deserializeUtterance: round-trip sin perder datos', () => {
  const original = createUtterance([{ type: 'pictogram', pictogramId: 'p1', text: 'querer' }]);
  const serialized = serializeUtterance(original);
  const restored = deserializeUtterance(serialized);
  assert.deepEqual(restored, original);
});

test('deserializeUtterance: JSON invalido devuelve null, no tira', () => {
  assert.equal(deserializeUtterance('esto no es json'), null);
  assert.equal(deserializeUtterance('{"tokens": "no es array"}'), null);
});

// Vocabulario nucleo (item 37)

test('getAllNucleoWords: junta todas las categorias, sin estar vacio', () => {
  const words = getAllNucleoWords();
  assert.ok(words.length > 50, 'un nucleo de CAA real tiene bastante mas de 50 palabras');
  assert.ok(words.includes('querer'));
  assert.ok(words.includes('si'));
});

test('getNucleoCategories: devuelve las claves del catalogo', () => {
  const categories = getNucleoCategories();
  assert.ok(categories.includes('pronombres'));
  assert.ok(categories.includes('verbos_nucleo'));
  assert.equal(categories.length, Object.keys(NUCLEO_VOCABULARIO).length);
});

test('NUCLEO_VOCABULARIO: ninguna categoria esta vacia', () => {
  for (const [category, words] of Object.entries(NUCLEO_VOCABULARIO)) {
    assert.ok(words.length > 0, `${category} no puede estar vacia`);
  }
});
