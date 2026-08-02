// Unica responsabilidad: el modelo de "enunciado" — una frase armada con
// el constructor del comunicador (Sesion 11) como una lista ORDENADA de
// tokens, cada uno un pictograma o una palabra suelta. Puro, sin red ni
// estado — ni sabe de React ni de Postgres.
//
// Por que hace falta un modelo compartido: sin esto, cada superficie que
// necesita "una frase armada con pictogramas" (el comunicador en si, el
// modo "no puedo hablar" de la Sesion 13, el historial de lo dicho de la
// Sesion 12, la salida en pictogramas del chat) inventa su propio formato
// y no se pueden reconstruir entre si. `mensajes.contenido` en la BD es
// texto plano sin columna de metadata — por eso un enunciado se serializa
// COMO texto (para que siga siendo compatible con todo lo que ya lee
// `contenido`) mas un bloque JSON aparte con los tokens originales.

/**
 * @typedef {{ type: 'pictogram', pictogramId: string, text: string } | { type: 'text', text: string }} UtteranceToken
 */

/**
 * @param {UtteranceToken[]} tokens
 * @returns {{ tokens: UtteranceToken[], text: string }}
 */
export function createUtterance(tokens) {
  const clean = (tokens || []).filter((t) => t && typeof t.text === 'string' && t.text.trim());
  return { tokens: clean, text: utteranceToText(clean) };
}

/** Texto hablable/legible de un enunciado: las palabras en orden, separadas por espacio. */
export function utteranceToText(tokens) {
  return (tokens || []).map((t) => t.text.trim()).join(' ').trim();
}

/** Serializa un enunciado para guardarlo como `valor` de un evento de uso o como metadata de un mensaje. */
export function serializeUtterance(utterance) {
  return JSON.stringify({ tokens: utterance.tokens, text: utterance.text });
}

/** @returns {{ tokens: UtteranceToken[], text: string } | null} null si no se pudo parsear */
export function deserializeUtterance(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed?.tokens)) return null;
    return createUtterance(parsed.tokens);
  } catch {
    return null;
  }
}
