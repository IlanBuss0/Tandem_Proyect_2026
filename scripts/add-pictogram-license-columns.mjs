import BD from '../src/db/BD.js';

// Migracion de pictogramas hacia librerias con licencia comercial (freemium).
// ARASAAC es CC BY-NC-SA: la clausula NonCommercial es incompatible con un
// modelo freemium. En vez de borrar el catalogo actual, se le agrega
// metadata legal a cada pictograma para poder filtrar por licencia sin
// perder nada. `uso_comercial_permitido` arranca en false a proposito: lo
// que no se verifico, no se publica bajo modo comercial.
const sql = `
  ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS licencia_codigo TEXT;
  ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS licencia_version TEXT;
  ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS licencia_url TEXT;
  ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS texto_atribucion TEXT;
  ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS url_fuente TEXT;
  ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS uso_comercial_permitido BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS share_alike_requerido BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE pictogramas ADD COLUMN IF NOT EXISTS fecha_importacion TIMESTAMPTZ;
`;

const indexSql = `
  CREATE INDEX IF NOT EXISTS idx_pictogramas_uso_comercial ON pictogramas (uso_comercial_permitido);
`;

// Backfill: todo lo que ya esta en la base viene de ARASAAC (CC BY-NC-SA,
// uso comercial NO permitido) o es propio (TANDEM_AI, generado con IA,
// uso comercial permitido porque no depende de licencia de terceros).
const backfillArasaacSql = `
  UPDATE pictogramas
  SET
    licencia_codigo = 'CC-BY-NC-SA-4.0',
    licencia_version = '4.0',
    licencia_url = 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    texto_atribucion = 'Autor: Sergio Palao. Propietario: Gobierno de Aragon (ARASAAC).',
    url_fuente = 'https://arasaac.org',
    uso_comercial_permitido = false,
    share_alike_requerido = true,
    fecha_importacion = COALESCE(fecha_importacion, fecha_sincronizacion)
  WHERE origen = 'ARASAAC' AND licencia_codigo IS NULL
`;

const backfillTandemAiSql = `
  UPDATE pictogramas
  SET
    licencia_codigo = 'TANDEM_PROPIETARIO',
    uso_comercial_permitido = true,
    share_alike_requerido = false,
    fecha_importacion = COALESCE(fecha_importacion, fecha_creacion)
  WHERE origen = 'TANDEM_AI' AND licencia_codigo IS NULL
`;

try {
  await BD.query(sql);
  await BD.query(indexSql);
  const arasaacResult = await BD.execute(backfillArasaacSql);
  const tandemAiResult = await BD.execute(backfillTandemAiSql);

  console.log('Columnas de licencia creadas en pictogramas.');
  console.log(`Backfill ARASAAC (bloqueado para uso comercial): ${arasaacResult} filas.`);
  console.log(`Backfill TANDEM_AI (uso comercial permitido): ${tandemAiResult} filas.`);
} catch (error) {
  console.error('Error creando columnas de licencia en pictogramas:', error.message);
}

process.exit(0);
