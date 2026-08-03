import BD from '../db/BD.js';

// Unica responsabilidad: persistir y leer rutinas ("Mi dia") y sus pasos.
// Tablas reales (rutinas + rutina_items) en vez del blob JSON gigante en
// configuraciones_usuarios (clave 'routines.mi-dia'), que se reescribia
// entero cada vez que se tocaba un solo paso. Mismo patron que
// UsageEventRepository.js / CalendarEventRepository.js.
const ITEM_COLUMNS = `
  id, id_rutina, orden, hora, titulo, icono, categoria, completado, reminders,
  id_pictograma, pictograma_url, pictograma_nombre, pictograma_confianza,
  pictograma_resuelto_para, pictograma_label
`;

export default class RoutineRepository {
  ensureSchemaAsync = async () => {
    await BD.execute(`
      CREATE TABLE IF NOT EXISTS rutinas (
        id TEXT PRIMARY KEY,
        id_usuario INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        dia_semana SMALLINT,
        fecha TEXT,
        fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fecha_modificacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await BD.execute(`
      CREATE TABLE IF NOT EXISTS rutina_items (
        id TEXT PRIMARY KEY,
        id_rutina TEXT NOT NULL REFERENCES rutinas(id) ON DELETE CASCADE,
        orden INTEGER NOT NULL,
        hora TEXT NOT NULL,
        titulo TEXT NOT NULL,
        icono TEXT,
        categoria TEXT,
        completado BOOLEAN NOT NULL DEFAULT false,
        reminders JSONB,
        id_pictograma TEXT,
        pictograma_url TEXT,
        pictograma_nombre TEXT,
        pictograma_confianza TEXT,
        pictograma_resuelto_para TEXT,
        pictograma_label TEXT
      )
    `);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_rutinas_usuario ON rutinas (id_usuario)`);
    await BD.execute(`CREATE INDEX IF NOT EXISTS idx_rutina_items_rutina ON rutina_items (id_rutina, orden)`);
  };

  getForUsuarioAsync = async (idUsuario) => {
    const routines = await BD.query(
      `SELECT id, nombre, dia_semana, fecha FROM rutinas WHERE id_usuario = $1 ORDER BY fecha_creacion ASC`,
      [idUsuario],
    );
    if (routines.length === 0) return [];

    const items = await BD.query(
      `SELECT ${ITEM_COLUMNS} FROM rutina_items WHERE id_rutina = ANY($1) ORDER BY id_rutina, orden ASC`,
      [routines.map((r) => r.id)],
    );
    const itemsByRoutine = new Map();
    for (const item of items) {
      if (!itemsByRoutine.has(item.id_rutina)) itemsByRoutine.set(item.id_rutina, []);
      itemsByRoutine.get(item.id_rutina).push(item);
    }
    return routines.map((r) => ({ ...r, items: itemsByRoutine.get(r.id) || [] }));
  };

  // Reemplaza TODO el dia de un usuario en una transaccion — mismo
  // comportamiento que el guardado bulk de hoy (RoutinesContext debounce-
  // guarda el array entero), asi que RoutinesContext.tsx no necesita
  // reescribirse en esta migracion. El PATCH de un item puntual es aparte
  // (ver updateItemAsync) para los casos que ya pueden ser granulares
  // (togglear completado, corregir un pictograma).
  replaceAllForUsuarioAsync = async (idUsuario, routines) => {
    return await BD.transaction(async (client) => {
      await client.query(`DELETE FROM rutinas WHERE id_usuario = $1`, [idUsuario]);

      for (const routine of routines) {
        await client.query(
          `INSERT INTO rutinas (id, id_usuario, nombre, dia_semana, fecha) VALUES ($1,$2,$3,$4,$5)`,
          [routine.id, idUsuario, routine.nombre, routine.dia_semana ?? null, routine.fecha ?? null],
        );
        let orden = 0;
        for (const item of routine.items || []) {
          await client.query(
            `
              INSERT INTO rutina_items (
                id, id_rutina, orden, hora, titulo, icono, categoria, completado, reminders,
                id_pictograma, pictograma_url, pictograma_nombre, pictograma_confianza,
                pictograma_resuelto_para, pictograma_label
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            `,
            [
              item.id, routine.id, orden, item.hora, item.titulo, item.icono || null,
              item.categoria || null, Boolean(item.completado), item.reminders ? JSON.stringify(item.reminders) : null,
              item.id_pictograma || null, item.pictograma_url || null, item.pictograma_nombre || null,
              item.pictograma_confianza || null, item.pictograma_resuelto_para || null, item.pictograma_label || null,
            ],
          );
          orden += 1;
        }
      }
    });
  };

  getItemOwnerUsuarioIdAsync = async (itemId) => {
    const row = await BD.queryOne(
      `SELECT r.id_usuario FROM rutina_items ri JOIN rutinas r ON r.id = ri.id_rutina WHERE ri.id = $1`,
      [itemId],
    );
    return row?.id_usuario ?? null;
  };

  updateItemAsync = async (itemId, patch) => {
    const fields = [];
    const values = [];
    const columnByField = {
      hora: 'hora', titulo: 'titulo', icono: 'icono', categoria: 'categoria', completado: 'completado',
      id_pictograma: 'id_pictograma', pictograma_url: 'pictograma_url', pictograma_nombre: 'pictograma_nombre',
      pictograma_confianza: 'pictograma_confianza', pictograma_resuelto_para: 'pictograma_resuelto_para',
      pictograma_label: 'pictograma_label',
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
    if (fields.length === 0) return;

    values.push(itemId);
    await BD.execute(`UPDATE rutina_items SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  };
}
