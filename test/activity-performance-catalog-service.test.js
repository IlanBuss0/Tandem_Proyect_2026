import test from 'node:test';
import assert from 'node:assert/strict';

import ActivityPerformanceCatalogService from '../src/services/ActivityPerformanceCatalogService.js';

test('activity performance catalog service returns domains from repository', async () => {
  const service = new ActivityPerformanceCatalogService({
    getDomainsAsync: async () => [{ codigo: 'vida_cotidiana_autonomia' }],
  });

  const domains = await service.getDomainsAsync();

  assert.deepEqual(domains, [{ codigo: 'vida_cotidiana_autonomia' }]);
});

test('activity performance catalog service returns categories from repository', async () => {
  const service = new ActivityPerformanceCatalogService({
    getCategoriesAsync: async () => [{ codigo: 'compras', codigo_dominio: 'vida_cotidiana_autonomia' }],
  });

  const categories = await service.getCategoriesAsync();

  assert.deepEqual(categories, [{ codigo: 'compras', codigo_dominio: 'vida_cotidiana_autonomia' }]);
});

test('activity performance catalog service returns skills from repository', async () => {
  const service = new ActivityPerformanceCatalogService({
    getSkillsAsync: async () => [{ codigo: 'planificacion' }],
  });

  const skills = await service.getSkillsAsync();

  assert.deepEqual(skills, [{ codigo: 'planificacion' }]);
});
