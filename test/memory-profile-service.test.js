import assert from 'node:assert/strict';
import test from 'node:test';

import MemoryProfileService from '../src/services/MemoryProfileService.js';

// Perfil de memoria (Sesion 25): junta datos de varias fuentes ya
// existentes y los corre por los modulos puros de calculo. Estos tests
// mockean cada fuente por separado (mismo patron que el resto del
// proyecto — sobreescritura de propiedades de instancia) para confirmar
// que el ensamblado es correcto, sin depender de una BD real.
function buildService() {
  const service = new MemoryProfileService();
  service.CalendarEventService.getForUsuarioAsync = async () => [];
  service.ConfiguracionUsuarioService.getByUsuarioIdAsync = async () => [];
  service.UsageEventService.getForUsuarioAsync = async () => [];
  service.MemoryProfileRepository.getFrequentPictogramIdsAsync = async () => [];
  service.PersonalVocabularyStore.getAsync = async () => ({});
  service.StylePreferenceStore.getPreferredStyleAsync = async () => null;
  return service;
}

test('computeProfileAsync: sin ningun dato, devuelve un perfil vacio pero valido (nunca rompe)', async () => {
  const service = buildService();
  const profile = await service.computeProfileAsync(17);

  assert.deepEqual(profile.frequentPictogramIds, []);
  assert.equal(profile.preferredStyle, null);
  assert.deepEqual(profile.autonomyCardUsage, []);
  assert.deepEqual(profile.eventTypePatterns, []);
  assert.equal(profile.anticipationSupport, null);
  assert.equal(profile.vocabularyReport.totalUtterances, 0);
  assert.deepEqual(profile.evolutionWeeks, []);
});

test('computeProfileAsync: une los pictogramas frecuentes por uso automatico con los del vocabulario personal', async () => {
  const service = buildService();
  service.MemoryProfileRepository.getFrequentPictogramIdsAsync = async () => ['mulberry:agua'];
  service.PersonalVocabularyStore.getAsync = async () => ({ dientes: 'mulberry:dientes', comer: 'mulberry:agua' });

  const profile = await service.computeProfileAsync(17);

  assert.deepEqual(new Set(profile.frequentPictogramIds), new Set(['mulberry:agua', 'mulberry:dientes']));
});

test('getFrequentPictogramIdsAsync: metodo chico y separado, sin tocar calendario ni eventos_uso', async () => {
  const service = buildService();
  service.MemoryProfileRepository.getFrequentPictogramIdsAsync = async () => ['mulberry:agua'];
  service.PersonalVocabularyStore.getAsync = async () => ({ dientes: 'mulberry:dientes' });
  let calendarCalled = false;
  let usageCalled = false;
  service.CalendarEventService.getForUsuarioAsync = async () => { calendarCalled = true; return []; };
  service.UsageEventService.getForUsuarioAsync = async () => { usageCalled = true; return []; };

  const ids = await service.getFrequentPictogramIdsAsync(17);

  assert.deepEqual(new Set(ids), new Set(['mulberry:agua', 'mulberry:dientes']));
  assert.equal(calendarCalled, false, 'no deberia consultar calendario para este dato chico');
  assert.equal(usageCalled, false, 'no deberia consultar eventos_uso para este dato chico');
});

test('computeProfileAsync: pasa los eventos de tarjeta_autonomia_usada a computeAutonomyCardUsage', async () => {
  const service = buildService();
  service.UsageEventService.getForUsuarioAsync = async (idUsuario, options) => {
    if (options?.tipoEvento === 'tarjeta_autonomia_usada') {
      return Array(3).fill({ entidad_tipo: 'tarjeta_autonomia', entidad_id: 'necesito-ayuda', valor: { label: 'Necesito ayuda' } });
    }
    return [];
  };

  const profile = await service.computeProfileAsync(17);

  assert.deepEqual(profile.autonomyCardUsage, [
    { entidadTipo: 'tarjeta_autonomia', entidadId: 'necesito-ayuda', label: 'Necesito ayuda', count: 3 },
  ]);
});

test('getProfileAsync: sin Redis (dev), delega directo en computeProfileAsync sin romper', async () => {
  const service = buildService();
  const profile = await service.getProfileAsync(17);
  assert.ok(profile);
  assert.deepEqual(profile.frequentPictogramIds, []);
});
