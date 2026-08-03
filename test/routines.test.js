import assert from 'node:assert/strict';
import test from 'node:test';

import RoutineService from '../src/services/RoutineService.js';

// Migracion de "Mi dia" de configuraciones_usuarios (blob JSON gigante,
// clave 'routines.mi-dia') a las tablas rutinas + rutina_items. Estos
// tests cubren la traduccion entre el shape del frontend (DayRoutine/
// RoutineItem en ingles) y las columnas de la tabla (en espanol), y el
// chequeo de dueño antes de un PATCH granular.
function buildService() {
  const service = new RoutineService();
  service.ensureSchemaAsync = async () => {};
  return service;
}

test('getForUsuarioAsync: traduce las columnas de la tabla al shape del frontend', async () => {
  const service = buildService();
  service.RoutineRepository.getForUsuarioAsync = async () => [{
    id: 'r-1', nombre: 'Día escolar', dia_semana: 1, fecha: null,
    items: [{
      id: 'i-1', hora: '08:00', titulo: 'Lavarse los dientes', icono: '🪥', categoria: 'mañana',
      completado: true, reminders: [10], id_pictograma: 'mulberry:teeth', pictograma_url: 'https://x/y.png',
      pictograma_nombre: 'Cepillo', pictograma_confianza: 'alta', pictograma_resuelto_para: 'Lavarse los dientes',
      pictograma_label: 'Dientes',
    }],
  }];

  const [routine] = await service.getForUsuarioAsync(17);

  assert.equal(routine.name, 'Día escolar');
  assert.equal(routine.dayOfWeek, 1);
  assert.equal(routine.items[0].time, '08:00');
  assert.equal(routine.items[0].title, 'Lavarse los dientes');
  assert.equal(routine.items[0].completed, true);
  assert.equal(routine.items[0].pictogramId, 'mulberry:teeth');
  assert.equal(routine.items[0].pictogramImageUrl, 'https://x/y.png');
});

test('replaceAllForUsuarioAsync: traduce del shape del frontend a las columnas antes de guardar', async () => {
  const service = buildService();
  let receivedRoutines = null;
  service.RoutineRepository.replaceAllForUsuarioAsync = async (idUsuario, routines) => { receivedRoutines = routines; };
  service.RoutineRepository.getForUsuarioAsync = async () => [];

  await service.replaceAllForUsuarioAsync(17, [{
    id: 'r-1', name: 'Día escolar', dayOfWeek: 1,
    items: [{ id: 'i-1', time: '08:00', title: 'Comer', icon: '🍽️', category: 'mediodía', completed: false }],
  }]);

  assert.equal(receivedRoutines[0].nombre, 'Día escolar');
  assert.equal(receivedRoutines[0].dia_semana, 1);
  assert.equal(receivedRoutines[0].items[0].hora, '08:00');
  assert.equal(receivedRoutines[0].items[0].titulo, 'Comer');
});

test('updateItemAsync: item de otro usuario tira 404, no llama a updateItemAsync del repositorio', async () => {
  const service = buildService();
  service.RoutineRepository.getItemOwnerUsuarioIdAsync = async () => 5;
  let called = false;
  service.RoutineRepository.updateItemAsync = async () => { called = true; };

  await assert.rejects(() => service.updateItemAsync('i-1', 17, { completed: true }));
  assert.equal(called, false);
});

test('updateItemAsync: item propio traduce el patch y lo aplica', async () => {
  const service = buildService();
  service.RoutineRepository.getItemOwnerUsuarioIdAsync = async () => 17;
  let patchReceived = null;
  service.RoutineRepository.updateItemAsync = async (itemId, patch) => { patchReceived = patch; };

  await service.updateItemAsync('i-1', 17, { completed: true, pictogramId: 'mulberry:teeth' });

  assert.equal(patchReceived.completado, true);
  assert.equal(patchReceived.id_pictograma, 'mulberry:teeth');
});

test('updateItemAsync: item no encontrado (owner null) tira 404', async () => {
  const service = buildService();
  service.RoutineRepository.getItemOwnerUsuarioIdAsync = async () => null;

  await assert.rejects(() => service.updateItemAsync('i-inexistente', 17, { completed: true }));
});
