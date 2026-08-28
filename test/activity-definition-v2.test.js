import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVITY_DEFINITION_SCHEMA_VERSION,
  DEFAULT_SUCCESS_CRITERIA_WEIGHTS,
  buildDefaultEvaluationConfig,
  validateActivityDefinitionV2,
  validateSkillWeights,
  validateSuccessCriteriaWeights,
} from '../src/modules/activity-performance/activity-definition-v2.js';

const validDefinition = () => ({
  schemaVersion: ACTIVITY_DEFINITION_SCHEMA_VERSION,
  titulo: 'Compra en supermercado',
  codigoCategoria: 'compras',
  proposito: 'evaluacion',
  dificultadGeneral: 'medio',
  duracionEsperadaMinutos: 10,
  habilidades: [
    { codigoHabilidad: 'planificacion', peso: 45, esPrincipal: true },
    { codigoHabilidad: 'manejo_dinero', peso: 25, esPrincipal: false },
    { codigoHabilidad: 'atencion_selectiva', peso: 20, esPrincipal: false },
    { codigoHabilidad: 'numeracion_calculo', peso: 10, esPrincipal: false },
  ],
  criteriosExito: { ...DEFAULT_SUCCESS_CRITERIA_WEIGHTS },
});

test('ActivityDefinitionV2 accepts a valid enriched definition', () => {
  assert.deepEqual(validateActivityDefinitionV2(validDefinition()), { ok: true, errors: [] });
});

test('skill weights require one principal skill and total weight 100', () => {
  assert.equal(validateSkillWeights(validDefinition().habilidades), null);
  assert.match(validateSkillWeights([{ peso: 100, esPrincipal: false }]), /exactamente una/);
  assert.match(validateSkillWeights([{ peso: 50, esPrincipal: true }]), /100/);
  assert.match(validateSkillWeights([{ peso: 0, esPrincipal: true }]), /positivos/);
});

test('success criteria weights must total 100', () => {
  assert.equal(validateSuccessCriteriaWeights(DEFAULT_SUCCESS_CRITERIA_WEIGHTS), null);
  assert.match(validateSuccessCriteriaWeights({ precision: 40 }), /100/);
  assert.match(validateSuccessCriteriaWeights({ precision: -1, independencia: 101 }), /no negativos/);
});

test('default evaluation config separates purpose and criteria by game type', () => {
  const gameConfig = buildDefaultEvaluationConfig('shopping-budget');
  const routineConfig = buildDefaultEvaluationConfig('routine-sequence');

  assert.equal(gameConfig.proposito, 'evaluacion');
  assert.equal(routineConfig.proposito, 'practica');
  assert.deepEqual(gameConfig.criteriosExito, DEFAULT_SUCCESS_CRITERIA_WEIGHTS);
});

test('ActivityDefinitionV2 rejects vague or incomplete definitions', () => {
  const definition = validDefinition();
  definition.titulo = 'x';
  definition.proposito = 'diagnostico';
  definition.duracionEsperadaMinutos = 0;

  const result = validateActivityDefinitionV2(definition);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length >= 3, true);
});
