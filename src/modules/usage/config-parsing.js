// Unica responsabilidad: leer eventos de calendario y registros
// emocionales desde filas crudas de configuraciones_usuarios (el blob
// store donde vive hoy el calendario y las emociones, ver
// ConfiguracionUsuarioController.js). Puro — recibe filas ya leidas, no
// hace queries. Espejo minimo de la logica de parseo que ya existe en el
// frontend (api.ts: normalizeCalendarEventsPayload, parseEmotionConfig),
// solo los campos que necesita la deteccion de patrones (Sesion 20).
const CALENDAR_EVENT_KEY_PREFIX = 'calendar.event:';
const EMOTION_KEY_PREFIX = 'emotion:';

export function parseCalendarEventsFromConfigs(configs) {
  const events = [];
  for (const row of configs || []) {
    if (!String(row.clave || '').startsWith(CALENDAR_EVENT_KEY_PREFIX)) continue;
    try {
      const value = JSON.parse(row.valor || '{}');
      if (!value.date) continue;
      events.push({
        id: String(value.id || row.id),
        date: String(value.date),
        type: String(value.type || 'personal'),
      });
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
