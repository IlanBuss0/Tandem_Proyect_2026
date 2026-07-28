import axios from 'axios';
import sharp from 'sharp';
import BD from '../src/db/BD.js';
import PictogramaRepository from '../src/repositories/PictogramaRepository.js';
import GlobalSymbolsProvider from '../src/providers/pictograms/GlobalSymbolsProvider.js';
import FileStorageService from '../src/services/FileStorageService.js';
import { assertLicenseAllowed, GLOBAL_SYMBOLS_ALLOWED_SETS } from '../src/modules/pictograms/license-whitelist.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Migracion de pictogramas a librerias con licencia comercial (Fase 5).
// Importa el catalogo de Global Symbols (19 colecciones aprobadas: Mulberry,
// PiCom x8, OCHA, OpenMoji, Blissymbolics, etc.) a la base local, con la
// misma validacion legal que corre en produccion.
//
// Uso:
//   node scripts/import-pictogram-catalog.mjs                 (lista por defecto)
//   node scripts/import-pictogram-catalog.mjs --terms=comer,agua,dormir
//   node scripts/import-pictogram-catalog.mjs --limit-terms=3 (solo probar con 3 terminos)
//   node scripts/import-pictogram-catalog.mjs --no-rehost     (no sube a Supabase Storage,
//                                                               deja el imageUrl apuntando
//                                                               directo a globalsymbols.com)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANGUAGE = process.env.PICTOGRAM_SYNC_LANGUAGE || 'es';

// Vocabulario nucleo de CAA en espanol + vocabulario rioplatense. Mismo
// espiritu que SYNC_SEARCH_TERMS de ArasaacProvider, pensado para maximizar
// cobertura real de conceptos de uso diario.
const DEFAULT_SEARCH_TERMS = [
  'comer', 'beber', 'agua', 'dormir', 'jugar', 'bano', 'ayuda', 'dolor',
  'contento', 'triste', 'enfadado', 'miedo', 'cansado', 'casa', 'escuela',
  'mama', 'papa', 'familia', 'vestirse', 'lavarse las manos', 'musica',
  'medico', 'trabajar', 'leer', 'escribir', 'esperar', 'salir', 'si', 'no',
  'gracias', 'por favor', 'hola', 'chau', 'quiero', 'necesito', 'siento',
  'colectivo', 'remera', 'pileta', 'auto', 'telefono', 'computadora',
  'television', 'comida', 'fruta', 'verdura', 'ropa', 'zapatos', 'cama',
  'silla', 'mesa', 'cocina', 'bano', 'jardin', 'calle', 'tienda', 'dinero',
];

function parseArgs() {
  const args = process.argv.slice(2);
  const termsArg = args.find((arg) => arg.startsWith('--terms='));
  const limitTermsArg = args.find((arg) => arg.startsWith('--limit-terms='));
  const noRehost = args.includes('--no-rehost');

  const terms = termsArg
    ? termsArg.replace('--terms=', '').split(',').map((t) => t.trim()).filter(Boolean)
    : DEFAULT_SEARCH_TERMS;
  const limitTerms = limitTermsArg ? Number.parseInt(limitTermsArg.replace('--limit-terms=', ''), 10) : null;

  return {
    searchTerms: limitTerms ? terms.slice(0, limitTerms) : terms,
    rehost: !noRehost,
  };
}

function safeSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

async function rehostImage(pictogram, fileStorage) {
  const response = await axios.get(pictogram.imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
  const png = await sharp(Buffer.from(response.data))
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const storagePath = `pictogramas/global-symbols/${safeSlug(pictogram.symbolsetSlug)}/${safeSlug(pictogram.id)}.png`;
  const uploaded = await fileStorage.uploadAsync({
    buffer: png,
    contentType: 'image/png',
    fileName: `${safeSlug(pictogram.id)}.png`,
    userId: 'system', // requerido por FileStorageService, no se usa porque se pasa `path` explicito
    path: storagePath,
    upsert: true,
  });

  return { ...pictogram, imageUrl: uploaded.url, downloadUrl: uploaded.url };
}

async function main() {
  const { searchTerms, rehost } = parseArgs();
  console.log(`Importando catalogo de Global Symbols. Idioma: ${LANGUAGE}. Terminos: ${searchTerms.length}. Rehost: ${rehost}.`);

  const repository = new PictogramaRepository();
  await repository.ensureSchemaAsync();

  const provider = new GlobalSymbolsProvider();
  const fileStorage = rehost ? new FileStorageService() : null;

  // Evidencia con fecha del estado de licencias de Global Symbols al momento
  // de importar (para poder demostrar que se importo bajo licencias
  // verificadas, si algun dia hace falta).
  try {
    const symbolsetsResponse = await axios.get('https://globalsymbols.com/api/v1/symbolsets', { timeout: 20000 });
    const evidencePath = path.join(__dirname, '..', 'docs', 'licenses', `global-symbols-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(evidencePath, JSON.stringify(symbolsetsResponse.data, null, 2));
    console.log(`Evidencia de licencias guardada en ${evidencePath}`);
  } catch (error) {
    console.warn('No se pudo guardar la evidencia de licencias (no bloquea el import):', error.message);
  }

  const pictograms = await provider.syncCatalog({ language: LANGUAGE, searchTerms });
  console.log(`Encontrados ${pictograms.length} pictogramas unicos en ${GLOBAL_SYMBOLS_ALLOWED_SETS.size} colecciones aprobadas.`);

  let imported = 0;
  let rejected = 0;
  let rehostFailed = 0;
  const finalPictograms = [];

  for (const pictogram of pictograms) {
    try {
      // Gate legal: nunca se saltea, aunque el proveedor ya venga filtrado.
      assertLicenseAllowed(pictogram);
    } catch (error) {
      rejected += 1;
      console.warn(`Rechazado por licencia (${pictogram.id}): ${error.message}`);
      continue;
    }

    let finalPictogram = pictogram;
    if (rehost) {
      try {
        finalPictogram = await rehostImage(pictogram, fileStorage);
      } catch (error) {
        rehostFailed += 1;
        console.warn(`No se pudo re-hostear ${pictogram.id}, se guarda con la URL original: ${error.message}`);
      }
    }

    finalPictograms.push(finalPictogram);
    imported += 1;
  }

  const affected = await repository.upsertManyAsync(finalPictograms);

  console.log('--- Resumen ---');
  console.log(`Encontrados:        ${pictograms.length}`);
  console.log(`Rechazados (licencia no valida): ${rejected}`);
  console.log(`Fallo el re-hosteo (se guardo con URL original): ${rehostFailed}`);
  console.log(`Importados/actualizados en la base: ${affected}`);

  process.exit(0);
}

main().catch((error) => {
  console.error('Error importando el catalogo de pictogramas:', error);
  process.exit(1);
});
