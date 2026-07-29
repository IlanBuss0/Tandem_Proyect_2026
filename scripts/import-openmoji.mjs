import OpenMojiProvider from '../src/providers/pictograms/OpenMojiProvider.js';
import PictogramCatalogImporter from '../src/services/PictogramCatalogImporter.js';

// Importador del catalogo de OpenMoji (~3.900 emojis a color, sin contar las
// variantes de tono de piel que el provider descarta como duplicados).
//
// Uso:
//   node scripts/import-openmoji.mjs
//   node scripts/import-openmoji.mjs --limit=50
//   node scripts/import-openmoji.mjs --force

function parseArgs() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  return {
    limit: limitArg ? Number.parseInt(limitArg.replace('--limit=', ''), 10) : null,
    force: args.includes('--force'),
  };
}

async function main() {
  const { limit, force } = parseArgs();

  console.log('Bajando el catalogo de OpenMoji (release oficial)...');
  const provider = new OpenMojiProvider();
  const { pictograms: all, version } = await provider.syncCatalog({ language: 'es' });
  const pictograms = limit ? all.slice(0, limit) : all;
  console.log(`OpenMoji ${version}: ${all.length} emojis utiles. A procesar: ${pictograms.length}.`);

  const importer = new PictogramCatalogImporter();
  const stats = await importer.importAsync({
    source: provider.key,
    storagePrefix: 'pictogramas/openmoji',
    pictograms,
    force,
  });

  console.log('--- Resumen ---');
  console.log(`Subidos a storage:        ${stats.uploaded}`);
  console.log(`Sin cambios (salteados):  ${stats.skipped}`);
  console.log(`Fallidos:                 ${stats.failed}`);
  console.log(`Rechazados por licencia:  ${stats.rejected}`);
  console.log(`Guardados en la base:     ${stats.affected}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Error importando OpenMoji:', error);
  process.exit(1);
});
