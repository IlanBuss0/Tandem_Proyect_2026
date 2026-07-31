import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import PictogramCatalogImporter from '../src/services/PictogramCatalogImporter.js';

// El sync mensual baja el catalogo COMPLETO de cada proveedor cada vez (no
// hay endpoint de "solo lo nuevo" ni en Mulberry ni en OpenMoji). Sin
// deduplicar antes de escribir, cada corrida reescribia ~5.900 filas en
// Postgres aunque nada hubiera cambiado upstream. Estos tests fijan el
// comportamiento: lo sin cambios ni se rasteriza, ni se sube a storage, ni se
// manda al upsert.

const SVG_A = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';
const SVG_B = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
const HASH_A = crypto.createHash('sha256').update(SVG_A).digest('hex');

function fakeRepository({ existingRows = [] } = {}) {
  const upsertCalls = [];
  return {
    upsertCalls,
    ensureSchemaAsync: async () => {},
    // PictogramCatalogImporter consulta la base directo con BD.query, no a
    // traves del repositorio, para el hash existente — se stubea mas abajo.
    upsertManyAsync: async (rows) => {
      upsertCalls.push(rows);
      return rows.length;
    },
  };
}

function fakeFileStorage() {
  let uploads = 0;
  return {
    get uploads() { return uploads; },
    uploadAsync: async ({ path }) => {
      uploads += 1;
      return { url: `https://fake.storage.test/${path}` };
    },
  };
}

test('un pictograma sin cambios (mismo hash, ya rehosteado) no se manda al upsert', async () => {
  const BD = (await import('../src/db/BD.js')).default;
  const originalQuery = BD.query;
  BD.query = async () => [{
    origen_id: 'mulberry:circle',
    url: 'https://fake.storage.test/storage/v1/object/public/files/pictogramas/mulberry/circle.png',
    asset_hash: HASH_A,
  }];

  try {
    const repository = fakeRepository();
    const fileStorage = fakeFileStorage();
    const importer = new PictogramCatalogImporter({ repository, fileStorage });

    const stats = await importer.importAsync({
      source: 'MULBERRY',
      storagePrefix: 'pictogramas/mulberry',
      pictograms: [{
        id: 'mulberry:circle',
        source: 'MULBERRY',
        name: 'circle',
        category: 'otros',
        tags: [],
        language: 'es',
        licenseCode: 'CC-BY-SA-4.0',
        commercialUseAllowed: true,
        shareAlikeRequired: true,
        svgBuffer: Buffer.from(SVG_A),
        metadata: { originalName: 'circle' },
      }],
      log: () => {},
    });

    assert.equal(stats.skipped, 1, 'deberia contarse como sin cambios');
    assert.equal(stats.uploaded, 0, 'no deberia rasterizar ni subir nada');
    assert.equal(fileStorage.uploads, 0, 'no deberia llamar a uploadAsync');
    assert.equal(repository.upsertCalls.length, 0, 'no deberia llamar a upsertManyAsync en absoluto');
    assert.equal(stats.affected, 0);
  } finally {
    BD.query = originalQuery;
  }
});

test('un pictograma nuevo (sin fila previa) SI se sube y se manda al upsert', async () => {
  const BD = (await import('../src/db/BD.js')).default;
  const originalQuery = BD.query;
  BD.query = async () => []; // nada existente todavia

  try {
    const repository = fakeRepository();
    const fileStorage = fakeFileStorage();
    const importer = new PictogramCatalogImporter({ repository, fileStorage });

    const stats = await importer.importAsync({
      source: 'MULBERRY',
      storagePrefix: 'pictogramas/mulberry',
      pictograms: [{
        id: 'mulberry:square',
        source: 'MULBERRY',
        name: 'square',
        category: 'otros',
        tags: [],
        language: 'es',
        licenseCode: 'CC-BY-SA-4.0',
        commercialUseAllowed: true,
        shareAlikeRequired: true,
        svgBuffer: Buffer.from(SVG_B),
        metadata: { originalName: 'square' },
      }],
      log: () => {},
    });

    assert.equal(stats.uploaded, 1);
    assert.equal(fileStorage.uploads, 1);
    assert.equal(repository.upsertCalls.length, 1, 'deberia llamar a upsertManyAsync una vez');
    assert.equal(repository.upsertCalls[0].length, 1);
    assert.equal(stats.affected, 1);
  } finally {
    BD.query = originalQuery;
  }
});

test('un pictograma con hash CAMBIADO (contenido distinto) se re-sube aunque ya exista', async () => {
  const BD = (await import('../src/db/BD.js')).default;
  const originalQuery = BD.query;
  BD.query = async () => [{
    origen_id: 'mulberry:circle',
    url: 'https://fake.storage.test/storage/v1/object/public/files/pictogramas/mulberry/circle.png',
    asset_hash: 'un-hash-viejo-que-ya-no-coincide',
  }];

  try {
    const repository = fakeRepository();
    const fileStorage = fakeFileStorage();
    const importer = new PictogramCatalogImporter({ repository, fileStorage });

    const stats = await importer.importAsync({
      source: 'MULBERRY',
      storagePrefix: 'pictogramas/mulberry',
      pictograms: [{
        id: 'mulberry:circle',
        source: 'MULBERRY',
        name: 'circle',
        category: 'otros',
        tags: [],
        language: 'es',
        licenseCode: 'CC-BY-SA-4.0',
        commercialUseAllowed: true,
        shareAlikeRequired: true,
        svgBuffer: Buffer.from(SVG_A), // contenido nuevo, hash no coincide con el guardado
        metadata: { originalName: 'circle' },
      }],
      log: () => {},
    });

    assert.equal(stats.uploaded, 1, 'un hash distinto debe tratarse como cambio real');
    assert.equal(repository.upsertCalls.length, 1);
  } finally {
    BD.query = originalQuery;
  }
});
