import crypto from 'crypto';
import sharp from 'sharp';
import BD from '../src/db/BD.js';
import PictogramaRepository from '../src/repositories/PictogramaRepository.js';
import MulberryProvider from '../src/providers/pictograms/MulberryProvider.js';
import FileStorageService from '../src/services/FileStorageService.js';
import { assertLicenseAllowed } from '../src/modules/pictograms/license-whitelist.js';

// Importador del catalogo de Mulberry Symbols (3.436 ilustraciones de CAA).
//
// Uso:
//   node scripts/import-mulberry.mjs                (importa/actualiza todo)
//   node scripts/import-mulberry.mjs --limit=50     (prueba rapida)
//   node scripts/import-mulberry.mjs --force        (re-sube aunque el hash no cambie)
//
// Como funciona el rehosteo: los SVG se rasterizan a PNG con sharp y se
// suben a Supabase Storage. Dos razones para no guardar el SVG tal cual:
//   1. El bucket rechaza image/svg+xml (mime type no permitido).
//   2. Un SVG de terceros puede traer <script>; el PNG lo elimina por
//      construccion, sin depender de sanitizar markup a mano.
//
// El hash SHA-256 del SVG original se guarda en metadata.assetHash. En el
// sync mensual, si el hash no cambio, se saltea rasterizar+subir y se
// conserva la URL existente — un re-sync tipico no vuelve a subir nada.

const STORAGE_PREFIX = 'pictogramas/mulberry';
const PNG_SIZE = 512;
const UPLOAD_CONCURRENCY = 10;

function parseArgs() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  return {
    limit: limitArg ? Number.parseInt(limitArg.replace('--limit=', ''), 10) : null,
    force: args.includes('--force'),
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/** Corre `worker` sobre `items` con como maximo `concurrency` en paralelo. */
async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const { limit, force } = parseArgs();
  const repository = new PictogramaRepository();
  await repository.ensureSchemaAsync();

  const provider = new MulberryProvider();
  const fileStorage = new FileStorageService();

  console.log('Bajando el catalogo de Mulberry desde GitHub...');
  const { pictograms: all, licenseText } = await provider.syncCatalog({ language: 'es' });
  const pictograms = limit ? all.slice(0, limit) : all;
  console.log(`Catalogo: ${all.length} simbolos. A procesar: ${pictograms.length}.`);
  if (licenseText && !licenseText.includes('by-sa/4.0')) {
    // Si upstream cambia la licencia, se corta antes de importar nada.
    throw new Error('El LICENSE.txt de Mulberry ya no declara CC BY-SA 4.0. Revisar antes de importar.');
  }

  // Hashes ya importados, para saltear lo que no cambio.
  const existingRows = await BD.query(
    `SELECT origen_id, url, metadata->>'assetHash' AS asset_hash
       FROM pictogramas WHERE origen = 'MULBERRY' AND idioma = 'es'`,
  );
  const existing = new Map(existingRows.map((row) => [row.origen_id, row]));
  console.log(`Ya en la base: ${existing.size}.`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const ready = [];

  await runPool(pictograms, UPLOAD_CONCURRENCY, async (pictogram) => {
    const assetHash = sha256(pictogram.svgBuffer);
    const previous = existing.get(pictogram.id);

    // Sin cambios y ya rehosteado en nuestro storage -> se reusa la URL.
    if (!force && previous?.asset_hash === assetHash && previous.url?.includes('/storage/v1/object/public/')) {
      ready.push({ ...pictogram, imageUrl: previous.url, downloadUrl: previous.url, assetHash });
      skipped += 1;
      return;
    }

    try {
      // limitInputPixels: false porque un puñado de SVG de Mulberry declaran
      // un viewBox enorme y a 300 DPI superan el limite por defecto de sharp
      // ("Input image exceeds pixel limit"). El resize posterior los baja a
      // 512x512 igual, asi que el pico de memoria es acotado.
      const png = await sharp(pictogram.svgBuffer, { density: 300, limitInputPixels: false })
        .resize(PNG_SIZE, PNG_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      const fileName = `${safeSlug(pictogram.metadata.fileBaseName)}.png`;
      const { url } = await fileStorage.uploadAsync({
        buffer: png,
        contentType: 'image/png',
        fileName,
        userId: 'system',
        path: `${STORAGE_PREFIX}/${fileName}`,
        upsert: true,
        // Se re-sube con upsert cuando cambia el arte original: 30 dias en
        // vez del default de 1 anio immutable de FileStorageService.
        cacheControl: 'public, max-age=2592000',
      });

      ready.push({ ...pictogram, imageUrl: url, downloadUrl: url, assetHash });
      uploaded += 1;
      if (uploaded % 250 === 0) console.log(`  subidos ${uploaded}...`);
    } catch (error) {
      failed += 1;
      console.warn(`  fallo ${pictogram.id}: ${error.message}`);
    }
  });

  // Gate legal: se aplica a todo, aunque el provider ya declare la licencia.
  const authorized = [];
  for (const pictogram of ready) {
    try {
      assertLicenseAllowed(pictogram);
      authorized.push({
        ...pictogram,
        metadata: { ...pictogram.metadata, assetHash: pictogram.assetHash },
      });
    } catch (error) {
      console.warn(`  rechazado por licencia (${pictogram.id}): ${error.message}`);
    }
  }

  const affected = await repository.upsertManyAsync(authorized);

  console.log('--- Resumen ---');
  console.log(`Subidos a storage:        ${uploaded}`);
  console.log(`Sin cambios (salteados):  ${skipped}`);
  console.log(`Fallidos:                 ${failed}`);
  console.log(`Guardados en la base:     ${affected}`);
  process.exit(failed > 0 && affected === 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Error importando Mulberry:', error);
  process.exit(1);
});
