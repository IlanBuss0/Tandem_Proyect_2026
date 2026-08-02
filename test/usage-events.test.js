import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidTipoEvento, validateUsageEvent, USAGE_EVENT_TYPES } from '../src/modules/usage/event-types.js';
import UsageEventService from '../src/services/UsageEventService.js';

// Registro de uso (Sesion 9): log append-only, fire-and-forget. Nunca debe
// poder romper la accion real que lo origina (completar un paso, registrar
// una emocion, elegir un pictograma) — por eso logAsync nunca tira.

test('isValidTipoEvento: solo acepta los tipos del catalogo', () => {
  assert.equal(isValidTipoEvento(USAGE_EVENT_TYPES.RUTINA_PASO_COMPLETADO), true);
  assert.equal(isValidTipoEvento(USAGE_EVENT_TYPES.TARJETA_AUTONOMIA_USADA), true);
  assert.equal(isValidTipoEvento(USAGE_EVENT_TYPES.PEDIDO_DIA), true);
  assert.equal(isValidTipoEvento('inventado'), false);
});

test('validateUsageEvent: tipoEvento invalido da error', () => {
  const error = validateUsageEvent({ tipoEvento: 'no-existe' });
  assert.ok(error);
});

test('validateUsageEvent: valor debe ser objeto si se manda', () => {
  const error = validateUsageEvent({ tipoEvento: USAGE_EVENT_TYPES.EMOCION_REGISTRADA, valor: 'no es objeto' });
  assert.ok(error);
});

test('validateUsageEvent: evento minimo valido no da error', () => {
  const error = validateUsageEvent({ tipoEvento: USAGE_EVENT_TYPES.EMOCION_REGISTRADA });
  assert.equal(error, null);
});

function buildService() {
  const service = new UsageEventService();
  service.ensureSchemaAsync = async () => {};
  return service;
}

test('logAsync: evento valido llama a createAsync y devuelve el id', async () => {
  const service = buildService();
  let created = null;
  service.UsageEventRepository.createAsync = async (event) => { created = event; return 42; };

  const id = await service.logAsync({ idUsuario: 7, tipoEvento: USAGE_EVENT_TYPES.RUTINA_PASO_COMPLETADO });

  assert.equal(id, 42);
  assert.equal(created.idUsuario, 7);
});

test('logAsync: sin idUsuario no llama a la BD y devuelve null, sin tirar', async () => {
  const service = buildService();
  let called = false;
  service.UsageEventRepository.createAsync = async () => { called = true; return 1; };

  const id = await service.logAsync({ tipoEvento: USAGE_EVENT_TYPES.RUTINA_PASO_COMPLETADO });

  assert.equal(id, null);
  assert.equal(called, false);
});

test('logAsync: tipoEvento invalido no tira, devuelve null', async () => {
  const service = buildService();
  const id = await service.logAsync({ idUsuario: 7, tipoEvento: 'no-existe' });
  assert.equal(id, null);
});

test('logAsync: si el repositorio tira (BD caida), no propaga la excepcion', async () => {
  const service = buildService();
  service.UsageEventRepository.createAsync = async () => { throw new Error('BD caida'); };

  const id = await service.logAsync({ idUsuario: 7, tipoEvento: USAGE_EVENT_TYPES.EMOCION_REGISTRADA });

  assert.equal(id, null);
});

test('logManyAsync: cuenta solo los que se guardaron de verdad', async () => {
  const service = buildService();
  let createCalls = 0;
  service.UsageEventRepository.createAsync = async () => { createCalls += 1; return createCalls; };

  const saved = await service.logManyAsync([
    { idUsuario: 7, tipoEvento: USAGE_EVENT_TYPES.RUTINA_PASO_COMPLETADO },
    { idUsuario: 7, tipoEvento: 'invalido' },
    { idUsuario: 7, tipoEvento: USAGE_EVENT_TYPES.EMOCION_REGISTRADA },
  ]);

  assert.equal(saved, 2, 'el evento con tipo invalido no cuenta, los otros 2 si');
  assert.equal(createCalls, 2, 'el invalido nunca llega al repositorio');
});

test('getForUsuarioAsync: delega en el repositorio con las opciones dadas', async () => {
  const service = buildService();
  let receivedOptions = null;
  service.UsageEventRepository.getForUsuarioAsync = async (idUsuario, options) => {
    receivedOptions = options;
    return [{ id: 1 }];
  };

  const rows = await service.getForUsuarioAsync(7, { tipoEvento: 'emocion_registrada', limit: 10 });

  assert.equal(rows.length, 1);
  assert.equal(receivedOptions.limit, 10);
});
