import BD from '../src/db/BD.js';
import {
  ACTIVITY_CATALOG_VERSION,
  ACTIVITY_CATEGORIES,
  ACTIVITY_DOMAINS,
  ACTIVITY_SKILLS,
  ACTIVITY_SUBSKILLS,
  validateActivityCatalogs,
} from '../src/modules/activity-performance/catalogs.js';

const validation = validateActivityCatalogs();

if (!validation.ok) {
  console.error('Catalogos de desempeno de actividades invalidos.', validation);
  process.exit(1);
}

const ensureSchemaSql = `
  CREATE TABLE IF NOT EXISTS dominios_actividad (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(80) NOT NULL UNIQUE,
    nombre VARCHAR(160) NOT NULL,
    descripcion TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    orden INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categorias_actividad (
    id SERIAL PRIMARY KEY,
    id_dominio INTEGER NOT NULL REFERENCES dominios_actividad(id),
    codigo VARCHAR(80) NOT NULL UNIQUE,
    nombre VARCHAR(160) NOT NULL,
    descripcion TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    orden INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS actividad_habilidades (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(80) NOT NULL,
    nombre VARCHAR(160) NOT NULL,
    dominio TEXT,
    descripcion TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    orden INTEGER NOT NULL DEFAULT 0
  );

  ALTER TABLE actividad_habilidades
    ADD COLUMN IF NOT EXISTS codigo VARCHAR(80),
    ADD COLUMN IF NOT EXISTS nombre VARCHAR(160),
    ADD COLUMN IF NOT EXISTS dominio TEXT,
    ADD COLUMN IF NOT EXISTS descripcion TEXT,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS orden INTEGER NOT NULL DEFAULT 0;

  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM actividad_habilidades
      WHERE codigo IS NULL OR nombre IS NULL
    ) THEN
      RAISE EXCEPTION 'actividad_habilidades contiene filas sin codigo o nombre';
    END IF;

    IF EXISTS (
      SELECT codigo
      FROM actividad_habilidades
      GROUP BY codigo
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'actividad_habilidades contiene codigos duplicados';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'actividad_habilidades_codigo_unique'
    ) THEN
      ALTER TABLE actividad_habilidades
        ADD CONSTRAINT actividad_habilidades_codigo_unique UNIQUE (codigo);
    END IF;
  END $$;

  ALTER TABLE actividad_habilidades
    ALTER COLUMN codigo SET NOT NULL,
    ALTER COLUMN nombre SET NOT NULL;

  CREATE TABLE IF NOT EXISTS actividad_subhabilidades (
    id SERIAL PRIMARY KEY,
    id_habilidad INTEGER NOT NULL REFERENCES actividad_habilidades(id),
    codigo VARCHAR(80) NOT NULL UNIQUE,
    nombre VARCHAR(160) NOT NULL,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE
  );

  CREATE INDEX IF NOT EXISTS idx_categorias_actividad_dominio ON categorias_actividad(id_dominio);
  CREATE INDEX IF NOT EXISTS idx_actividad_subhabilidades_habilidad ON actividad_subhabilidades(id_habilidad);
`;

async function upsertDomain(db, domain) {
  await db.query(
    `
      INSERT INTO dominios_actividad (codigo, nombre, descripcion, version, activo, orden)
      VALUES ($1, $2, $3, $4, TRUE, $5)
      ON CONFLICT (codigo) DO UPDATE
      SET nombre = EXCLUDED.nombre,
          descripcion = EXCLUDED.descripcion,
          version = EXCLUDED.version,
          activo = TRUE,
          orden = EXCLUDED.orden
    `,
    [domain.codigo, domain.nombre, domain.descripcion, ACTIVITY_CATALOG_VERSION, domain.orden],
  );
}

async function upsertCategory(db, category) {
  await db.query(
    `
      INSERT INTO categorias_actividad (id_dominio, codigo, nombre, descripcion, version, activo, orden)
      SELECT id, $2, $3, $4, $5, TRUE, $6
      FROM dominios_actividad
      WHERE codigo = $1
      ON CONFLICT (codigo) DO UPDATE
      SET id_dominio = EXCLUDED.id_dominio,
          nombre = EXCLUDED.nombre,
          descripcion = EXCLUDED.descripcion,
          version = EXCLUDED.version,
          activo = TRUE,
          orden = EXCLUDED.orden
    `,
    [
      category.dominioCodigo,
      category.codigo,
      category.nombre,
      category.descripcion ?? null,
      ACTIVITY_CATALOG_VERSION,
      category.orden,
    ],
  );
}

async function upsertSkill(db, skill) {
  await db.query(
    `
      INSERT INTO actividad_habilidades (codigo, nombre, dominio, descripcion, version, activo, orden)
      VALUES ($1, $2, $3, $4, $5, TRUE, $6)
      ON CONFLICT (codigo) DO UPDATE
      SET nombre = EXCLUDED.nombre,
          dominio = COALESCE(actividad_habilidades.dominio, EXCLUDED.dominio),
          descripcion = COALESCE(EXCLUDED.descripcion, actividad_habilidades.descripcion),
          version = EXCLUDED.version,
          activo = TRUE,
          orden = EXCLUDED.orden
    `,
    [
      skill.codigo,
      skill.nombre,
      skill.dominio ?? 'desempeno_actividades',
      skill.descripcion ?? null,
      ACTIVITY_CATALOG_VERSION,
      skill.orden,
    ],
  );
}

async function upsertSubskill(db, subskill) {
  await db.query(
    `
      INSERT INTO actividad_subhabilidades (id_habilidad, codigo, nombre, descripcion, activo)
      SELECT id, $2, $3, $4, TRUE
      FROM actividad_habilidades
      WHERE codigo = $1
      ON CONFLICT (codigo) DO UPDATE
      SET id_habilidad = EXCLUDED.id_habilidad,
          nombre = EXCLUDED.nombre,
          descripcion = EXCLUDED.descripcion,
          activo = TRUE
    `,
    [subskill.habilidadCodigo, subskill.codigo, subskill.nombre, subskill.descripcion ?? null],
  );
}

try {
  await BD.transaction(async (client) => {
    await client.query(ensureSchemaSql);

    for (const domain of ACTIVITY_DOMAINS) await upsertDomain(client, domain);
    for (const category of ACTIVITY_CATEGORIES) await upsertCategory(client, category);
    for (const skill of ACTIVITY_SKILLS) await upsertSkill(client, skill);
    for (const subskill of ACTIVITY_SUBSKILLS) await upsertSubskill(client, subskill);
  });

  console.log('Catalogos de desempeno de actividades listos.');
  await BD.close?.();
  process.exit(0);
} catch (error) {
  console.error('No se pudieron preparar los catalogos de desempeno de actividades:', error.message);
  await BD.close?.();
  process.exit(1);
}
