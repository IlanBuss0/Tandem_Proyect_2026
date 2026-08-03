// Unica responsabilidad: leer eventos de calendario y registros
// emocionales desde filas crudas de configuraciones_usuarios (el blob
// store donde vive hoy el calendario y las emociones, ver
// ConfiguracionUsuarioController.js). Puro — recibe filas ya leidas, no
// hace queries. Espejo minimo de la logica de parseo que ya existe en el
// frontend (api.ts: normalizeCalendarEventsPayload, parseEmotionConfig),
// solo los campos que necesita la deteccion de patrones (Sesion 20).
//
// El calendario tiene DOS formatos historicos (ver api.ts CALENDAR_CONFIG_KEY
// vs CALENDAR_EVENT_KEY_PREFIX): una fila vieja 'calendar.events' con un
// array de eventos, y filas nuevas 'calendar.event:<id>' de a una. Cuentas
// que todavia tienen su primer lote de eventos en el formato viejo (nunca
// migrado, no hay migracion de blobs por diseño — ver el plan de S9)
// quedaban invisibles para /patrones si solo se leia el prefijo nuevo.
const CALENDAR_EVENT_KEY_PREFIX = 'calendar.event:';
const CALENDAR_BULK_KEY = 'calendar.events';
const EMOTION_KEY_PREFIX = 'emotion:';

function toEvent(value, fallbackId) {
  if (!value?.date) return null;
  return {
    id: String(value.id || fallbackId),
    date: String(value.date),
    type: String(value.type || 'personal'),
  };
}

export function parseCalendarEventsFromConfigs(configs) {
  const events = [];
  for (const row of configs || []) {
    const clave = String(row.clave || '');
    if (clave === CALENDAR_BULK_KEY) {
      try {
        const values = JSON.parse(row.valor || '[]');
        if (Array.isArray(values)) {
          for (const value of values) {
            const event = toEvent(value, row.id);
            if (event) events.push(event);
          }
        }
      } catch {
        // fila corrupta o no-JSON: se ignora, no rompe el resto
      }
      continue;
    }
    if (!clave.startsWith(CALENDAR_EVENT_KEY_PREFIX)) continue;
    try {
      const event = toEvent(JSON.parse(row.valor || '{}'), row.id);
      if (event) events.push(event);
    } catch {
      // fila corrupta o no-JSON: se ignora, no rompe el resto
    }
  }
  return events;
}

export function parseEmotionsFromConfigs(configs) {
  const emotions = [];
  for (const row of configs || []) {
    if (!String(row.clave || '').startsWith(EMOTION_KEY_PREFIX)) continue;
    try {
      const value = JSON.parse(row.valor || '{}');
      if (!value.emotion || !value.date) continue;
      emotions.push({ date: String(value.date), emotion: String(value.emotion) });
    } catch {
      // idem
    }
  }
  return emotions;
}
