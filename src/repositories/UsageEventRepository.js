import BD from '../db/BD.js';

// Unica responsabilidad: persistir y leer eventos de uso (Sesion 9).
// Append-only a proposito: nunca se actualiza ni se borra una fila. Los
// blobs de rutinas/calendario/emociones son "ultimo estado" (se pierde el
// historial al sobreescribir); este log es la unica fuente real para
// "patrones" y "evolucion en el tiempo" del bloque F.
export default class UsageEventRepository {
  ensureSchemaAsync = async () => {
    await BD.execute(`
      CREATE TABLE IF NOT EXISTS eventos_uso (
        id BIGSERIAL PRIMARY KEY,
        id_usuario INTEGER NOT NULL,
        tipo_evento TEXT NOT NULL,
        entidad_tipo TEXT,
        entidad_id TEXT,
        id_pictograma TEXT,
        valor JSONB,
        origen TEXT,
        ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_eventos_uso_usuario_tipo_fecha ON eventos_uso (id_usuario, tipo_evento, ocurrido_en DESC)`);
  };

  createAsync = async (event) => {
    const sql = `
      INSERT INTO eventos_uso (id_usuario, tipo_evento, entidad_tipo, entidad_id, id_pictograma, valor, origen, ocurrido_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
      RETURNING id
    `;
    const values = [
      event.idUsuario,
      event.tipoEvento,
      event.entidadTipo || null,
      event.entidadId || null,
      event.idPictograma || null,
      event.valor ? JSON.stringify(event.valor) : null,
      event.origen || null,
      event.ocurrioEn || null,
    ];
    const row = await BD.queryOne(sql, values);
    return row?.id ?? null;
  };

  getForUsuarioAsync = async (idUsuario, { tipoEvento, limit = 50 } = {}) => {
    const where = ['id_usuario = $1'];
    const params = [idUsuario];
    if (tipoEvento) {
      params.push(tipoEvento);
      where.push(`tipo_evento = $${params.length}`);
    }
    params.push(Math.min(Number(limit) || 50, 200));
    const sql = `
      SELECT id, id_usuario, tipo_evento, entidad_tipo, entidad_id, id_pictograma, valor, origen, ocurrido_en
      FROM eventos_uso
      WHERE ${where.join(' AND ')}
      ORDER BY ocurrido_en DESC
      LIMIT $${params.length}
    `;
    return await BD.query(sql, params);
  };

  existsForUsuarioAndTimestampAsync = async (idUsuario, tipoEvento, ocurrioEn) => {
    const row = await BD.queryOne(
      `SELECT id FROM eventos_uso WHERE id_usuario = $1 AND tipo_evento = $2 AND ocurrido_en = $3 LIMIT 1`,
      [idUsuario, tipoEvento, ocurrioEn],
    );
    return Boolean(row);
  };
}
