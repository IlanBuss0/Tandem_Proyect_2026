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

// Regla de arquitectura: la busqueda se resuelve SIEMPRE contra la base
// local. Las APIs externas solo se tocan desde el job de sync mensual y los
// importadores de scripts/. Estos dos tests son la red de seguridad de esa
// regla: si alguien vuelve a meter un fetch en caliente, fallan.
test('la busqueda nunca le pega a una API externa (ni con el flag comercial apagado)', async () => {
  const previousCommercialMode = envConfig.pictogramCommercialMode;
  envConfig.pictogramCommercialMode = false; // el caso mas permisivo posible
  try {
    const service = new PictogramaService();
    let remoteCalls = 0;
    let upserts = 0;
    service.ensureSchemaAsync = async () => {};
    service.PictogramaRepository.searchAsync = async () => [localCat];
    service.PictogramaRepository.upsertManyAsync = async () => { upserts += 1; return 0; };
    // Si searchAsync intentara salir a la red, estos contadores se moverian.
    service.fetchArasaacPictograms = async () => { remoteCalls += 1; return [remoteCat]; };
    service.fetchArasaacPictogram = async () => { remoteCalls += 1; return remoteCat; };

    const results = await service.searchAsync({ search: 'gato', language: 'es', limit: 24 });

    assert.equal(remoteCalls, 0, 'searchAsync no debe llamar a ninguna API externa');
    assert.equal(upserts, 0, 'searchAsync no debe escribir en la base: es solo lectura');
    assert.deepEqual(results, [localCat]);
  } finally {
    envConfig.pictogramCommercialMode = previousCommercialMode;
  }
});

test('getByIdAsync devuelve null si el pictograma no esta importado, sin salir a la red', async () => {
  const service = new PictogramaService();
  let remoteCalls = 0;
  service.ensureSchemaAsync = async () => {};
  service.PictogramaRepository.getByExternalIdAsync = async () => null;
  service.fetchArasaacPictogram = async () => { remoteCalls += 1; return remoteCat; };

  const result = await service.getByIdAsync('9999', 'es');

  assert.equal(result, null);
  assert.equal(remoteCalls, 0, 'getByIdAsync no debe buscar en la API externa lo que no esta importado');
});
