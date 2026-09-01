import { envConfig } from '../../configs/env.config.js';
import { groqProvider } from '../../providers/ai/aiProviders.js';

// Unica responsabilidad: simplificar un texto a "lectura facil" (Sesion
// 18, item 15 "explicame esto"). Un solo llamado a Groq, sin batching —
// a diferencia de concept-extraction.js (que procesa lotes de pasos de
// rutina automaticamente), esto lo dispara el usuario a mano, una vez por
// vez, con un texto que puede ser largo (un mensaje, un parrafo pegado).
//
// Reglas de lectura facil (estandar de accesibilidad cognitiva, no
// inventadas aca): oraciones cortas, una idea por oracion, vocabulario
// simple, voz activa, sin dobles negaciones ni metaforas.
const MODEL = 'openai/gpt-oss-20b';
export const MAX_LECTURA_FACIL_CHARS = 2000;

const SYSTEM_PROMPT = `Reescribis un texto en espanol rioplatense en formato de LECTURA FACIL, para que lo entienda alguien con dificultad de comprension lectora (por ejemplo, una persona con autismo o discapacidad intelectual).

Reglas:
1. Oraciones CORTAS. Una idea por oracion.
2. Vocabulario simple y concreto. Nada de metaforas, dobles sentidos ni palabras raras.
3. Voz activa, no pasiva. "Juan cerro la puerta", no "la puerta fue cerrada por Juan".
4. Sin dobles negaciones.
5. Si el texto original tiene informacion irrelevante o de relleno, se puede sacar.
6. No agregues informacion que el texto original no tenia.

Respondes UNICAMENTE con un objeto JSON: {"oraciones": ["primera oracion", "segunda oracion", ...]}, una oracion corta por elemento del array, en el orden en que deberian leerse.`;

/**
 * @param {string} text
 * @returns {Promise<{ sentences: string[], usedGroq: boolean, degraded: boolean }>}
 */
export async function simplifyToLecturaFacilAsync(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { sentences: [], usedGroq: false, degraded: false };

  if (!envConfig.groqApiKey) {
    return { sentences: heuristicSplit(trimmed), usedGroq: false, degraded: true };
  }

  try {
    const response = await groqProvider.chatCompletion({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: trimmed.slice(0, MAX_LECTURA_FACIL_CHARS) },
      ],
      temperature: 0.2,
      responseFormat: { type: 'json_object' },
      timeoutMs: 30000,
    });

    const raw = response?.data?.choices?.[0]?.message?.content?.trim() || '';
    const parsed = JSON.parse(raw);
    const sentences = Array.isArray(parsed?.oraciones) ? parsed.oraciones.map(String).filter(Boolean) : [];
    if (sentences.length === 0) return { sentences: heuristicSplit(trimmed), usedGroq: true, degraded: true };
    return { sentences, usedGroq: true, degraded: false };
  } catch {
    return { sentences: heuristicSplit(trimmed), usedGroq: false, degraded: true };
  }
}

/** Fallback sin Groq: parte por oraciones existentes, nunca falla. */
function heuristicSplit(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return sentences.length > 0 ? sentences : [text];
}
