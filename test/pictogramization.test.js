import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreConceptMatch, pickBestMatch } from '../src/modules/pictograms/concept-matching.js';
import { extractConceptsHeuristic } from '../src/modules/pictograms/concept-extraction.js';
import PictogramizationService from '../src/services/PictogramizationService.js';
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

test('pictogramizeAsync: una sola llamada de extraccion para todas las frases del lote', async () => {
  const service = new PictogramizationService();
  let calls = 0;
  service.extractConceptsAsync = async (texts) => {
    calls += 1;
    return { concepts: texts.map((t) => [t.toLowerCase()]), usedGroq: true, degraded: false, model: 'llama-3.3-70b-versatile' };
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
  const service = new PictogramizationService();
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
    const service = new PictogramizationService();
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
  const service = new PictogramizationService();
  service.extractConceptsAsync = async () => ({ concepts: [['algo-que-no-existe']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({});

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'texto raro' }] });

  assert.equal(result.results[0].pictogram, null);
  assert.equal(result.results[0].confidence, 'ninguna');
});

test('pictogramizeAsync: minConfidence "alta" descarta los "media"', async () => {
  const service = new PictogramizationService();
  service.extractConceptsAsync = async () => ({ concepts: [['comer']], usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({ comer: [{ id: '1', name: 'comer con la boca cerrada', imageUrl: 'x', source: 'MULBERRY', tags: [] }] });

  const result = await service.pictogramizeAsync({ phrases: [{ id: '1', text: 'comer' }], minConfidence: 'alta' });

  assert.equal(result.results[0].pictogram, null, 'el unico candidato es "media", con minConfidence alta debe descartarse');
});

test('pictogramizeAsync: acepta phrases como array de strings (usa el indice como id)', async () => {
  const service = new PictogramizationService();
  service.extractConceptsAsync = async (texts) => ({ concepts: texts.map((t) => [t]), usedGroq: true, degraded: false, model: 'x' });
  service.PictogramaService.searchAsync = buildCatalog({});

  const result = await service.pictogramizeAsync({ phrases: ['hola', 'chau'] });

  assert.deepEqual(result.results.map((r) => r.id), ['0', '1']);
});

test('pictogramizeAsync: array vacio de phrases devuelve resultados vacios sin llamar a nada', async () => {
  const service = new PictogramizationService();
  let called = false;
  service.extractConceptsAsync = async () => { called = true; return { concepts: [], usedGroq: false, degraded: false, model: null }; };

  const result = await service.pictogramizeAsync({ phrases: [] });

  assert.deepEqual(result.results, []);
  assert.equal(called, false);
});
