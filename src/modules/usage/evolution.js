import { sentimentScore } from './emotion-sentiment.js';

// Unica responsabilidad: agrupar eventos de uso por semana ISO para mostrar
// "evolucion en el tiempo" (Sesion 21, item 44) — cuantos pasos de rutina
// se completaron y que tan positivo fue el animo, semana a semana. Puro —
// recibe eventos ya leidos de eventos_uso (Sesion 9), no hace queries.
//
// A diferencia de pattern-detection.js, ACA no hay piso minimo: mostrar
// "esta semana completaste 3 pasos" no es una conclusion causal, es un
// dato descriptivo. El piso minimo aplica cuando se afirma una relacion
// (X causa/se asocia con Y), no cuando se cuenta lo que paso.
function isoWeekKey(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;

  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * @param {{tipo_evento: string, ocurrido_en: string, valor?: {emotion?: string}}[]} events
 * @param {{maxWeeks?: number}} [options]
 */
export function buildEvolutionReport(events, options = {}) {
  const maxWeeks = options.maxWeeks ?? 8;
  const byWeek = new Map();

  for (const event of events || []) {
    const week = isoWeekKey(event?.ocurrido_en);
    if (!week) continue;
    if (!byWeek.has(week)) byWeek.set(week, { routineCompletions: 0, emotions: [] });
    const bucket = byWeek.get(week);

    if (event.tipo_evento === 'rutina_paso_completado') bucket.routineCompletions += 1;
    if (event.tipo_evento === 'emocion_registrada' && event.valor?.emotion) {
      bucket.emotions.push({ emotion: event.valor.emotion });
    }
  }

  const weeks = Array.from(byWeek.keys()).sort().slice(-maxWeeks);
  return weeks.map((week) => {
    const bucket = byWeek.get(week);
    const sentiment = sentimentScore(bucket.emotions);
    return {
      week,
      routineCompletions: bucket.routineCompletions,
      positiveEmotionRatio: sentiment ? sentiment.positiveRatio : null,
      emotionSampleSize: sentiment ? sentiment.sampleSize : 0,
    };
  });
}
