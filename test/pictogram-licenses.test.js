import test from 'node:test';
import assert from 'node:assert/strict';
import BD from '../src/db/BD.js';
import {
  ALLOWED_LICENSES,
  BLOCKED_LICENSES,
  GLOBAL_SYMBOLS_ALLOWED_SETS,
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
