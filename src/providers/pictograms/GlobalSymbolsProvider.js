import axiosClient from '../../modules/axios/axiosClient.js';
import { normalizeExternalCategory } from './categoryMapper.js';
import {
  GLOBAL_SYMBOLS_ALLOWED_SETS,
  GLOBAL_SYMBOLS_REDUNDANT_SETS,
  filterAllowedGlobalSymbolsResults,
} from '../../modules/pictograms/license-whitelist.js';

// globalsymbols.com/api/v1 — publica, SIN autenticacion, gratis. Cubre 19
// colecciones aprobadas (Mulberry, PiCom, OCHA, OpenMoji, etc.) con una sola
// API. Verificado en produccion:
//   - El endpoint de idioma usa ISO 639-3 ('spa'), NO 'es' (con 'es' da 404).
//   - El parametro `symbolset` de /labels/search se IGNORA en silencio y
//     sigue devolviendo resultados de ARASAAC. Por eso TODO resultado pasa
//     por filterAllowedGlobalSymbolsResults() antes de normalizarse.
const BASE_URL = 'https://globalsymbols.com/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;
// La API rechaza limit > 50 con {"error":"limit does not have a valid value"}.
// Pedir 100 o 200 no devuelve mas resultados: devuelve CERO.
const MAX_API_LIMIT = 50;

// Mapa minimo ISO 639-1 -> ISO 639-3 para los idiomas que usa Tandem hoy.
// Si en el futuro se agrega un idioma nuevo, hay que sumarlo aca.
const LANGUAGE_TO_ISO_639_3 = {
  es: 'spa',
  en: 'eng',
  pt: 'por',
};

function toIso639_3(language) {
  const normalized = String(language || 'es').trim().toLowerCase();
  if (normalized.length === 3) return normalized; // ya viene en formato spa/eng/etc.
  return LANGUAGE_TO_ISO_639_3[normalized] || 'spa';
}

// Global Symbols no tiene endpoint de "catalogo completo" como Mulberry/
// OpenMoji (que bajan un tarball/zip con todo): hay que pedirle termino por
// termino. Se busca en INGLES (ver comentario de syncCatalog) y se reusa el
// mismo vocabulario nucleo de CAA que ya esta en POPULAR_TITLES
// (PictogramaRepository.js), traducido, para no mantener dos listas del
// mismo concepto en espanol y en ingles.
const DEFAULT_SEARCH_TERMS = [
  'eat', 'drink', 'water', 'bathroom', 'toilet', 'wash hands', 'pain', 'hurt',
  'help', 'yes', 'no', 'happy', 'sad', 'angry', 'scared', 'tired', 'family',
  'mom', 'dad', 'home', 'school', 'sleep', 'get dressed', 'play', 'read',
  'write', 'wait', 'go out', 'doctor', 'supermarket', 'bus',
];

const IMAGE_DOWNLOAD_TIMEOUT_MS = 20000;
const DOWNLOAD_CONCURRENCY = 8;

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

export default class GlobalSymbolsProvider {
  key = 'GLOBAL_SYMBOLS';
  commercialUseAllowed = true;

  normalizePictogram(item, language) {
    const picto = item?.picto || {};
    const setInfo = GLOBAL_SYMBOLS_ALLOWED_SETS.get(picto.symbolset_id);
    if (!setInfo) return null; // defensivo: nunca deberia pasar si ya se filtro antes

    // origen_id prefijado con el slug del set: dos colecciones distintas
    // pueden reusar el mismo numero de picto.id, y pictogramas.origen_id es
    // parte de la clave unica (origen, idioma, origen_id).
    const origenId = `${setInfo.slug}:${picto.id}`;

    return {
      id: origenId,
      arasaacId: null,
      name: item?.text || `Pictograma ${picto.id}`,
      emoji: '',
      imageUrl: picto.image_url,
      downloadUrl: picto.image_url,
      category: normalizeExternalCategory(picto.part_of_speech),
      tags: [],
      language,
      source: this.key,
      author: setInfo.publisher,
      license: setInfo.licenseCode,
      licenseCode: setInfo.licenseCode,
      licenseVersion: setInfo.licenseVersion,
      licenseUrl: setInfo.licenseUrl,
      attributionText: setInfo.attributionText,
      sourceUrl: setInfo.publisherUrl,
      commercialUseAllowed: this.commercialUseAllowed,
      shareAlikeRequired: setInfo.licenseCode === 'CC-BY-SA-4.0' || setInfo.licenseCode === 'CC-BY-SA-2.0-UK',
      // Metadata util para el importador (Fase 5): de que set exacto vino,
      // para el reporte de atribuciones agrupado por coleccion real, y el
      // nombre original en ingles para que scripts/translate-catalog-labels.mjs
      // sepa que traducir (mismo patron que Mulberry/OpenMoji).
      symbolsetId: picto.symbolset_id,
      symbolsetSlug: setInfo.slug,
      symbolsetName: setInfo.name,
      metadata: {
        originalName: item?.text || null,
        symbolsetSlug: setInfo.slug,
        symbolsetId: picto.symbolset_id,
      },
    };
  }

  async searchRaw({ language, text, limit = MAX_API_LIMIT }) {
    const iso = toIso639_3(language);
    try {
      const response = await axiosClient.get(`${BASE_URL}/labels/search`, {
        params: { query: text, language: iso, limit: Math.min(limit, MAX_API_LIMIT) },
        headers: { Accept: 'application/json' },
        timeout: DEFAULT_TIMEOUT_MS,
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      if (error?.response?.status === 404) return [];
      throw new Error(`No se pudieron obtener pictogramas de Global Symbols: ${error.message}`);
    }
  }

  async search({ language, text, limit }) {
    if (!text) return []; // esta API no tiene un endpoint de "novedades" como ARASAAC
    const raw = await this.searchRaw({ language, text, limit: MAX_API_LIMIT });
    const allowed = filterAllowedGlobalSymbolsResults(raw);
    return allowed
      .map((item) => this.normalizePictogram(item, language))
      .filter(Boolean)
      .slice(0, limit || 24);
  }

  async getById() {
    // Global Symbols no expone un endpoint estable de "un picto por id"
    // publico y documentado. Los pictogramas ya importados se resuelven
    // por la propia base local (misma clave origen+origen_id de siempre).
    return null;
  }

  /**
   * Recorre las colecciones aprobadas trayendo resultados para una lista
   * amplia de terminos de busqueda (Global Symbols no expone "traeme todo",
   * a diferencia de Mulberry/OpenMoji que bajan un tarball/zip completo).
   *
   * IMPORTANTE — se busca en INGLES, no en espanol, SIEMPRE, sin importar el
   * `language` que reciba (ese parametro es el idioma de ALMACENAMIENTO, no
   * de busqueda: el sync mensual lo llama con 'es'). Esta fue la causa del
   * primer import fallido: buscando en espanol, las colecciones con mas
   * etiquetas hispanas son ARASAAC (bloqueada) y Blissymbolics, con lo cual
   * el 97% del catalogo importado termino siendo Blissymbolics (simbolos
   * abstractos ilegibles) y las colecciones utiles quedaron con 1-2 resultados.
   * Medido sobre 750 labels: en ingles, OpenMoji devuelve 114 coincidencias,
   * PiCom AI Realistic 95, Cartoon 60, HighContrast 53; Blissymbolics 12.
   *
   * Los nombres quedan en ingles y los traduce despues
   * scripts/translate-catalog-labels.mjs / el paso de traduccion del sync.
   *
   * Cada imagen se DESCARGA y se devuelve como `svgBuffer` (mismo campo que
   * usan Mulberry/OpenMoji) para que PictogramCatalogImporter la re-hostee en
   * nuestro Storage — nunca se guarda solo el link a globalsymbols.com. Un
   * pictograma cuya descarga falla se descarta de esta corrida (no rompe el
   * resto) y se reintenta solo en el proximo sync.
   */
  async syncCatalog({ searchTerms = DEFAULT_SEARCH_TERMS, language: storageLanguage = 'es' } = {}) {
    const byId = new Map();
    for (const term of searchTerms) {
      const raw = await this.searchRaw({ language: 'en', text: term }).catch(() => []);
      const allowed = filterAllowedGlobalSymbolsResults(raw);
      for (const item of allowed) {
        // Mulberry y OpenMoji ya entran completos por su importador directo:
        // traerlos tambien por aca duplicaba el mismo dibujo con otro
        // origen_id. Ver GLOBAL_SYMBOLS_REDUNDANT_SETS.
        if (GLOBAL_SYMBOLS_REDUNDANT_SETS.has(item?.picto?.symbolset_id)) continue;
        const normalized = this.normalizePictogram(item, storageLanguage);
        if (normalized) byId.set(normalized.id, normalized);
      }
    }

    const candidates = Array.from(byId.values());
    const pictograms = [];
    await runPool(candidates, DOWNLOAD_CONCURRENCY, async (pictogram) => {
      try {
        const response = await axiosClient.get(pictogram.imageUrl, {
          responseType: 'arraybuffer',
          timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
        });
        pictograms.push({ ...pictogram, svgBuffer: Buffer.from(response.data) });
      } catch {
        // Se descarta: mejor faltar un pictograma que romper todo el sync.
        // Vuelve a intentarse solo en el proximo sync mensual.
      }
    });

    return { pictograms };
  }
}
