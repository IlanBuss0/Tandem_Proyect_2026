import assert from 'node:assert/strict';
import test from 'node:test';

import PictogramaService, { mergePictograms, normalizeSearchText } from '../src/services/PictogramaService.js';
import { envConfig } from '../src/configs/env.config.js';

const localCat = { id: '10', arasaacId: 10, name: 'gato doméstico', tags: ['animal'], popularity: 2 };
const remoteCat = { _id: 20, keywords: [{ keyword: 'gato' }, { keyword: 'felino' }], categories: ['animal'] };

test('normalizes accents and whitespace in search terms', () => {
  assert.equal(normalizeSearchText('  GÁTO  '), 'gato');
});

test('merges duplicates and ranks exact matches before prefixes', () => {
  const exact = { id: '20', arasaacId: 20, name: 'gato', tags: [] };
  const results = mergePictograms([localCat, exact], [exact], 'gato', 24);
  assert.deepEqual(results.map(item => item.id), ['20', '10']);
});

test('queries ARASAAC even when the local database has matches', async () => {
  // Este test valida el fallback en vivo a ARASAAC, que solo existe cuando
  // PICTOGRAM_COMMERCIAL_MODE esta apagado (ver PictogramaService.searchAsync).
  // Se fuerza el flag aca en vez de depender del .env de quien corra los
  // tests, para que el resultado no cambie segun ese flag este prendido o
  // apagado en el entorno.
  const previousCommercialMode = envConfig.pictogramCommercialMode;
  envConfig.pictogramCommercialMode = false;
  try {
    const service = new PictogramaService();
    let remoteCalls = 0;
    let saved = [];
    service.ensureSchemaAsync = async () => {};
    service.PictogramaRepository.searchAsync = async () => [localCat];
    service.PictogramaRepository.upsertManyAsync = async items => { saved = items; return items.length; };
    service.fetchArasaacPictograms = async () => { remoteCalls += 1; return [remoteCat]; };

    const results = await service.searchAsync({ search: 'gato', language: 'es', limit: 24 });

    assert.equal(remoteCalls, 1);
    assert.equal(saved.length, 1);
    assert.equal(results[0].name, 'gato');
    assert.equal(results.length, 2);
  } finally {
    envConfig.pictogramCommercialMode = previousCommercialMode;
  }
});

test('returns local results when ARASAAC is unavailable', async () => {
  const service = new PictogramaService();
  service.ensureSchemaAsync = async () => {};
  service.PictogramaRepository.searchAsync = async () => [localCat];
  service.PictogramaRepository.upsertManyAsync = async () => 0;
  service.fetchArasaacPictograms = async () => { throw new Error('offline'); };

  const results = await service.searchAsync({ search: 'gato', language: 'es', limit: 24 });
  assert.deepEqual(results, [localCat]);
});
