// Unica responsabilidad: clasificar una emocion como positiva o negativa y
// calcular una proporcion sobre una lista de registros. Extraido de
// pattern-detection.js (Sesion 20) porque evolution.js (Sesion 21) necesita
// exactamente el mismo criterio — dos listas de "que cuenta como positivo"
// que se desincronizan con el tiempo son peor que una sola fuente.
export const NEGATIVE_EMOTIONS = new Set(['Ansioso', 'Nervioso', 'Frustrado', 'Enojado', 'Triste', 'Preocupado']);
export const POSITIVE_EMOTIONS = new Set(['Contento', 'Feliz', 'Tranquilo', 'Motivado', 'Orgulloso']);

/**
 * @param {{emotion: string}[]} emotions
 * @returns {{positiveRatio: number, sampleSize: number} | null}
 */
export function sentimentScore(emotions) {
  const relevant = (emotions || []).filter((e) => NEGATIVE_EMOTIONS.has(e.emotion) || POSITIVE_EMOTIONS.has(e.emotion));
  if (relevant.length === 0) return null;
  const positive = relevant.filter((e) => POSITIVE_EMOTIONS.has(e.emotion)).length;
  return { positiveRatio: positive / relevant.length, sampleSize: relevant.length };
}
