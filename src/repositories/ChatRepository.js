import BD from '../db/BD.js';
import { decryptFieldInRows } from '../modules/security/field-encryption.helper.js';

export default class ChatRepository {
  constructor() {
    console.log('Estoy en: ChatRepository.constructor()');
    this.descriptionColumnReady = false;
  }

  ensureDescriptionColumnAsync = async () => {
    if (this.descriptionColumnReady) return;
    await BD.execute(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS descripcion TEXT`);
    await BD.execute(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
    await BD.execute(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_path TEXT`);
    await BD.execute(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_content_type TEXT`);
    await BD.execute(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_actualizada_en TIMESTAMP`);
    await BD.execute(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP`);
    await BD.execute(`UPDATE chats SET actualizado_en = COALESCE(actualizado_en, fecha_creacion, NOW()) WHERE actualizado_en IS NULL`);
    await BD.execute(`ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS fecha_edicion TIMESTAMP`);
    await BD.execute(`ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMP`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_chats_actualizado_en ON chats (actualizado_en)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_mensajes_chat_id ON mensajes (id_chat, id)`);
    this.descriptionColumnReady = true;
  };

  getAllAsync = async () => {
    console.log('ChatRepository.getAllAsync()');
    await this.ensureDescriptionColumnAsync();
    const sql = `SELECT id, id_tipo_chat, nombre, descripcion, avatar_url, avatar_path, avatar_content_type, avatar_actualizada_en, actualizado_en, fecha_creacion, activo FROM chats ORDER BY id DESC`;
    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`ChatRepository.getByIdAsync(${id})`);
    await this.ensureDescriptionColumnAsync();
    const sql = `SELECT id, id_tipo_chat, nombre, descripcion, avatar_url, avatar_path, avatar_content_type, avatar_actualizada_en, actualizado_en, fecha_creacion, activo FROM chats WHERE id = $1`;
    return await BD.queryOne(sql, [id]);
  };

  getByUsuarioIdAsync = async (idUsuario) => {
    console.log(`ChatRepository.getByUsuarioIdAsync(${idUsuario})`);
    return await this.getByUsuarioIdSinceAsync(idUsuario, null);
  };

  getByUsuarioIdSinceAsync = async (idUsuario, since = null) => {
    console.log(`ChatRepository.getByUsuarioIdSinceAsync(${idUsuario}, ${since})`);
    await this.ensureDescriptionColumnAsync();
    const sql = `
      SELECT 
        c.id, 
        c.id_tipo_chat, 
        c.nombre, 
        c.descripcion,
        c.avatar_url,
        c.avatar_path,
        c.avatar_content_type,
        c.avatar_actualizada_en,
        c.actualizado_en,
        c.fecha_creacion, 
        c.activo,
        COUNT(DISTINCT pc_all.id)::int AS cantidad_participantes,
        jsonb_agg(DISTINCT
          jsonb_build_object(
            'id_usuario', u_part.id,
            'nombre', u_part.nombre,
            'apellido', u_part.apellido,
            'id_tipo_usuario', u_part.id_tipo_usuario,
            'es_admin', COALESCE(pc_all.es_admin, false)
          )
        ) FILTER (WHERE u_part.id IS NOT NULL) AS participantes,
        MAX(u_part.id) FILTER (WHERE u_part.id != $1) AS id_otro_usuario,
        MAX(u_part.nombre) FILTER (WHERE u_part.id != $1) AS nombre_otro_usuario,
        MAX(u_part.apellido) FILTER (WHERE u_part.id != $1) AS apellido_otro_usuario,
        m.contenido AS ultimo_mensaje_contenido,
        m.fecha_envio AS ultimo_mensaje_fecha,
        m.id_usuario_emisor AS ultimo_mensaje_id_emisor,
        (
          SELECT COUNT(*)::int
          FROM mensajes m2 
          WHERE m2.id_chat = c.id 
            AND m2.id > COALESCE(pc.ultimo_mensaje_leido_id, 0)
            AND m2.id_usuario_emisor != $1
            AND m2.eliminado = false
        ) AS cantidad_no_leidos
      FROM chats c
      INNER JOIN participantes_chats pc ON pc.id_chat = c.id
      LEFT JOIN participantes_chats pc_all ON pc_all.id_chat = c.id AND pc_all.fecha_salida IS NULL
      LEFT JOIN usuarios u_part ON u_part.id = pc_all.id_usuario
      LEFT JOIN LATERAL (
          SELECT contenido, fecha_envio, id_usuario_emisor
          FROM mensajes 
          WHERE id_chat = c.id AND eliminado = false
          ORDER BY fecha_envio DESC
          LIMIT 1
      ) m ON true
      WHERE pc.id_usuario = $1
        AND pc.fecha_salida IS NULL
        AND c.activo = true
        AND (
          $2::timestamp IS NULL
          OR c.actualizado_en >= $2::timestamp
          OR pc.fecha_ultima_lectura >= $2::timestamp
          OR EXISTS (
            SELECT 1
            FROM participantes_chats pc_changed
            WHERE pc_changed.id_chat = c.id
              AND (
                pc_changed.fecha_ingreso >= $2::timestamp
                OR pc_changed.fecha_salida >= $2::timestamp
              )
          )
          OR EXISTS (
            SELECT 1
            FROM mensajes m_changed
            WHERE m_changed.id_chat = c.id
              AND (
                m_changed.fecha_envio >= $2::timestamp
                OR m_changed.fecha_edicion >= $2::timestamp
                OR m_changed.fecha_eliminacion >= $2::timestamp
              )
          )
        )
        AND (
          pc.oculto_desde IS NULL
          OR EXISTS (
            SELECT 1
            FROM mensajes m_visible
            WHERE m_visible.id_chat = c.id
              AND m_visible.eliminado = false
              AND m_visible.fecha_envio > pc.oculto_desde
              AND m_visible.id_usuario_emisor != $1
          )
        )
      GROUP BY c.id, c.id_tipo_chat, c.nombre, c.descripcion, c.avatar_url, c.avatar_path, c.avatar_content_type, c.avatar_actualizada_en, c.actualizado_en, c.fecha_creacion, c.activo, pc.ultimo_mensaje_leido_id, pc.fecha_ultima_lectura, m.contenido, m.fecha_envio, m.id_usuario_emisor
      ORDER BY m.fecha_envio DESC NULLS LAST, c.fecha_creacion DESC
    `;
    const rows = await BD.query(sql, [idUsuario, since]);
    return decryptFieldInRows(rows, 'ultimo_mensaje_contenido');
  };

  getActiveBetweenUsersAsync = async (idUsuarioA, idUsuarioB, idTipoChat = null) => {
    console.log(`ChatRepository.getActiveBetweenUsersAsync(${idUsuarioA}, ${idUsuarioB}, ${idTipoChat})`);
    await this.ensureDescriptionColumnAsync();
    const sql = `
      SELECT c.id, c.id_tipo_chat, c.nombre, c.descripcion, c.avatar_url, c.avatar_path, c.avatar_content_type, c.avatar_actualizada_en, c.fecha_creacion, c.activo
      FROM chats c
      INNER JOIN participantes_chats pca ON pca.id_chat = c.id
      INNER JOIN participantes_chats pcb ON pcb.id_chat = c.id
      INNER JOIN participantes_chats pc_active ON pc_active.id_chat = c.id AND pc_active.fecha_salida IS NULL
      WHERE pca.id_usuario = $1
        AND pcb.id_usuario = $2
        AND pca.fecha_salida IS NULL
        AND pcb.fecha_salida IS NULL
        AND c.activo = true
        AND ($3::int IS NULL OR c.id_tipo_chat = $3)
      GROUP BY c.id, c.id_tipo_chat, c.nombre, c.descripcion, c.avatar_url, c.avatar_path, c.avatar_content_type, c.avatar_actualizada_en, c.fecha_creacion, c.activo
      HAVING COUNT(DISTINCT pc_active.id_usuario) = 2
      ORDER BY c.fecha_creacion DESC
      LIMIT 1
    `;
    return await BD.queryOne(sql, [idUsuarioA, idUsuarioB, idTipoChat]);
  };

  getActiveParticipantsAsync = async (idChat) => {
    await this.ensureDescriptionColumnAsync();
    const sql = `
      SELECT id, id_chat, id_usuario, fecha_ingreso, fecha_salida, oculto_desde, COALESCE(es_admin, false) AS es_admin
      FROM participantes_chats
      WHERE id_chat = $1 AND fecha_salida IS NULL
      ORDER BY id ASC
    `;
    return await BD.query(sql, [idChat]);
  };

  replaceParticipantsAsync = async (idChat, participantIds, adminIds = [], fecha = new Date()) => {
    await this.ensureDescriptionColumnAsync();
    return await BD.transaction(async (client) => {
      for (const idUsuario of participantIds) {
        const existing = await client.query(
          `SELECT id FROM participantes_chats WHERE id_chat = $1 AND id_usuario = $2 LIMIT 1`,
          [idChat, idUsuario],
        );

        if (existing.rows[0]?.id) {
          await client.query(
            `
              UPDATE participantes_chats
              SET fecha_salida = null,
                  oculto_desde = CASE
                    WHEN fecha_salida IS NULL THEN null
                    ELSE (
                      SELECT MIN(fecha_envio)
                      FROM (
                        SELECT fecha_envio
                        FROM mensajes
                        WHERE id_chat = $2 AND eliminado = false
                        ORDER BY id DESC
                        LIMIT 5
                      ) ultimos
                    )
                  END,
                  es_admin = $3
              WHERE id = $1
            `,
            [existing.rows[0].id, idChat, adminIds.includes(idUsuario)],
          );
        } else {
          await client.query(
            `
              INSERT INTO participantes_chats (id_chat, id_usuario, fecha_ingreso, fecha_salida, oculto_desde, es_admin)
              VALUES (
                $1,
                $2,
                $3,
                null,
                (
                  SELECT MIN(fecha_envio)
                  FROM (
                    SELECT fecha_envio
                    FROM mensajes
                    WHERE id_chat = $1 AND eliminado = false
                    ORDER BY id DESC
                    LIMIT 5
                  ) ultimos
                ),
                $4
              )
            `,
            [idChat, idUsuario, fecha, adminIds.includes(idUsuario)],
          );
        }
      }

      await client.query(
        `
          UPDATE participantes_chats
          SET fecha_salida = $2, es_admin = false
          WHERE id_chat = $1
            AND fecha_salida IS NULL
            AND id_usuario <> ALL($3::int[])
        `,
        [idChat, fecha, participantIds],
      );

      await client.query(
        `UPDATE chats SET actualizado_en = NOW() WHERE id = $1`,
        [idChat],
      );
    });
  };

  createWithParticipantsAsync = async ({ id_tipo_chat, nombre, descripcion = null, fecha_creacion, participantes, administradores = [] }) => {
    await this.ensureDescriptionColumnAsync();
    return await BD.transaction(async (client) => {
      const chatResult = await client.query(
        `INSERT INTO chats (id_tipo_chat, nombre, descripcion, fecha_creacion, actualizado_en, activo) VALUES ($1, $2, $3, $4, $4, true) RETURNING id, id_tipo_chat, nombre, descripcion, avatar_url, avatar_path, avatar_content_type, avatar_actualizada_en, actualizado_en, fecha_creacion, activo`,
        [id_tipo_chat, nombre ?? null, descripcion ?? null, fecha_creacion],
      );

      const chat = chatResult.rows[0];

      for (const idUsuario of participantes) {
        await client.query(
          `INSERT INTO participantes_chats (id_chat, id_usuario, fecha_ingreso, fecha_salida, oculto_desde, es_admin) VALUES ($1, $2, $3, null, null, $4)`,
          [chat.id, idUsuario, fecha_creacion, administradores.includes(idUsuario)],
        );
      }

      return chat;
    });
  };

  createAsync = async (entity) => {
    await this.ensureDescriptionColumnAsync();
    const sql = `INSERT INTO chats (id_tipo_chat, nombre, descripcion, fecha_creacion, actualizado_en, activo) VALUES ($1, $2, $3, $4, $4, COALESCE($5, true)) RETURNING id`;
    const values = [entity?.id_tipo_chat, entity?.nombre ?? null, entity?.descripcion ?? null, entity?.fecha_creacion, entity?.activo ?? true];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    const id = entity.id;
    const previousEntity = await this.getByIdAsync(id);
    if (previousEntity == null) return 0;
    const sql = `UPDATE chats SET id_tipo_chat = $2, nombre = $3, descripcion = $4, fecha_creacion = $5, activo = $6, actualizado_en = NOW() WHERE id = $1`;
    const values = [id, entity?.id_tipo_chat ?? previousEntity.id_tipo_chat, entity?.nombre ?? previousEntity.nombre, entity?.descripcion ?? previousEntity.descripcion, entity?.fecha_creacion ?? previousEntity.fecha_creacion, entity?.activo ?? previousEntity.activo];
    return await BD.execute(sql, values);
  };

  updateAvatarAsync = async (id, { avatar_url, avatar_path, avatar_content_type }) => {
    await this.ensureDescriptionColumnAsync();
    const sql = `
      UPDATE chats
      SET avatar_url = $2,
          avatar_path = $3,
          avatar_content_type = $4,
          avatar_actualizada_en = NOW(),
          actualizado_en = NOW()
      WHERE id = $1
    `;
    return await BD.execute(sql, [id, avatar_url, avatar_path, avatar_content_type]);
  };

  deleteByIdAsync = async (id) => {
    const sql = `UPDATE chats SET activo = false, actualizado_en = NOW() WHERE id = $1`;
    return await BD.execute(sql, [id]);
  };
}
