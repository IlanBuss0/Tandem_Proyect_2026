import BD from '../db/BD.js';

export default class NotificacionRepository {
  constructor() {
    console.log('Estoy en: NotificacionRepository.constructor()');
  }

  getByUsuarioDestinoIdAsync = async (idUsuarioDestino, limit = 50) => {
    console.log(`NotificacionRepository.getByUsuarioDestinoIdAsync(${idUsuarioDestino})`);
    const sql = `SELECT n.id, n.id_usuario_destino, n.id_usuario_actor, n.id_tipo_notificacion, n.titulo, n.cuerpo, n.leida, n.fecha_creacion, n.fecha_lectura, n.reference_type, n.reference_id, n.context_user_id, CASE WHEN rr.source_type='routine' THEN rr.routine_id END AS reference_routine_id, CASE WHEN rr.source_type='routine' THEN rr.item_id END AS reference_item_id, CASE WHEN rr.source_type='calendar' THEN rr.item_id END AS reference_calendar_event_id FROM notificaciones n LEFT JOIN recordatorios_programados rr ON n.reference_type IN ('routine','calendar') AND rr.id = n.reference_id WHERE n.id_usuario_destino = $1 ORDER BY n.id DESC LIMIT $2`;
    return await BD.query(sql, [idUsuarioDestino, limit]);
  };

  createAsync = async (entity) => {
    console.log(`NotificacionRepository.createAsync(${JSON.stringify(entity)})`);
    const sql = `INSERT INTO notificaciones (id_usuario_destino, id_usuario_actor, id_tipo_notificacion, titulo, cuerpo, leida, fecha_creacion, fecha_lectura, reference_type, reference_id, context_user_id) VALUES ($1, $2, $3, $4, $5, COALESCE($6, false), $7, $8, $9, $10, $11) RETURNING id`;
    const values = [entity?.id_usuario_destino, entity?.id_usuario_actor ?? null, entity?.id_tipo_notificacion, entity?.titulo, entity?.cuerpo ?? null, entity?.leida ?? false, entity?.fecha_creacion, entity?.fecha_lectura ?? null, entity?.reference_type ?? null, entity?.reference_id ?? null, entity?.context_user_id ?? null];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  createManyAsync = async (entities) => {
    console.log(`NotificacionRepository.createManyAsync(${entities?.length ?? 0})`);
    if (!Array.isArray(entities) || entities.length === 0) return 0;

    const chunkSize = 1000;
    let totalRows = 0;

    for (let i = 0; i < entities.length; i += chunkSize) {
      totalRows += await this.createManyChunkAsync(entities.slice(i, i + chunkSize));
    }

    return totalRows;
  };

  createManyChunkAsync = async (entities) => {
    const columnsPerRow = 11;
    const values = [];
    const placeholders = entities.map((entity, index) => {
      const base = index * columnsPerRow;
      values.push(
        entity?.id_usuario_destino,
        entity?.id_usuario_actor ?? null,
        entity?.id_tipo_notificacion,
        entity?.titulo,
        entity?.cuerpo ?? null,
        entity?.leida ?? false,
        entity?.fecha_creacion,
        entity?.fecha_lectura ?? null,
        entity?.reference_type ?? null,
        entity?.reference_id ?? null,
        entity?.context_user_id ?? null,
      );

      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, COALESCE($${base + 6}, false), $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
    });

    const sql = `
      INSERT INTO notificaciones
        (id_usuario_destino, id_usuario_actor, id_tipo_notificacion, titulo, cuerpo, leida, fecha_creacion, fecha_lectura, reference_type, reference_id, context_user_id)
      VALUES ${placeholders.join(', ')}
    `;

    return await BD.execute(sql, values);
  };

  markAsReadForUserAsync = async (id, userId) => BD.execute(
    `UPDATE notificaciones SET leida = true, fecha_lectura = COALESCE(fecha_lectura, NOW()) WHERE id = $1 AND id_usuario_destino = $2`,
    [id, userId],
  );

  markAllAsReadForUserAsync = async (userId) => BD.execute(
    `UPDATE notificaciones SET leida = true, fecha_lectura = NOW() WHERE id_usuario_destino = $1 AND leida = false`,
    [userId],
  );
}
