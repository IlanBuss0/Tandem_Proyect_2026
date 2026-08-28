import test from 'node:test';
import assert from 'node:assert/strict';

import ActivityRevisionService from '../src/services/ActivityRevisionService.js';
import {
  validateActivityRevisionPayload,
  validateActivityRevisionSource,
} from '../src/modules/activity-performance/activity-revision.js';
import { ACTIVITY_DEFINITION_SCHEMA_VERSION, DEFAULT_SUCCESS_CRITERIA_WEIGHTS } from '../src/modules/activity-performance/activity-definition-v2.js';

const validDefinition = () => ({
  schemaVersion: ACTIVITY_DEFINITION_SCHEMA_VERSION,
  titulo: 'Compra en supermercado',
  codigoCategoria: 'compras',
  proposito: 'evaluacion',
  dificultadGeneral: 'medio',
  duracionEsperadaMinutos: 10,
  habilidades: [{ codigoHabilidad: 'planificacion', peso: 100, esPrincipal: true }],
  criteriosExito: { ...DEFAULT_SUCCESS_CRITERIA_WEIGHTS },
});

test('activity revision source must reference exactly one origin', () => {
  assert.equal(validateActivityRevisionSource({ idActividad: 1 }), null);
  assert.equal(validateActivityRevisionSource({ idActividadPersonalizada: 1 }), null);
  assert.match(validateActivityRevisionSource({}), /exactamente una/);
  assert.match(validateActivityRevisionSource({ idActividad: 1, idActividadPersonalizada: 2 }), /exactamente una/);
});

test('activity revision payload validates source and definition', () => {
  assert.deepEqual(
    validateActivityRevisionPayload({ source: { idActividad: 1 }, definition: validDefinition() }),
    { ok: true, errors: [] },
  );

  const result = validateActivityRevisionPayload({ source: {}, definition: { schemaVersion: 1 } });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length > 1, true);
});

test('activity revision service creates only valid revisions', async () => {
  const createdPayloads = [];
  const service = new ActivityRevisionService({
    createAsync: async (payload) => {
      createdPayloads.push(payload);
      return { id: 12, numero_revision: 1 };
    },
  });

  const result = await service.createAsync({
    source: { idActividadPersonalizada: 9 },
    definition: validDefinition(),
    idUsuarioAutor: 3,
  });

  assert.deepEqual(result, { id: 12, numero_revision: 1 });
  assert.equal(createdPayloads.length, 1);

  await assert.rejects(
    () => service.createAsync({ source: {}, definition: validDefinition() }),
    /exactamente una/,
  );
});
