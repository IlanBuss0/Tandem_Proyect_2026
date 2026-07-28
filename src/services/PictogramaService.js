import axiosClient from '../modules/axios/axiosClient.js';
import PictogramaRepository from '../repositories/PictogramaRepository.js';
import { cacheService } from './CacheService.js';
import ArasaacProvider from '../providers/pictograms/ArasaacProvider.js';
import { PICTOGRAM_PROVIDERS } from '../providers/pictograms/index.js';
import { envConfig } from '../configs/env.config.js';

const DEFAULT_LANGUAGE = 'es';
const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 100;

function normalizeLimit(value) {
  const limit = Number.parseInt(value, 10);
  if (Number.isNaN(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function pictogramSearchRank(pictogram, search) {
  const query = normalizeSearchText(search);
  const name = normalizeSearchText(pictogram?.name);
  const searchable = normalizeSearchText([name, ...(pictogram?.tags || [])].join(' '));
  if (!query) return 3;
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (searchable.includes(query)) return 2;
  return 3;
}

export function mergePictograms(local, remote, search, limit) {
  const byId = new Map();
  for (const pictogram of [...local, ...remote]) {
    const key = String(pictogram?.arasaacId || pictogram?.id || '');
    if (key && !byId.has(key)) byId.set(key, pictogram);
  }

  return Array.from(byId.values())
    .sort((a, b) => {
      const rank = pictogramSearchRank(a, search) - pictogramSearchRank(b, search);
      if (rank !== 0) return rank;
      const popularityA = Number(a?.popularity || 0) + Number(a?.downloadCount || 0) + Number(a?.useCount || 0) + Number(a?.savedCount || 0);
      const popularityB = Number(b?.popularity || 0) + Number(b?.downloadCount || 0) + Number(b?.useCount || 0) + Number(b?.savedCount || 0);
      if (popularityA !== popularityB) return popularityB - popularityA;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'es');
    })
    .slice(0, limit);
}

function normalizeLanguage(value) {
  return String(value || DEFAULT_LANGUAGE).trim().toLowerCase() || DEFAULT_LANGUAGE;
}

export default class PictogramaService {
  constructor() {
    this.PictogramaRepository = new PictogramaRepository();
    this.schemaReady = null;

    // ARASAAC sigue siendo un proveedor de primera clase por compatibilidad
    // (busqueda en vivo, sync completo), pero queda marcado
    // commercialUseAllowed = false: ver Fase 4 (PICTOGRAM_COMMERCIAL_MODE)
    // para como se apaga en produccion sin tocar este archivo.
    this.arasaacProvider = new ArasaacProvider();
    this.providers = PICTOGRAM_PROVIDERS;
  }

  async ensureSchemaAsync() {
    if (!this.schemaReady) {
      this.schemaReady = this.PictogramaRepository.ensureSchemaAsync();
    }

    return await this.schemaReady;
  }

  async searchAsync({ search, category, language, limit, targetPertenecienteId }) {
    await this.ensureSchemaAsync();

    const locale = normalizeLanguage(language);
    const normalizedLimit = normalizeLimit(limit);
    const searchText = String(search || category || '').trim();
    const normalizedCategory = String(category || '').trim().toLowerCase();

    const cacheKey = `pictogram.search.${locale}.${normalizeSearchText(searchText)}.${normalizedCategory}.${normalizedLimit}${targetPertenecienteId ? `.${targetPertenecienteId}` : ''}`;
    const cachedResult = await cacheService.get(cacheKey);
    if (cachedResult) return cachedResult;

    const cached = await this.PictogramaRepository.searchAsync({
      search,
      category,
      language: locale,
      limit: normalizedLimit,
      targetPertenecienteId,
    });

    if (!searchText && cached.length > 0) {
      await cacheService.set(cacheKey, cached, 3600);
      return cached;
    }

    // Busqueda en vivo: hoy solo ARASAAC hace fallback en vivo (asi
    // funcionaba antes del refactor multi-proveedor). El catalogo de Global
    // Symbols se trae por lote con el importador (Fase 5) y ya queda
    // disponible en `cached` sin pegarle a la red en cada busqueda.
    //
    // En modo comercial (PICTOGRAM_COMMERCIAL_MODE=true) directamente NO se
    // consulta a ARASAAC: es una licencia CC BY-NC-SA, no tiene sentido
    // traer resultados que despues nunca se van a poder mostrar. Sin este
    // corte, el merge de abajo los volvia a mezclar aunque el filtro de
    // `cached` (PictogramaRepository.searchAsync) ya los hubiera excluido.
    const pictograms = envConfig.pictogramCommercialMode
      ? []
      : searchText
        ? await this.fetchArasaacPictograms(
            `/pictograms/${encodeURIComponent(locale)}/search/${encodeURIComponent(searchText)}`,
          ).catch(() => [])
        : await this.fetchArasaacPictograms(`/pictograms/${encodeURIComponent(locale)}/new/${normalizedLimit}`).catch(() => []);

    const normalized = pictograms.map((pictogram) => this.arasaacProvider.normalizePictogram(pictogram, locale));

    await this.PictogramaRepository.upsertManyAsync(normalized);

    const remote = (!category || category === 'todas' || searchText === category)
      ? normalized
      : normalized.filter((pictogram) => pictogram.category === String(category).toLowerCase());
    const result = searchText
      ? mergePictograms(cached, remote, searchText, normalizedLimit)
      : remote.slice(0, normalizedLimit);

    await cacheService.set(cacheKey, result, 3600);
    return result;
  }

  async getByIdAsync(id, language) {
    if (!id) {
      throw new Error('El id del pictograma es obligatorio.');
    }

    await this.ensureSchemaAsync();

    const locale = normalizeLanguage(language);
    const cacheKey = `pictogram.${id}.${locale}`;
    const cachedResult = await cacheService.get(cacheKey);
    if (cachedResult) return cachedResult;

    const cached = await this.PictogramaRepository.getByExternalIdAsync(id, locale);
    if (cached) {
      await cacheService.set(cacheKey, cached, 7200);
      return cached;
    }

    const path = `/pictograms/${encodeURIComponent(locale)}/${encodeURIComponent(id)}`;
    const pictogram = await this.fetchArasaacPictogram(path);
    const normalized = pictogram ? this.arasaacProvider.normalizePictogram(pictogram, locale) : null;
    if (normalized) {
      await this.PictogramaRepository.upsertManyAsync([normalized]);
      await cacheService.set(cacheKey, normalized, 7200);
    }
    return normalized;
  }

  async getCategoriesAsync(language) {
    await this.ensureSchemaAsync();
    const locale = normalizeLanguage(language);
    const cacheKey = `pictogram.categories.${locale}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const categories = await this.PictogramaRepository.getCategoriesAsync(locale);
    await cacheService.set(cacheKey, categories, 86400);
    return categories;
  }

  async getAttributionsAsync() {
    await this.ensureSchemaAsync();
    const cacheKey = `pictogram.attributions.${envConfig.pictogramCommercialMode ? 'commercial' : 'all'}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const attributions = await this.PictogramaRepository.getAttributionsAsync();
    await cacheService.set(cacheKey, attributions, 3600);
    return attributions;
  }

  async downloadAsync(id, language) {
    const locale = normalizeLanguage(language);
    const pictogram = await this.getByIdAsync(id, locale);
    if (!pictogram?.downloadUrl && !pictogram?.imageUrl) return null;

    const url = pictogram.downloadUrl || pictogram.imageUrl;
    const response = await axiosClient.get(url, {
      responseType: 'arraybuffer',
      timeout: Number.parseInt(process.env.ARASAAC_REQUEST_TIMEOUT_MS || 30000, 10),
    });

    await this.PictogramaRepository.incrementDownloadAsync(id, locale);

    return {
      data: Buffer.from(response.data),
      contentType: response.headers?.['content-type'] || 'image/png',
      fileName: `${String(pictogram.name || `pictograma-${id}`).replace(/[^\w.-]+/g, '_')}.png`,
    };
  }

  async getFavoritesAsync(userId, language) {
    await this.ensureSchemaAsync();
    if (!userId) {
      throw new Error('El usuario es obligatorio.');
    }

    return await this.PictogramaRepository.getFavoritesByUserAsync(userId, normalizeLanguage(language));
  }

  async markSavedAsync(id, language, userId) {
    await this.ensureSchemaAsync();
    if (!userId) {
      throw new Error('El usuario es obligatorio.');
    }

    const locale = normalizeLanguage(language);
    const pictogram = await this.getByIdAsync(id, locale);
    if (!pictogram) return null;

    await this.PictogramaRepository.addFavoriteAsync({ userId, pictogramId: id, language: locale });
    return pictogram;
  }

  async unmarkSavedAsync(id, language, userId) {
    await this.ensureSchemaAsync();
    if (!userId) {
      throw new Error('El usuario es obligatorio.');
    }

    const locale = normalizeLanguage(language);
    return await this.PictogramaRepository.removeFavoriteAsync({ userId, pictogramId: id, language: locale });
  }

  /**
   * Resuelve la URL de imagen de un pictograma. Antes del refactor
   * multi-proveedor asumia que todo id era numerico de ARASAAC; ahora
   * primero busca el pictograma en la base local para saber de que
   * proveedor es (cada uno construye su propia URL de forma distinta), y
   * solo si no lo encuentra cae al comportamiento legado de ARASAAC (ids
   * numericos sueltos que todavia no se importaron).
   */
  async getImageUrlAsync(id, resolution) {
    if (!id) {
      throw new Error('El id del pictograma es obligatorio.');
    }

    await this.ensureSchemaAsync();
    const cached = await this.PictogramaRepository.getByExternalIdAsync(String(id), DEFAULT_LANGUAGE);
    if (cached?.imageUrl) return cached.imageUrl;

    return this.arasaacProvider.buildImageUrl(id, Number.parseInt(resolution, 10) || undefined);
  }

  // Se mantiene el metodo sincrono viejo por compatibilidad con quien lo
  // use fuera de este servicio; internamente redirige al asincrono.
  getImageUrl(id, resolution) {
    return this.arasaacProvider.buildImageUrl(id, Number.parseInt(resolution, 10) || undefined);
  }

  // --- Delegacion a ArasaacProvider ---------------------------------------
  // Se mantienen estos tres metodos con el mismo nombre/firma que tenian
  // antes del refactor (en vez de llamar directo a this.arasaacProvider.xxx
  // en todos lados) para no romper los tests existentes, que los
  // sobreescriben directamente sobre la instancia del servicio
  // (test/pictogram-search.test.js).
  async fetchArasaacPictograms(path) {
    return this.arasaacProvider.fetchArasaacPictograms(path);
  }

  async fetchArasaacPictogram(path) {
    return this.arasaacProvider.fetchArasaacPictogram(path);
  }

  async fetchArasaacCatalog(locale) {
    return this.arasaacProvider.fetchArasaacCatalog(locale);
  }

  async syncFromArasaacAsync({ language } = {}) {
    await this.ensureSchemaAsync();

    const locale = normalizeLanguage(language);
    const pictograms = await this.fetchArasaacCatalog(locale);
    const normalized = pictograms.map((pictogram) => this.arasaacProvider.normalizePictogram(pictogram, locale));
    const affected = await this.PictogramaRepository.upsertManyAsync(normalized);

    await cacheService.delByPattern('pictogram.*');

    return {
      language: locale,
      fetched: pictograms.length,
      saved: affected,
    };
  }
}
