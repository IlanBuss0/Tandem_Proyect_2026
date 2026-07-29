import axiosClient from '../../modules/axios/axiosClient.js';
import { normalizeExternalCategory } from './categoryMapper.js';
import { GLOBAL_SYMBOLS_ALLOWED_SETS, filterAllowedGlobalSymbolsResults } from '../../modules/pictograms/license-whitelist.js';

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
      // para el reporte de atribuciones agrupado por coleccion real.
      symbolsetId: picto.symbolset_id,
      symbolsetSlug: setInfo.slug,
      symbolsetName: setInfo.name,
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
   * amplia de terminos de busqueda (Global Symbols no expone "traeme todo").
   *
   * IMPORTANTE — se busca en INGLES, no en espanol. Esta fue la causa del
   * primer import fallido: buscando en espanol, las colecciones con mas
   * etiquetas hispanas son ARASAAC (bloqueada) y Blissymbolics, con lo cual
   * el 97% del catalogo importado termino siendo Blissymbolics (simbolos
   * abstractos ilegibles) y las colecciones utiles quedaron con 1-2 resultados.
   * Medido sobre 750 labels: en ingles, OpenMoji devuelve 114 coincidencias,
   * PiCom AI Realistic 95, Cartoon 60, HighContrast 53; Blissymbolics 12.
   *
   * Los nombres quedan en ingles y los traduce despues
   * scripts/translate-catalog-labels.mjs.
   */
  async syncCatalog({ searchTerms, language = 'en' }) {
    const byId = new Map();
    for (const term of searchTerms || []) {
      const raw = await this.searchRaw({ language, text: term }).catch(() => []);
      const allowed = filterAllowedGlobalSymbolsResults(raw);
      for (const item of allowed) {
        // Se normaliza como 'es' aunque la busqueda fue en ingles: el catalogo
        // local es en espanol y el nombre se traduce en el paso siguiente.
        const normalized = this.normalizePictogram(item, 'es');
        if (normalized) byId.set(normalized.id, normalized);
      }
    }
    return Array.from(byId.values());
  }
}
