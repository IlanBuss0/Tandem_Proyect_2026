import BD from '../db/BD.js';

// Unica responsabilidad: persistir en Postgres el resultado de "texto ->
// conceptos" de Groq, para NO volver a gastar cuota cuando otro usuario (o
// el mismo) escribe el mismo texto. Guarda los CONCEPTOS, no el pictograma
// final: el pictograma se re-busca en vivo contra el catalogo (SQL, sin
// cuota) para que una mejora del catalogo despues de hoy siga beneficiando
// a un texto ya cacheado.
//
// Es un cache global compartido entre TODOS los usuarios y TODAS las
// superficies (rutinas, calendario, traductor manual), a diferencia del
// vocabulario personal (personal-vocabulary.js), que es por usuario y
// guarda el pictograma elegido a mano.
export default class PictogramizationMemoRepository {
  ensureSchemaAsync = async () => {
    await BD.execute(`
      CREATE TABLE IF NOT EXISTS pictogramizaciones_memo (
        id BIGSERIAL PRIMARY KEY,
        idioma TEXT NOT NULL DEFAULT 'es',
        texto_normalizado TEXT NOT NULL,
        conceptos JSONB NOT NULL,
        modelo TEXT,
        fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pictogramizaciones_memo_idioma_texto_key UNIQUE (idioma, texto_normalizado)
      )
    `);
  };

  /**
   * @param {string[]} normalizedTexts ya normalizados (normalizeSearchText)
   * @returns {Promise<Map<string, string[]>>} texto_normalizado -> conceptos
   */
  getManyAsync = async (normalizedTexts, language) => {
    if (!Array.isArray(normalizedTexts) || normalizedTexts.length === 0) return new Map();
    const rows = await BD.query(
      `SELECT texto_normalizado, conceptos FROM pictogramizaciones_memo WHERE idioma = $1 AND texto_normalizado = ANY($2)`,
      [language, normalizedTexts],
    );
    const map = new Map();
    for (const row of rows) {
      const conceptos = Array.isArray(row.conceptos) ? row.conceptos : [];
      map.set(row.texto_normalizado, conceptos);
    }
    return map;
  };

  /**
   * @param {Array<{ textoNormalizado: string, conceptos: string[] }>} entries
   */
  upsertManyAsync = async (entries, language, modelo) => {
    const valid = (entries || []).filter((e) => e.textoNormalizado && Array.isArray(e.conceptos) && e.conceptos.length > 0);
    if (valid.length === 0) return;

    await Promise.all(valid.map((entry) => BD.execute(
      `INSERT INTO pictogramizaciones_memo (idioma, texto_normalizado, conceptos, modelo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (idioma, texto_normalizado)
       DO UPDATE SET conceptos = EXCLUDED.conceptos, modelo = EXCLUDED.modelo`,
      [language, entry.textoNormalizado, JSON.stringify(entry.conceptos), modelo || null],
    )));
  };
}
