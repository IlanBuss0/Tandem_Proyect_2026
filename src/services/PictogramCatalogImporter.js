import crypto from 'crypto';
import sharp from 'sharp';
import BD from '../db/BD.js';
import PictogramaRepository from '../repositories/PictogramaRepository.js';
import FileStorageService from './FileStorageService.js';
import { assertLicenseAllowed } from '../modules/pictograms/license-whitelist.js';

// Importador comun a todos los proveedores de catalogo que traen los archivos
// en memoria (Mulberry, OpenMoji). Centraliza lo que antes estaba duplicado:
// hash para saltear lo que no cambio, rasterizado a PNG, subida a storage,
// gate de licencia y upsert.
//
// Reglas que garantiza:
//   - Todo pictograma queda rehosteado en NUESTRO storage. La app nunca
//     depende de que github.com o globalsymbols.com respondan.
//   - Todo pictograma pasa por assertLicenseAllowed antes de guardarse.
//   - Un re-sync mensual sin cambios upstream no vuelve a subir nada (se
//     compara el SHA-256 del archivo original guardado en metadata.assetHash).

const PNG_SIZE = 512;
const DEFAULT_CONCURRENCY = 10;

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

export default class PictogramCatalogImporter {
  constructor({ repository = null, fileStorage = null } = {}) {
    this.repository = repository ?? new PictogramaRepository();
    this.fileStorage = fileStorage ?? new FileStorageService();
  }

  /**
   * @param {object} options
   * @param {string} options.source        valor de `origen` en la base ('MULBERRY', 'OPENMOJI', 'GLOBAL_SYMBOLS')
   * @param {string} options.storagePrefix carpeta en storage ('pictogramas/mulberry')
   * @param {Array}  options.pictograms    salida del provider (con svgBuffer)
   * @param {string} [options.language]
   * @param {boolean} [options.force]      re-sube aunque el hash no haya cambiado
   * @param {(msg: string) => void} [options.log]
   */
  async importAsync({ source, storagePrefix, pictograms, language = 'es', force = false, concurrency = DEFAULT_CONCURRENCY, log = console.log }) {
    await this.repository.ensureSchemaAsync();

    const existingRows = await BD.query(
      `SELECT origen_id, url, metadata->>'assetHash' AS asset_hash
         FROM pictogramas WHERE origen = $1 AND idioma = $2`,
      [source, language],
    );
    const existing = new Map(existingRows.map((row) => [row.origen_id, row]));
    log(`Ya en la base: ${existing.size}.`);

    const stats = { uploaded: 0, skipped: 0, failed: 0, rejected: 0 };
    const ready = [];

    await runPool(pictograms, concurrency, async (pictogram) => {
      const assetHash = sha256(pictogram.svgBuffer);
      const previous = existing.get(pictogram.id);
      const unchanged = !force && previous?.asset_hash === assetHash && previous.url?.includes('/storage/v1/object/public/');

      if (unchanged) {
        // Ni se rasteriza ni se sube ni se escribe en la base: la fila de
        // Postgres ya tiene exactamente estos datos de una corrida anterior.
        // Antes esto igual se mandaba al upsert (una transaccion de ~5.900
        // filas todos los meses sin necesidad), y de paso hubiera vuelto a
        // pisar texto_busqueda con el nombre en ingles del proveedor. Ver el
        // ON CONFLICT de upsertManyAsync para ese fix aparte.
        stats.skipped += 1;
        return;
      }

      try {
        // limitInputPixels: false porque algunos SVG declaran un viewBox
        // enorme y a 300 DPI superan el limite por defecto de sharp. El
        // resize posterior los baja a 512x512, asi que la memoria es acotada.
        const png = await sharp(pictogram.svgBuffer, { density: 300, limitInputPixels: false })
          .resize(PNG_SIZE, PNG_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();

        const fileName = `${safeSlug(pictogram.id.replace(/^[^:]+:/, ''))}.png`;
        const { url } = await this.fileStorage.uploadAsync({
          buffer: png,
          contentType: 'image/png',
          fileName,
          userId: 'system',
          path: `${storagePrefix}/${fileName}`,
          upsert: true,
          // Se re-sube con upsert cuando cambia el arte original (poco
          // frecuente), asi que 30 dias en vez del default de 1 anio immutable.
          cacheControl: 'public, max-age=2592000',
        });

        ready.push({ ...pictogram, imageUrl: url, downloadUrl: url, assetHash });
        stats.uploaded += 1;
        if (stats.uploaded % 250 === 0) log(`  subidos ${stats.uploaded}...`);
      } catch (error) {
        stats.failed += 1;
        log(`  fallo ${pictogram.id}: ${error.message}`);
      }
    });

    // Gate legal: se aplica a todo lo NUEVO o CAMBIADO, aunque el provider ya
    // declare su licencia. Lo sin cambios (`ready` no las incluye) ya paso
    // este chequeo en una corrida anterior.
    const authorized = [];
    for (const pictogram of ready) {
      try {
        assertLicenseAllowed(pictogram);
        authorized.push({
          ...pictogram,
          metadata: { ...(pictogram.metadata ?? {}), assetHash: pictogram.assetHash },
        });
      } catch (error) {
        stats.rejected += 1;
        log(`  rechazado por licencia (${pictogram.id}): ${error.message}`);
      }
    }

    // Solo se escribe en la base lo nuevo/cambiado. Con un catalogo estable
    // (el caso comun mes a mes) esto puede ser 0 filas.
    stats.affected = authorized.length > 0 ? await this.repository.upsertManyAsync(authorized) : 0;
    return stats;
  }
}
