import BD from '../db/BD.js';

// Unica responsabilidad: persistir y leer eventos de calendario. Tabla real
// (columnas propias, indice por usuario+fecha) en vez del blob JSON viejo
// en configuraciones_usuarios (claves 'calendar.events' / 'calendar.event:*'),
// que llego a tener DOS formatos coexistiendo y un bug real por eso
// (config-parsing.js se perdia los eventos que quedaron en el formato bulk).
// Mismo patron que UsageEventRepository.js (Sesion 9).
const COLUMNS = `
  id, id_usuario, titulo, fecha, hora, tipo, descripcion, color, reminders,
  id_pictograma, pictograma_url, pictograma_nombre, pictograma_confianza,
  pictograma_resuelto_para, after_note, plan_b, sensory_note,
  fecha_creacion, fecha_modificacion
`;

export default class CalendarEventRepository {
  ensureSchemaAsync = async () => {
    await BD.execute(`
      CREATE TABLE IF NOT EXISTS eventos_calendario (
        id TEXT PRIMARY KEY,
        id_usuario INTEGER NOT NULL,
        titulo TEXT NOT NULL,
        fecha TEXT NOT NULL,
        hora TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'personal',
        descripcion TEXT,
        color TEXT,
        reminders JSONB,
        id_pictograma TEXT,
        pictograma_url TEXT,
        pictograma_nombre TEXT,
        pictograma_confianza TEXT,
        pictograma_resuelto_para TEXT,
        after_note TEXT,
        plan_b TEXT,
        sensory_note TEXT,
        fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_eventos_calendario_usuario_fecha ON eventos_calendario (id_usuario, fecha)`);
  };

  getForUsuarioAsync = async (idUsuario) => {
    return await BD.query(
      `SELECT ${COLUMNS} FROM eventos_calendario WHERE id_usuario = $1 ORDER BY fecha ASC, hora ASC`,
      [idUsuario],
    );
  };

  getByIdAsync = async (id) => {
    return await BD.queryOne(`SELECT ${COLUMNS} FROM eventos_calendario WHERE id = $1`, [id]);
  };

  // Devuelve tambien `inserted` (false si ON CONFLICT DO NOTHING salteo la
  // fila por ya existir) — lo necesita el script de migracion para no
  // mentir en el log cuando se lo corre una segunda vez.
  createAsync = async (event) => {
    const row = await BD.queryOne(
      `
        INSERT INTO eventos_calendario (
          id, id_usuario, titulo, fecha, hora, tipo, descripcion, color, reminders,
          id_pictograma, pictograma_url, pictograma_nombre, pictograma_confianza,
          pictograma_resuelto_para, after_note, plan_b, sensory_note
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `,
      [
        event.id, event.idUsuario, event.titulo, event.fecha, event.hora,
        event.tipo || 'personal', event.descripcion || null, event.color || null,
        event.reminders ? JSON.stringify(event.reminders) : null,
        event.idPictograma || null, event.pictogramaUrl || null, event.pictogramaNombre || null,
        event.pictogramaConfianza || null, event.pictogramaResueltoPara || null,
        event.afterNote || null, event.planB || null, event.sensoryNote || null,
      ],
    );
    const created = await this.getByIdAsync(event.id);
    return { ...created, inserted: Boolean(row) };
  };

  updateAsync = async (id, patch) => {
    const fields = [];
    const values = [];
    const columnByField = {
      titulo: 'titulo', fecha: 'fecha', hora: 'hora', tipo: 'tipo', descripcion: 'descripcion',
      color: 'color', idPictograma: 'id_pictograma', pictogramaUrl: 'pictograma_url',
      pictogramaNombre: 'pictograma_nombre', pictogramaConfianza: 'pictograma_confianza',
      pictogramaResueltoPara: 'pictograma_resuelto_para', afterNote: 'after_note',
      planB: 'plan_b', sensoryNote: 'sensory_note',
    };
    for (const [field, column] of Object.entries(columnByField)) {
      if (patch[field] === undefined) continue;
      values.push(patch[field]);
      fields.push(`${column} = $${values.length}`);
    }
    if (patch.reminders !== undefined) {
      values.push(patch.reminders ? JSON.stringify(patch.reminders) : null);
      fields.push(`reminders = $${values.length}`);
    }
    if (fields.length === 0) return await this.getByIdAsync(id);

    fields.push('fecha_modificacion = NOW()');
    values.push(id);
    await BD.execute(`UPDATE eventos_calendario SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
    return await this.getByIdAsync(id);
  };

  deleteAsync = async (id) => {
    return await BD.execute(`DELETE FROM eventos_calendario WHERE id = $1`, [id]);
  };
}
