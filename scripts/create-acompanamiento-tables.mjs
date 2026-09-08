import BD from '../src/db/BD.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS acompanamiento_notas_compartidas (
    id BIGSERIAL PRIMARY KEY,
    id_perteneciente INTEGER NOT NULL REFERENCES pertenecientes(id) ON DELETE CASCADE,
    id_usuario_autor INTEGER NOT NULL REFERENCES usuarios(id),
    contenido TEXT NOT NULL CHECK (char_length(btrim(contenido)) BETWEEN 1 AND 2000),
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_acomp_notas_perteneciente_fecha
   ON acompanamiento_notas_compartidas (id_perteneciente, fecha_creacion DESC)`,
  `CREATE TABLE IF NOT EXISTS acompanamiento_objetivos (
    id BIGSERIAL PRIMARY KEY,
    id_perteneciente INTEGER NOT NULL REFERENCES pertenecientes(id) ON DELETE CASCADE,
    id_usuario_creador INTEGER NOT NULL REFERENCES usuarios(id),
    titulo VARCHAR(160) NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 160),
    descripcion TEXT,
    estado VARCHAR(24) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'pausado', 'completado')),
    progreso SMALLINT NOT NULL DEFAULT 0 CHECK (progreso BETWEEN 0 AND 100),
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_acomp_objetivos_perteneciente_estado
   ON acompanamiento_objetivos (id_perteneciente, estado, fecha_actualizacion DESC)`,
  `CREATE TABLE IF NOT EXISTS acompanamiento_acuerdos (
    id BIGSERIAL PRIMARY KEY,
    id_perteneciente INTEGER NOT NULL REFERENCES pertenecientes(id) ON DELETE CASCADE,
    id_usuario_creador INTEGER NOT NULL REFERENCES usuarios(id),
    texto VARCHAR(500) NOT NULL CHECK (char_length(btrim(texto)) BETWEEN 1 AND 500),
    completado BOOLEAN NOT NULL DEFAULT false,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_acomp_acuerdos_perteneciente_fecha
   ON acompanamiento_acuerdos (id_perteneciente, fecha_creacion DESC)`,
];

try {
  for (const statement of statements) await BD.execute(statement);
  console.log('Tablas de acompañamiento creadas o verificadas correctamente.');
} finally {
  await BD.pool?.end?.();
}
