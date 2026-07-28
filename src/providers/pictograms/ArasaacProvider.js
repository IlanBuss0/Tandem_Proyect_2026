import https from 'https';
import axiosClient from '../../modules/axios/axiosClient.js';
import { normalizeExternalCategory } from './categoryMapper.js';

// Extraido tal cual de src/services/PictogramaService.js (pre-refactor
// multi-proveedor). ARASAAC es CC BY-NC-SA: queda marcado
// commercialUseAllowed = false a proposito. Sigue existiendo como proveedor
// -no se borra el catalogo- pero detras de PICTOGRAM_COMMERCIAL_MODE deja de
// aparecer en resultados (ver Fase 4, PictogramaRepository.searchAsync).
const DEFAULT_ARASAAC_API_URL = 'https://api.arasaac.org/api';
const DEFAULT_ARASAAC_STATIC_URL = 'https://static.arasaac.org/pictograms';
const DEFAULT_RESOLUTION = 300;
const DEFAULT_ARASAAC_TIMEOUT_MS = 30000;
const SYNC_SEARCH_TERMS = [
  'acciones y rutinas', 'actividades', 'casa', 'comida', 'comunicacion',
  'compras y dinero', 'conceptos', 'conductas', 'emociones',
  'escuela y aprendizaje', 'higiene', 'lugares', 'naturaleza', 'objetos',
  'ocio', 'personas', 'salud y cuerpo', 'tecnologia', 'tiempo', 'transporte',
  'vida diaria', 'beber', 'comer', 'dolor', 'familia', 'jugar', 'leer', 'vestirse',
];

const allowSelfSignedCertificates =
  process.env.ARASAAC_ALLOW_SELF_SIGNED === 'true' || process.env.NODE_ENV !== 'production';
const arasaacHttpsAgent = new https.Agent({
  rejectUnauthorized: !allowSelfSignedCertificates,
});

function normalizeKeyword(keyword) {
  if (!keyword || typeof keyword !== 'object') return null;
  return keyword.keyword || keyword.plural || null;
}

export default class ArasaacProvider {
  key = 'ARASAAC';
  commercialUseAllowed = false;
  licenseCode = 'CC-BY-NC-SA-4.0';

  constructor() {
    this.baseUrl = (process.env.ARASAAC_API_BASE_URL || DEFAULT_ARASAAC_API_URL).replace(/\/$/, '');
  }

  buildImageUrl(id, resolution = DEFAULT_RESOLUTION) {
    const staticUrl = (process.env.ARASAAC_STATIC_URL || DEFAULT_ARASAAC_STATIC_URL).replace(/\/$/, '');
    return `${staticUrl}/${id}/${id}_${resolution}.png`;
  }

  normalizePictogram(pictogram, language) {
    const id = pictogram?._id || pictogram?.id;
    const keywords = Array.isArray(pictogram?.keywords) ? pictogram.keywords.map(normalizeKeyword).filter(Boolean) : [];
    const name = keywords[0] || pictogram?.text || pictogram?.name || `Pictograma ${id}`;

    return {
      id: String(id),
      arasaacId: Number(id),
      name,
      emoji: '',
      imageUrl: this.buildImageUrl(id),
      downloadUrl: this.buildImageUrl(id, 500),
      category: normalizeExternalCategory(pictogram?.categories),
      tags: Array.from(new Set(keywords.slice(1, 8))),
      language,
      source: 'ARASAAC',
      author: 'Sergio Palao',
      license: 'CC BY-NC-SA',
      licenseCode: this.licenseCode,
      licenseVersion: '4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      attributionText: 'Autor: Sergio Palao. Propietario: Gobierno de Aragon (ARASAAC).',
      sourceUrl: 'https://arasaac.org',
      commercialUseAllowed: this.commercialUseAllowed,
      shareAlikeRequired: true,
    };
  }

  async fetchArasaacPictograms(path) {
    try {
      const response = await axiosClient.get(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        httpsAgent: arasaacHttpsAgent,
        timeout: Number.parseInt(process.env.ARASAAC_REQUEST_TIMEOUT_MS || DEFAULT_ARASAAC_TIMEOUT_MS, 10),
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      if (error?.response?.status === 404) return [];
      throw new Error(`No se pudieron obtener pictogramas de ARASAAC: ${error.message}`);
    }
  }

  async fetchArasaacPictogram(path) {
    try {
      const response = await axiosClient.get(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        httpsAgent: arasaacHttpsAgent,
        timeout: Number.parseInt(process.env.ARASAAC_REQUEST_TIMEOUT_MS || DEFAULT_ARASAAC_TIMEOUT_MS, 10),
      });
      return response.data;
    } catch (error) {
      if (error?.response?.status === 404) return null;
      throw new Error(`No se pudo obtener el pictograma de ARASAAC: ${error.message}`);
    }
  }

  async fetchArasaacCatalog(locale) {
    const configuredPath = process.env.ARASAAC_PICTOGRAMS_SYNC_PATH;
    const candidatePaths = [
      configuredPath ? configuredPath.replace('{language}', encodeURIComponent(locale)) : null,
      `/pictograms/${encodeURIComponent(locale)}/all`,
      `/pictograms/${encodeURIComponent(locale)}`,
    ].filter(Boolean);

    for (const path of candidatePaths) {
      const pictograms = await this.fetchArasaacPictograms(path).catch(() => []);
      if (pictograms.length > 0) return pictograms;
    }

    const byId = new Map();
    for (const term of SYNC_SEARCH_TERMS) {
      const path = `/pictograms/${encodeURIComponent(locale)}/search/${encodeURIComponent(term)}`;
      const pictograms = await this.fetchArasaacPictograms(path).catch(() => []);
      for (const pictogram of pictograms) {
        const id = pictogram?._id || pictogram?.id;
        if (id) byId.set(String(id), pictogram);
      }
    }

    return Array.from(byId.values());
  }

  async search({ language, text, limit }) {
    const path = text
      ? `/pictograms/${encodeURIComponent(language)}/search/${encodeURIComponent(text)}`
      : `/pictograms/${encodeURIComponent(language)}/new/${limit}`;

    const pictograms = await this.fetchArasaacPictograms(path).catch(() => []);
    return pictograms.map((pictogram) => this.normalizePictogram(pictogram, language));
  }

  async getById({ language, id }) {
    const path = `/pictograms/${encodeURIComponent(language)}/${encodeURIComponent(id)}`;
    const pictogram = await this.fetchArasaacPictogram(path);
    return pictogram ? this.normalizePictogram(pictogram, language) : null;
  }

  async syncCatalog({ language }) {
    const pictograms = await this.fetchArasaacCatalog(language);
    return pictograms.map((pictogram) => this.normalizePictogram(pictogram, language));
  }
}
