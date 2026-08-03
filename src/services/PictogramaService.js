import axiosClient from '../modules/axios/axiosClient.js';
import PictogramaRepository from '../repositories/PictogramaRepository.js';
import { cacheService } from './CacheService.js';
import ArasaacProvider from '../providers/pictograms/ArasaacProvider.js';
import { PICTOGRAM_PROVIDERS } from '../providers/pictograms/index.js';
import { envConfig } from '../configs/env.config.js';
import { getVisualStyleLabel } from '../modules/pictograms/visual-styles.js';
import { getCollectionLabel } from '../modules/pictograms/license-whitelist.js';

const DEFAULT_LANGUAGE = 'es';
const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 100;

function normalizeLimit(value) {
  const limit = Number.parseInt(value, 10);
  if (Number.isNaN(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function normalizePage(value) {
  const page = Number.parseInt(value, 10);
  if (Number.isNaN(page) || page <= 0) return 1;
  return page;
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

  // boostPictogramIds (Sesion 25, perfil de memoria): pictogramas que el
  // llamador ya sabe que esta persona usa de verdad, para que aparezcan
  // primero sin tocar el filtro. Se resuelve AFUERA de este service (en
  // el controller) a proposito: PictogramaService no necesita saber que
  // es un "perteneciente" ni como se resuelve su memoria, solo recibe una
  // lista de ids. Ademas evita un ciclo de imports (MemoryProfileService
  // depende, indirectamente, de este mismo archivo).
  async searchAsync({ search, category, style, collection, language, limit, page, targetPertenecienteId, boostPictogramIds }) {
    await this.ensureSchemaAsync();

    const locale = normalizeLanguage(language);
    const normalizedLimit = normalizeLimit(limit);
    const normalizedPage = normalizePage(page);
    const searchText = String(search || category || '').trim();
    const normalizedCategory = String(category || '').trim().toLowerCase();
    const normalizedStyle = String(style || '').trim().toLowerCase();
    const normalizedCollection = String(collection || '').trim().toLowerCase();
    const boostIds = Array.isArray(boostPictogramIds) ? boostPictogramIds.filter(Boolean).sort() : [];

    const cacheKey = `pictogram.search.${locale}.${normalizeSearchText(searchText)}.${normalizedCategory}`
      + `.${normalizedStyle}.${normalizedCollection}`
      + `.${normalizedLimit}.${normalizedPage}${targetPertenecienteId ? `.${targetPertenecienteId}` : ''}`
      + `${boostIds.length > 0 ? `.boost:${boostIds.join(',')}` : ''}`;
    const cachedResult = await cacheService.get(cacheKey);
    if (cachedResult) return cachedResult;

    // La busqueda SIEMPRE se resuelve contra la base local, nunca contra una
    // API externa. Es una decision de arquitectura, no una optimizacion:
    //   - La UI no depende de que globalsymbols.com/arasaac.org esten arriba
    //     ni de su latencia. Si se cae un proveedor, la app sigue igual.
    //   - El catalogo entra por el job de sync mensual
    //     (src/jobs/pictogramaSyncJob.js) y por los importadores de
    //     scripts/, que son los UNICOS que hablan con las APIs externas.
    //   - Cada fila ya trae su licencia y atribucion validadas al importarse,
    //     asi que nunca se muestra algo cuya licencia no se verifico.
    // Si un termino no da resultados, la respuesta correcta es agregarlo al
    // importador y correr el sync, no pegarle a la red en caliente.
    const { items, total } = await this.PictogramaRepository.searchAsync({
      search,
      category,
      style,
      collection,
      language: locale,
      limit: normalizedLimit,
      offset: (normalizedPage - 1) * normalizedLimit,
      targetPertenecienteId,
      boostPictogramIds: boostIds,
    });

    const result = {
      items,
      total,
      page: normalizedPage,
      pageSize: normalizedLimit,
      totalPages: Math.max(1, Math.ceil(total / normalizedLimit)),
    };

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

    // Igual que searchAsync: se resuelve solo contra la base. Si un id no
    // esta importado, devuelve null y el controller responde 404 — no se sale
    // a buscarlo a la API externa en caliente.
    const stored = await this.PictogramaRepository.getByExternalIdAsync(id, locale);
    if (stored) {
      await cacheService.set(cacheKey, stored, 7200);
    }
    return stored ?? null;
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

  /**
   * Opciones del panel de filtros: categorias, estilos visuales y colecciones,
   * cada una con su conteo real. Se resuelve de una sola llamada para que la
   * UI no tenga que pedir tres endpoints ni hardcodear listas que se
   * desactualizan con cada sync.
   */
  async getFilterOptionsAsync(language) {
    await this.ensureSchemaAsync();
    const locale = normalizeLanguage(language);
    const cacheKey = `pictogram.filters.${locale}.${envConfig.pictogramCommercialMode ? 'commercial' : 'all'}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const { categories, styles, collections } = await this.PictogramaRepository.getFilterOptionsAsync(locale);

    const result = {
      // La categoria ya viene en espanol desde el importador.
      categories: categories.map((row) => ({ id: row.id, name: row.id, total: row.total })),
      styles: styles.map((row) => ({ id: row.id, name: getVisualStyleLabel(row.id), total: row.total })),
      collections: collections.map((row) => ({ id: row.id, name: getCollectionLabel(row.id), total: row.total })),
    };

    await cacheService.set(cacheKey, result, 86400);
    return result;
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
