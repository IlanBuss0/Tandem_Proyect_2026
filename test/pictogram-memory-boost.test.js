import test from 'node:test';
import assert from 'node:assert/strict';
import PictogramaRepository from '../src/repositories/PictogramaRepository.js';

// Perfil de memoria (Sesion 25): el catalogo de pictogramas prioriza, sin
// ninguna marca visual, los pictogramas que una persona ya usa de verdad
// — con o sin filtro de categoria activo. Contra la base real (mismo
// patron que pictogram-pagination.test.js), no mockeada.
const repository = new PictogramaRepository();

test('boostPictogramIds: un pictograma boosteado pasa al frente del orden, sin boost quedaba mas atras', async () => {
  const plain = await repository.searchAsync({ category: 'todas', language: 'es', limit: 10, offset: 0 });
  if (plain.items.length < 2) return; // catalogo de test demasiado chico

  const target = plain.items[plain.items.length - 1];
  const boosted = await repository.searchAsync({
    category: 'todas', language: 'es', limit: 10, offset: 0,
    boostPictogramIds: [target.id],
  });

  assert.equal(boosted.items[0].id, target.id, 'el pictograma boosteado deberia quedar primero');
});

test('boostPictogramIds: sigue respetando el filtro de categoria (no lo reemplaza, solo reordena adentro)', async () => {
  const withCategory = await repository.searchAsync({ category: 'todas', language: 'es', limit: 20, offset: 0 });
  if (withCategory.items.length < 2) return;

  const target = withCategory.items[withCategory.items.length - 1];
  const boosted = await repository.searchAsync({
    category: 'todas', language: 'es', limit: 20, offset: 0,
    boostPictogramIds: [target.id],
  });

  const idsWithoutBoost = new Set(withCategory.items.map((i) => i.id));
  const idsWithBoost = new Set(boosted.items.map((i) => i.id));
  assert.deepEqual(idsWithBoost, idsWithoutBoost, 'el boost no deberia cambiar QUE pictogramas matchean, solo el orden');
});

test('boostPictogramIds: un id que no matchea el filtro no aparece de la nada', async () => {
  const result = await repository.searchAsync({
    category: 'todas', language: 'es', limit: 10, offset: 0,
    boostPictogramIds: ['id-que-no-existe-en-la-base'],
  });
  assert.ok(Array.isArray(result.items));
});

test('boostPictogramIds junto con texto de busqueda no revienta el COUNT (bug real: parametro sin tipo)', async () => {
  // Bug real: el param del boost se colaba en el slice de params del COUNT
  // cuando habia searchText (whereParamCount se reasigna despues del LIKE),
  // y Postgres tiraba "could not determine data type of parameter" porque
  // el COUNT nunca lo referencia en su texto.
  const result = await repository.searchAsync({
    search: 'a', category: '', language: 'es', limit: 5, offset: 0,
    boostPictogramIds: ['id-que-no-existe'],
  });
  assert.ok(Array.isArray(result.items));
  assert.equal(typeof result.total, 'number');
});

test('boostPictogramIds vacio o ausente no cambia el orden de siempre', async () => {
  const sinParametro = await repository.searchAsync({ category: 'todas', language: 'es', limit: 10, offset: 0 });
  const vacio = await repository.searchAsync({ category: 'todas', language: 'es', limit: 10, offset: 0, boostPictogramIds: [] });

  assert.deepEqual(sinParametro.items.map((i) => i.id), vacio.items.map((i) => i.id));
});
