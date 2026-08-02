import { getAllNucleoWords } from '../communication/nucleo-vocabulario.js';
import { normalizeSearchText } from '../../services/PictogramaService.js';

// Unica responsabilidad: calcular que palabras del vocabulario nucleo
// (Sesion 11) uso una persona y cuales nunca uso, a partir de sus
// enunciados hablados (Sesion 9: eventos tipo 'enunciado_hablado', que
// guardan el texto completo dicho con el comunicador). Puro — recibe los
// eventos ya leidos de la BD, no hace queries.
//
// Por que contar palabras del texto en vez de pedir un evento por
// palabra: el enunciado ya guarda el texto completo ("yo querer agua"),
// partirlo en palabras es gratis y no requiere cambiar como se loguean
// los eventos.
export function buildVocabularyReport(enunciadoHabladoEvents) {
  const wordCounts = new Map();

  for (const event of enunciadoHabladoEvents) {
    const text = event?.valor?.text;
    if (typeof text !== 'string') continue;
    const words = normalizeSearchText(text).split(/\s+/).filter(Boolean);
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  const nucleoWords = getAllNucleoWords();
  const used = [];
  const neverUsed = [];

  for (const word of nucleoWords) {
    const normalized = normalizeSearchText(word);
    const count = wordCounts.get(normalized) || 0;
    if (count > 0) used.push({ word, count });
    else neverUsed.push(word);
  }

  used.sort((a, b) => b.count - a.count);

  return { used, neverUsed, totalUtterances: enunciadoHabladoEvents.length };
}
