import test from 'node:test';
import assert from 'node:assert/strict';
import PictogramaRepository from '../src/repositories/PictogramaRepository.js';

// Paginacion real de /api/pictograms (pedido: "pagina 1 de X" con botones
// para avanzar). Dos bugs reales que aparecieron armando esto, y que estos
// tests dejan cubiertos:
//
//   1. El COUNT(*) para el total se armaba con TODOS los params acumulados,
//      incluidos los que solo usa el ORDER BY (coincidencia exacta/prefijo/
//      palabra completa) cuando hay texto de busqueda. Postgres rechaza el
//      bind si se le pasan mas parametros de los que la consulta realmente
//      referencia ("bind message supplies N, but prepared statement
//      requires M") — rompia CUALQUIER busqueda con texto en cuanto se pedia
//      `page`.
//   2. Sin un desempate unico (id) al final del ORDER BY, dos pictogramas
//      empatados en popularidad/titulo (el caso mas comun: casi todos estan
//      en 0) podian aparecer en cualquier orden entre dos queries distintas,
//      asi que la pagina 2 repetia filas que ya habian salido en la pagina 1.

const repository = new PictogramaRepository();

test('searchAsync con texto de busqueda no revienta al pedir el total (bug del COUNT con params de mas)', async () => {
  const result = await repository.searchAsync({
    search: 'a',
    category: '',
    language: 'es',
    limit: 5,
    offset: 0,
  });

  assert.ok(Array.isArray(result.items));
  assert.equal(typeof result.total, 'number');
  assert.ok(result.total >= result.items.length);
});

test('la paginacion no repite pictogramas entre la pagina 1 y la pagina 2', async () => {
  const limit = 10;
  const page1 = await repository.searchAsync({ category: 'todas', language: 'es', limit, offset: 0 });
  const page2 = await repository.searchAsync({ category: 'todas', language: 'es', limit, offset: limit });

  if (page1.total <= limit) return; // catalogo demasiado chico para probar una segunda pagina

  const idsPage1 = new Set(page1.items.map((item) => item.id));
  const overlap = page2.items.filter((item) => idsPage1.has(item.id));

  assert.deepEqual(overlap, [], 'ningun pictograma de la pagina 1 deberia repetirse en la pagina 2');
});

test('total y totalPages calculados por el servicio son consistentes con items.length', async () => {
  const PictogramaService = (await import('../src/services/PictogramaService.js')).default;
  const service = new PictogramaService();
  service.ensureSchemaAsync = async () => {};

  const result = await service.searchAsync({ category: 'todas', language: 'es', limit: 10, page: 1 });

  assert.ok(result.items.length <= 10);
  assert.equal(result.totalPages, Math.max(1, Math.ceil(result.total / result.pageSize)));
});
