// Migra calendario y "Mi dia" del blob JSON en configuraciones_usuarios
// (claves 'calendar.events' bulk / 'calendar.event:<id>' / 'routines.mi-dia')
// a las tablas reales eventos_calendario y rutinas/rutina_items.
//
// NO borra las filas viejas de configuraciones_usuarios — quedan de
// respaldo hasta confirmar que todo funciona (borrarlas es un paso aparte,
// futuro, fuera de este script).
//
// Idempotente:
// - Calendario: eventos_calendario.id es la misma id que ya tenia el
//   evento en el JSON, y CalendarEventRepository.createAsync usa
//   ON CONFLICT (id) DO NOTHING — correrlo dos veces no duplica nada.
// - Rutinas: reemplaza el dia ENTERO de un usuario (replaceAllForUsuarioAsync
//   hace DELETE + INSERT en una transaccion), asi que si ya hay rutinas
//   migradas para ese usuario, el script LAS SALTEA en vez de pisarlas —
//   si no, correrlo dos veces borraria ediciones hechas despues del corte
//   contra la tabla nueva.
//
// Uso: node scripts/migrate-calendar-and-routines.mjs
import BD from '../src/db/BD.js';
import CalendarEventService from '../src/services/CalendarEventService.js';
import RoutineService from '../src/services/RoutineService.js';

function calendarTypeColor(type) {
  const colors = {
    terapia: 'hsl(270 40% 75%)', escuela: 'hsl(210 70% 55%)', personal: 'hsl(30 80% 60%)',
    medico: 'hsl(0 72% 55%)', social: 'hsl(150 60% 45%)', actividad: 'hsl(45 90% 55%)',
  };
  return colors[type] || colors.personal;
}

// Version completa del parseo de calendario para la migracion (a
// diferencia de parseCalendarEventsFromConfigs, que solo extrae
// {id,date,type} para pattern-detection.js, esto preserva TODOS los
// campos — mismo criterio que normalizeCalendarEventsPayload del frontend).
function parseFullCalendarEvent(raw, fallbackId) {
  if (!raw?.date || !raw?.title) return null;
  const type = raw.type || 'personal';
  return {
    id: String(raw.id || fallbackId),
    titulo: String(raw.title),
    fecha: String(raw.date),
    hora: String(raw.time || '09:00'),
    tipo: type,
    descripcion: String(raw.description || ''),
    color: String(raw.color || calendarTypeColor(type)),
    reminders: Array.isArray(raw.reminders) ? raw.reminders.map(Number).filter(Number.isFinite) : undefined,
    idPictograma: raw.pictogramId || null,
    pictogramaUrl: raw.pictogramImageUrl || null,
    pictogramaNombre: raw.pictogramName || null,
    pictogramaConfianza: raw.pictogramConfidence || null,
    pictogramaResueltoPara: raw.pictogramResolvedFor || null,
    afterNote: raw.afterNote || null,
    planB: raw.planB || null,
    sensoryNote: raw.sensoryNote || null,
  };
}

async function migrateCalendar(calendarEventService) {
  const rows = await BD.query(
    `SELECT id, id_usuario, clave, valor FROM configuraciones_usuarios WHERE clave = 'calendar.events' OR clave LIKE 'calendar.event:%'`,
  );
  console.log(`[migrate] ${rows.length} filas de calendario encontradas en configuraciones_usuarios.`);

  let inserted = 0;
  let alreadyExisted = 0;
  let skippedInvalid = 0;
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.id_usuario)) grouped.set(row.id_usuario, []);
    grouped.get(row.id_usuario).push(row);
  }

  for (const [idUsuario, userRows] of grouped) {
    for (const row of userRows) {
      const clave = String(row.clave);
      let rawEvents = [];
      try {
        if (clave === 'calendar.events') {
          const parsed = JSON.parse(row.valor || '[]');
          rawEvents = Array.isArray(parsed) ? parsed : [];
        } else {
          rawEvents = [JSON.parse(row.valor || '{}')];
        }
      } catch {
        skippedInvalid += 1;
        continue;
      }

      for (const [index, raw] of rawEvents.entries()) {
        const event = parseFullCalendarEvent(raw, `ce-${row.id}-${index}`);
        if (!event) { skippedInvalid += 1; continue; }
        const result = await calendarEventService.CalendarEventRepository.createAsync({ ...event, idUsuario });
        if (result.inserted) inserted += 1;
        else alreadyExisted += 1;
      }
    }
  }

  console.log(`[migrate] calendario: ${inserted} eventos insertados, ${alreadyExisted} ya existian (salteados), ${skippedInvalid} filas invalidas salteadas.`);
}

function parseFullRoutinesPayload(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map((routine, rIndex) => ({
    id: String(routine?.id || `r-${Date.now()}-${rIndex}`),
    name: String(routine?.name || 'Rutina'),
    dayOfWeek: routine?.dayOfWeek ?? null,
    date: routine?.date || undefined,
    items: Array.isArray(routine?.items) ? routine.items.map((item, iIndex) => ({
      id: String(item?.id || `i-${Date.now()}-${rIndex}-${iIndex}`),
      time: String(item?.time || '08:00'),
      title: String(item?.title || ''),
      icon: item?.icon || '⭐',
      category: item?.category || 'mañana',
      completed: Boolean(item?.completed),
      reminders: Array.isArray(item?.reminders) ? item.reminders.map(Number).filter(Number.isFinite) : undefined,
      pictogramId: item?.pictogramId || undefined,
      pictogramImageUrl: item?.pictogramImageUrl || undefined,
      pictogramName: item?.pictogramName || undefined,
      pictogramConfidence: item?.pictogramConfidence || undefined,
      pictogramResolvedFor: item?.pictogramResolvedFor || undefined,
      pictogramLabel: item?.pictogramLabel || undefined,
    })) : [],
  })).filter((r) => r.name && r.id);
}

async function migrateRoutines(routineService) {
  const rows = await BD.query(
    `SELECT id_usuario, valor FROM configuraciones_usuarios WHERE clave = 'routines.mi-dia'`,
  );
  console.log(`[migrate] ${rows.length} filas de "Mi dia" encontradas en configuraciones_usuarios.`);

  let migrated = 0;
  let skippedAlreadyMigrated = 0;
  let skippedEmpty = 0;
  let skippedInvalid = 0;

  for (const row of rows) {
    const existing = await routineService.RoutineRepository.getForUsuarioAsync(row.id_usuario);
    if (existing.length > 0) {
      skippedAlreadyMigrated += 1;
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(row.valor || '[]');
    } catch {
      skippedInvalid += 1;
      continue;
    }

    // [] es un usuario que todavia no armo ninguna rutina — valido, no hay
    // nada que migrar, distinto de un JSON realmente corrupto.
    if (Array.isArray(payload) && payload.length === 0) { skippedEmpty += 1; continue; }

    const routines = parseFullRoutinesPayload(payload);
    if (routines.length === 0) { skippedInvalid += 1; continue; }

    await routineService.replaceAllForUsuarioAsync(row.id_usuario, routines);
    migrated += 1;
  }

  console.log(`[migrate] rutinas: ${migrated} usuarios migrados, ${skippedAlreadyMigrated} ya migrados (salteados), ${skippedEmpty} sin rutinas todavia, ${skippedInvalid} invalidos.`);
}

async function main() {
  const calendarEventService = new CalendarEventService();
  const routineService = new RoutineService();
  await calendarEventService.ensureSchemaAsync();
  await routineService.ensureSchemaAsync();

  await migrateCalendar(calendarEventService);
  await migrateRoutines(routineService);

  process.exit(0);
}

main().catch((error) => {
  console.error('[migrate] fallo:', error);
  process.exit(1);
});
