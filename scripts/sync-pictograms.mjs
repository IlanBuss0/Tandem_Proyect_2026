import { runPictogramSyncAsync } from '../src/jobs/pictogramaSyncJob.js';

// Corre a mano la misma sincronizacion que ejecuta el job mensual
// (src/jobs/pictogramaSyncJob.js). Util para forzar una actualizacion sin
// esperar el intervalo, o para verificar que los proveedores responden.
//
// Antes este script llamaba a syncFromArasaacAsync: ahora sincroniza todos
// los proveedores bulk (Mulberry + OpenMoji) y respeta el hash incremental.
//
// Uso:
//   npm run pictograms:sync
//   node scripts/sync-pictograms.mjs --force   (re-sube todo, ignora el hash)

const force = process.argv.includes('--force');
const language = process.env.PICTOGRAM_SYNC_LANGUAGE || 'es';

const results = await runPictogramSyncAsync({ language, force });

console.log('');
console.log('--- Resumen del sync ---');
for (const result of results) {
  if (result.error) {
    console.log(`${result.provider}: ERROR - ${result.error}`);
  } else {
    console.log(
      `${result.provider}: ${result.affected} guardados `
      + `(${result.uploaded} subidos, ${result.skipped} sin cambios, ${result.failed} fallidos)`,
    );
  }
}

const hadErrors = results.some((result) => result.error);
process.exit(hadErrors ? 1 : 0);
