import assert from 'node:assert/strict';
import test from 'node:test';
import ActividadAsignadaService from '../src/services/ActividadAsignadaService.js';

const payload = (targetId = 20) => ({ id_actividad: null, id_actividad_personalizada: 9, id_perteneciente: targetId, id_usuario_asignador: 5, id_estado_actividad: 1, fecha_asignacion: new Date().toISOString() });
const description = (sourceUserId) => `Actividad\nJuego: ${JSON.stringify({ gameType: 'routine-sequence', gameData: { routineSequence: { sourceRoutine: { sourceUserId } } } })}`;

function serviceFor(sourceUserId, targetUserId) {
  const service = new ActividadAsignadaService();
  service.ActividadPersonalizadaRepository.getByIdAsync = async () => ({ id: 9, descripcion: description(sourceUserId) });
  service.PertenecienteRepository.getByIdAsync = async () => ({ id: 20, id_usuario: targetUserId });
  service.ActividadAsignadaRepository.createAsync = async () => 77;
  service.NotificationProducerService.createAsync = async () => 1;
  return service;
}

test('una instantanea de rutina no se asigna a otro perteneciente', async () => {
  const service = serviceFor(17, 22);
  await assert.rejects(() => service.createAsync(payload()), (error) => error.statusCode === 403);
});

test('una instantanea de rutina se puede asignar al perteneciente de origen', async () => {
  const service = serviceFor(17, 17);
  assert.equal(await service.createAsync(payload()), 77);
});
