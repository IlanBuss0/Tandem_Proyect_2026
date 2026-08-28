import BD from '../src/db/BD.js';

const expectedTables = [
  'actividad_revisiones',
  'actividad_revision_habilidades',
  'actividad_revision_items',
];

const expectedConstraints = [
  'actividad_revisiones_origen_check',
  'actividad_revisiones_proposito_check',
  'actividad_revisiones_dificultad_check',
];

const expectedIndexes = [
  'idx_actividad_revisiones_integrada_revision',
  'idx_actividad_revisiones_personalizada_revision',
  'idx_actividad_revision_habilidades_principal',
  'idx_actividad_revision_habilidades_unique',
];

try {
  const tables = await BD.query(
    `
      SELECT table_name, CAST(COUNT(1) AS INTEGER) AS columns
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = ANY($2)
      GROUP BY table_name
      ORDER BY table_name
    `,
    ['public', expectedTables],
  );

  const constraints = await BD.query(
    `
      SELECT conname
      FROM pg_constraint
      WHERE conname = ANY($1)
      ORDER BY conname
    `,
    [expectedConstraints],
  );

  const indexes = await BD.query(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = $1
        AND indexname = ANY($2)
      ORDER BY indexname
    `,
    ['public', expectedIndexes],
  );

  const existingTables = new Set(tables.map((table) => table.table_name));
  const existingConstraints = new Set(constraints.map((constraint) => constraint.conname));
  const existingIndexes = new Set(indexes.map((index) => index.indexname));

  const missingTables = expectedTables.filter((table) => !existingTables.has(table));
  const missingConstraints = expectedConstraints.filter((constraint) => !existingConstraints.has(constraint));
  const missingIndexes = expectedIndexes.filter((index) => !existingIndexes.has(index));

  if (missingTables.length || missingConstraints.length || missingIndexes.length) {
    console.error('Validacion de revisiones incompleta.', {
      missingTables,
      missingConstraints,
      missingIndexes,
      tables,
    });
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, tables, constraints, indexes }, null, 2));
  await BD.close?.();
  process.exit(0);
} catch (error) {
  console.error('No se pudieron validar las revisiones de actividades:', error.message);
  await BD.close?.();
  process.exit(1);
}
