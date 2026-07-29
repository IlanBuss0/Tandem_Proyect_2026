import PictogramCatalogImporter from '../services/PictogramCatalogImporter.js';
import { PICTOGRAM_PROVIDERS, BULK_CATALOG_PROVIDERS } from '../providers/pictograms/index.js';
import { cacheService } from '../services/CacheService.js';

// Sync mensual del catalogo de pictogramas.
//
// Este job es el UNICO camino por el que entran pictogramas nuevos desde las
// APIs/repos externos. La busqueda en vivo (PictogramaService.searchAsync) no
// sale nunca a la red: lee solo de la base. Ver el comentario en searchAsync.
//
// Que hace en cada corrida:
//   1. Baja el catalogo completo de cada proveedor bulk (Mulberry, OpenMoji).
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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

  // Las busquedas y el listado de categorias quedan cacheados; despues de un
  // sync hay que tirar ese cache o los pictogramas nuevos no aparecen hasta
  // que expire solo.
  await cacheService.delByPattern('pictogram.*');

  return results;
}

export function startPictogramaSyncJob() {
  if (process.env.PICTOGRAM_SYNC_ENABLED !== 'true') return null;

  const language = process.env.PICTOGRAM_SYNC_LANGUAGE || 'es';
  const intervalDays = parsePositiveInt(process.env.PICTOGRAM_SYNC_INTERVAL_DAYS, DEFAULT_INTERVAL_DAYS);
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

  const run = async () => {
    try {
      await runPictogramSyncAsync({ language });
    } catch (error) {
      console.error('[Pictogramas] Error en el sync programado:', error.message);
    }
  };

  const timer = setInterval(run, intervalMs);
  // No mantiene el proceso vivo solo por este timer.
  if (typeof timer.unref === 'function') timer.unref();

  if (process.env.PICTOGRAM_SYNC_ON_START === 'true') {
    // Sin await a proposito: el arranque del server no espera a que termine
    // de bajar los catalogos.
    void run();
  }

  console.log(`[Pictogramas] Sync automatico activo cada ${intervalDays} dias (${BULK_CATALOG_PROVIDERS.map((p) => p.key).join(', ')}).`);
  return timer;
}
