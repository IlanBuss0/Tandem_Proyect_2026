// Unica responsabilidad: detectar patrones entre eventos de calendario y
// emociones registradas (Sesion 20, item 41 ⭐), y si los apoyos de
// anticipacion (historia social, Sesion 15) se asocian con mejor animo
// (item 43). Puro — recibe datos ya leidos, no hace queries.
//
// Regla de honestidad, la mas importante de este modulo: "una conclusion
// equivocada es peor que ninguna" (la misma regla del motor de
// pictogramas, aplicada a estadistica). Por eso hay un PISO MINIMO de
// observaciones antes de reportar cualquier patron. Sin piso, un patron
// de 2 datos es ruido disfrazado de insight — y presentarselo a una
// familia como "descubrimos un patron" es peor que no decir nada.
import { sentimentScore } from './emotion-sentiment.js';

const MIN_OBSERVATIONS = 3;

/**
 * Item 41: por tipo de evento de calendario, la proporcion de emociones
 * negativas registradas el mismo dia. Solo devuelve tipos con piso minimo
 * de observaciones Y una proporcion negativa claramente alta (>=60%).
 */
export function detectEventTypePatterns(events, emotionRecords) {
  const byType = new Map();
  for (const event of events) {
    if (!byType.has(event.type)) byType.set(event.type, []);
    byType.get(event.type).push(event);
  }

  const patterns = [];
  for (const [type, typeEvents] of byType) {
    const dates = new Set(typeEvents.map((e) => e.date));
    const relatedEmotions = emotionRecords.filter((r) => dates.has(r.date));
    const sentiment = sentimentScore(relatedEmotions);
    if (!sentiment || sentiment.sampleSize < MIN_OBSERVATIONS) continue;

    const negativeRatio = 1 - sentiment.positiveRatio;
    if (negativeRatio >= 0.6) {
      patterns.push({ type, negativeRatio, sampleSize: sentiment.sampleSize });
    }
  }

  return patterns.sort((a, b) => b.negativeRatio - a.negativeRatio);
}

/**
 * Item 43: compara el animo en dias con eventos donde SE VIO la historia
 * social (Sesion 15) contra dias con eventos donde no se vio, para ver si
 * anticipar se asocia con mejor animo. Requiere piso minimo en AMBOS
 * grupos — sin eso, no hay con que comparar de verdad.
 */
export function evaluateAnticipationSupport(events, emotionRecords, socialStoryViewedEventIds) {
  const viewedDates = new Set(events.filter((e) => socialStoryViewedEventIds.has(e.id)).map((e) => e.date));
  const notViewedDates = new Set(events.filter((e) => !socialStoryViewedEventIds.has(e.id)).map((e) => e.date));

  const viewedSentiment = sentimentScore(emotionRecords.filter((r) => viewedDates.has(r.date)));
  const notViewedSentiment = sentimentScore(emotionRecords.filter((r) => notViewedDates.has(r.date)));

  if (!viewedSentiment || !notViewedSentiment) return null;
  if (viewedSentiment.sampleSize < MIN_OBSERVATIONS || notViewedSentiment.sampleSize < MIN_OBSERVATIONS) return null;

  const difference = viewedSentiment.positiveRatio - notViewedSentiment.positiveRatio;
  return {
    viewedPositiveRatio: viewedSentiment.positiveRatio,
    notViewedPositiveRatio: notViewedSentiment.positiveRatio,
    difference,
    helps: difference >= 0.15,
  };
}
