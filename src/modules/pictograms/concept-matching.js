import { normalizeSearchText } from '../../services/PictogramaService.js';

// Unica responsabilidad de este modulo: dado un concepto y un pictograma
// candidato, decidir que tan bien matchean. Funciones puras, sin red ni DB —
// no saben nada de Groq ni de como se consiguieron los candidatos.
//
// La regla de diseno que gobierna todo esto: en CAA un pictograma equivocado
// es peor que ninguno, porque la persona confia en la imagen. Por eso el
// nivel "alta" es deliberadamente estricto (nunca por etiqueta, nunca por
// substring), y "baja" nunca se devuelve como pictograma resuelto — se
// reporta como "ninguna" y la UI cae al emoji que el paso ya tenia.

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasNegation(text) {
  return /\b(no|sin)\b/.test(text);
}

/**
 * Punta que tan bien matchea un concepto con un pictograma.
 *
 * @param {string} concept
 * @param {{ name: string, tags?: string[] }} pictogram
 * @returns {{ level: 'alta'|'media'|'baja', score: number, matchedOn: string }}
 */
export function scoreConceptMatch(concept, pictogram) {
  const c = normalizeSearchText(concept);
  const title = normalizeSearchText(pictogram?.name);

  if (!c || c.length < 2 || !title) {
    return { level: 'baja', score: 0, matchedOn: 'concepto-invalido' };
  }

  if (title === c) {
    return { level: 'alta', score: 1.0, matchedOn: 'titulo-exacto' };
  }

  let level = 'baja';
  let score = 0;
  let matchedOn = 'sin-match';

  // Conceptos de 3 caracteres o menos ("ir", "ya") son demasiado ambiguos
  // para confiar en un match parcial: "ir" no puede subir de "baja" contra
  // "ir de compras" solo porque es prefijo. La igualdad exacta de arriba ya
  // los cubre cuando de verdad corresponden.
  if (c.length <= 3) {
    return { level: 'baja', score: 0, matchedOn: 'concepto-muy-corto' };
  }

  const cWords = c.split(' ').length;
  const titleWords = title.split(' ').length;
  const cRegex = new RegExp(`\\b${escapeRegex(c)}\\b`);
  const titleRegex = new RegExp(`\\b${escapeRegex(title)}\\b`);

  if (title.startsWith(`${c} `)) {
    level = 'media'; score = 0.7; matchedOn = 'titulo-prefijo';
  } else if (titleRegex.test(c) && cWords - titleWords <= 3) {
    // El titulo entero aparece como palabra completa DENTRO del concepto
    // (el picto es la "cabeza" de una frase mas larga): "tomar el
    // colectivo" contiene "colectivo".
    level = 'media'; score = 0.6; matchedOn = 'titulo-palabra-en-concepto';
  } else if (cRegex.test(title) && titleWords - cWords <= 3) {
    level = 'media'; score = 0.55; matchedOn = 'palabra-completa-en-titulo';
  } else if ((pictogram?.tags || []).some((t) => normalizeSearchText(t) === c)) {
    // Nunca "alta": las etiquetas incluyen el nombre original en ingles que
    // agrega PictogramTranslationService, son mas ruidosas que el titulo.
    level = 'media'; score = 0.5; matchedOn = 'etiqueta-exacta';
  } else if (title.includes(c)) {
    level = 'baja'; score = 0.2; matchedOn = 'solo-substring';
  }

  // "tomar la pastilla" no puede matchear "no tomar pastillas": si uno tiene
  // negacion y el otro no, degradar un nivel.
  if (level !== 'baja' && hasNegation(c) !== hasNegation(title)) {
    level = level === 'alta' ? 'media' : 'baja';
    score -= 0.3;
    matchedOn += '+negacion-degradada';
  }

  return { level, score, matchedOn };
}

// Compara dos candidatos del mismo nivel para el mismo concepto. `current`
// puede ser null (todavia no hay ninguno elegido). El desempate en score
// empatado es primero el estilo visual preferido del usuario (Sesion 2:
// "preferencia de estilo visual por persona" — el catalogo suele tener el
// mismo concepto dibujado en varios estilos, y conviene mostrar siempre el
// que esa persona ya eligio antes) y despues el titulo mas corto, mas
// especifico.
function isBetterCandidate(candidate, current, preferredStyle) {
  if (!current) return true;
  if (candidate.score !== current.score) return candidate.score > current.score;

  if (preferredStyle) {
    const candidateMatches = candidate.pictogram.visualStyle === preferredStyle;
    const currentMatches = current.pictogram.visualStyle === preferredStyle;
    if (candidateMatches !== currentMatches) return candidateMatches;
  }

  return candidate.pictogram.name.length < current.pictogram.name.length;
}

/**
 * Elige el mejor pictograma entre varios conceptos, cada uno con su lista de
 * candidatos ya buscados. Recorre los conceptos en el orden dado (el motor
 * de extraccion los ordena del mas al menos representativo) y devuelve el
 * primer "alta"; si no hay ninguno, el "media" de mayor score. Ante un
 * empate de score, se prefiere el estilo visual que el usuario ya eligio
 * antes (`preferredStyle`, opcional).
 *
 * @param {string[]} concepts
 * @param {Map<string, Array<{name: string, tags?: string[], visualStyle?: string|null}>>} candidatesByConcept
 * @param {string|null} [preferredStyle]
 * @returns {{ pictogram, confidence: 'alta'|'media', concept: string, matchedOn: string, score: number } | null}
 */
export function pickBestMatch(concepts, candidatesByConcept, preferredStyle = null) {
  let bestAlta = null;
  let bestMedia = null;

  for (const concept of concepts) {
    const candidatos = candidatesByConcept.get(concept) || [];
    for (const pictogram of candidatos) {
      const { level, score, matchedOn } = scoreConceptMatch(concept, pictogram);
      if (level === 'baja') continue;

      const entry = { pictogram, confidence: level, concept, matchedOn, score };
      if (level === 'alta' && isBetterCandidate(entry, bestAlta, preferredStyle)) {
        bestAlta = entry;
      } else if (level === 'media' && isBetterCandidate(entry, bestMedia, preferredStyle)) {
        bestMedia = entry;
      }
    }
  }

  return bestAlta || bestMedia || null;
}
