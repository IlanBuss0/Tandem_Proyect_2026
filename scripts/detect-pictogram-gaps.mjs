import BD from '../src/db/BD.js';

// Migracion de pictogramas a librerias con licencia comercial (Fase 6).
// Mide, contra lo que YA esta importado en la base local, cuantos conceptos
// nucleo de CAA en espanol tienen al menos un pictograma con
// uso_comercial_permitido = true. Sirve para decidir con datos reales -no
// con la sensacion- si hace falta generar pictogramas propios con IA
// (AiPictogramService, ya existe) para tapar los huecos.
//
// Uso: npm run pictograms:gaps
const CORE_CONCEPTS = [
  'comer', 'beber', 'agua', 'ir al bano', 'bano', 'lavarse las manos',
  'dolor', 'ayuda', 'si', 'no', 'contento', 'triste', 'enfadado', 'miedo',
  'cansado', 'familia', 'mama', 'papa', 'casa', 'escuela', 'dormir',
  'vestirse', 'jugar', 'leer', 'escribir', 'esperar', 'salir', 'medico',
  'supermercado', 'autobus', 'gracias', 'por favor', 'hola', 'chau',
  'quiero', 'necesito', 'siento', 'telefono', 'computadora', 'television',
  'comida', 'fruta', 'verdura', 'ropa', 'zapatos', 'cama', 'silla', 'mesa',
  'cocina', 'jardin', 'calle', 'tienda', 'dinero', 'trabajar',
  // Vocabulario rioplatense: no suele existir en librerias anglo-primero.
  'colectivo', 'remera', 'pileta', 'bondi', 'zapatillas', 'campera',
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function countMatches(concept) {
  const normalized = normalizeText(concept);
  const row = await BD.queryOne(
    `
      SELECT COUNT(*)::int AS total
      FROM pictogramas
      WHERE uso_comercial_permitido = true
        AND (
          LOWER(titulo) LIKE $1
          OR EXISTS (SELECT 1 FROM unnest(etiquetas) AS etiqueta WHERE LOWER(etiqueta) LIKE $1)
        )
    `,
    [`%${normalized}%`],
  );
  return row?.total || 0;
}

async function main() {
  const results = [];
  for (const concept of CORE_CONCEPTS) {
    const total = await countMatches(concept);
    results.push({ concept, total });
  }

  const covered = results.filter((r) => r.total > 0);
  const gaps = results.filter((r) => r.total === 0);

  console.log('--- Cobertura de vocabulario nucleo (solo pictogramas con uso comercial permitido) ---');
  console.log(`Cubiertos: ${covered.length}/${results.length}`);
  console.log('');
  console.log('Huecos (0 resultados) — candidatos a generar con IA (AiPictogramService):');
  gaps.forEach((r) => console.log(`  - ${r.concept}`));
  console.log('');
  console.log('Cobertura flaca (1-2 resultados, poca variedad visual):');
  results.filter((r) => r.total > 0 && r.total <= 2).forEach((r) => console.log(`  - ${r.concept} (${r.total})`));

  console.log('');
  console.log(JSON.stringify({ coveredCount: covered.length, total: results.length, gaps: gaps.map((r) => r.concept) }, null, 2));

  process.exit(0);
}

main().catch((error) => {
  console.error('Error detectando huecos de vocabulario:', error);
  process.exit(1);
});
