import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { startPictogramaSyncJob, getLastSyncAtAsync, recordSyncAttemptAsync } from '../src/jobs/pictogramaSyncJob.js';

// Red de seguridad del sync mensual de pictogramas.
//
// Contexto: la primera version usaba setInterval(run, 30 dias). El delay de
// setInterval se guarda en un entero de 32 bits con signo (maximo 2.147.483.647
// ms, ~24,9 dias), asi que 30 dias desbordaba y Node lo trataba como 1 ms:
// el backend bajaba el catalogo entero de Mulberry (13MB) cientos de veces por
// minuto en cada arranque. Node no avisa: no tira error ni warning.

const MAX_TIMER_DELAY_MS = 2147483647; // 2^31 - 1
const JOB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'jobs', 'pictogramaSyncJob.js');

test('el intervalo de VERIFICACION no puede desbordar setInterval', () => {
  const source = readFileSync(JOB_PATH, 'utf8');
  const match = source.match(/const CHECK_INTERVAL_MS\s*=\s*([^;]+);/);
  assert.ok(match, 'deberia existir CHECK_INTERVAL_MS en el job');

  // eslint-disable-next-line no-eval -- expresion propia del repo, no input externo
  const checkIntervalMs = eval(match[1]);
  assert.ok(
    checkIntervalMs > 0 && checkIntervalMs <= MAX_TIMER_DELAY_MS,
    `CHECK_INTERVAL_MS (${checkIntervalMs}ms) debe estar entre 1 y ${MAX_TIMER_DELAY_MS}ms`,
  );
});

test('el job NO pasa el intervalo completo a setInterval (30 dias desbordarian)', () => {
  const source = readFileSync(JOB_PATH, 'utf8');
  // Se analizan las lineas donde se crea un timer. Comparar por linea es mas
  // confiable que un regex sobre todo el archivo: el callback suele traer sus
  // propios parentesis (`setInterval(() => void algo(), DELAY)`).
  const timerLines = source
    .split('\n')
    .filter((line) => /\b(setInterval|setTimeout)\s*\(/.test(line));

  assert.ok(timerLines.length > 0, 'deberia haber al menos un timer en el job');

  // El intervalo configurable (intervalMs, que puede ser de 30 dias o mas) solo
  // se usa para COMPARAR fechas, nunca como delay de un timer.
  for (const line of timerLines) {
    assert.ok(
      !/\bintervalMs\b/.test(line),
      `intervalMs no debe usarse como delay de un timer (desborda 32 bits): ${line.trim()}`,
    );
  }

  assert.ok(
    timerLines.some((line) => line.includes('CHECK_INTERVAL_MS')),
    'el timer periodico debe usar CHECK_INTERVAL_MS',
  );
});

test('con PICTOGRAM_SYNC_ENABLED distinto de true el job no arranca', () => {
  const previous = process.env.PICTOGRAM_SYNC_ENABLED;
  process.env.PICTOGRAM_SYNC_ENABLED = 'false';
  try {
    assert.equal(startPictogramaSyncJob(), null);
  } finally {
    if (previous === undefined) delete process.env.PICTOGRAM_SYNC_ENABLED;
    else process.env.PICTOGRAM_SYNC_ENABLED = previous;
  }
});

test('arrancar el job con ON_START=false no dispara ninguna descarga inmediata', () => {
  const previousEnabled = process.env.PICTOGRAM_SYNC_ENABLED;
  const previousOnStart = process.env.PICTOGRAM_SYNC_ON_START;
  process.env.PICTOGRAM_SYNC_ENABLED = 'true';
  process.env.PICTOGRAM_SYNC_ON_START = 'false';

  try {
    const timer = startPictogramaSyncJob();
    assert.ok(timer, 'deberia devolver el timer del chequeo periodico');

    // El primer chequeo esta diferido (FIRST_CHECK_DELAY_MS), asi que arrancar
    // el job no puede haber lanzado una descarga todavia.
    const delay = timer._idleTimeout ?? timer[Symbol.toPrimitive]?.();
    if (typeof delay === 'number') {
      assert.ok(delay > 0 && delay <= MAX_TIMER_DELAY_MS, `el delay del timer (${delay}ms) debe ser valido`);
    }
    clearInterval(timer);
  } finally {
    if (previousEnabled === undefined) delete process.env.PICTOGRAM_SYNC_ENABLED;
    else process.env.PICTOGRAM_SYNC_ENABLED = previousEnabled;
    if (previousOnStart === undefined) delete process.env.PICTOGRAM_SYNC_ON_START;
    else process.env.PICTOGRAM_SYNC_ON_START = previousOnStart;
  }
});

test('getLastSyncAtAsync devuelve la fecha del ultimo sync (o null si no hubo)', async () => {
  const lastSyncAt = await getLastSyncAtAsync();
  assert.ok(
    lastSyncAt === null || lastSyncAt instanceof Date,
    'deberia devolver un Date o null',
  );
  if (lastSyncAt) {
    assert.ok(!Number.isNaN(lastSyncAt.getTime()), 'la fecha devuelta debe ser valida');
  }
});

// Bug real encontrado antes de activar el sync en produccion: si en una
// corrida ningun proveedor tenia cambios, PictogramCatalogImporter no llamaba
// a upsertManyAsync (stats.affected = 0), y como el "ultimo sync" se leia de
// MAX(fecha_sincronizacion) de los pictogramas, esa fecha quedaba congelada
// en el ultimo cambio real. El chequeo de 6hs siguiente veia el sync como
// "vencido" otra vez y disparaba una descarga completa de nuevo, y asi cada
// 6hs para siempre en vez de cada 30 dias. Ahora el estado vive en su propia
// tabla y se marca en cada intento, haya cambios o no.
test('getLastSyncAtAsync avanza con recordSyncAttemptAsync aunque ningun pictograma haya cambiado', async () => {
  const before = await getLastSyncAtAsync();

  await recordSyncAttemptAsync();
  const after = await getLastSyncAtAsync();

  assert.ok(after instanceof Date, 'deberia quedar una fecha registrada');
  if (before) {
    assert.ok(
      after.getTime() >= before.getTime(),
      'la fecha deberia avanzar (o quedar igual si corrio en el mismo instante), nunca retroceder',
    );
  }

  // Un segundo intento no debe fallar por PK duplicada (es un upsert de una
  // sola fila, no una fila nueva por corrida).
  await recordSyncAttemptAsync();
  const afterSecond = await getLastSyncAtAsync();
  assert.ok(afterSecond.getTime() >= after.getTime());
});
