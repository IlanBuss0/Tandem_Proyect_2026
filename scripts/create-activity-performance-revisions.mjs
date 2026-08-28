import BD from '../src/db/BD.js';

const sql = `
  CREATE TABLE IF NOT EXISTS actividad_revisiones (
    id BIGSERIAL PRIMARY KEY,
    id_actividad INTEGER REFERENCES actividades(id),
    id_actividad_personalizada INTEGER REFERENCES actividades_personalizadas(id),
    version INTEGER,
    definicion JSONB,
    creado_por INTEGER REFERENCES usuarios(id),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE actividad_revisiones
    ADD COLUMN IF NOT EXISTS id_actividad INTEGER REFERENCES actividades(id),
    ADD COLUMN IF NOT EXISTS id_actividad_personalizada INTEGER REFERENCES actividades_personalizadas(id),
    ADD COLUMN IF NOT EXISTS numero_revision INTEGER,
    ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS id_dominio INTEGER REFERENCES dominios_actividad(id),
    ADD COLUMN IF NOT EXISTS id_categoria INTEGER REFERENCES categorias_actividad(id),
    ADD COLUMN IF NOT EXISTS titulo VARCHAR(200),
    ADD COLUMN IF NOT EXISTS descripcion_perteneciente TEXT,
    ADD COLUMN IF NOT EXISTS instrucciones TEXT,
    ADD COLUMN IF NOT EXISTS objetivo_equipo_apoyo TEXT,
    ADD COLUMN IF NOT EXISTS proposito VARCHAR(20),
    ADD COLUMN IF NOT EXISTS dificultad_general VARCHAR(20),
    ADD COLUMN IF NOT EXISTS duracion_esperada_minutos INTEGER,
    ADD COLUMN IF NOT EXISTS configuracion_dificultad JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS configuracion_apoyos JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS criterios_exito JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS contexto_esperado JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS game_type VARCHAR(80),
    ADD COLUMN IF NOT EXISTS game_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS pasos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS mensaje_finalizacion TEXT,
    ADD COLUMN IF NOT EXISTS idioma VARCHAR(10) NOT NULL DEFAULT 'es',
    ADD COLUMN IF NOT EXISTS id_usuario_autor INTEGER REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS publicada BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT TRUE;

  UPDATE actividad_revisiones
  SET
    numero_revision = COALESCE(numero_revision, version, 1),
    id_usuario_autor = COALESCE(id_usuario_autor, creado_por),
    fecha_creacion = COALESCE(fecha_creacion, creado_en),
    titulo = COALESCE(titulo, definicion->>'titulo'),
    proposito = COALESCE(proposito, definicion->>'proposito'),
    dificultad_general = COALESCE(dificultad_general, definicion->>'dificultadGeneral')
  WHERE numero_revision IS NULL
    OR id_usuario_autor IS NULL
    OR fecha_creacion IS NULL
    OR titulo IS NULL
    OR proposito IS NULL
    OR dificultad_general IS NULL;

  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM actividad_revisiones
      WHERE (id_actividad IS NULL AND id_actividad_personalizada IS NULL)
         OR (id_actividad IS NOT NULL AND id_actividad_personalizada IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'actividad_revisiones contiene origen invalido';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM actividad_revisiones
      WHERE numero_revision IS NULL
         OR schema_version IS NULL
         OR proposito IS NULL
         OR dificultad_general IS NULL
    ) THEN
      RAISE EXCEPTION 'actividad_revisiones contiene filas incompletas';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'actividad_revisiones_origen_check'
    ) THEN
      ALTER TABLE actividad_revisiones
        ADD CONSTRAINT actividad_revisiones_origen_check
        CHECK (
          (id_actividad IS NOT NULL AND id_actividad_personalizada IS NULL)
          OR
          (id_actividad IS NULL AND id_actividad_personalizada IS NOT NULL)
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'actividad_revisiones_proposito_check'
    ) THEN
      ALTER TABLE actividad_revisiones
        ADD CONSTRAINT actividad_revisiones_proposito_check
        CHECK (proposito IN ('practica', 'evaluacion', 'generalizacion'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'actividad_revisiones_dificultad_check'
    ) THEN
      ALTER TABLE actividad_revisiones
        ADD CONSTRAINT actividad_revisiones_dificultad_check
        CHECK (dificultad_general IN ('facil', 'medio', 'avanzado'));
    END IF;
  END $$;

  ALTER TABLE actividad_revisiones
    ALTER COLUMN numero_revision SET NOT NULL,
    ALTER COLUMN schema_version SET NOT NULL,
    ALTER COLUMN proposito SET NOT NULL,
    ALTER COLUMN dificultad_general SET NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_actividad_revisiones_integrada_revision
    ON actividad_revisiones(id_actividad, numero_revision)
    WHERE id_actividad IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_actividad_revisiones_personalizada_revision
    ON actividad_revisiones(id_actividad_personalizada, numero_revision)
    WHERE id_actividad_personalizada IS NOT NULL;

  CREATE OR REPLACE FUNCTION prevent_published_activity_revision_update()
  RETURNS TRIGGER AS $$
  BEGIN
    IF OLD.publicada = TRUE THEN
      RAISE EXCEPTION 'Una revision publicada no se modifica; se debe crear una revision nueva';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_prevent_published_activity_revision_update ON actividad_revisiones;
  CREATE TRIGGER trg_prevent_published_activity_revision_update
    BEFORE UPDATE ON actividad_revisiones
    FOR EACH ROW
    EXECUTE FUNCTION prevent_published_activity_revision_update();

  CREATE TABLE IF NOT EXISTS actividad_revision_habilidades (
    id BIGSERIAL PRIMARY KEY,
    id_revision BIGINT NOT NULL REFERENCES actividad_revisiones(id) ON DELETE CASCADE,
    id_habilidad INTEGER NOT NULL REFERENCES actividad_habilidades(id),
    id_subhabilidad INTEGER REFERENCES actividad_subhabilidades(id),
    peso SMALLINT NOT NULL CHECK (peso > 0),
    es_principal BOOLEAN NOT NULL DEFAULT FALSE,
    origen_mapeo VARCHAR(20) NOT NULL DEFAULT 'confirmado',
    version_catalogo INTEGER NOT NULL DEFAULT 1
  );

  ALTER TABLE actividad_revision_habilidades
    ADD COLUMN IF NOT EXISTS id_subhabilidad INTEGER REFERENCES actividad_subhabilidades(id),
    ADD COLUMN IF NOT EXISTS origen_mapeo VARCHAR(20) NOT NULL DEFAULT 'confirmado',
    ADD COLUMN IF NOT EXISTS version_catalogo INTEGER NOT NULL DEFAULT 1;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_actividad_revision_habilidades_principal
    ON actividad_revision_habilidades(id_revision)
    WHERE es_principal = TRUE;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_actividad_revision_habilidades_unique
    ON actividad_revision_habilidades(
      id_revision,
      id_habilidad,
      COALESCE(id_subhabilidad, 0)
    );

  CREATE TABLE IF NOT EXISTS actividad_revision_items (
    id BIGSERIAL PRIMARY KEY,
    id_revision BIGINT NOT NULL REFERENCES actividad_revisiones(id) ON DELETE CASCADE,
    item_key VARCHAR(120) NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    tipo_evidencia VARCHAR(80) NOT NULL,
    dificultad VARCHAR(20),
    peso SMALLINT NOT NULL DEFAULT 1 CHECK (peso > 0),
    criterio_correcto JSONB NOT NULL DEFAULT '{}'::jsonb,
    habilidades JSONB NOT NULL DEFAULT '[]'::jsonb,
    tiempo_esperado_ms INTEGER,
    ayudas_permitidas JSONB NOT NULL DEFAULT '{}'::jsonb,
    categorias_error_permitidas JSONB NOT NULL DEFAULT '[]'::jsonb,
    obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (id_revision, item_key)
  );
`;

try {
  await BD.execute(sql);
  console.log('Tablas de revisiones de actividades listas.');
  await BD.close?.();
  process.exit(0);
} catch (error) {
  console.error('No se pudieron preparar las revisiones de actividades:', error.message);
  await BD.close?.();
  process.exit(1);
}
