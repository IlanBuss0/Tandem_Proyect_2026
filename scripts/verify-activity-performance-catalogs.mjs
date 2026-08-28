import BD from '../src/db/BD.js';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_DOMAINS,
  ACTIVITY_SKILLS,
} from '../src/modules/activity-performance/catalogs.js';

const expectedCounts = {
  dominios_actividad: ACTIVITY_DOMAINS.length,
  categorias_actividad: ACTIVITY_CATEGORIES.length,
  actividad_habilidades: ACTIVITY_SKILLS.length,
};

try {
  const counts = await BD.query(`
    SELECT 'dominios_actividad' AS table_name, CAST(COUNT(1) AS INTEGER) AS rows FROM dominios_actividad
    UNION ALL
    SELECT 'categorias_actividad', CAST(COUNT(1) AS INTEGER) FROM categorias_actividad
    UNION ALL
    SELECT 'actividad_habilidades', CAST(COUNT(1) AS INTEGER) FROM actividad_habilidades
    UNION ALL
    SELECT 'actividad_subhabilidades', CAST(COUNT(1) AS INTEGER) FROM actividad_subhabilidades
    ORDER BY table_name
  `);

  const missingDomains = await BD.query(
    `
      SELECT expected.codigo
      FROM UNNEST($1::TEXT[]) AS expected(codigo)
      LEFT JOIN dominios_actividad actual ON actual.codigo = expected.codigo
      WHERE actual.id IS NULL
    `,
    [ACTIVITY_DOMAINS.map((domain) => domain.codigo)],
  );

  const missingCategories = await BD.query(
    `
      SELECT expected.codigo
      FROM UNNEST($1::TEXT[]) AS expected(codigo)
      LEFT JOIN categorias_actividad actual ON actual.codigo = expected.codigo
      WHERE actual.id IS NULL
    `,
    [ACTIVITY_CATEGORIES.map((category) => category.codigo)],
  );

  const missingSkills = await BD.query(
    `
      SELECT expected.codigo
      FROM UNNEST($1::TEXT[]) AS expected(codigo)
      LEFT JOIN actividad_habilidades actual ON actual.codigo = expected.codigo
      WHERE actual.id IS NULL
    `,
    [ACTIVITY_SKILLS.map((skill) => skill.codigo)],
  );

  const failedCount = counts.find((row) => {
    const expected = expectedCounts[row.table_name];
    return expected != null && row.rows < expected;
  });

  if (failedCount || missingDomains.length || missingCategories.length || missingSkills.length) {
    console.error('Validacion de catalogos incompleta.', {
      counts,
      missingDomains,
      missingCategories,
      missingSkills,
    });
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, counts }, null, 2));
  await BD.close?.();
  process.exit(0);
} catch (error) {
  console.error('No se pudieron validar los catalogos de desempeno de actividades:', error.message);
  await BD.close?.();
  process.exit(1);
}
