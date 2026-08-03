import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAutonomyCardUsage, MIN_USES } from '../src/modules/usage/memory-profile.js';

function event(entidadTipo, entidadId, label) {
  return { entidad_tipo: entidadTipo, entidad_id: entidadId, valor: { label } };
}

test('computeAutonomyCardUsage: sin eventos, lista vacia', () => {
  assert.deepEqual(computeAutonomyCardUsage([]), []);
});

test(`computeAutonomyCardUsage: no cuenta algo usado menos de ${MIN_USES} veces`, () => {
  const events = [
    event('tarjeta_autonomia', 'necesito-ayuda', 'Necesito ayuda'),
    event('tarjeta_autonomia', 'necesito-ayuda', 'Necesito ayuda'),
  ];
  assert.deepEqual(computeAutonomyCardUsage(events), []);
});

test('computeAutonomyCardUsage: cuenta y ordena de mas a menos usado, respetando el piso', () => {
  const events = [
    ...Array(5).fill(event('tarjeta_autonomia', 'necesito-ayuda', 'Necesito ayuda')),
    ...Array(3).fill(event('modo_no_puedo_hablar', 'si', 'Sí')),
    ...Array(2).fill(event('tarjeta_autonomia', 'necesito-un-momento', 'Necesito un momento')),
  ];
  const result = computeAutonomyCardUsage(events);
  assert.deepEqual(result, [
    { entidadTipo: 'tarjeta_autonomia', entidadId: 'necesito-ayuda', label: 'Necesito ayuda', count: 5 },
    { entidadTipo: 'modo_no_puedo_hablar', entidadId: 'si', label: 'Sí', count: 3 },
  ]);
});

test('computeAutonomyCardUsage: distingue por entidadTipo aunque el entidadId sea igual', () => {
  const events = [
    ...Array(3).fill(event('tarjeta_autonomia', 'necesito-ayuda', 'Necesito ayuda (tarjeta)')),
    ...Array(3).fill(event('modo_no_puedo_hablar', 'necesito-ayuda', 'Necesito ayuda (crisis)')),
  ];
  const result = computeAutonomyCardUsage(events);
  assert.equal(result.length, 2);
});

test('computeAutonomyCardUsage: usa stepTitle como label si no hay label (arrancar_tarea)', () => {
  const events = Array(3).fill({ entidad_tipo: 'arrancar_tarea', entidad_id: 'Lavarse los dientes', valor: { stepTitle: 'Lavarse los dientes' } });
  const result = computeAutonomyCardUsage(events);
  assert.equal(result[0].label, 'Lavarse los dientes');
});

test('computeAutonomyCardUsage: ignora eventos sin entidad_tipo o entidad_id, no rompe', () => {
  const events = [{ entidad_tipo: null, entidad_id: 'x' }, { entidad_tipo: 'x', entidad_id: null }, {}];
  assert.deepEqual(computeAutonomyCardUsage(events), []);
});
