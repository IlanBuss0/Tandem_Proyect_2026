import assert from 'node:assert/strict';
import test from 'node:test';

import CalendarEventService from '../src/services/CalendarEventService.js';

// Migracion de calendario de configuraciones_usuarios (JSON blob, dos
// formatos coexistiendo) a la tabla eventos_calendario. Estos tests cubren
// el service: validacion minima y verificacion de dueño antes de tocar la
// BD (mismo patron de mock que usage-events.test.js — sobreescritura de
// propiedades de instancia, sin libreria de mocking).
function buildService() {
  const service = new CalendarEventService();
  service.ensureSchemaAsync = async () => {};
  return service;
}

test('createAsync: evento valido genera un id y llama al repositorio', async () => {
  const service = buildService();
  let created = null;
  service.CalendarEventRepository.createAsync = async (event) => { created = event; return { ...event }; };

  const result = await service.createAsync(17, { titulo: 'Turno', fecha: '2026-08-01', hora: '10:00' });

  assert.ok(result.id.startsWith('ce-'));
  assert.equal(created.idUsuario, 17);
  assert.equal(created.titulo, 'Turno');
});

test('createAsync: sin titulo/fecha/hora tira sin llamar al repositorio', async () => {
  const service = buildService();
  let called = false;
  service.CalendarEventRepository.createAsync = async () => { called = true; };

  await assert.rejects(() => service.createAsync(17, { titulo: 'Turno' }));
  assert.equal(called, false);
});

test('updateAsync: evento de otro usuario tira 404, no llama a updateAsync del repositorio', async () => {
  const service = buildService();
  service.CalendarEventRepository.getByIdAsync = async () => ({ id: 'ce-1', id_usuario: 5 });
  let called = false;
  service.CalendarEventRepository.updateAsync = async () => { called = true; };

  await assert.rejects(() => service.updateAsync('ce-1', 17, { titulo: 'Otro' }));
  assert.equal(called, false);
});

test('updateAsync: evento propio se actualiza normalmente', async () => {
  const service = buildService();
  service.CalendarEventRepository.getByIdAsync = async () => ({ id: 'ce-1', id_usuario: 17 });
  let patchReceived = null;
  service.CalendarEventRepository.updateAsync = async (id, patch) => { patchReceived = patch; return { id, ...patch }; };

  const result = await service.updateAsync('ce-1', 17, { titulo: 'Nuevo titulo' });

  assert.equal(result.titulo, 'Nuevo titulo');
  assert.equal(patchReceived.titulo, 'Nuevo titulo');
});

test('deleteAsync: evento de otro usuario tira 404, no borra', async () => {
  const service = buildService();
  service.CalendarEventRepository.getByIdAsync = async () => ({ id: 'ce-1', id_usuario: 5 });
  let called = false;
  service.CalendarEventRepository.deleteAsync = async () => { called = true; };

  await assert.rejects(() => service.deleteAsync('ce-1', 17));
  assert.equal(called, false);
});

test('getForUsuarioAsync: delega directo en el repositorio', async () => {
  const service = buildService();
  service.CalendarEventRepository.getForUsuarioAsync = async (idUsuario) => {
    assert.equal(idUsuario, 17);
    return [{ id: 'ce-1' }];
  };

  const rows = await service.getForUsuarioAsync(17);
  assert.equal(rows.length, 1);
});
