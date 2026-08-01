import test from 'node:test';
import assert from 'node:assert/strict';
import BD from '../src/db/BD.js';
import PictogramaRepository from '../src/repositories/PictogramaRepository.js';
import PictogramaService from '../src/services/PictogramaService.js';
import {
  VISUAL_STYLES,
  VISUAL_STYLE_LABELS,
  resolveVisualStyle,
} from '../src/modules/pictograms/visual-styles.js';

// Filtros del catalogo (categoria + estilo visual + coleccion).
//
// Contexto: el catalogo tiene 42 pictogramas que dicen "triste" y 36 que dicen
// "agua". No son duplicados basura: son el mismo concepto en estilos graficos
// distintos, y en CAA eso es una funcion (hay gente que lee mejor un dibujo
// realista, otra un trazo simple, y con baja vision hace falta alto
// contraste). El filtro es lo que convierte ese "ruido" en una eleccion.

const repository = new PictogramaRepository();

test('resolveVisualStyle nunca devuelve vacio, ni con datos desconocidos', () => {
  assert.equal(resolveVisualStyle({ source: 'MULBERRY' }), VISUAL_STYLES.ILUSTRACION);
  assert.equal(resolveVisualStyle({ source: 'OPENMOJI' }), VISUAL_STYLES.EMOJI);
  assert.equal(resolveVisualStyle({ source: 'TANDEM_AI' }), VISUAL_STYLES.PROPIO);
  // Proveedor desconocido, coleccion desconocida y objeto vacio: siempre cae
  // en un estilo valido, nunca null (la UI filtra por este campo).
  assert.equal(resolveVisualStyle({ source: 'PROVEEDOR_NUEVO' }), VISUAL_STYLES.ILUSTRACION);
  assert.equal(resolveVisualStyle({ source: 'GLOBAL_SYMBOLS', symbolsetSlug: 'algo-que-no-existe' }), VISUAL_STYLES.ILUSTRACION);
  assert.equal(resolveVisualStyle({}), VISUAL_STYLES.ILUSTRACION);
  assert.equal(resolveVisualStyle(), VISUAL_STYLES.ILUSTRACION);
});

test('la coleccion pesa mas que el proveedor (Global Symbols mezcla estilos)', () => {
  // El mismo origen GLOBAL_SYMBOLS trae colecciones con estilos opuestos.
  assert.equal(
    resolveVisualStyle({ source: 'GLOBAL_SYMBOLS', symbolsetSlug: 'picom-high-contrast-symbols' }),
    VISUAL_STYLES.ALTO_CONTRASTE,
  );
  assert.equal(
    resolveVisualStyle({ source: 'GLOBAL_SYMBOLS', symbolsetSlug: 'ai-realistic-symbols-a-picom-collection' }),
    VISUAL_STYLES.REALISTA,
  );
  assert.equal(
    resolveVisualStyle({ source: 'GLOBAL_SYMBOLS', symbolsetSlug: 'picom-ai-cute-symbols' }),
    VISUAL_STYLES.DIBUJO,
  );
});

test('todo estilo declarado tiene su etiqueta para la UI', () => {
  for (const style of Object.values(VISUAL_STYLES)) {
    assert.ok(VISUAL_STYLE_LABELS[style], `falta la etiqueta de "${style}"`);
  }
});

test('DB: no queda ningun pictograma sin estilo visual', async () => {
  const row = await BD.queryOne(`SELECT COUNT(*)::int AS total FROM pictogramas WHERE estilo_visual IS NULL`);
  assert.equal(
    row.total,
    0,
    'hay pictogramas sin estilo: no aparecerian en ningun filtro. Correr scripts/backfill-pictogram-styles.mjs',
  );
});

test('DB: todos los estilos guardados son valores conocidos', async () => {
  const rows = await BD.query(`SELECT DISTINCT estilo_visual FROM pictogramas WHERE estilo_visual IS NOT NULL`);
  const validos = new Set(Object.values(VISUAL_STYLES));
  for (const row of rows) {
    assert.ok(validos.has(row.estilo_visual), `estilo desconocido en la base: "${row.estilo_visual}"`);
  }
});

test('filtrar por estilo devuelve menos resultados que sin filtrar, y la suma cierra', async () => {
  const sinFiltro = await repository.searchAsync({ search: 'triste', language: 'es', limit: 1, offset: 0 });
  if (sinFiltro.total === 0) return; // catalogo vacio

  const service = new PictogramaService();
  service.ensureSchemaAsync = async () => {};
  const { styles } = await service.getFilterOptionsAsync('es');

  let suma = 0;
  for (const style of styles) {
    const filtrado = await repository.searchAsync({
      search: 'triste', style: style.id, language: 'es', limit: 1, offset: 0,
    });
    assert.ok(
      filtrado.total <= sinFiltro.total,
      `filtrar por "${style.id}" no puede dar mas resultados que sin filtro`,
    );
    suma += filtrado.total;
  }

  // Cada pictograma tiene exactamente UN estilo, asi que las partes suman el
  // total. Si no cerrara, habria filas con un estilo fuera de la lista.
  assert.equal(suma, sinFiltro.total, 'la suma por estilo deberia dar el total sin filtrar');
});

test('un estilo multiseleccion suma los resultados de cada estilo por separado', async () => {
  const emoji = await repository.searchAsync({ style: 'emoji', language: 'es', limit: 1, offset: 0 });
  const realista = await repository.searchAsync({ style: 'realista', language: 'es', limit: 1, offset: 0 });
  const ambos = await repository.searchAsync({ style: 'emoji,realista', language: 'es', limit: 1, offset: 0 });

  assert.equal(ambos.total, emoji.total + realista.total);
});

test('filtrar por una coleccion devuelve solo pictogramas de esa coleccion', async () => {
  const { items, total } = await repository.searchAsync({
    collection: 'mulberry', language: 'es', limit: 20, offset: 0,
  });
  if (total === 0) return;

  for (const item of items) {
    assert.equal(item.collection, 'mulberry', `${item.id} no es de mulberry`);
  }
});

test('un filtro inexistente da 0 resultados, no todos', async () => {
  const { total } = await repository.searchAsync({
    style: 'estilo-que-no-existe', language: 'es', limit: 1, offset: 0,
  });
  assert.equal(total, 0, 'un estilo desconocido no debe ignorarse silenciosamente');
});

test('"todas" en un filtro se trata como sin filtro (no como un valor literal)', async () => {
  const sinFiltro = await repository.searchAsync({ language: 'es', limit: 1, offset: 0 });
  const conTodas = await repository.searchAsync({ style: 'todas', collection: 'todas', language: 'es', limit: 1, offset: 0 });

  assert.equal(conTodas.total, sinFiltro.total);
});

test('las opciones de filtro traen los 3 ejes con conteos positivos', async () => {
  const service = new PictogramaService();
  service.ensureSchemaAsync = async () => {};
  const { categories, styles, collections } = await service.getFilterOptionsAsync('es');

  for (const [name, list] of [['categories', categories], ['styles', styles], ['collections', collections]]) {
    assert.ok(Array.isArray(list) && list.length > 0, `${name} no deberia venir vacio`);
    for (const option of list) {
      assert.ok(option.id, `${name}: hay una opcion sin id`);
      assert.ok(option.name, `${name}: la opcion "${option.id}" no tiene nombre para la UI`);
      assert.ok(option.total > 0, `${name}: "${option.id}" tiene conteo ${option.total}; no deberia ofrecerse`);
    }
  }
});

test('las opciones de filtro nunca ofrecen algo que despues da 0 resultados', async () => {
  const service = new PictogramaService();
  service.ensureSchemaAsync = async () => {};
  const { styles, collections } = await service.getFilterOptionsAsync('es');

  // Se prueba con los 3 primeros de cada eje para no hacer 30 queries.
  for (const style of styles.slice(0, 3)) {
    const { total } = await repository.searchAsync({ style: style.id, language: 'es', limit: 1, offset: 0 });
    assert.ok(total > 0, `el filtro de estilo "${style.id}" se ofrece pero no devuelve nada`);
  }
  for (const collection of collections.slice(0, 3)) {
    const { total } = await repository.searchAsync({ collection: collection.id, language: 'es', limit: 1, offset: 0 });
    assert.ok(total > 0, `el filtro de coleccion "${collection.id}" se ofrece pero no devuelve nada`);
  }
});
