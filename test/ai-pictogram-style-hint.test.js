import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../src/services/AiPictogramService.js';

// Sesion 25 (perfil de memoria), arreglo de consistencia: el generador con
// IA (AiPictogramService, usado por un tutor con foto de referencia)
// suma el estilo preferido de la persona destino al prompt, igual que ya
// hace el motor automatico de pictogramizacion via StylePreferenceStore.

test('buildPrompt: sin estilo preferido, no menciona ningun estilo', () => {
  const prompt = buildPrompt('ducharse', 'bañarse en la ducha');
  assert.ok(!/Prefer a|bold outlines/i.test(prompt));
});

test('buildPrompt: con estilo "realista", suma el hint correspondiente', () => {
  const prompt = buildPrompt('ducharse', 'bañarse en la ducha', '', 'realista');
  assert.match(prompt, /realistic, photo-like/i);
});

test('buildPrompt: con estilo "alto-contraste", suma el hint correspondiente', () => {
  const prompt = buildPrompt('ducharse', 'bañarse en la ducha', '', 'alto-contraste');
  assert.match(prompt, /bold outlines.*high-contrast/i);
});

test('buildPrompt: un estilo desconocido no rompe ni agrega nada', () => {
  const prompt = buildPrompt('ducharse', 'bañarse en la ducha', '', 'estilo-que-no-existe');
  assert.ok(!/Prefer a|bold outlines/i.test(prompt));
});

test('buildPrompt: el hint de estilo aparece antes de las instrucciones de revision', () => {
  const prompt = buildPrompt('ducharse', 'bañarse en la ducha', 'agregar jabon', 'realista');
  const styleIndex = prompt.indexOf('realistic, photo-like');
  const revisionIndex = prompt.indexOf('Revision request');
  assert.ok(styleIndex > -1 && revisionIndex > -1 && styleIndex < revisionIndex);
});
