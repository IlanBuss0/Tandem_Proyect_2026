import BD from '../db/BD.js';

const SESSION_COLUMNS = `id, id_profesional, id_perteneciente, fecha_sesion, titulo, duracion_minutos,
  estado, recordatorios, legacy_calendar_event_id, recurrence_group_id, recurrence_rule, recurrence_index,
  motivo_cancelacion`;

const SESSION_COLUMNS_WITH_NOTE = `s.id, s.id_profesional, s.id_perteneciente, s.fecha_sesion, s.titulo, s.duracion_minutos,
  s.estado, s.recordatorios, s.legacy_calendar_event_id, s.recurrence_group_id, s.recurrence_rule, s.recurrence_index,
  s.motivo_cancelacion,
  EXISTS (
    SELECT 1 FROM notas_privadas_profesionales n
    JOIN documentos_drive_notas d ON d.id_nota_privada = n.id
    WHERE n.id_sesion_profesional = s.id
  ) AS has_note`;

export default class SesionProfesionalRepository {
  constructor() {
    console.log('Estoy en: SesionProfesionalRepository.constructor()');
  }

  getAllAsync = async () => {
    console.log('SesionProfesionalRepository.getAllAsync()');
    const sql = `SELECT ${SESSION_COLUMNS} FROM sesiones_profesionales ORDER BY fecha_sesion DESC`;
    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`SesionProfesionalRepository.getByIdAsync(${id})`);
    const sql = `SELECT ${SESSION_COLUMNS} FROM sesiones_profesionales WHERE id = $1`;
    return await BD.queryOne(sql, [id]);
  };

  getByPertenecienteIdAsync = async (idPerteneciente) => {
    console.log(`SesionProfesionalRepository.getByPertenecienteIdAsync(${idPerteneciente})`);
    const sql = `SELECT ${SESSION_COLUMNS} FROM sesiones_profesionales WHERE id_perteneciente = $1 ORDER BY fecha_sesion DESC`;
    return await BD.query(sql, [idPerteneciente]);
  };

  getByProfesionalIdAsync = async (idProfesional) => {
    console.log(`SesionProfesionalRepository.getByProfesionalIdAsync(${idProfesional})`);
    const sql = `SELECT ${SESSION_COLUMNS_WITH_NOTE} FROM sesiones_profesionales s WHERE s.id_profesional = $1 ORDER BY s.fecha_sesion DESC`;
    return await BD.query(sql, [idProfesional]);
  };

  createAsync = async (entity) => {
    console.log(`SesionProfesionalRepository.createAsync(${JSON.stringify(entity)})`);
    const sql = `
      INSERT INTO sesiones_profesionales (
        id_profesional, id_perteneciente, fecha_sesion, titulo, duracion_minutos, estado,
        recordatorios, legacy_calendar_event_id, recurrence_group_id, recurrence_rule, recurrence_index,
        motivo_cancelacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12)
      RETURNING id
    `;
    const values = [
      entity?.id_profesional,
      entity?.id_perteneciente,
      entity?.fecha_sesion,
      entity?.titulo ?? 'Sesion profesional',
      entity?.duracion_minutos ?? 60,
      entity?.estado ?? 'programada',
      JSON.stringify(entity?.recordatorios ?? []),
      entity?.legacy_calendar_event_id ?? null,
      entity?.recurrence_group_id ?? null,
      entity?.recurrence_rule ? JSON.stringify(entity.recurrence_rule) : null,
      entity?.recurrence_index ?? 0,
      entity?.motivo_cancelacion ?? null,
    ];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  /** Inserta varias sesiones (ej. una serie recurrente) en una sola transaccion: si una falla, no queda ninguna a medias. */
  createManyAsync = async (entities) => {
    console.log(`SesionProfesionalRepository.createManyAsync(${entities.length} sesiones)`);
    if (entities.length === 0) return [];

    // 1 INSERT masivo con todas las ocurrencias (antes: 1 INSERT por sesion).
    const columnsPerRow = 12;
    const values = [];
    const placeholders = entities.map((entity, index) => {
      const base = index * columnsPerRow;
      values.push(
        entity?.id_profesional,
        entity?.id_perteneciente,
        entity?.fecha_sesion,
        entity?.titulo ?? 'Sesion profesional',
        entity?.duracion_minutos ?? 60,
        entity?.estado ?? 'programada',
        JSON.stringify(entity?.recordatorios ?? []),
        entity?.legacy_calendar_event_id ?? null,
        entity?.recurrence_group_id ?? null,
        entity?.recurrence_rule ? JSON.stringify(entity.recurrence_rule) : null,
        entity?.recurrence_index ?? 0,
        entity?.motivo_cancelacion ?? null,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}::jsonb, $${base + 8}, $${base + 9}, $${base + 10}::jsonb, $${base + 11}, $${base + 12})`;
    });
    const sql = `
      INSERT INTO sesiones_profesionales (
        id_profesional, id_perteneciente, fecha_sesion, titulo, duracion_minutos, estado,
        recordatorios, legacy_calendar_event_id, recurrence_group_id, recurrence_rule, recurrence_index,
        motivo_cancelacion
      )
      VALUES ${placeholders.join(', ')}
      RETURNING id
    `;
    return await BD.transaction(async (client) => {
      const result = await client.query(sql, values);
      return result.rows.map((row) => row.id ?? 0);
    });
  };

  /**
   * Redimensiona/renombra una serie recurrente completa en una sola
   * transaccion con lock (FOR UPDATE) para serializar resizes concurrentes
   * del mismo grupo. `computeChanges(rows, pastCount)` es una funcion pura
   * (sin I/O) provista por el service: recibe las filas del grupo ya
   * ordenadas por fecha real (no por indice, que puede no coincidir si se
   * reprogramo una sola ocurrencia) y la cantidad de sesiones ya pasadas, y
   * devuelve `{ effectiveTitulo, toInsert, toDeleteIds, toCompleteIds, finalRule }`
   * o tira un error (statusCode incluido) que hace ROLLBACK automatico.
   */
  resizeSeriesAsync = async (groupId, computeChanges) => {
    console.log(`SesionProfesionalRepository.resizeSeriesAsync(${groupId})`);
    return await BD.transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT ${SESSION_COLUMNS} FROM sesiones_profesionales
         WHERE recurrence_group_id = $1
         ORDER BY fecha_sesion ASC, recurrence_index ASC
         FOR UPDATE`,
        [groupId],
      );
      const pastCountResult = await client.query(
        `SELECT COUNT(*)::int AS c FROM sesiones_profesionales
         WHERE recurrence_group_id = $1 AND fecha_sesion <= NOW()`,
        [groupId],
      );
      const pastCount = pastCountResult.rows[0]?.c ?? 0;

      const { effectiveTitulo, toInsert, toDeleteIds, toCompleteIds, finalRule } = computeChanges(rows, pastCount);

      let deletedNotesCount = 0;
      if (toDeleteIds?.length) {
        const notesResult = await client.query(
          `SELECT COUNT(*)::int AS c FROM notas_privadas_profesionales
           WHERE id_sesion_profesional = ANY($1::int[])`,
          [toDeleteIds],
        );
        deletedNotesCount = notesResult.rows[0]?.c ?? 0;
        await client.query(
          `DELETE FROM sesiones_profesionales WHERE id = ANY($1::int[])`,
          [toDeleteIds],
        );
      }

      if (toInsert?.length) {
        const insertSql = `
          INSERT INTO sesiones_profesionales (
            id_profesional, id_perteneciente, fecha_sesion, titulo, duracion_minutos, estado,
            recordatorios, legacy_calendar_event_id, recurrence_group_id, recurrence_rule, recurrence_index
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11)
        `;
        for (const entity of toInsert) {
          await client.query(insertSql, [
            entity.id_profesional,
            entity.id_perteneciente,
            entity.fecha_sesion,
            entity.titulo,
            entity.duracion_minutos,
            entity.estado,
            JSON.stringify(entity.recordatorios ?? []),
            entity.legacy_calendar_event_id ?? null,
            entity.recurrence_group_id,
            JSON.stringify(entity.recurrence_rule),
            entity.recurrence_index,
          ]);
        }
      }

      if (toCompleteIds?.length) {
        await client.query(
          `UPDATE sesiones_profesionales SET estado = 'completada' WHERE id = ANY($1::int[])`,
          [toCompleteIds],
        );
      }

      if (effectiveTitulo !== undefined || finalRule !== undefined) {
        await client.query(
          `UPDATE sesiones_profesionales
           SET titulo = COALESCE($2, titulo), recurrence_rule = COALESCE($3::jsonb, recurrence_rule)
           WHERE recurrence_group_id = $1`,
          [groupId, effectiveTitulo ?? null, finalRule ? JSON.stringify(finalRule) : null],
        );
      }

      const finalRows = await client.query(
        `SELECT ${SESSION_COLUMNS} FROM sesiones_profesionales
         WHERE recurrence_group_id = $1
         ORDER BY fecha_sesion ASC`,
        [groupId],
      );
      return {
        sessions: finalRows.rows,
        deletedSessionIds: toDeleteIds ?? [],
        deletedNotesCount,
        completedSessionIds: toCompleteIds ?? [],
      };
    });
  };

  updateAsync = async (entity, preloadedPreviousEntity = null) => {
    console.log(`SesionProfesionalRepository.updateAsync(${JSON.stringify(entity)})`);
    const id = entity.id;
    // El caller (el service) ya suele tener la fila previa cargada para
    // validar ownership antes de llamar acá — evita repetir el SELECT.
    const previousEntity = preloadedPreviousEntity ?? await this.getByIdAsync(id);
    if (previousEntity == null) return 0;
    const sql = `
      UPDATE sesiones_profesionales
      SET id_profesional = $2, id_perteneciente = $3, fecha_sesion = $4, titulo = $5,
          duracion_minutos = $6, estado = $7, recordatorios = $8::jsonb,
          recurrence_group_id = $9, recurrence_rule = $10::jsonb, recurrence_index = $11,
          motivo_cancelacion = $12
      WHERE id = $1
    `;
    const values = [
      id,
      entity?.id_profesional ?? previousEntity.id_profesional,
      entity?.id_perteneciente ?? previousEntity.id_perteneciente,
      entity?.fecha_sesion ?? previousEntity.fecha_sesion,
      entity?.titulo ?? previousEntity.titulo,
      entity?.duracion_minutos ?? previousEntity.duracion_minutos,
      entity?.estado ?? previousEntity.estado,
      JSON.stringify(entity?.recordatorios ?? previousEntity.recordatorios ?? []),
      entity?.recurrence_group_id ?? previousEntity.recurrence_group_id ?? null,
      entity?.recurrence_rule ? JSON.stringify(entity.recurrence_rule) : (previousEntity.recurrence_rule ? JSON.stringify(previousEntity.recurrence_rule) : null),
      entity?.recurrence_index ?? previousEntity.recurrence_index ?? 0,
      entity?.motivo_cancelacion ?? null,
    ];
    return await BD.execute(sql, values);
  };

  getPrivateNoteAsync = async (idSesion, idProfesional) => {
    return await BD.queryOne(`
      SELECT n.id, n.id_sesion_profesional, n.id_profesional,
             n.fecha_creacion, n.fecha_actualizacion,
             CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
               'id', d.id, 'google_file_id', d.google_file_id, 'nombre', d.nombre,
               'mime_type', d.mime_type, 'web_view_url', d.web_view_url,
               'fecha_vinculacion', d.fecha_vinculacion
             ) END AS documento_drive
      FROM notas_privadas_profesionales n
      LEFT JOIN documentos_drive_notas d ON d.id_nota_privada = n.id
      WHERE n.id_sesion_profesional = $1 AND n.id_profesional = $2
    `, [idSesion, idProfesional]);
  };

  ensurePrivateNoteAsync = async (idSesion, idProfesional) => {
    return await BD.queryOne(`
      INSERT INTO notas_privadas_profesionales (id_sesion_profesional, id_profesional)
      VALUES ($1, $2)
      ON CONFLICT (id_sesion_profesional) DO NOTHING
      RETURNING id, id_sesion_profesional, id_profesional, fecha_creacion, fecha_actualizacion
    `, [idSesion, idProfesional]) ?? await BD.queryOne(`
      SELECT id, id_sesion_profesional, id_profesional, fecha_creacion, fecha_actualizacion
      FROM notas_privadas_profesionales
      WHERE id_sesion_profesional = $1 AND id_profesional = $2
    `, [idSesion, idProfesional]);
  };

  upsertDriveDocumentAsync = async (idNota, document) => {
    return await BD.queryOne(`
      INSERT INTO documentos_drive_notas (id_nota_privada, google_file_id, nombre, mime_type, web_view_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id_nota_privada) DO UPDATE
      SET google_file_id = EXCLUDED.google_file_id, nombre = EXCLUDED.nombre,
          mime_type = EXCLUDED.mime_type, web_view_url = EXCLUDED.web_view_url,
          fecha_vinculacion = NOW()
      RETURNING id, google_file_id, nombre, mime_type, web_view_url, fecha_vinculacion
    `, [idNota, document.google_file_id, document.nombre, document.mime_type, document.web_view_url]);
  };

  deleteDriveDocumentAsync = async (idNota) => {
    return await BD.execute('DELETE FROM documentos_drive_notas WHERE id_nota_privada = $1', [idNota]);
  };

  deleteByIdAsync = async (id) => {
    console.log(`SesionProfesionalRepository.deleteByIdAsync(${id})`);
    const sql = `DELETE FROM sesiones_profesionales WHERE id = $1`;
    return await BD.execute(sql, [id]);
  };
}
