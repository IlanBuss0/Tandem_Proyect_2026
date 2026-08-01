import axios from 'axios';
import { envConfig } from '../../configs/env.config.js';

// Unica responsabilidad de este modulo: convertir frases en conceptos
// buscables ("Lavarse los dientes" -> ["lavarse los dientes", "cepillarse
// los dientes", "dientes"]). No sabe nada de pictogramas, catalogo ni
// scoring — eso vive en concept-matching.js y en PictogramizationService.js.
//
// El manejo de Groq (batching, 429 en dos niveles, parseo tolerante, split
// por count mismatch) esta calcado de PictogramTranslationService.js: es el
// patron ya probado en produccion para este mismo tipo de llamada.

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';
// Lotes mas chicos que la traduccion de catalogo: cada frase pide HASTA 3
// conceptos (no 1 traduccion), asi que el mismo lote genera ~3x mas tokens
// de salida.
const BATCH_SIZE_PRIMARY = 40;
const BATCH_SIZE_FALLBACK = 12;
const DELAY_BETWEEN_BATCHES_MS = 2500;
export const MAX_PHRASES_PER_REQUEST = 60;

export const SYSTEM_PROMPT = `Convertis pasos de rutinas diarias en conceptos buscables en un catalogo de pictogramas de comunicacion aumentativa (CAA), en espanol rioplatense (Argentina).

Por cada frase de entrada devolves de 1 a 3 conceptos, ORDENADOS del mas representativo al menos representativo.

Reglas:
1. Todo en minusculas, sin comillas, sin punto final.
2. Sacas articulos, preposiciones, posesivos, pronombres sueltos y adverbios de tiempo ("la", "el", "mi", "de", "en", "con", "para", "antes", "despues", "hoy", "cuando").
3. Los verbos van en INFINITIVO. Si el verbo es reflexivo o pronominal, dejalo asi: "me lavo los dientes" -> "lavarse los dientes". "Se viste" -> "vestirse".
4. Las expresiones de varias palabras que nombran UNA sola accion o UN solo objeto NO se parten: "lavarse las manos", "hacer la cama", "poner la mesa", "sacar la basura", "cepillo de dientes". El primer concepto casi siempre es la accion completa.
5. El concepto 1 es la accion u objeto principal del paso. Los conceptos 2 y 3 son alternativas mas cortas o mas generales, para el caso de que el catalogo no tenga el primero: "tomar el colectivo a la escuela" -> ["tomar el colectivo","colectivo","escuela"]. Nunca repitas el mismo concepto dos veces.
6. Usas la palabra mas comun en Argentina: "autobus" -> "colectivo", "telefono movil" -> "celular", "piscina" -> "pileta", "coche" -> "auto", "zumo" -> "jugo", "ordenador" -> "computadora". "lavarse los dientes" y "cepillarse los dientes" son ambos validos: devolve los dos.
7. Si la frase es abstracta y no nombra nada dibujable ("pausa de respiracion cuando me pongo nervioso"), devolve el concepto concreto mas cercano ("respirar") y nada mas. NO inventes objetos que la frase no menciona.
8. Nunca devuelvas un array vacio: si no podes extraer nada, devolve la frase entera en minusculas como unico concepto.
9. No agregues explicaciones, ni markdown, ni claves extra.

Respondes UNICAMENTE con un objeto JSON con una sola clave "conceptos", cuyo valor es un array de arrays de strings, del mismo largo y en el mismo orden que la entrada.

Ejemplo de entrada: ["Lavarse las manos antes de comer","Tomar el colectivo a la escuela","Hacer la cama"]
Ejemplo de salida: {"conceptos":[["lavarse las manos","manos","comer"],["tomar el colectivo","colectivo","escuela"],["hacer la cama","cama"]]}`;

const STOPWORDS = new Set(['la', 'el', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'con', 'para', 'a', 'mi', 'su', 'antes', 'despues', 'hoy', 'cuando', 'y', 'al']);

/**
 * Fallback sin LLM. Peor que Groq (no lematiza ni agrupa reflexivos), pero
 * nunca falla y nunca sale a la red. Se usa sin GROQ_API_KEY o si Groq esta
 * caido.
 */
export function extractConceptsHeuristic(text) {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  const words = normalized.split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
  if (words.length === 0) return [normalized || text];
  const candidates = [words.join(' '), words.slice(0, 2).join(' '), words[words.length - 1]];
  return candidates.filter((c, i, arr) => c && arr.indexOf(c) === i);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGroqBatch(phrases, { model, attempt = 1, primaryModelExhaustedRef }) {
  const activeModel = model ?? (primaryModelExhaustedRef.value ? FALLBACK_MODEL : PRIMARY_MODEL);
  try {
    const response = await axios.post(GROQ_CHAT_URL, {
      model: activeModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(phrases) },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }, {
      headers: { Authorization: `Bearer ${envConfig.groqApiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    const text = response?.data?.choices?.[0]?.message?.content?.trim() || '';
    let parsed;
    try {
      const asJson = JSON.parse(text);
      parsed = Array.isArray(asJson) ? asJson : Object.values(asJson).find(Array.isArray);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!Array.isArray(parsed) || parsed.length !== phrases.length) {
      const error = new Error(`se esperaban ${phrases.length} listas de conceptos y llegaron ${Array.isArray(parsed) ? parsed.length : 'nada'}`);
      error.isCountMismatch = true;
      throw error;
    }
    return parsed.map((value, index) => {
      const arr = Array.isArray(value) ? value.map((c) => String(c ?? '').trim()).filter(Boolean) : [];
      return arr.length > 0 ? arr : extractConceptsHeuristic(phrases[index]);
    });
  } catch (error) {
    const status = error?.response?.status;
    const message = error?.response?.data?.error?.message || error.message;

    if (status === 429) {
      const isDailyLimit = /per day|TPD/i.test(message);

      if (isDailyLimit && activeModel === PRIMARY_MODEL) {
        primaryModelExhaustedRef.value = true;
        return callGroqBatch(phrases, { attempt: 1, model: FALLBACK_MODEL, primaryModelExhaustedRef });
      }

      if (!isDailyLimit && attempt <= 3) {
        await sleep(attempt * 15000);
        return callGroqBatch(phrases, { attempt: attempt + 1, model: activeModel, primaryModelExhaustedRef });
      }
    }

    if (error.isCountMismatch) throw error;
    throw new Error(`[${activeModel}] ${message}`);
  }
}

async function callGroqWithSplit(phrases, primaryModelExhaustedRef) {
  try {
    return await callGroqBatch(phrases, { primaryModelExhaustedRef });
  } catch (error) {
    if (!error.isCountMismatch || phrases.length <= 1) throw error;
    const middle = Math.floor(phrases.length / 2);
    const [left, right] = await Promise.all([
      callGroqWithSplit(phrases.slice(0, middle), primaryModelExhaustedRef),
      callGroqWithSplit(phrases.slice(middle), primaryModelExhaustedRef),
    ]);
    return [...left, ...right];
  }
}

/**
 * Extrae conceptos de una lista de frases. Nunca lanza: si no hay
 * GROQ_API_KEY, si Groq esta caido, o si un lote falla definitivamente,
 * degrada al heuristico para las frases afectadas.
 *
 * @param {string[]} phrases
 * @returns {Promise<{ concepts: string[][], usedGroq: boolean, degraded: boolean, model: string|null }>}
 */
export async function extractConceptsAsync(phrases) {
  if (!Array.isArray(phrases) || phrases.length === 0) {
    return { concepts: [], usedGroq: false, degraded: false, model: null };
  }

  if (!envConfig.groqApiKey) {
    return { concepts: phrases.map(extractConceptsHeuristic), usedGroq: false, degraded: true, model: null };
  }

  const primaryModelExhaustedRef = { value: false };
  const result = new Array(phrases.length);
  let anyFailed = false;

  let offset = 0;
  while (offset < phrases.length) {
    const batchSize = primaryModelExhaustedRef.value ? BATCH_SIZE_FALLBACK : BATCH_SIZE_PRIMARY;
    const batch = phrases.slice(offset, offset + batchSize);
    try {
      const batchConcepts = await callGroqWithSplit(batch, primaryModelExhaustedRef);
      for (let i = 0; i < batch.length; i += 1) result[offset + i] = batchConcepts[i];
    } catch {
      anyFailed = true;
      for (let i = 0; i < batch.length; i += 1) result[offset + i] = extractConceptsHeuristic(batch[i]);
    }
    offset += batch.length;
    if (offset < phrases.length) await sleep(DELAY_BETWEEN_BATCHES_MS);
  }

  return {
    concepts: result,
    usedGroq: true,
    degraded: anyFailed,
    model: primaryModelExhaustedRef.value ? FALLBACK_MODEL : PRIMARY_MODEL,
  };
}
