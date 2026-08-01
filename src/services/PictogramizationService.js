import PictogramaService from './PictogramaService.js';
import { normalizeSearchText } from './PictogramaService.js';
import { cacheService } from './CacheService.js';
import { extractConceptsAsync, MAX_PHRASES_PER_REQUEST } from '../modules/pictograms/concept-extraction.js';
import { pickBestMatch } from '../modules/pictograms/concept-matching.js';
import PersonalVocabularyStore from '../modules/pictograms/personal-vocabulary.js';

// Unica responsabilidad de este servicio: orquestar "frase -> pictograma".
// No sabe COMO se extraen conceptos (concept-extraction.js) ni COMO se
// puntua un match (concept-matching.js) — solo los conecta entre si y con
// el catalogo (PictogramaService).
//
// Es el motor detras de la traduccion automatica de "Mi dia" (Sesion 1):
// el perteneciente nunca escribe nada, la app traduce sola lo que ya esta
// en el sistema. Diferencial sobre Pictotraductor/PictoFacile: no hace
// falta que nadie tipee texto.
//
// Regla de diseno: NUNCA se muestra un pictograma dudoso. Si no hay
// certeza suficiente, se devuelve pictogram:null y el front cae al emoji
// que el paso ya tenia. Nadie tiene que validar nada para que ande.

export { MAX_PHRASES_PER_REQUEST };

const CANDIDATES_PER_CONCEPT = 8;
const MEMO_MAX_SIZE = 2000;

// Memo en proceso: Redis esta desactivado hoy (REDIS_URL sin configurar), asi
// que cacheService es no-op. Este Map evita que dos pestanas del mismo
// usuario, o dos llamados seguidos, disparen dos veces la misma resolucion
// en la misma corrida del proceso. No reemplaza la persistencia real (eso lo
// hace el front guardando pictogramResolvedFor en cada RoutineItem).
const memo = new Map();

function memoGet(key) {
  return memo.has(key) ? memo.get(key) : undefined;
}

function memoSet(key, value) {
  if (memo.size >= MEMO_MAX_SIZE) {
    const oldest = memo.keys().next().value;
    memo.delete(oldest);
  }
  memo.set(key, value);
}

export default class PictogramizationService {
  constructor() {
    this.PictogramaService = new PictogramaService();
    this.PersonalVocabularyStore = new PersonalVocabularyStore();
    // Asignado en el constructor (no llamado directo del import) para poder
    // mockearlo por instancia en los tests, mismo patron que
    // `service.PictogramaRepository.searchAsync = async () => ...` en el
    // resto del repo.
    this.extractConceptsAsync = extractConceptsAsync;
  }

  /**
   * Resuelve una lista de frases a pictogramas.
   *
   * @param {object} params
   * @param {Array<{id: string, text: string}>} params.phrases
   * @param {string} [params.language]
   * @param {string|null} [params.targetPertenecienteId]
   * @param {'alta'|'media'} [params.minConfidence]
   * @param {number|string|null} [params.userId] - para el vocabulario personal (Sesion 2)
   * @returns {Promise<{
   *   results: Array<{ id, text, concepts: string[], pictogram: object|null, confidence: 'alta'|'media'|'ninguna', matchedOn: string|null }>,
   *   engine: { model: string|null, usedGroq: boolean, degraded: boolean }
   * }>}
   */
  async pictogramizeAsync({ phrases, language = 'es', targetPertenecienteId = null, minConfidence = 'media', userId = null }) {
    const allItems = (Array.isArray(phrases) ? phrases : [])
      .map((p, index) => (typeof p === 'string' ? { id: String(index), text: p } : p))
      .filter((p) => p && typeof p.text === 'string' && p.text.trim());

    if (allItems.length === 0) {
      return { results: [], engine: { model: null, usedGroq: false, degraded: false } };
    }

    // Vocabulario personal: si el usuario ya eligio a mano un pictograma para
    // este texto exacto, se usa directo. No hace falta Groq ni el catalogo
    // de nuevo — ademas de mas preciso, cuida la cuota diaria.
    const vocabulary = await this.PersonalVocabularyStore.getAsync(userId);
    const vocabularyResults = new Map();
    const pendingVocabularyIds = new Set();
    for (const item of allItems) {
      const pictogramId = vocabulary[normalizeSearchText(item.text)];
      if (pictogramId) pendingVocabularyIds.add(pictogramId);
    }
    if (pendingVocabularyIds.size > 0) {
      const pictogramsById = new Map();
      await Promise.all(Array.from(pendingVocabularyIds).map(async (id) => {
        const pictogram = await this.PictogramaService.getByIdAsync(id, language);
        if (pictogram) pictogramsById.set(id, pictogram);
      }));
      for (const item of allItems) {
        const pictogramId = vocabulary[normalizeSearchText(item.text)];
        const pictogram = pictogramId && pictogramsById.get(pictogramId);
        if (pictogram) {
          vocabularyResults.set(item.id, {
            id: item.id,
            text: item.text,
            concepts: [],
            pictogram: { id: pictogram.id, name: pictogram.name, imageUrl: pictogram.imageUrl, source: pictogram.source },
            confidence: 'alta',
            matchedOn: 'vocabulario-personal',
          });
        }
      }
    }

    const items = allItems.filter((item) => !vocabularyResults.has(item.id));

    if (items.length === 0) {
      return {
        results: allItems.map((item) => vocabularyResults.get(item.id)),
        engine: { model: null, usedGroq: false, degraded: false },
      };
    }

    // Dedupe de texto: dos pasos con el mismo titulo (o el mismo paso en dos
    // pestanas) no pagan Groq dos veces en la misma corrida.
    const uniqueTexts = [];
    const textToIndex = new Map();
    for (const item of items) {
      const key = normalizeSearchText(item.text);
      if (!textToIndex.has(key)) {
        textToIndex.set(key, uniqueTexts.length);
        uniqueTexts.push(item.text);
      }
    }

    const cacheKey = `pictogramize.${language}.${uniqueTexts.map(normalizeSearchText).sort().join('|')}`;
    let conceptsByUniqueText = await cacheService.get(cacheKey);
    let engineInfo = { usedGroq: false, degraded: false, model: null };

    if (!conceptsByUniqueText) {
      const memoHit = memoGet(cacheKey);
      if (memoHit) {
        conceptsByUniqueText = memoHit.concepts;
        engineInfo = memoHit.engineInfo;
      } else {
        const { concepts, usedGroq, degraded, model } = await this.extractConceptsAsync(uniqueTexts);
        conceptsByUniqueText = concepts;
        engineInfo = { usedGroq, degraded, model };
        memoSet(cacheKey, { concepts, engineInfo });
        await cacheService.set(cacheKey, concepts, 86400);
      }
    }

    // Candidatos por CONCEPTO unico (no por frase): "manos" puede aparecer en
    // varios pasos, se busca una sola vez.
    const allConcepts = new Set();
    for (const conceptList of conceptsByUniqueText) {
      for (const concept of conceptList) allConcepts.add(concept);
    }

    const candidatesByConcept = new Map();
    await Promise.all(Array.from(allConcepts).map(async (concept) => {
      const { items: found } = await this.PictogramaService.searchAsync({
        search: concept,
        language,
        limit: CANDIDATES_PER_CONCEPT,
        targetPertenecienteId,
      });
      candidatesByConcept.set(concept, found);
    }));

    const resolvedResults = new Map(vocabularyResults);
    for (const item of items) {
      const uniqueIndex = textToIndex.get(normalizeSearchText(item.text));
      const concepts = conceptsByUniqueText[uniqueIndex] || [];
      const best = pickBestMatch(concepts, candidatesByConcept);

      const meetsMinConfidence = best && (minConfidence === 'media' || best.confidence === 'alta');

      if (!meetsMinConfidence) {
        resolvedResults.set(item.id, { id: item.id, text: item.text, concepts, pictogram: null, confidence: 'ninguna', matchedOn: null });
        continue;
      }

      resolvedResults.set(item.id, {
        id: item.id,
        text: item.text,
        concepts,
        pictogram: {
          id: best.pictogram.id,
          name: best.pictogram.name,
          imageUrl: best.pictogram.imageUrl,
          source: best.pictogram.source,
        },
        confidence: best.confidence,
        matchedOn: best.matchedOn,
      });
    }

    return { results: allItems.map((item) => resolvedResults.get(item.id)), engine: engineInfo };
  }
}
