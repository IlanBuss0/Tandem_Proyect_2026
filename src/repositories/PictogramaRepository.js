import BD from '../db/BD.js';
import { envConfig } from '../configs/env.config.js';

const POPULAR_TITLES = [
  'comer',
  'beber',
  'agua',
  'ir al bano',
  'bano',
  'lavarse las manos',
  'dolor',
  'ayuda',
  'si',
  'no',
  'contento',
  'triste',
  'enfadado',
  'miedo',
  'cansado',
  'familia',
  'mamá',
  'papá',
  'casa',
  'escuela',
  'dormir',
  'vestirse',
  'jugar',
  'leer',
  'escribir',
  'esperar',
  'salir',
  'medico',
  'supermercado',
  'autobus',
];

/**
 * Escapa los metacaracteres de regex de un termino de busqueda antes de
 * interpolarlo en un patron de Postgres (`~*`). Sin esto, alguien buscando
 * "(" o "a+b" haria fallar la query con un error de regex invalida.
 */
// Juego de caracteres para busqueda insensible a acentos y ñ.
//
// Por que hace falta: las etiquetas del catalogo quedaron inconsistentes — el
// modelo que las tradujo saco los acentos en la mayoria (solo ~5% quedo con
// tilde o ñ). Asi, buscar "baño" no encontraba "bano", y buscar "miercoles" no
// encontraba los pocos "miércoles". Y encima el usuario escribe de las dos
// formas. Normalizar en la CONSULTA resuelve los dos lados sin depender de que
// los datos esten prolijos ni de instalar la extension unaccent.
const ACCENTED_CHARS = 'áéíóúàèìòùâêîôûäëïöüñç';
const PLAIN_CHARS = 'aeiouaeiouaeiouaeiounc';

/** Envuelve una expresion SQL para compararla sin acentos ni ñ. */
function sqlUnaccent(expression) {
  return `TRANSLATE(LOWER(${expression}), '${ACCENTED_CHARS}', '${PLAIN_CHARS}')`;
}

/** Misma normalizacion que sqlUnaccent, del lado de JavaScript. */
function unaccent(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[̀-ͯ]/g, '') // por si viene en forma descompuesta
    .split('')
    .map((char) => {
      const index = ACCENTED_CHARS.indexOf(char);
      return index === -1 ? char : PLAIN_CHARS[index];
    })
    .join('');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getPopularityScore(pictogram) {
  const title = normalizeText(pictogram?.name);
  const exactIndex = POPULAR_TITLES.findIndex((item) => normalizeText(item) === title);
  if (exactIndex >= 0) return POPULAR_TITLES.length - exactIndex + 100;

  const prefixIndex = POPULAR_TITLES.findIndex((item) => title.startsWith(normalizeText(item)));
  if (prefixIndex >= 0) return POPULAR_TITLES.length - prefixIndex;

  return 0;
}

function normalizeRow(row) {
  if (!row) return null;

  return {
    id: String(row.origen_id || row.arasaac_id || row.id),
    dbId: row.id,
    arasaacId: row.arasaac_id,
    name: row.titulo,
    emoji: '',
    imageUrl: row.url,
    downloadUrl: row.url_descarga || row.url,
    category: row.tipo,
    tags: Array.isArray(row.etiquetas) ? row.etiquetas : [],
    language: row.idioma,
    source: row.origen,
    author: row.autor,
    license: row.licencia,
    popularity: row.popularidad || 0,
    useCount: row.uso_total || 0,
    downloadCount: row.descarga_total || 0,
    savedCount: row.guardado_total || 0,
    syncedAt: row.fecha_sincronizacion,
    targetPertenecienteId: row.id_perteneciente_destino ? Number(row.id_perteneciente_destino) : null,
    status: row.estado_publicacion || 'approved',
    licenseCode: row.licencia_codigo,
    licenseVersion: row.licencia_version,
    licenseUrl: row.licencia_url,
    attributionText: row.texto_atribucion,
    sourceUrl: row.url_fuente,
    // Default seguro: si nunca se corrio la migracion de licencias sobre
    // esta fila, se trata como NO permitido para uso comercial.
    commercialUseAllowed: row.uso_comercial_permitido === true,
    shareAlikeRequired: row.share_alike_requerido === true,
  };
}

function buildSearchText(pictogram) {
  return [
    pictogram?.name,
    pictogram?.category,
    ...(Array.isArray(pictogram?.tags) ? pictogram.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function toDbValues(pictogram) {
  const origen = pictogram.source || 'ARASAAC';
  const origenId = String(pictogram.arasaacId || pictogram.id);
  // Se conserva el metadata que trae el proveedor (nombre original en ingles,
  // categoria original, assetHash para el sync incremental, etc.) y se le
  // suman los dos campos historicos. Antes esta funcion lo descartaba y
  // reconstruia el objeto de cero, con lo cual el assetHash nunca llegaba a
  // la base y cada sync mensual volvia a subir el catalogo completo.
  const metadata = {
    ...(pictogram.metadata && typeof pictogram.metadata === 'object' ? pictogram.metadata : {}),
    id: pictogram.id,
    favorite: pictogram.favorite || false,
  };

  return [
    origen,
    origenId,
    Number.isFinite(Number(pictogram.arasaacId)) ? Number(pictogram.arasaacId) : null,
    pictogram.name,
    pictogram.category || 'otros',
    pictogram.imageUrl,
    pictogram.downloadUrl || pictogram.imageUrl,
    Array.isArray(pictogram.tags) ? pictogram.tags : [],
    pictogram.language || 'es',
    pictogram.author || null,
    pictogram.license || null,
    buildSearchText(pictogram),
    JSON.stringify(metadata),
    getPopularityScore(pictogram),
    pictogram.licenseCode || null,
    pictogram.licenseVersion || null,
    pictogram.licenseUrl || null,
    pictogram.attributionText || null,
    pictogram.sourceUrl || null,
    // Default seguro: si el proveedor no declara explicitamente
    // commercialUseAllowed = true, el pictograma no se publica en modo
    // comercial. Se aplica lo mismo a un resync (nunca se "hereda" un true
    // implicito de un valor previo).
    pictogram.commercialUseAllowed === true,
    pictogram.shareAlikeRequired === true,
  ];
}

export default class PictogramaRepository {
  ensureSchemaAsync = async () => {
    await BD.execute(`
      CREATE TABLE IF NOT EXISTS pictogramas (
        id BIGSERIAL PRIMARY KEY,
        origen TEXT NOT NULL DEFAULT 'ARASAAC',
        origen_id TEXT NOT NULL,
        arasaac_id INTEGER,
        titulo TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'otros',
        url TEXT NOT NULL,
        url_descarga TEXT,
        etiquetas TEXT[] NOT NULL DEFAULT '{}',
        idioma TEXT NOT NULL DEFAULT 'es',
        autor TEXT,
        licencia TEXT,
        texto_busqueda TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        fecha_sincronizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pictogramas_origen_idioma_origen_id_key UNIQUE (origen, idioma, origen_id)
      )
    `);

    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_pictogramas_idioma_tipo ON pictogramas (idioma, tipo)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_pictogramas_titulo_lower ON pictogramas (LOWER(titulo))`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_pictogramas_etiquetas ON pictogramas USING GIN (etiquetas)`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS popularidad INTEGER NOT NULL DEFAULT 0`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS uso_total INTEGER NOT NULL DEFAULT 0`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS descarga_total INTEGER NOT NULL DEFAULT 0`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS guardado_total INTEGER NOT NULL DEFAULT 0`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS id_usuario_creador INTEGER REFERENCES usuarios(id)`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS id_perteneciente_destino INTEGER REFERENCES pertenecientes(id)`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS estado_publicacion VARCHAR(30) NOT NULL DEFAULT 'approved'`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS motivo_revision TEXT`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS id_administrador_revisor INTEGER REFERENCES usuarios(id)`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS fecha_revision TIMESTAMPTZ`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS generacion_ia_id UUID`);
    // Metadata legal por pictograma (migracion hacia librerias con licencia
    // comercial). uso_comercial_permitido arranca en false: lo que no se
    // verifico, no se publica en modo comercial. Ver scripts/add-pictogram-license-columns.mjs
    // para el backfill de los registros existentes.
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS licencia_codigo TEXT`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS licencia_version TEXT`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS licencia_url TEXT`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS texto_atribucion TEXT`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS url_fuente TEXT`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS uso_comercial_permitido BOOLEAN NOT NULL DEFAULT false`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS share_alike_requerido BOOLEAN NOT NULL DEFAULT false`);
    await BD.execute(`ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS fecha_importacion TIMESTAMPTZ`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_pictogramas_uso_comercial ON pictogramas (uso_comercial_permitido)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_pictogramas_populares ON pictogramas (idioma, popularidad DESC, descarga_total DESC, uso_total DESC, titulo ASC)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_pictogramas_publicacion ON pictogramas(estado_publicacion, fecha_creacion DESC)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_pictogramas_generacion_ia ON pictogramas(generacion_ia_id) WHERE generacion_ia_id IS NOT NULL`);

    await BD.execute(`
      CREATE TABLE IF NOT EXISTS favoritos_pictogramas (
        id BIGSERIAL PRIMARY KEY,
        id_usuario TEXT NOT NULL,
        idioma TEXT NOT NULL DEFAULT 'es',
        origen TEXT NOT NULL DEFAULT 'ARASAAC',
        origen_id TEXT NOT NULL,
        fecha_marcado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT favoritos_pictogramas_usuario_pictograma_key UNIQUE (id_usuario, idioma, origen, origen_id)
      )
    `);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_favoritos_pictogramas_usuario ON favoritos_pictogramas (id_usuario, idioma, fecha_marcado DESC)`);
  };

  searchAsync = async ({ search, category, language, limit, targetPertenecienteId }) => {
    const where = ["idioma = $1"];
    // El switch de la migracion de licencias (Fase 4): en modo comercial
    // solo se descubren pictogramas con uso_comercial_permitido = true.
    // Se aplica solo a la BUSQUEDA (descubrimiento de contenido nuevo), no a
    // los lookups por id (getByExternalIdAsync) — un favorito o una
    // actividad que ya referencia un pictograma de ARASAAC no debe romperse
    // retroactivamente, solo dejar de ofrecerse como resultado nuevo.
    if (envConfig.pictogramCommercialMode) {
      where.push('uso_comercial_permitido = true');
    }
    if (targetPertenecienteId) {
      const ids = String(targetPertenecienteId).split(',').map(Number).filter(Boolean);
      if (ids.length > 0) {
        where.push(`(origen <> 'TANDEM_AI' OR estado_publicacion = 'approved' OR (estado_publicacion = 'private' AND id_perteneciente_destino = ANY('{${ids.join(',')}}'::int[])))`);
      } else {
        where.push("(origen <> 'TANDEM_AI' OR estado_publicacion = 'approved')");
      }
    } else {
      where.push("(origen <> 'TANDEM_AI' OR estado_publicacion = 'approved')");
    }
    const params = [language];
    const categories = String(category || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item && item !== 'todas');
    const searchText = String(search || '').trim().toLowerCase();
    let orderBy = `
      (popularidad + descarga_total + uso_total + guardado_total) DESC,
      popularidad DESC,
      titulo ASC
    `;

    if (categories.length > 0) {
      params.push(categories);
      where.push(`tipo = ANY($${params.length})`);
    }

    if (searchText) {
      // Todas las comparaciones van sin acentos ni ñ, de los dos lados: asi
      // "baño" encuentra "bano" y "miercoles" encuentra "miércoles". Ver el
      // comentario de sqlUnaccent para el porque.
      const plainSearch = unaccent(searchText);
      const tituloPlain = sqlUnaccent('titulo');
      const busquedaPlain = sqlUnaccent('texto_busqueda');
      const etiquetaPlain = sqlUnaccent('etiqueta');

      params.push(`%${plainSearch}%`);
      const index = params.length;
      where.push(`(
        ${tituloPlain} LIKE $${index}
        OR ${busquedaPlain} LIKE $${index}
        OR EXISTS (
          SELECT 1
          FROM unnest(etiquetas) AS etiqueta
          WHERE ${etiquetaPlain} LIKE $${index}
        )
      )`);
      params.push(plainSearch);
      const exactIndex = params.length;
      params.push(`${plainSearch}%`);
      const prefixIndex = params.length;
      // Coincidencia por PALABRA COMPLETA (\y = word boundary de Postgres).
      // Sin este nivel, buscar "agua" devolvia primero "country Paraguay" y
      // "flag Nicaragua", porque el substring esta ahi adentro y quedaba
      // empatado con todo lo demas, decidiendose por orden alfabetico.
      // Se escapan los metacaracteres de regex del termino buscado.
      params.push(escapeRegex(plainSearch));
      const wordIndex = params.length;
      orderBy = `
        CASE
          WHEN ${tituloPlain} = $${exactIndex} THEN 0
          WHEN ${tituloPlain} LIKE $${prefixIndex} THEN 1
          WHEN ${tituloPlain} ~ ('\\y' || $${wordIndex} || '\\y') THEN 2
          WHEN EXISTS (
            SELECT 1 FROM unnest(etiquetas) AS etiqueta
            WHERE ${etiquetaPlain} = $${exactIndex}
          ) THEN 3
          WHEN ${tituloPlain} LIKE $${index} THEN 4
          ELSE 5
        END,
        (popularidad + descarga_total + uso_total + guardado_total) DESC,
        LENGTH(titulo) ASC,
        titulo ASC
      `;
    }

    const shouldDeduplicateDefaults = !searchText && categories.length === 0;
    const queryLimit = shouldDeduplicateDefaults ? limit * 3 : limit;
    params.push(queryLimit);
    const sql = `
      SELECT id, origen, origen_id, arasaac_id, titulo, tipo, url, url_descarga,
             etiquetas, idioma, autor, licencia, popularidad, uso_total, descarga_total,
             guardado_total, fecha_sincronizacion, id_perteneciente_destino, estado_publicacion,
             licencia_codigo, licencia_version, licencia_url, texto_atribucion, url_fuente,
             uso_comercial_permitido, share_alike_requerido
      FROM pictogramas
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${params.length}
    `;

    const rows = await BD.query(sql, params);
    const normalizedRows = rows.map(normalizeRow);

    if (!shouldDeduplicateDefaults) return normalizedRows;

    const seen = new Set();
    return normalizedRows
      .filter((pictogram) => {
        const key = normalizeText(pictogram.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  };

  getByExternalIdAsync = async (id, language) => {
    const sql = `
      SELECT id, origen, origen_id, arasaac_id, titulo, tipo, url, url_descarga,
             etiquetas, idioma, autor, licencia, popularidad, uso_total, descarga_total,
             guardado_total, fecha_sincronizacion,
             licencia_codigo, licencia_version, licencia_url, texto_atribucion, url_fuente,
             uso_comercial_permitido, share_alike_requerido
      FROM pictogramas
      WHERE idioma = $1
        AND (origen_id = $2 OR arasaac_id::TEXT = $2)
        AND (origen <> 'TANDEM_AI' OR estado_publicacion = 'approved')
      LIMIT 1
    `;
    return normalizeRow(await BD.queryOne(sql, [language, String(id)]));
  };

  getByExternalIdForUserAsync = async (id, language, userId) => {
    const sql = `
      SELECT p.id, p.origen, p.origen_id, p.arasaac_id, p.titulo, p.tipo, p.url, p.url_descarga,
             p.etiquetas, p.idioma, p.autor, p.licencia, p.popularidad, p.uso_total,
             p.descarga_total, p.guardado_total, p.fecha_sincronizacion,
             p.id_perteneciente_destino, p.estado_publicacion,
             p.licencia_codigo, p.licencia_version, p.licencia_url, p.texto_atribucion, p.url_fuente,
             p.uso_comercial_permitido, p.share_alike_requerido
      FROM pictogramas p
      WHERE p.idioma = $1
        AND (p.origen_id = $2 OR p.arasaac_id::TEXT = $2)
        AND (
          p.origen <> 'TANDEM_AI'
          OR p.estado_publicacion = 'approved'
          OR (
            p.estado_publicacion = 'private'
            AND p.id_perteneciente_destino IN (
              SELECT id FROM pertenecientes WHERE id_usuario = $3
            )
          )
        )
      LIMIT 1
    `;
    return normalizeRow(await BD.queryOne(sql, [language, String(id), Number(userId)]));
  };

  countAsync = async (language) => {
    const row = await BD.queryOne("SELECT COUNT(*)::INTEGER AS total FROM pictogramas WHERE idioma = $1 AND (origen <> 'TANDEM_AI' OR estado_publicacion = 'approved')", [language]);
    return row?.total || 0;
  };

  getCategoriesAsync = async (language) => {
    // Mismo criterio que searchAsync: en modo comercial los conteos por
    // categoria tampoco deben incluir pictogramas sin uso_comercial_permitido,
    // si no el desplegable de categorias queda mintiendo sobre cuanto
    // contenido hay realmente disponible.
    const commercialFilter = envConfig.pictogramCommercialMode ? "AND uso_comercial_permitido = true" : '';
    const rows = await BD.query(
      `
        SELECT tipo, COUNT(*)::INTEGER AS total
        FROM pictogramas
        WHERE idioma = $1 AND (origen <> 'TANDEM_AI' OR estado_publicacion = 'approved') ${commercialFilter}
        GROUP BY tipo
        ORDER BY tipo ASC
      `,
      [language],
    );

    return rows.map((row) => ({ id: row.tipo, name: row.tipo, total: row.total }));
  };

  /**
   * Agrupa por licencia + atribucion los pictogramas efectivamente visibles
   * hoy (respeta PICTOGRAM_COMMERCIAL_MODE, igual que searchAsync) para que
   * la pantalla de "Licencias y atribuciones" nunca quede desactualizada
   * respecto de lo que la app realmente muestra.
   */
  getAttributionsAsync = async () => {
    const where = envConfig.pictogramCommercialMode ? 'WHERE uso_comercial_permitido = true' : '';
    const rows = await BD.query(`
      SELECT
        origen,
        licencia_codigo,
        licencia_version,
        licencia_url,
        texto_atribucion,
        url_fuente,
        COUNT(*)::INTEGER AS total
      FROM pictogramas
      ${where}
      GROUP BY origen, licencia_codigo, licencia_version, licencia_url, texto_atribucion, url_fuente
      ORDER BY total DESC
    `);

    return rows.map((row) => ({
      source: row.origen,
      licenseCode: row.licencia_codigo,
      licenseVersion: row.licencia_version,
      licenseUrl: row.licencia_url,
      attributionText: row.texto_atribucion,
      sourceUrl: row.url_fuente,
      total: row.total,
    }));
  };

  incrementDownloadAsync = async (id, language) => {
    return await BD.execute(
      `
        UPDATE pictogramas
        SET descarga_total = descarga_total + 1,
            fecha_actualizacion = NOW()
        WHERE idioma = $1 AND (origen_id = $2 OR arasaac_id::TEXT = $2)
      `,
      [language, String(id)],
    );
  };

  incrementSavedAsync = async (id, language) => {
    return await BD.execute(
      `
        UPDATE pictogramas
        SET guardado_total = guardado_total + 1,
            fecha_actualizacion = NOW()
        WHERE idioma = $1 AND (origen_id = $2 OR arasaac_id::TEXT = $2)
      `,
      [language, String(id)],
    );
  };

  decrementSavedAsync = async (id, language) => {
    return await BD.execute(
      `
        UPDATE pictogramas
        SET guardado_total = GREATEST(guardado_total - 1, 0),
            fecha_actualizacion = NOW()
        WHERE idioma = $1 AND (origen_id = $2 OR arasaac_id::TEXT = $2)
      `,
      [language, String(id)],
    );
  };

  getFavoritesByUserAsync = async (userId, language) => {
    const sql = `
      SELECT p.id, p.origen, p.origen_id, p.arasaac_id, p.titulo, p.tipo, p.url, p.url_descarga,
             p.etiquetas, p.idioma, p.autor, p.licencia, p.popularidad, p.uso_total,
             p.descarga_total, p.guardado_total, p.fecha_sincronizacion
      FROM favoritos_pictogramas fp
      INNER JOIN pictogramas p
        ON p.origen = fp.origen
       AND p.origen_id = fp.origen_id
       AND p.idioma = fp.idioma
      WHERE fp.id_usuario = $1 AND fp.idioma = $2
      ORDER BY fp.fecha_marcado DESC
    `;

    const rows = await BD.query(sql, [String(userId), language]);
    return rows.map(normalizeRow);
  };

  addFavoriteAsync = async ({ userId, pictogramId, language }) => {
    const pictogram = await this.getByExternalIdForUserAsync(pictogramId, language, userId);
    if (!pictogram) return 0;

    const row = await BD.queryOne(
      `
        INSERT INTO favoritos_pictogramas (id_usuario, idioma, origen, origen_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id_usuario, idioma, origen, origen_id) DO NOTHING
        RETURNING id
      `,
      [String(userId), language, pictogram.source || 'ARASAAC', String(pictogram.arasaacId || pictogram.id)],
    );

    if (row?.id) {
      await this.incrementSavedAsync(pictogramId, language);
      return row.id;
    }

    return 0;
  };

  removeFavoriteAsync = async ({ userId, pictogramId, language }) => {
    const pictogram = await this.getByExternalIdForUserAsync(pictogramId, language, userId);
    if (!pictogram) return 0;

    const rows = await BD.execute(
      `
        DELETE FROM favoritos_pictogramas
        WHERE id_usuario = $1 AND idioma = $2 AND origen = $3 AND origen_id = $4
      `,
      [String(userId), language, pictogram.source || 'ARASAAC', String(pictogram.arasaacId || pictogram.id)],
    );

    if (rows > 0) {
      await this.decrementSavedAsync(pictogramId, language);
    }

    return rows;
  };

  upsertManyAsync = async (pictograms) => {
    const items = (Array.isArray(pictograms) ? pictograms : []).filter((pictogram) => pictogram?.id && pictogram?.name && pictogram?.imageUrl);
    if (items.length === 0) return 0;

    return await BD.transaction(async (client) => {
      let affected = 0;
      const batchSize = 500;

      for (let offset = 0; offset < items.length; offset += batchSize) {
        const batch = items.slice(offset, offset + batchSize);
        const values = [];
        const rowsSql = batch.map((pictogram, index) => {
          values.push(...toDbValues(pictogram));
          const base = index * 21;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}::jsonb, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, $${base + 21})`;
        });
        const result = await client.query(
          `
            INSERT INTO pictogramas (
              origen, origen_id, arasaac_id, titulo, tipo, url, url_descarga,
              etiquetas, idioma, autor, licencia, texto_busqueda, metadata, popularidad,
              licencia_codigo, licencia_version, licencia_url, texto_atribucion, url_fuente,
              uso_comercial_permitido, share_alike_requerido
            )
            VALUES ${rowsSql.join(', ')}
            ON CONFLICT (origen, idioma, origen_id)
            DO UPDATE SET
              arasaac_id = EXCLUDED.arasaac_id,
              -- La traduccion al espanol NO se pisa. Los proveedores externos
              -- (Mulberry, OpenMoji) mandan el nombre en ingles en cada sync;
              -- si se sobreescribiera el titulo, el sync mensual borraria todo
              -- el trabajo de scripts/translate-catalog-labels.mjs. Se conserva
              -- metadata.nameEs como fuente de verdad del titulo traducido.
              titulo = COALESCE(NULLIF(pictogramas.metadata->>'nameEs', ''), EXCLUDED.titulo),
              tipo = EXCLUDED.tipo,
              url = EXCLUDED.url,
              url_descarga = EXCLUDED.url_descarga,
              -- Union de etiquetas: las del proveedor mas las que agrego la
              -- traduccion (el nombre original en ingles, para poder buscar
              -- en los dos idiomas).
              etiquetas = ARRAY(
                SELECT DISTINCT e
                FROM unnest(EXCLUDED.etiquetas || pictogramas.etiquetas) AS e
                WHERE e IS NOT NULL AND e <> ''
              ),
              autor = EXCLUDED.autor,
              licencia = EXCLUDED.licencia,
              -- Mismo criterio que titulo: si hay traduccion, texto_busqueda
              -- se reconstruye a partir de ella (+ tipo + etiquetas fusionadas)
              -- en vez de tomar el de EXCLUDED, que siempre viene armado con
              -- el nombre en ingles del proveedor (buildSearchText() en este
              -- mismo archivo). Sin este fix, cada sync revertia el texto de
              -- busqueda al ingles aunque titulo ya quedara bien en espanol,
              -- degradando el matching de frases de varias palabras.
              texto_busqueda = LOWER(
                COALESCE(NULLIF(pictogramas.metadata->>'nameEs', ''), EXCLUDED.titulo)
                || ' ' || EXCLUDED.tipo || ' '
                || COALESCE(array_to_string(
                     ARRAY(
                       SELECT DISTINCT e
                       FROM unnest(EXCLUDED.etiquetas || pictogramas.etiquetas) AS e
                       WHERE e IS NOT NULL AND e <> ''
                     ), ' '
                   ), '')
              ),
              -- Se conserva nameEs al mergear: EXCLUDED.metadata trae el
              -- assetHash y el nombre original nuevos, pero no la traduccion.
              metadata = EXCLUDED.metadata
                         || COALESCE(
                              jsonb_strip_nulls(jsonb_build_object('nameEs', pictogramas.metadata->>'nameEs')),
                              '{}'::jsonb
                            ),
              popularidad = EXCLUDED.popularidad,
              licencia_codigo = EXCLUDED.licencia_codigo,
              licencia_version = EXCLUDED.licencia_version,
              licencia_url = EXCLUDED.licencia_url,
              texto_atribucion = EXCLUDED.texto_atribucion,
              url_fuente = EXCLUDED.url_fuente,
              uso_comercial_permitido = EXCLUDED.uso_comercial_permitido,
              share_alike_requerido = EXCLUDED.share_alike_requerido,
              fecha_sincronizacion = NOW(),
              fecha_actualizacion = NOW()
          `,
          values,
        );
        affected += result.rowCount;
      }

      return affected;
    });
  };
}
