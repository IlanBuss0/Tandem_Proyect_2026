import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreConceptMatch, pickBestMatch } from '../src/modules/pictograms/concept-matching.js';
import { extractConceptsHeuristic } from '../src/modules/pictograms/concept-extraction.js';
import PictogramizationService from '../src/services/PictogramizationService.js';
import PersonalVocabularyStore from '../src/modules/pictograms/personal-vocabulary.js';
import StylePreferenceStore from '../src/modules/pictograms/style-preference.js';
import { envConfig } from '../src/configs/env.config.js';

// Motor de pictogramizacion (Sesion 1): frase -> pictograma, sin que el
// perteneciente tenga que escribir nada. Regla de diseno que estos tests
// protegen: en CAA un pictograma equivocado es peor que ninguno, asi que
// "alta" tiene que ser deliberadamente estricto (nunca por etiqueta, nunca
// por substring pelado) y "baja" nunca se devuelve como resultado.

// --- scoreConceptMatch ---

test('scoreConceptMatch: titulo exacto es alta', () => {
  const r = scoreConceptMatch('ducharse', { name: 'ducharse', tags: [] });
  assert.equal(r.level, 'alta');
});

test('scoreConceptMatch: mismas palabras normalizadas (mayusculas/acentos) es alta', () => {
  const r = scoreConceptMatch('Lavarse Las Manos', { name: 'lavarse las manos', tags: [] });
  assert.equal(r.level, 'alta');
});

test('scoreConceptMatch: "agua" no matchea "aguacate" en alta ni media (el falso positivo mas probable)', () => {
  const r = scoreConceptMatch('agua', { name: 'aguacate', tags: [] });
  assert.equal(r.level, 'baja', 'un substring pelado sin limite de palabra no puede dar alta ni media');
});

test('scoreConceptMatch: prefijo con limite de palabra da media', () => {
  const r = scoreConceptMatch('comer', { name: 'comer con la boca cerrada', tags: [] });
  assert.equal(r.level, 'media');
  assert.equal(r.matchedOn, 'titulo-prefijo');
});

test('scoreConceptMatch: el titulo aparece como palabra completa dentro de un concepto mas largo', () => {
  const r = scoreConceptMatch('tomar el colectivo', { name: 'colectivo', tags: [] });
  assert.equal(r.level, 'media');
  assert.equal(r.matchedOn, 'titulo-palabra-en-concepto');
});

test('scoreConceptMatch: palabra completa dentro del titulo da media', () => {
  const r = scoreConceptMatch('perro', { name: 'pasear al perro', tags: [] });
  assert.equal(r.level, 'media');
  assert.equal(r.matchedOn, 'palabra-completa-en-titulo');
});

test('scoreConceptMatch: etiqueta exacta da media, nunca alta', () => {
  const r = scoreConceptMatch('pileta', { name: 'swimming pool', tags: ['pileta'] });
  assert.equal(r.level, 'media');
  assert.equal(r.matchedOn, 'etiqueta-exacta');
});

test('scoreConceptMatch: negacion en uno solo de los dos degrada el nivel', () => {
  const r = scoreConceptMatch('tomar la pastilla', { name: 'no tomar la pastilla', tags: [] });
  assert.notEqual(r.level, 'alta', 'no tomar es lo opuesto de tomar, no puede dar alta');
});

test('scoreConceptMatch: conceptos muy cortos no pasan de baja salvo igualdad exacta', () => {
  const r = scoreConceptMatch('ir', { name: 'ir de compras', tags: [] });
  assert.equal(r.level, 'baja');
});

// --- pickBestMatch ---

test('pickBestMatch: si el concepto 1 no matchea, usa el concepto 2', () => {
  const candidatesByConcept = new Map([
    ['tomar el colectivo a la escuela', []],
    ['colectivo', [{ id: '1', name: 'colectivo', tags: [] }]],
  ]);
  const best = pickBestMatch(['tomar el colectivo a la escuela', 'colectivo'], candidatesByConcept);
  assert.equal(best.confidence, 'alta');
  assert.equal(best.pictogram.id, '1');
});

test('pickBestMatch: entre dos "media" gana el titulo mas corto', () => {
  const candidatesByConcept = new Map([
    ['mesa', [
      { id: 'largo', name: 'mesa de comedor grande', tags: [] },
      { id: 'corto', name: 'mesa de living', tags: [] },
    ]],
  ]);
  // ambos matchean via "titulo-prefijo" con el mismo score (0.7): desempata el mas corto
  const best = pickBestMatch(['mesa'], candidatesByConcept);
  assert.equal(best.pictogram.id, 'corto');
});

test('pickBestMatch: ante un empate de score, gana el estilo visual preferido', () => {
  const candidatesByConcept = new Map([
    ['agua', [
      { id: 'ilustracion', name: 'agua', tags: [], visualStyle: 'ilustracion' },
      { id: 'realista', name: 'agua', tags: [], visualStyle: 'realista' },
    ]],
  ]);
  // ambos son "alta" por titulo exacto con el mismo score: sin preferencia
  // gana el primero encontrado, con preferencia gana el del estilo pedido
  const sinPreferencia = pickBestMatch(['agua'], candidatesByConcept);
  assert.equal(sinPreferencia.pictogram.id, 'ilustracion');

  const conPreferencia = pickBestMatch(['agua'], candidatesByConcept, 'realista');
  assert.equal(conPreferencia.pictogram.id, 'realista');
});

test('pickBestMatch: ante un empate de score, gana un pictograma que la persona ya reconoce (Sesion 25)', () => {
  const candidatesByConcept = new Map([
    ['agua', [
      { id: 'nuevo-para-ella', name: 'agua', tags: [] },
      { id: 'ya-lo-uso', name: 'agua', tags: [] },
    ]],
  ]);
  const sinMemoria = pickBestMatch(['agua'], candidatesByConcept);
  assert.equal(sinMemoria.pictogram.id, 'nuevo-para-ella');

  const conMemoria = pickBestMatch(['agua'], candidatesByConcept, null, new Set(['ya-lo-uso']));
  assert.equal(conMemoria.pictogram.id, 'ya-lo-uso');
});

test('pickBestMatch: el pictograma que ya reconoce gana incluso sobre el estilo preferido', () => {
  const candidatesByConcept = new Map([
    ['agua', [
      { id: 'estilo-preferido', name: 'agua', tags: [], visualStyle: 'realista' },
      { id: 'ya-lo-uso', name: 'agua', tags: [], visualStyle: 'ilustracion' },
    ]],
  ]);
  const best = pickBestMatch(['agua'], candidatesByConcept, 'realista', new Set(['ya-lo-uso']));
  assert.equal(best.pictogram.id, 'ya-lo-uso', 'reconocer el pictograma puntual pesa mas que el estilo general');
});

test('pickBestMatch: sin ningun match devuelve null', () => {
  const candidatesByConcept = new Map([['xyz', [{ id: '1', name: 'algo totalmente distinto', tags: [] }]]]);
  const best = pickBestMatch(['xyz'], candidatesByConcept);
  assert.equal(best, null);
});

// --- extractConceptsHeuristic ---

test('extractConceptsHeuristic nunca devuelve un array vacio', () => {
  assert.ok(extractConceptsHeuristic('').length > 0);
  assert.ok(extractConceptsHeuristic('la el de').length > 0);
});

test('extractConceptsHeuristic saca stopwords', () => {
  const concepts = extractConceptsHeuristic('Lavarse las manos antes de comer');
  assert.ok(!concepts[0].includes(' de '));
});

// --- PictogramizationService.pictogramizeAsync ---

function buildCatalog(entries) {
  // entries: { concepto-buscado: [pictogramas] }
  return async ({ search }) => ({ items: entries[search] || [], total: (entries[search] || []).length });
}

// El memo global (PictogramizationMemoRepository) pega contra Postgres, que
// no existe en este entorno de test. Por defecto se mockea vacio (sin hits,
// upsert no-op) para que el resto de los tests no dependa de BD; los tests
// del memo en si mismo sobreescriben esto a proposito.
function buildService() {
  const service = new PictogramizationService();
  service.PictogramizationMemoRepository.ensureSchemaAsync = async () => {};
  service.PictogramizationMemoRepository.getManyAsync = async () => new Map();
  service.PictogramizationMemoRepository.upsertManyAsync = async () => {};
  service.MemoryProfileService.getFrequentPictogramIdsAsync = async () => [];
  return service;
}

test('pictogramizeAsync: una sola llamada de extraccion para todas las frases del lote', async () => {
  const service = buildService();
  let calls = 0;
  service.extractConceptsAsync = async (texts) => {
    calls += 1;
    return { concepts: texts.map((t) => [t.toLowerCase()]), usedGroq: true, degraded: false, model: 'openai/gpt-oss-20b' };
  };
  service.PictogramaService.searchAsync = buildCatalog({});

  await service.pictogramizeAsync({
    phrases: [
      { id: '1', text: 'Uno' }, { id: '2', text: 'Dos' }, { id: '3', text: 'Tres' },
      { id: '4', text: 'Cuatro' }, { id: '5', text: 'Cinco' },
    ],
  });

  assert.equal(calls, 1, 'debe extraer conceptos de las 5 frases en una sola llamada, no una por frase');
});

test('pictogramizeAsync: frases duplicadas piden un solo searchAsync por concepto unico', async () => {
  const service = buildService();
  service.extractConceptsAsync = async (texts) => ({
    concepts: texts.map(() => ['manos']), usedGroq: true, degraded: false, model: 'x',
  });
  let searchCalls = 0;
  service.PictogramaService.searchAsync = async ({ search }) => { searchCalls += 1; return { items: [], total: 0 }; };

  await service.pictogramizeAsync({
    phrases: [{ id: '1', text: 'Lavarse las manos' }, { id: '2', text: 'lavarse las manos' }, { id: '3', text: 'LAVARSE LAS MANOS' }],
  });

  assert.equal(searchCalls, 1, 'las 3 frases son el mismo texto normalizado: un solo concepto, una sola busqueda');
});

test('pictogramizeAsync: sin GROQ_API_KEY degrada al heuristico sin lanzar', async () => {
  const previous = envConfig.groqApiKey;
  envConfig.groqApiKey = null;
  try {
    const service = buildService();
    service.PictogramaService.searchAsync = buildCatalog({ dientes: [{ id: '1', name: 'dientes', imageUrl: 'x', source: 'MULBERRY', tags: [] }] });

    const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'dientes' }] });

    assert.equal(result.engine.degraded, true);
    assert.equal(result.engine.usedGroq, false);
    assert.equal(result.results.length, 1);
  } finally {
    envConfig.groqApiKey = previous;
  }
});

test('pictogramizeAsync: sin certeza suficiente devuelve pictogram null y confidence "ninguna"', async () => {
  const service = buildService();
  service.extractConceptsAsync = async () => ({ concepts: [['algo-que-no-existe']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({});

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'texto raro' }] });

  assert.equal(result.results[0].pictogram, null);
  assert.equal(result.results[0].confidence, 'ninguna');
});

test('pictogramizeAsync: minConfidence "alta" descarta los "media"', async () => {
  const service = buildService();
  service.extractConceptsAsync = async () => ({ concepts: [['comer']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({ comer: [{ id: '1', name: 'comer con la boca cerrada', imageUrl: 'x', source: 'MULBERRY', tags: [] }] });

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'comer' }], minConfidence: 'alta' });

  assert.equal(result.results[0].pictogram, null, 'el unico candidato es "media", con minConfidence alta debe descartarse');
});

test('pictogramizeAsync: acepta phrases como array de strings (usa el indice como id)', async () => {
  const service = buildService();
  service.extractConceptsAsync = async (texts) => ({ concepts: texts.map((t) => [t]), usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({});

  const result = await service.pictogramizeAsync({ phrases: ['hola', 'chau'] });

  assert.deepEqual(result.results.map((r) => r.id), ['0', '1']);
});

test('pictogramizeAsync: array vacio de phrases devuelve resultados vacios sin llamar a nada', async () => {
  const service = buildService();
  let called = false;
  service.extractConceptsAsync = async () => { called = true; return { concepts: [], usedGroq: false, degraded: false, model: null }; };

  const result = await service.pictogramizeAsync({ phrases: [] });

  assert.deepEqual(result.results, []);
  assert.equal(called, false);
});

// --- Vocabulario personal (Sesion 2) ---
// Un texto de paso que el usuario ya resolvio a mano no vuelve a pasar por
// Groq ni por el catalogo: se sirve directo del vocabulario, con
// matchedOn:'vocabulario-personal'.

test('personal-vocabulary: getAsync sin userId no pega a la BD y devuelve {}', async () => {
  const store = new PersonalVocabularyStore();
  store.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync = async () => { throw new Error('no deberia llamarse'); };
  assert.deepEqual(await store.getAsync(null), {});
});

test('personal-vocabulary: rememberAsync crea la config si no existia', async () => {
  const store = new PersonalVocabularyStore();
  let created = null;
  store.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync = async () => null;
  store.ConfiguracionUsuarioService.createAsync = async (entity) => { created = entity; return 1; };

  await store.rememberAsync(7, 'Lavarse los dientes', 'picto-1');

  assert.equal(created.id_usuario, 7);
  assert.deepEqual(JSON.parse(created.valor), { 'lavarse los dientes': 'picto-1' });
});

test('personal-vocabulary: rememberAsync mergea con el vocabulario existente en vez de pisarlo', async () => {
  const store = new PersonalVocabularyStore();
  let updated = null;
  store.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync = async () => (
    { id: 99, id_usuario: 7, valor: JSON.stringify({ ducharse: 'picto-0' }) }
  );
  store.ConfiguracionUsuarioService.updateAsync = async (entity) => { updated = entity; return 1; };

  await store.rememberAsync(7, 'Lavarse los dientes', 'picto-1');

  assert.equal(updated.id, 99);
  assert.deepEqual(JSON.parse(updated.valor), { ducharse: 'picto-0', 'lavarse los dientes': 'picto-1' });
});

test('pictogramizeAsync: un texto en el vocabulario personal no llama a Groq ni al catalogo', async () => {
  const service = buildService();
  let groqCalls = 0;
  let searchCalls = 0;
  service.extractConceptsAsync = async () => { groqCalls += 1; return { concepts: [[]], usedGroq: true, degraded: false, model: 'x' }; };
  service.PictogramaService.searchAsync = async () => { searchCalls += 1; return { items: [], total: 0 }; };
  service.PictogramaService.getByIdAsync = async (id) => ({ id, name: 'dientes', imageUrl: 'x', source: 'MULBERRY' });
  service.PersonalVocabularyStore.getAsync = async () => ({ 'lavarse los dientes': 'picto-1' });

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'Lavarse los dientes' }], userId: 7 });

  assert.equal(groqCalls, 0);
  assert.equal(searchCalls, 0);
  assert.equal(result.results[0].confidence, 'alta');
  assert.equal(result.results[0].matchedOn, 'vocabulario-personal');
  assert.equal(result.results[0].pictogram.id, 'picto-1');
});

test('pictogramizeAsync: mezcla de un texto en vocabulario y otro nuevo resuelve cada uno por su via', async () => {
  const service = buildService();
  service.extractConceptsAsync = async (texts) => ({ concepts: texts.map(() => ['ducharse']), usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({ ducharse: [{ id: 'auto-1', name: 'ducharse', imageUrl: 'x', source: 'MULBERRY', tags: [] }] });
  service.PictogramaService.getByIdAsync = async (id) => ({ id, name: 'dientes', imageUrl: 'x', source: 'MULBERRY' });
  service.PersonalVocabularyStore.getAsync = async () => ({ 'lavarse los dientes': 'picto-1' });

  const result = await service.pictogramizeAsync({
    phrases: [{ id: '1', text: 'Lavarse los dientes' }, { id: '2', text: 'Ducharse' }],
    userId: 7,
  });

  assert.equal(result.results[0].matchedOn, 'vocabulario-personal');
  assert.equal(result.results[0].pictogram.id, 'picto-1');
  assert.equal(result.results[1].pictogram.id, 'auto-1');
});

test('pictogramizeAsync: si el pictograma del vocabulario ya no existe, resuelve normal en vez de romper', async () => {
  const service = buildService();
  service.extractConceptsAsync = async () => ({ concepts: [['ducharse']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({ ducharse: [{ id: 'auto-1', name: 'ducharse', imageUrl: 'x', source: 'MULBERRY', tags: [] }] });
  service.PictogramaService.getByIdAsync = async () => null;
  service.PersonalVocabularyStore.getAsync = async () => ({ ducharse: 'picto-borrado' });

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'Ducharse' }], userId: 7 });

  assert.equal(result.results[0].pictogram.id, 'auto-1');
});

test('pictogramizeAsync: prioriza el pictograma frecuente del perfil de memoria sobre uno recien encontrado (Sesion 25)', async () => {
  const service = buildService();
  service.extractConceptsAsync = async () => ({ concepts: [['agua']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({
    agua: [
      { id: 'nuevo-para-el', name: 'agua', imageUrl: 'x', source: 'MULBERRY', tags: [] },
      { id: 'ya-lo-reconoce', name: 'agua', imageUrl: 'x', source: 'MULBERRY', tags: [] },
    ],
  });
  service.MemoryProfileService.getFrequentPictogramIdsAsync = async (userId) => {
    assert.equal(userId, 7);
    return ['ya-lo-reconoce'];
  };

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'agua' }], userId: 7 });

  assert.equal(result.results[0].pictogram.id, 'ya-lo-reconoce');
});

test('pictogramizeAsync: sin userId, no pide el perfil de memoria (no rompe, no gasta la cache)', async () => {
  const service = buildService();
  service.extractConceptsAsync = async () => ({ concepts: [['agua']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({ agua: [{ id: '1', name: 'agua', imageUrl: 'x', source: 'MULBERRY', tags: [] }] });
  let called = false;
  service.MemoryProfileService.getFrequentPictogramIdsAsync = async () => { called = true; return []; };

  await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'agua' }] });

  assert.equal(called, false);
});

// --- Preferencia de estilo visual (Sesion 2) ---

test('style-preference: sin elecciones previas devuelve null', async () => {
  const store = new StylePreferenceStore();
  store.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync = async () => null;
  assert.equal(await store.getPreferredStyleAsync(7), null);
});

test('style-preference: devuelve el estilo mas elegido, no el ultimo', async () => {
  const store = new StylePreferenceStore();
  store.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync = async () => (
    { valor: JSON.stringify({ ilustracion: 2, realista: 5 }) }
  );
  assert.equal(await store.getPreferredStyleAsync(7), 'realista');
});

test('style-preference: registerChoiceAsync acumula en vez de pisar', async () => {
  const store = new StylePreferenceStore();
  let saved = null;
  store.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync = async () => (
    { id: 5, id_usuario: 7, valor: JSON.stringify({ realista: 1 }) }
  );
  store.ConfiguracionUsuarioService.updateAsync = async (entity) => { saved = entity; return 1; };

  await store.registerChoiceAsync(7, 'realista');

  assert.deepEqual(JSON.parse(saved.valor), { realista: 2 });
});

test('pictogramizeAsync: usa el estilo preferido del usuario para desempatar candidatos "alta"', async () => {
  const service = buildService();
  service.extractConceptsAsync = async () => ({ concepts: [['agua']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({
    agua: [
      { id: 'ilustracion', name: 'agua', imageUrl: 'x', source: 'MULBERRY', tags: [], visualStyle: 'ilustracion' },
      { id: 'realista', name: 'agua', imageUrl: 'x', source: 'GLOBAL_SYMBOLS', tags: [], visualStyle: 'realista' },
    ],
  });
  service.StylePreferenceStore.getPreferredStyleAsync = async () => 'realista';

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'agua' }] });

  assert.equal(result.results[0].pictogram.id, 'realista');
});

// --- Memo global en BD (arreglo del traductor: no gastar Groq de nuevo) ---
// Un texto que YA se le pidio a Groq alguna vez (de cualquier usuario, en
// cualquier pantalla) no vuelve a gastar cuota: se sirve del memo.

test('pictogramizeAsync: un texto ya memoizado no llama a Groq', async () => {
  const service = buildService();
  let groqCalls = 0;
  service.extractConceptsAsync = async () => { groqCalls += 1; return { concepts: [['no-deberia-usarse']], usedGroq: true, degraded: false, model: 'x' }; };
  service.PictogramizationMemoRepository.getManyAsync = async () => new Map([['ducharse', ['ducharse', 'ducha']]]);
  service.PictogramaService.searchAsync = buildCatalog({ ducharse: [{ id: 'auto-1', name: 'ducharse', imageUrl: 'x', source: 'MULBERRY', tags: [] }] });

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'Ducharse' }] });

  assert.equal(groqCalls, 0);
  assert.equal(result.results[0].pictogram.id, 'auto-1');
});

test('pictogramizeAsync: solo se le pide a Groq lo que falta en el memo, y se guarda lo nuevo', async () => {
  const service = buildService();
  let groqTexts = null;
  let upserted = null;
  service.extractConceptsAsync = async (texts) => { groqTexts = texts; return { concepts: texts.map(() => ['manos']), usedGroq: true, degraded: false, model: 'x' }; };
  service.PictogramizationMemoRepository.getManyAsync = async () => new Map([['ducharse', ['ducharse']]]);
  service.PictogramizationMemoRepository.upsertManyAsync = async (entries) => { upserted = entries; };
  service.PictogramaService.searchAsync = buildCatalog({});

  await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'Ducharse' }, { id: '2', text: 'Lavarse las manos' }] });

  assert.deepEqual(groqTexts, ['Lavarse las manos'], 'solo pide a Groq el texto que no estaba en el memo');
  assert.equal(upserted.length, 1);
  assert.equal(upserted[0].textoNormalizado, 'lavarse las manos');
});

test('pictogramizeAsync: preferredStyleOverride gana por encima del estilo aprendido (Sesion 10, alto contraste)', async () => {
  const service = buildService();
  service.extractConceptsAsync = async () => ({ concepts: [['agua']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({
    agua: [
      { id: 'ilustracion', name: 'agua', imageUrl: 'x', source: 'MULBERRY', tags: [], visualStyle: 'ilustracion' },
      { id: 'alto-contraste', name: 'agua', imageUrl: 'x', source: 'GLOBAL_SYMBOLS', tags: [], visualStyle: 'alto-contraste' },
    ],
  });
  // el usuario aprendio "ilustracion" por uso, pero pide alto contraste
  service.StylePreferenceStore.getPreferredStyleAsync = async () => 'ilustracion';

  const result = await service.pictogramizeAsync({
    phrases: [{ id: '1', text: 'agua' }],
    preferredStyleOverride: 'alto-contraste',
  });

  assert.equal(result.results[0].pictogram.id, 'alto-contraste');
});

test('pictogramizeAsync: un resultado degradado (heuristico) no se guarda en el memo', async () => {
  const service = buildService();
  let upsertCalled = false;
  service.extractConceptsAsync = async () => ({ concepts: [['ducharse']], usedGroq: true, degraded: true, model: 'x' });
  service.PictogramizationMemoRepository.upsertManyAsync = async () => { upsertCalled = true; };
  service.PictogramaService.searchAsync = buildCatalog({});

  await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'Ducharse' }] });

  assert.equal(upsertCalled, false, 'no hay que envenenar el memo con un resultado degradado');
});
