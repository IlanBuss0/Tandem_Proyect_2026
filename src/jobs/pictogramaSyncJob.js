import BD from '../db/BD.js';
import PictogramCatalogImporter from '../services/PictogramCatalogImporter.js';
import { PICTOGRAM_PROVIDERS, BULK_CATALOG_PROVIDERS } from '../providers/pictograms/index.js';
import { cacheService } from '../services/CacheService.js';
import { translatePendingLabelsAsync, countPendingTranslationsAsync } from '../services/PictogramTranslationService.js';

// Sync mensual del catalogo de pictogramas.
//
// Este job es el UNICO camino por el que entran pictogramas nuevos desde las
// APIs/repos externos. La busqueda en vivo (PictogramaService.searchAsync) no
// sale nunca a la red: lee solo de la base. Ver el comentario en searchAsync.
//
// Que hace en cada corrida:
//   1. Baja el catalogo completo de cada proveedor bulk (Mulberry, OpenMoji,
//      Global Symbols).
//   2. Compara el SHA-256 de cada archivo contra metadata.assetHash en la
//      base: lo que no cambio no se vuelve a rasterizar ni a subir.
//   3. Rehostea lo nuevo/cambiado en nuestro storage y hace upsert.
//   4. Invalida el cache de busquedas y categorias.
//
// Variables de entorno:
//   PICTOGRAM_SYNC_ENABLED=true        activa el job
//   PICTOGRAM_SYNC_ON_START=true       corre una vez al arrancar el server
//   PICTOGRAM_SYNC_INTERVAL_DAYS=30    cada cuanto (default 30)
//   PICTOGRAM_SYNC_LANGUAGE=es

const DEFAULT_INTERVAL_DAYS = 30;
// Cada cuanto se VERIFICA si corresponde sincronizar. Tiene que quedar bien
// por debajo del maximo de setInterval (2^31-1 ms, ~24,9 dias); ver el
// comentario en startPictogramaSyncJob.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
// Demora del primer chequeo tras arrancar, para que reiniciar el backend en
// desarrollo no dispare una descarga inmediata.
const FIRST_CHECK_DELAY_MS = 10 * 60 * 1000; // 10 minutos

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Estado del sync guardado en su propia tabla de una sola fila, en vez de
// inferir "cuando fue el ultimo sync" a partir de fecha_sincronizacion de los
// pictogramas.
//
// Por que: fecha_sincronizacion solo se actualiza en las filas que
// PictogramCatalogImporter realmente reescribe (ver stats.affected). Si una
// corrida no encuentra ningun cambio upstream (el caso normal en regimen,
// porque Mulberry/OpenMoji no actualizan seguido), NINGUNA fila se toca, asi
// que MAX(fecha_sincronizacion) queda congelado en la fecha del ultimo cambio
// real. Eso rompe el intervalo de 30 dias: el chequeo de 6hs siguiente ve un
// "ultimo sync" viejo, dispara un sync completo de nuevo, ese tampoco cambia
// nada, y asi cada 6hs para siempre en vez de cada 30 dias.
async function ensureSyncStateTableAsync() {
  await BD.execute(`
    CREATE TABLE IF NOT EXISTS pictograma_sync_estado (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      ultima_corrida TIMESTAMPTZ,
      CONSTRAINT pictograma_sync_estado_fila_unica CHECK (id = 1)
    )
  `);
}

/**
 * Marca "se hizo un chequeo/sync ahora", haya o no haya cambiado algo.
 * Exportada para poder testear el round-trip con getLastSyncAtAsync sin tener
 * que correr un sync completo contra Mulberry/OpenMoji de verdad.
 */
export async function recordSyncAttemptAsync() {
  await ensureSyncStateTableAsync();
  await BD.execute(`
    INSERT INTO pictograma_sync_estado (id, ultima_corrida) VALUES (1, NOW())
    ON CONFLICT (id) DO UPDATE SET ultima_corrida = NOW()
  `);
}

/**
 * Corre una pasada de sincronizacion sobre todos los proveedores bulk.
 * Exportada aparte del scheduler para poder invocarla a mano desde un script.
 */
export async function runPictogramSyncAsync({ language = 'es', force = false, log = console.log } = {}) {
  const importer = new PictogramCatalogImporter();
  const results = [];

  for (const { key, storagePrefix } of BULK_CATALOG_PROVIDERS) {
    const provider = PICTOGRAM_PROVIDERS[key];
    if (!provider?.syncCatalog) {
      log(`[Pictogramas] ${key}: el proveedor no soporta syncCatalog, se saltea.`);
      continue;
    }

    const startedAt = Date.now();
    try {
      log(`[Pictogramas] ${key}: bajando catalogo...`);
      const { pictograms } = await provider.syncCatalog({ language });

      const stats = await importer.importAsync({
        source: provider.key,
        storagePrefix,
        pictograms,
        language,
        force,
        log: (message) => log(`[Pictogramas] ${key}: ${message}`),
      });

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      log(
        `[Pictogramas] ${key}: ${stats.affected} guardados `
        + `(${stats.uploaded} subidos, ${stats.skipped} sin cambios, ${stats.failed} fallidos) en ${seconds}s.`,
      );
      results.push({ provider: key, ...stats });
    } catch (error) {
      // Un proveedor caido no debe impedir que se sincronicen los demas.
      log(`[Pictogramas] ${key}: ERROR - ${error.message}`);
      results.push({ provider: key, error: error.message });
    }
  }

  // Traduccion de lo pendiente, en su propio try/catch: si Groq esta caido o
  // sin cupo, un sync que ya importo bien los pictogramas (en ingles) no debe
  // reportarse como fallido por eso. Los que queden sin traducir se marcan con
  // metadata.nameEs IS NULL y los recoge el chequeo periodico de 6hs (ver
  // startPictogramaSyncJob) o el proximo sync mensual.
  try {
    const translationStats = await translatePendingLabelsAsync({
      log: (message) => log(`[Pictogramas] Traduccion: ${message}`),
    });
    if (translationStats.error) {
      log(`[Pictogramas] Traduccion: ${translationStats.error}. Queda para el proximo chequeo.`);
    } else if (translationStats.pending > 0) {
      log(
        `[Pictogramas] Traduccion: ${translationStats.translated}/${translationStats.pending} `
        + `traducidas (${translationStats.failedBatches} lotes fallidos).`,
      );
    }
  } catch (error) {
    log(`[Pictogramas] Traduccion: ERROR - ${error.message}. Queda para el proximo chequeo.`);
  }

  // Las busquedas y el listado de categorias quedan cacheados; despues de un
  // sync hay que tirar ese cache o los pictogramas nuevos no aparecen hasta
  // que expire solo.
  await cacheService.delByPattern('pictogram.*');

  // Se registra el intento SIEMPRE, incluso si ningun proveedor tuvo cambios
  // o si algun proveedor fallo (el error ya quedo logueado arriba, por
  // proveedor). Es lo que le da sentido a "cada 30 dias": si se marcara solo
  // cuando hay cambios, un mes sin novedades upstream haria que el chequeo de
  // 6hs siguiente crea que nunca se sincronizo y vuelva a intentarlo enseguida.
  await recordSyncAttemptAsync();

  return results;
}

/**
 * Devuelve cuando fue el ultimo sync (intento, haya cambiado algo o no), leido
 * de pictograma_sync_estado. Ver el comentario junto a recordSyncAttemptAsync
 * para el motivo de no usar fecha_sincronizacion de los pictogramas.
 *
 * Consecuencia importante: el estado sobrevive a los reinicios. Reiniciar el
 * backend 20 veces en un dia no dispara 20 syncs.
 */
export async function getLastSyncAtAsync() {
  await ensureSyncStateTableAsync();
  const row = await BD.queryOne(`SELECT ultima_corrida FROM pictograma_sync_estado WHERE id = 1`);
  return row?.ultima_corrida ? new Date(row.ultima_corrida) : null;
}

export function startPictogramaSyncJob() {
  if (process.env.PICTOGRAM_SYNC_ENABLED !== 'true') return null;

  const language = process.env.PICTOGRAM_SYNC_LANGUAGE || 'es';
  const intervalDays = parsePositiveInt(process.env.PICTOGRAM_SYNC_INTERVAL_DAYS, DEFAULT_INTERVAL_DAYS);
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

  // Lock simple en memoria: evita que dos syncs completos corran a la vez en
  // este mismo proceso. Sin esto, si una corrida se llegara a extender mas de
  // CHECK_INTERVAL_MS (por ejemplo GitHub o Groq respondiendo lento), el
  // siguiente chequeo periodico la ve "vencida" (todavia no se registro
  // recordSyncAttemptAsync porque no termino) y arrancaria una segunda
  // descarga completa en paralelo.
  let isSyncRunning = false;

  const run = async () => {
    if (isSyncRunning) {
      console.log('[Pictogramas] Ya hay un sync en curso: se saltea esta corrida.');
      return;
    }
    isSyncRunning = true;
    try {
      await runPictogramSyncAsync({ language });
    } catch (error) {
      console.error('[Pictogramas] Error en el sync programado:', error.message);
    } finally {
      isSyncRunning = false;
    }
  };

  // Reintenta SOLO la traduccion (no vuelve a bajar ni a importar ningun
  // catalogo) cuando quedaron pictogramas en ingles de una corrida anterior.
  // Se llama en cada chequeo de 6hs que no dispara un sync completo.
  const retryPendingTranslationsIfAny = async () => {
    try {
      const pendingCount = await countPendingTranslationsAsync();
      if (pendingCount === 0) return;

      console.log(`[Pictogramas] Hay ${pendingCount} etiquetas sin traducir de una corrida anterior: reintentando.`);
      const stats = await translatePendingLabelsAsync({
        log: (message) => console.log(`[Pictogramas] Traduccion: ${message}`),
      });
      if (stats.error) {
        console.log(`[Pictogramas] Traduccion: ${stats.error}. Se reintenta en el proximo chequeo.`);
      } else {
        console.log(`[Pictogramas] Traduccion: ${stats.translated}/${stats.pending} traducidas.`);
      }
    } catch (error) {
      console.error('[Pictogramas] Error reintentando traducciones pendientes:', error.message);
    }
  };

  // OJO — no se puede usar setInterval con el intervalo real.
  //
  // setInterval/setTimeout guardan el delay en un entero de 32 bits con signo:
  // el maximo es 2.147.483.647 ms (~24,9 dias). 30 dias son 2.592.000.000 ms,
  // asi que se pasa, y Node NO tira error: lo trata como 1 ms. Resultado: el
  // sync se disparaba en loop infinito y bajaba el catalogo de Mulberry (13MB)
  // cientos de veces por minuto en cada arranque del backend.
  //
  // En vez de temporizar el intervalo completo, se chequea seguido (cada 6hs,
  // bien por debajo del limite) y se sincroniza solo si REALMENTE paso el
  // tiempo configurado desde el ultimo sync.
  const checkAndRunIfDue = async () => {
    try {
      const lastSyncAt = await getLastSyncAtAsync();
      const elapsedMs = lastSyncAt ? Date.now() - lastSyncAt.getTime() : Infinity;

      if (elapsedMs < intervalMs) {
        // Todavia no toca el sync completo, pero igual vale la pena revisar
        // si quedaron traducciones pendientes de una corrida anterior (por
        // ejemplo, si Groq se quedo sin cupo diario a mitad del catalogo la
        // ultima vez). El cupo de Groq se resetea por dia, y este chequeo
        // corre cada 6hs, asi que lo pendiente termina traduciendose solo al
        // otro dia, sin esperar los 30 dias hasta el proximo sync.
        const diasRestantes = ((intervalMs - elapsedMs) / 86400000).toFixed(1);
        console.log(`[Pictogramas] Todavia no corresponde sincronizar (faltan ${diasRestantes} dias).`);
        await retryPendingTranslationsIfAny();
        return;
      }

      console.log(
        lastSyncAt
          ? `[Pictogramas] Ultimo sync hace ${(elapsedMs / 86400000).toFixed(1)} dias: sincronizando.`
          : '[Pictogramas] No hay ningun sync previo: sincronizando.',
      );
      await run();
    } catch (error) {
      console.error('[Pictogramas] Error verificando si corresponde sincronizar:', error.message);
    }
  };

  const timer = setInterval(() => void checkAndRunIfDue(), CHECK_INTERVAL_MS);
  // No mantiene el proceso vivo solo por este timer.
  if (typeof timer.unref === 'function') timer.unref();

  if (process.env.PICTOGRAM_SYNC_ON_START === 'true') {
    // Fuerza un sync al arrancar, sin importar cuando fue el ultimo. Sin await
    // a proposito: el arranque del server no espera a que bajen los catalogos.
    console.log('[Pictogramas] PICTOGRAM_SYNC_ON_START=true: forzando sync al arrancar.');
    void run();
  } else {
    // Primer chequeo diferido: evita que un reinicio en desarrollo dispare una
    // descarga inmediata, y le da tiempo al server a terminar de levantar.
    const firstCheck = setTimeout(() => void checkAndRunIfDue(), FIRST_CHECK_DELAY_MS);
    if (typeof firstCheck.unref === 'function') firstCheck.unref();
  }

  console.log(
    `[Pictogramas] Sync automatico activo: cada ${intervalDays} dias `
    + `(se verifica cada ${CHECK_INTERVAL_MS / 3600000}hs) — ${BULK_CATALOG_PROVIDERS.map((p) => p.key).join(', ')}.`,
  );
  return timer;
}
