import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResourceScenario } from '../src/modules/activities/resource-scenario.validation.js';
import ActividadAsignadaService from '../src/services/ActividadAsignadaService.js';
import AuthorizationService from '../src/services/AuthorizationService.js';

const validScenario = () => ({
  startNodeId: 'start',
  resources: [{ id: 'energy', name: 'Energia', icon: '⚡', min: 0, max: 10, initial: 5 }],
  nodes: [
    {
      id: 'start', prompt: '¿Que haces?', terminal: false, options: [
        { id: 'a', label: 'Opcion A', score: 80, resourceDeltas: { energy: -1 }, nextNodeId: 'end' },
        { id: 'b', label: 'Opcion B', score: 40, resourceDeltas: { energy: 1 }, nextNodeId: 'end' },
      ],
    },
    { id: 'end', prompt: 'Fin', terminal: true, options: [] },
  ],
});

const validShoppingBudget = () => ({
  kind: 'shopping-budget',
  schemaVersion: 1,
  prompt: 'Completa la lista',
  currencySymbol: '$',
  budget: 10,
  products: [
    { id: 'bread', name: 'Pan', image: '🍞', price: 3, required: true },
    { id: 'milk', name: 'Leche', image: '🥛', price: 3, required: true },
    { id: 'cookies', name: 'Galletitas', image: '🍪', price: 2, required: false },
  ],
});

test('acepta una compra simple y conserva compatibilidad con escenarios anteriores', () => {
  assert.equal(validateResourceScenario(validShoppingBudget()).kind, 'shopping-budget');
  assert.equal(validateResourceScenario(validScenario()).startNodeId, 'start');
});

test('rechaza compras sin distractores o con presupuesto insuficiente', () => {
  const withoutDistractor = validShoppingBudget();
  withoutDistractor.products[2].required = true;
  assert.throws(() => validateResourceScenario(withoutDistractor), /producto extra/);

  const insufficientBudget = validShoppingBudget();
  insufficientBudget.budget = 5;
  assert.throws(() => validateResourceScenario(insufficientBudget), /presupuesto/);
});

test('acepta un escenario de recursos valido', () => {
  assert.equal(validateResourceScenario(validScenario()).startNodeId, 'start');
});

test('rechaza ciclos y nodos inaccesibles', () => {
  const cyclic = validScenario();
  cyclic.nodes[1] = {
    id: 'end', prompt: 'Otra decision', terminal: false, options: [
      { id: 'c', label: 'Volver', score: 50, resourceDeltas: {}, nextNodeId: 'start' },
      { id: 'd', label: 'Volver tambien', score: 50, resourceDeltas: {}, nextNodeId: 'start' },
    ],
  };
  assert.throws(() => validateResourceScenario(cyclic), /ciclos/);

  const unreachable = validScenario();
  unreachable.nodes.push({ id: 'orphan', prompt: 'Sin entrada', terminal: true, options: [] });
  assert.throws(() => validateResourceScenario(unreachable), /alcanzables/);
});

test('rechaza puntajes, recursos y ramas invalidas', () => {
  const scenario = validScenario();
  scenario.nodes[0].options[0].score = 101;
  assert.throws(() => validateResourceScenario(scenario), /puntaje/);

  const brokenTarget = validScenario();
  brokenTarget.nodes[0].options[0].nextNodeId = 'missing';
  assert.throws(() => validateResourceScenario(brokenTarget), /nodo existente/);
});

test('solo el perteneciente asignado puede completar y el service conserva el contrato de puntaje', async () => {
  const service = new ActividadAsignadaService();
  service.ActividadAsignadaRepository = {
    getByIdAsync: async () => ({ id: 9, id_perteneciente: 4, id_usuario_asignador: 2, fecha_completada: null }),
    completeAsync: async (id, score) => ({ id, puntaje_ultimo: score, puntaje_mejor: score }),
  };
  service.NotificationProducerService = { createAsync: async () => ({}) };
  const originalContext = AuthorizationService.getUserContext;
  const originalAssert = AuthorizationService.assertCanWritePertenecienteResource;
  AuthorizationService.getUserContext = async () => ({ perteneciente: { id: 4 } });
  AuthorizationService.assertCanWritePertenecienteResource = async () => true;
  try {
    const result = await service.completeForUserAsync(9, 17, 85);
    assert.equal(result.puntaje_mejor, 85);
    await assert.rejects(() => service.completeForUserAsync(9, 17, 101), /entre 0 y 100/);
    AuthorizationService.getUserContext = async () => ({ perteneciente: { id: 8 } });
    await assert.rejects(() => service.completeForUserAsync(9, 17, 80), /Solo el perteneciente asignado/);
  } finally {
    AuthorizationService.getUserContext = originalContext;
    AuthorizationService.assertCanWritePertenecienteResource = originalAssert;
  }
});
