import PictogramaService from './PictogramaService.js';
import { normalizeSearchText } from './PictogramaService.js';
import { extractConceptsAsync, MAX_PHRASES_PER_REQUEST } from '../modules/pictograms/concept-extraction.js';
import { pickBestMatch } from '../modules/pictograms/concept-matching.js';
import PersonalVocabularyStore from '../modules/pictograms/personal-vocabulary.js';
import StylePreferenceStore from '../modules/pictograms/style-preference.js';
import PictogramizationMemoRepository from '../repositories/PictogramizationMemoRepository.js';
import MemoryProfileService from './MemoryProfileService.js';

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

export default class PictogramizationService {
  constructor() {
    this.PictogramaService = new PictogramaService();
    this.PersonalVocabularyStore = new PersonalVocabularyStore();
    this.StylePreferenceStore = new StylePreferenceStore();
    this.PictogramizationMemoRepository = new PictogramizationMemoRepository();
    this.MemoryProfileService = new MemoryProfileService();
    // Asignado en el constructor (no llamado directo del import) para poder
    // mockearlo por instancia en los tests, mismo patron que
    // `service.PictogramaRepository.searchAsync = async () => ...` en el
    // resto del repo.
    this.extractConceptsAsync = extractConceptsAsync;
  }

  async ensureMemoSchemaAsync() {
    if (!this.memoSchemaReady) {
      this.memoSchemaReady = this.PictogramizationMemoRepository.ensureSchemaAsync();
    }
    return await this.memoSchemaReady;
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
   * @param {string|null} [params.preferredStyleOverride] - fuerza un estilo visual (Sesion 10, item 48: alto contraste) por encima de lo aprendido
   * @returns {Promise<{
   *   results: Array<{ id, text, concepts: string[], pictogram: object|null, confidence: 'alta'|'media'|'ninguna', matchedOn: string|null }>,
   *   engine: { model: string|null, usedGroq: boolean, degraded: boolean }
   * }>}
   */
  async pictogramizeAsync({ phrases, language = 'es', targetPertenecienteId = null, minConfidence = 'media', userId = null, preferredStyleOverride = null }) {
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

    // Memo global en BD (texto -> conceptos), compartido entre TODOS los
    // usuarios y TODAS las superficies (rutinas, calendario, traductor
    // manual): si alguien ya escribio "lavarse los dientes" alguna vez, ni
    // este ni ningun otro usuario vuelve a gastar Groq para ese texto. Se
    // guardan los CONCEPTOS, no el pictograma final, para que una mejora del
    // catalogo despues de hoy siga beneficiando a un texto ya cacheado (el
    // matching contra el catalogo es SQL, no consume cuota).
    await this.ensureMemoSchemaAsync();
    const normalizedUniqueTexts = uniqueTexts.map(normalizeSearchText);
    const memoHits = await this.PictogramizationMemoRepository.getManyAsync(normalizedUniqueTexts, language);

    const missingIndexes = [];
    const missingTexts = [];
    normalizedUniqueTexts.forEach((normalized, index) => {
      if (!memoHits.has(normalized)) {
        missingIndexes.push(index);
        missingTexts.push(uniqueTexts[index]);
      }
    });

    const conceptsByUniqueText = new Array(uniqueTexts.length);
    normalizedUniqueTexts.forEach((normalized, index) => {
      if (memoHits.has(normalized)) conceptsByUniqueText[index] = memoHits.get(normalized);
    });

    let engineInfo = { usedGroq: false, degraded: false, model: null };

    if (missingTexts.length > 0) {
      const { concepts, usedGroq, degraded, model } = await this.extractConceptsAsync(missingTexts);
      engineInfo = { usedGroq, degraded, model };
      missingIndexes.forEach((uniqueIndex, i) => { conceptsByUniqueText[uniqueIndex] = concepts[i]; });

      // Solo se persiste al memo compartido cuando Groq de verdad contesto
      // (no degradado): un resultado heuristico es peor que uno de Groq, y
      // guardarlo "envenenaria" el memo para el proximo que escriba lo mismo.
      if (usedGroq && !degraded) {
        const entries = missingIndexes.map((uniqueIndex, i) => ({
          textoNormalizado: normalizedUniqueTexts[uniqueIndex],
          conceptos: concepts[i],
        }));
        await this.PictogramizationMemoRepository.upsertManyAsync(entries, language, model);
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

    // Preferencia de estilo visual (Sesion 2): entre varios candidatos
    // empatados para el mismo concepto, se prioriza el estilo que este
    // usuario ya eligio a mano mas veces. Se pide una sola vez para todo
    // el lote, no por item.
    // Sesion 10, item 48 (accesibilidad): si el frontend pide un estilo
    // (alto contraste, por el setting de accesibilidad del usuario), gana
    // por encima del estilo aprendido por uso — es una necesidad, no una
    // preferencia que se pueda ignorar.
    // Sesion 25 (perfil de memoria): antes que el estilo, se prioriza un
    // pictograma puntual que la persona ya reconoce. Metodo chico y
    // cacheado aparte (getFrequentPictogramIdsAsync), no el perfil
    // completo — esto corre en el camino caliente de cada resolucion.
    const [preferredStyle, frequentPictogramIds] = await Promise.all([
      preferredStyleOverride ? Promise.resolve(preferredStyleOverride) : this.StylePreferenceStore.getPreferredStyleAsync(userId),
      userId ? this.MemoryProfileService.getFrequentPictogramIdsAsync(userId) : Promise.resolve([]),
    ]);
    const frequentPictogramIdSet = new Set(frequentPictogramIds);

    const resolvedResults = new Map(vocabularyResults);
    for (const item of items) {
      const uniqueIndex = textToIndex.get(normalizeSearchText(item.text));
      const concepts = conceptsByUniqueText[uniqueIndex] || [];
      const best = pickBestMatch(concepts, candidatesByConcept, preferredStyle, frequentPictogramIdSet);

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
