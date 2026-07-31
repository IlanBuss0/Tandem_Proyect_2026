import { translatePendingLabelsAsync } from '../src/services/PictogramTranslationService.js';

// Traduce a mano el catalogo de pictogramas. La logica vive en
// src/services/PictogramTranslationService.js, compartida con el sync
// automatico (src/jobs/pictogramaSyncJob.js) — ver ese archivo para el
// detalle de como funciona la traduccion y el fallback de modelos.
//
// Uso:
//   npm run pictograms:translate-catalog
//   node scripts/translate-catalog-labels.mjs --limit=200
//   node scripts/translate-catalog-labels.mjs --retranslate   (rehace todo)

function parseArgs() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  return {
    limit: limitArg ? Number.parseInt(limitArg.replace('--limit=', ''), 10) : null,
    retranslate: args.includes('--retranslate'),
  };
}

async function main() {
  const { limit, retranslate } = parseArgs();
  const result = await translatePendingLabelsAsync({ limit, retranslate, log: console.log });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.pending === 0) {
    console.log('No hay etiquetas pendientes de traducir.');
    process.exit(0);
  }

  console.log('--- Resumen ---');
  console.log(`Traducidas:      ${result.translated}`);
  console.log(`Lotes fallidos:  ${result.failedBatches}`);
  if (result.failedBatches > 0) {
    console.log('Volve a correr el script para reintentar solo lo que quedo pendiente.');
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('Error traduciendo el catalogo:', error);
  process.exit(1);
});
