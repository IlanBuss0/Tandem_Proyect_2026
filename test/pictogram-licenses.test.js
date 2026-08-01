import test from 'node:test';
import assert from 'node:assert/strict';
import BD from '../src/db/BD.js';
import PictogramaRepository from '../src/repositories/PictogramaRepository.js';
import {
  ALLOWED_LICENSES,
  BLOCKED_LICENSES,
  GLOBAL_SYMBOLS_ALLOWED_SETS,
  GLOBAL_SYMBOLS_REDUNDANT_SETS,
  assertLicenseAllowed,
  filterAllowedGlobalSymbolsResults,
} from '../src/modules/pictograms/license-whitelist.js';

// Migracion de pictogramas a librerias con licencia comercial (freemium).
// Este archivo es la red de seguridad automatica: si alguien agrega sin
// querer un proveedor o una coleccion con licencia NC, el deploy tiene que
// fallar aca, no en produccion.

test('assertLicenseAllowed rechaza licencias no comerciales conocidas', () => {
  for (const licenseCode of BLOCKED_LICENSES) {
    assert.throws(
      () => assertLicenseAllowed({ licenseCode }),
      (error) => error.statusCode === 400 && error.code === 'PICTOGRAM_LICENSE_BLOCKED',
      `deberia rechazar ${licenseCode}`,
    );
  }
});

test('assertLicenseAllowed rechaza licencias desconocidas (no whitelisteadas)', () => {
  assert.throws(
    () => assertLicenseAllowed({ licenseCode: 'ALGO-RARO-QUE-NO-EXISTE' }),
    (error) => error.statusCode === 400 && error.code === 'PICTOGRAM_LICENSE_NOT_WHITELISTED',
  );
});

test('assertLicenseAllowed rechaza pictogramas sin licencia declarada', () => {
  assert.throws(
    () => assertLicenseAllowed({}),
    (error) => error.code === 'PICTOGRAM_LICENSE_MISSING',
  );
});

test('assertLicenseAllowed acepta todas las licencias de la whitelist', () => {
  for (const licenseCode of ALLOWED_LICENSES) {
    assert.doesNotThrow(() => assertLicenseAllowed({ licenseCode }));
  }
});

test('la whitelist de Global Symbols NUNCA incluye ARASAAC (symbolset 17)', () => {
  assert.equal(GLOBAL_SYMBOLS_ALLOWED_SETS.has(17), false);
});

test('la whitelist de Global Symbols NUNCA incluye picom-symbols (symbolset 110, es CC BY-NC)', () => {
  assert.equal(GLOBAL_SYMBOLS_ALLOWED_SETS.has(110), false);
  for (const [, info] of GLOBAL_SYMBOLS_ALLOWED_SETS) {
    assert.notEqual(info.slug, 'picom-symbols');
  }
});

// Blissymbolics es CC BY-SA 4.0, o sea legalmente usable — se excluye por un
// motivo VISUAL: no son dibujos sino un sistema de escritura simbolica
// abstracta (un circulo, una linea) que hay que aprender para leerlo. En el
// primer import copo 315 de 324 pictogramas y dejo el catalogo ilegible,
// porque es la coleccion con mas etiquetas en espanol y se buscaba en espanol.
// Este test existe para que no vuelva a entrar "porque la licencia da".
test('la whitelist NUNCA incluye Blissymbolics (symbolset 16): licencia ok pero ilegible para CAA', () => {
  assert.equal(GLOBAL_SYMBOLS_ALLOWED_SETS.has(16), false);
  for (const [, info] of GLOBAL_SYMBOLS_ALLOWED_SETS) {
    assert.notEqual(info.slug, 'blissymbolics');
  }
});

test('la whitelist NUNCA incluye PiCom Unicode (symbolset 228): son glifos, no ilustraciones', () => {
  assert.equal(GLOBAL_SYMBOLS_ALLOWED_SETS.has(228), false);
  for (const [, info] of GLOBAL_SYMBOLS_ALLOWED_SETS) {
    assert.notEqual(info.slug, 'picom-unicode-symbols');
  }
});

test('ninguna coleccion de la whitelist tiene una licencia bloqueada', () => {
  for (const [, info] of GLOBAL_SYMBOLS_ALLOWED_SETS) {
    assert.equal(BLOCKED_LICENSES.has(info.licenseCode), false, `${info.slug} no deberia estar en la whitelist`);
    assert.equal(ALLOWED_LICENSES.has(info.licenseCode), true, `${info.slug} deberia tener una licencia permitida`);
  }
});

test('filterAllowedGlobalSymbolsResults descarta ARASAAC aunque venga mezclado con resultados validos', () => {
  const raw = [
    { picto: { symbolset_id: 17 } }, // ARASAAC, NC — debe descartarse
    { picto: { symbolset_id: 110 } }, // picom-symbols, NC — debe descartarse
    { picto: { symbolset_id: 13 } }, // Mulberry, BY-SA — valido
    { picto: { symbolset_id: 83 } }, // OpenMoji, BY-SA — valido
  ];

  const filtered = filterAllowedGlobalSymbolsResults(raw);

  assert.deepEqual(
    filtered.map((item) => item.picto.symbolset_id).sort(),
    [13, 83],
  );
});

// Mulberry y OpenMoji se importan completos y directo de su repo oficial.
// Traerlos TAMBIEN por Global Symbols metia el mismo dibujo dos veces con
// origen_id distinto (paso: 26 + 101 filas duplicadas en la base).
test('las colecciones que ya se importan directo estan marcadas como redundantes en Global Symbols', () => {
  assert.equal(GLOBAL_SYMBOLS_REDUNDANT_SETS.has(13), true, 'mulberry (13) se importa directo del repo');
  assert.equal(GLOBAL_SYMBOLS_REDUNDANT_SETS.has(83), true, 'openmoji (83) se importa directo del release');
});

test('las colecciones redundantes siguen siendo legalmente validas (se excluyen por origen, no por licencia)', () => {
  for (const [id] of GLOBAL_SYMBOLS_REDUNDANT_SETS) {
    assert.equal(GLOBAL_SYMBOLS_ALLOWED_SETS.has(id), true, `el set ${id} deberia seguir en la whitelist legal`);
  }
});

test('DB: no hay pictogramas de Global Symbols de colecciones que ya se importan directo', async () => {
  const slugs = Array.from(GLOBAL_SYMBOLS_REDUNDANT_SETS.values()).map((info) => info.slug);
  const rows = await BD.query(
    `SELECT metadata->>'symbolsetSlug' AS slug, COUNT(*)::int AS total
       FROM pictogramas
      WHERE origen = 'GLOBAL_SYMBOLS' AND metadata->>'symbolsetSlug' = ANY($1::text[])
      GROUP BY 1`,
    [slugs],
  );

  assert.deepEqual(
    rows.map((row) => `${row.slug}: ${row.total}`),
    [],
    'estas colecciones estan duplicadas: entraron por Global Symbols y por su importador directo',
  );
});

test('DB: ningun pictograma con uso_comercial_permitido=true tiene licencia bloqueada', async () => {
  const rows = await BD.query(
    `SELECT id, origen, licencia_codigo FROM pictogramas WHERE uso_comercial_permitido = true`,
  );

  for (const row of rows) {
    assert.equal(
      BLOCKED_LICENSES.has(row.licencia_codigo),
      false,
      `pictograma ${row.id} (${row.origen}) tiene uso_comercial_permitido=true con licencia bloqueada ${row.licencia_codigo}`,
    );
    assert.equal(
      ALLOWED_LICENSES.has(row.licencia_codigo),
      true,
      `pictograma ${row.id} (${row.origen}) tiene uso_comercial_permitido=true con una licencia que no esta en la whitelist: ${row.licencia_codigo}`,
    );
  }
});

test('DB: todo ARASAAC sigue marcado con uso_comercial_permitido=false', async () => {
  const row = await BD.queryOne(
    `SELECT COUNT(*)::int AS total FROM pictogramas WHERE origen = 'ARASAAC' AND uso_comercial_permitido = true`,
  );
  assert.equal(row.total, 0, 'ningun pictograma de ARASAAC deberia estar marcado como uso comercial permitido');
});

// El sync mensual vuelve a bajar el catalogo entero y los proveedores externos
// mandan SIEMPRE el nombre en ingles. Sin esta proteccion en el ON CONFLICT de
// upsertManyAsync, cada sync borraba las ~5.900 traducciones al espanol y la
// app quedaba en ingles hasta que se volviera a traducir a mano.
//
// OJO — este test escribe en la base real, asi que trabaja sobre una fila
// PROPIA descartable (origen 'TEST_FIXTURE') y la borra al terminar.
//
// La version anterior agarraba un pictograma real del catalogo y le hacia el
// upsert encima. Como no declaraba autor/atribucion/url_fuente, el ON CONFLICT
// los pisaba con NULL, y como mandaba imageUrl: 'https://ejemplo.test/...',
// dejaba el pictograma con la imagen ROTA en la app. Cada corrida de tests
// arruinaba una fila nueva del catalogo de produccion.
const FIXTURE_SOURCE = 'TEST_FIXTURE';
const FIXTURE_ID = 'onconflict-guard';

async function deleteFixtureAsync() {
  await BD.execute(
    `DELETE FROM pictogramas WHERE origen = $1 AND origen_id = $2`,
    [FIXTURE_SOURCE, FIXTURE_ID],
  );
}

test('DB: un re-sync con el nombre en ingles no pisa la traduccion al espanol', async (t) => {
  const repository = new PictogramaRepository();
  const nameEn = 'test fixture apple';
  const nameEs = 'manzana de prueba';

  await deleteFixtureAsync();
  t.after(deleteFixtureAsync);

  // 1) Estado inicial: como queda una fila DESPUES de traducirse (titulo en
  //    espanol + metadata.nameEs como fuente de verdad de la traduccion).
  await repository.upsertManyAsync([{
    id: FIXTURE_ID,
    source: FIXTURE_SOURCE,
    name: nameEs,
    imageUrl: 'https://ejemplo.test/fixture.png',
    category: 'otros',
    tags: [],
    language: 'es',
    licenseCode: 'CC-BY-SA-4.0',
    author: 'Autor de prueba',
    attributionText: 'Atribucion de prueba',
    sourceUrl: 'https://ejemplo.test',
    commercialUseAllowed: true,
    shareAlikeRequired: true,
    metadata: { nameEs, originalName: nameEn, assetHash: 'hash-1' },
  }]);

  // 2) El re-sync: el proveedor manda el nombre en INGLES y sin la traduccion
  //    en metadata, igual que en una corrida real del sync mensual.
  await repository.upsertManyAsync([{
    id: FIXTURE_ID,
    source: FIXTURE_SOURCE,
    name: nameEn,
    imageUrl: 'https://ejemplo.test/fixture.png',
    category: 'otros',
    tags: [],
    language: 'es',
    licenseCode: 'CC-BY-SA-4.0',
    author: 'Autor de prueba',
    attributionText: 'Atribucion de prueba',
    sourceUrl: 'https://ejemplo.test',
    commercialUseAllowed: true,
    shareAlikeRequired: true,
    metadata: { originalName: nameEn, assetHash: 'hash-2' },
  }]);

  const after = await BD.queryOne(
    `SELECT titulo, texto_busqueda, metadata->>'nameEs' AS "nameEs"
       FROM pictogramas WHERE origen = $1 AND origen_id = $2 AND idioma = 'es'`,
    [FIXTURE_SOURCE, FIXTURE_ID],
  );

  assert.equal(after.titulo, nameEs, 'el titulo debe seguir siendo la traduccion al espanol');
  assert.equal(after.nameEs, nameEs, 'metadata.nameEs no debe perderse al mergear el metadata nuevo');
  // Mismo bug que titulo, pero se me habia pasado la primera vez: el sync
  // reconstruia texto_busqueda con EXCLUDED.texto_busqueda (el nombre en
  // ingles del proveedor), asi que la busqueda por frase quedaba en ingles
  // aunque el titulo ya se viera bien en espanol.
  assert.ok(
    after.texto_busqueda.includes(nameEs.toLowerCase()),
    `texto_busqueda ("${after.texto_busqueda}") deberia incluir la traduccion ("${nameEs}"), no solo el nombre en ingles`,
  );
});

// Defensa del bug de arriba a nivel query: un upsert que NO declara la
// metadata legal no debe borrar la que ya estaba. Los proveedores reales
// siempre la declaran; cualquier otro camino de escritura (un test, un fix
// parcial a mano) no puede dejar el catalogo sin atribucion, porque sin
// atribucion se incumple CC BY-SA.
test('DB: un upsert sin metadata legal no borra la atribucion existente', async (t) => {
  const repository = new PictogramaRepository();

  await deleteFixtureAsync();
  t.after(deleteFixtureAsync);

  await repository.upsertManyAsync([{
    id: FIXTURE_ID,
    source: FIXTURE_SOURCE,
    name: 'fixture',
    imageUrl: 'https://ejemplo.test/fixture.png',
    category: 'otros',
    tags: [],
    language: 'es',
    licenseCode: 'CC-BY-SA-4.0',
    license: 'CC-BY-SA-4.0',
    author: 'Autor Original',
    attributionText: 'Atribucion Original',
    sourceUrl: 'https://origen-original.test',
    commercialUseAllowed: true,
    shareAlikeRequired: true,
    metadata: { assetHash: 'hash-1' },
  }]);

  // Segundo upsert "pobre": sin autor, sin atribucion, sin url_fuente.
  await repository.upsertManyAsync([{
    id: FIXTURE_ID,
    source: FIXTURE_SOURCE,
    name: 'fixture',
    imageUrl: 'https://ejemplo.test/fixture.png',
    category: 'otros',
    tags: [],
    language: 'es',
    licenseCode: 'CC-BY-SA-4.0',
    commercialUseAllowed: true,
    shareAlikeRequired: true,
    metadata: { assetHash: 'hash-2' },
  }]);

  const after = await BD.queryOne(
    `SELECT autor, licencia, texto_atribucion, url_fuente
       FROM pictogramas WHERE origen = $1 AND origen_id = $2 AND idioma = 'es'`,
    [FIXTURE_SOURCE, FIXTURE_ID],
  );

  assert.equal(after.autor, 'Autor Original', 'el autor no debe borrarse');
  assert.equal(after.texto_atribucion, 'Atribucion Original', 'la atribucion no debe borrarse');
  assert.equal(after.url_fuente, 'https://origen-original.test', 'la url de la fuente no debe borrarse');
  assert.equal(after.licencia, 'CC-BY-SA-4.0', 'la licencia no debe borrarse');
});

// Garantia dura de cumplimiento: nada publicado en modo comercial puede
// quedar sin credito al autor. CC BY-SA lo exige, y la pantalla "Acerca de"
// se arma con estos campos: una fila sin atribucion aparece ahi como un
// bloque anonimo.
test('DB: todo pictograma comercial de un proveedor externo tiene atribucion', async () => {
  const rows = await BD.query(
    `SELECT origen, origen_id, titulo
       FROM pictogramas
      WHERE uso_comercial_permitido = true
        AND origen NOT IN ('TANDEM_AI', 'TEST_FIXTURE')
        AND (texto_atribucion IS NULL OR texto_atribucion = '')`,
  );

  assert.deepEqual(
    rows.map((row) => `${row.origen}:${row.origen_id} (${row.titulo})`),
    [],
    'estos pictogramas se publican sin atribuir a su autor: incumple CC BY-SA',
  );
});
