import BD from '../db/BD.js';
import { decryptFieldInRow, decryptFieldInRows, encryptField } from '../modules/security/field-encryption.helper.js';

export default class MensajeRepository {
  constructor() {
    console.log('Estoy en: MensajeRepository.constructor()');
    this.fileMetadataColumnsReady = true;
    this.messageMetadataColumnsReady = false;
  }

  ensureFileMetadataColumnsAsync = async () => {
    this.fileMetadataColumnsReady = true;
  };

  ensureMessageMetadataColumnsAsync = async () => {
    if (this.messageMetadataColumnsReady) return;
    await BD.execute(`ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS fecha_edicion TIMESTAMPTZ`);
    await BD.execute(`ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMPTZ`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_mensajes_chat_id ON mensajes (id_chat, id)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_mensajes_chat_fecha_envio ON mensajes (id_chat, fecha_envio)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_mensajes_chat_fecha_edicion ON mensajes (id_chat, fecha_edicion)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_mensajes_chat_fecha_eliminacion ON mensajes (id_chat, fecha_eliminacion)`);
    this.messageMetadataColumnsReady = true;
  };

  archivoJsonExpression = () => (
    this.fileMetadataColumnsReady
      ? `json_build_object('id', a.id, 'url', a.url, 'nombre_archivo', a.nombre_archivo, 'content_type', a.content_type, 'peso_bytes', a.peso_bytes)`
      : `json_build_object('id', a.id, 'url', a.url, 'nombre_archivo', a.nombre_archivo)`
  );

  getAllAsync = async () => {
    console.log('MensajeRepository.getAllAsync()');
    await this.ensureMessageMetadataColumnsAsync();
    const sql = `SELECT id, id_chat, id_usuario_emisor, id_tipo_mensaje, contenido, fecha_envio, fecha_edicion, fecha_eliminacion, eliminado FROM mensajes ORDER BY id DESC`;
    return decryptFieldInRows(await BD.query(sql), 'contenido');
  };

  getByIdAsync = async (id) => {
    console.log(`MensajeRepository.getByIdAsync(${id})`);
    await this.ensureFileMetadataColumnsAsync();
    await this.ensureMessageMetadataColumnsAsync();
    const sql = `
      SELECT m.id, m.id_chat, m.id_usuario_emisor, m.id_tipo_mensaje, m.contenido, m.fecha_envio, m.fecha_edicion, m.fecha_eliminacion, m.eliminado,
        COALESCE(
          json_agg(
            ${this.archivoJsonExpression()}
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) AS archivos
      FROM mensajes m
      LEFT JOIN mensajes_archivos ma ON ma.id_mensaje = m.id
      LEFT JOIN archivos a ON a.id = ma.id_archivo
      WHERE m.id = $1
      GROUP BY m.id, m.id_chat, m.id_usuario_emisor, m.id_tipo_mensaje, m.contenido, m.fecha_envio, m.fecha_edicion, m.fecha_eliminacion, m.eliminado
    `;
    return decryptFieldInRow(await BD.queryOne(sql, [id]), 'contenido');
  };

  getByChatIdAsync = async (idChat, limit = 30, beforeId = null, afterId = null) => {
    console.log(`MensajeRepository.getByChatIdAsync(${idChat}, ${limit}, ${beforeId}, ${afterId})`);
    await this.ensureMessageMetadataColumnsAsync();
    const orderDirection = afterId ? 'ASC' : 'DESC';
    const sql = `
      SELECT id, id_chat, id_usuario_emisor, id_tipo_mensaje, contenido, fecha_envio, fecha_edicion, fecha_eliminacion, eliminado
      FROM mensajes 
      WHERE id_chat = $1 
        AND ($3::int IS NULL OR id < $3)
        AND ($4::int IS NULL OR id > $4)
        AND eliminado = false
      ORDER BY id ${orderDirection}
      LIMIT $2
    `;
    return decryptFieldInRows(await BD.query(sql, [idChat, limit, beforeId, afterId]), 'contenido');
  };

  getByChatForParticipantAsync = async (idChat, idUsuario, limit = 30, beforeId = null, afterId = null) => {
    console.log(`MensajeRepository.getByChatForParticipantAsync(${idChat}, ${idUsuario}, ${limit}, ${beforeId}, ${afterId})`);
    await this.ensureFileMetadataColumnsAsync();
    await this.ensureMessageMetadataColumnsAsync();
    const orderDirection = afterId ? 'ASC' : 'DESC';
    const sql = `
      SELECT m.id, m.id_chat, m.id_usuario_emisor, m.id_tipo_mensaje, m.contenido, m.fecha_envio, m.fecha_edicion, m.fecha_eliminacion, m.eliminado,
        COALESCE(
          json_agg(
          ${this.archivoJsonExpression()}
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'
      ) AS archivos
    FROM mensajes m
    INNER JOIN participantes_chats pc ON pc.id_chat = m.id_chat AND pc.id_usuario = $2
      LEFT JOIN mensajes_archivos ma ON ma.id_mensaje = m.id
      LEFT JOIN archivos a ON a.id = ma.id_archivo
      WHERE m.id_chat = $1
        AND ($4::int IS NULL OR m.id < $4)
        AND ($5::int IS NULL OR m.id > $5)
        AND m.eliminado = false
        AND (pc.oculto_desde IS NULL OR m.fecha_envio >= pc.oculto_desde)
      GROUP BY m.id, m.id_chat, m.id_usuario_emisor, m.id_tipo_mensaje, m.contenido, m.fecha_envio, m.fecha_edicion, m.fecha_eliminacion, m.eliminado
      ORDER BY m.id ${orderDirection}
      LIMIT $3
    `;
    return decryptFieldInRows(await BD.query(sql, [idChat, idUsuario, limit, beforeId, afterId]), 'contenido');
  };

  getByChatIdAsync = async (idChat, limit = 30, beforeId = null, afterId = null) => {
    console.log(`MensajeRepository.getByChatIdAsync(${idChat}, ${limit}, ${beforeId}, ${afterId})`);
    await this.ensureFileMetadataColumnsAsync();
    await this.ensureMessageMetadataColumnsAsync();
    const orderDirection = afterId ? 'ASC' : 'DESC';
    const sql = `
      SELECT m.id, m.id_chat, m.id_usuario_emisor, m.id_tipo_mensaje, m.contenido, m.fecha_envio, m.fecha_edicion, m.fecha_eliminacion, m.eliminado,
        COALESCE(
          json_agg(
          ${this.archivoJsonExpression()}
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'
      ) AS archivos
    FROM mensajes m
    LEFT JOIN mensajes_archivos ma ON ma.id_mensaje = m.id
    LEFT JOIN archivos a ON a.id = ma.id_archivo
      WHERE m.id_chat = $1
        AND ($3::int IS NULL OR m.id < $3)
        AND ($4::int IS NULL OR m.id > $4)
        AND m.eliminado = false
      GROUP BY m.id, m.id_chat, m.id_usuario_emisor, m.id_tipo_mensaje, m.contenido, m.fecha_envio, m.fecha_edicion, m.fecha_eliminacion, m.eliminado
      ORDER BY m.id ${orderDirection}
      LIMIT $2
    `;
    return decryptFieldInRows(await BD.query(sql, [idChat, limit, beforeId, afterId]), 'contenido');
  };

  createAsync = async (entity) => {
    console.log(`MensajeRepository.createAsync(chat=${entity?.id_chat})`);
    await this.ensureMessageMetadataColumnsAsync();
    const sql = `INSERT INTO mensajes (id_chat, id_usuario_emisor, id_tipo_mensaje, contenido, fecha_envio, eliminado) VALUES ($1, $2, $3, $4, $5, COALESCE($6, false)) RETURNING id`;
    const values = [entity?.id_chat, entity?.id_usuario_emisor, entity?.id_tipo_mensaje, encryptField(entity?.contenido ?? null), entity?.fecha_envio, entity?.eliminado ?? false];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    console.log(`MensajeRepository.updateAsync(${JSON.stringify(entity)})`);
    await this.ensureMessageMetadataColumnsAsync();
    const id = entity.id;
    const previousEntity = await this.getByIdAsync(id);
    if (previousEntity == null) return 0;
    const sql = `UPDATE mensajes SET id_chat = $2, id_usuario_emisor = $3, id_tipo_mensaje = $4, contenido = $5, fecha_envio = $6, eliminado = $7, fecha_edicion = $8, fecha_eliminacion = $9 WHERE id = $1`;
    const values = [id, entity?.id_chat ?? previousEntity.id_chat, entity?.id_usuario_emisor ?? previousEntity.id_usuario_emisor, entity?.id_tipo_mensaje ?? previousEntity.id_tipo_mensaje, encryptField(entity?.contenido ?? previousEntity.contenido), entity?.fecha_envio ?? previousEntity.fecha_envio, entity?.eliminado ?? previousEntity.eliminado, entity?.fecha_edicion === undefined ? previousEntity.fecha_edicion : entity.fecha_edicion, entity?.fecha_eliminacion === undefined ? previousEntity.fecha_eliminacion : entity.fecha_eliminacion];
    return await BD.execute(sql, values);
  };

  deleteByIdAsync = async (id) => {
    console.log(`MensajeRepository.deleteByIdAsync(${id})`);
    await this.ensureMessageMetadataColumnsAsync();
    const sql = `UPDATE mensajes SET eliminado = true, fecha_eliminacion = NOW() WHERE id = $1`;
    return await BD.execute(sql, [id]);
  };
}
