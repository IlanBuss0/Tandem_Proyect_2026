import BD from '../src/db/BD.js';
import PictogramaRepository from '../src/repositories/PictogramaRepository.js';
import { resolveVisualStyle } from '../src/modules/pictograms/visual-styles.js';

// Rellena estilo_visual en los pictogramas que se importaron ANTES de que
// existiera la columna. Las importaciones nuevas ya lo guardan solas (ver
// toDbValues en PictogramaRepository).
//
// Es idempotente: solo toca las filas con estilo_visual NULL, asi que se puede
// correr las veces que sea. Con --force recalcula TODAS (util si se cambia el
// mapeo de estilos en visual-styles.js y hay que reaplicarlo al catalogo).
//
// Uso:
//   node scripts/backfill-pictogram-styles.mjs
//   node scripts/backfill-pictogram-styles.mjs --force

const force = process.argv.includes('--force');

async function main() {
  await new PictogramaRepository().ensureSchemaAsync();

  const rows = await BD.query(
    `SELECT id, origen, metadata->>'symbolsetSlug' AS "symbolsetSlug"
       FROM pictogramas
      ${force ? '' : 'WHERE estilo_visual IS NULL'}`,
  );

  if (rows.length === 0) {
    console.log('No hay pictogramas sin estilo visual. Nada que hacer.');
    process.exit(0);
  }

  console.log(`A procesar: ${rows.length} pictogramas${force ? ' (--force: se recalculan todos)' : ''}.`);

  // Se agrupan por estilo para hacer un UPDATE por estilo (7 queries) en vez
  // de uno por fila (6.000+).
  const idsByStyle = new Map();
  for (const row of rows) {
    const style = resolveVisualStyle({ source: row.origen, symbolsetSlug: row.symbolsetSlug });
    if (!idsByStyle.has(style)) idsByStyle.set(style, []);
    idsByStyle.get(style).push(row.id);
  }

  let updated = 0;
  for (const [style, ids] of idsByStyle) {
    const affected = await BD.execute(
      `UPDATE pictogramas SET estilo_visual = $1 WHERE id = ANY($2::bigint[])`,
      [style, ids],
    );
    console.log(`  ${style}: ${affected}`);
    updated += affected;
  }

  const pendientes = await BD.queryOne(
    `SELECT COUNT(*)::int AS total FROM pictogramas WHERE estilo_visual IS NULL`,
  );

  console.log('--- Resumen ---');
  console.log(`Actualizados:            ${updated}`);
  console.log(`Sin estilo todavia:      ${pendientes.total}`);
  process.exit(pendientes.total === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Error rellenando estilos visuales:', error);
  process.exit(1);
});
