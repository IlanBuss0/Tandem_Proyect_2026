import BD from '../src/db/BD.js';

await BD.execute(`
  ALTER TABLE actividades_asignadas
    ADD COLUMN IF NOT EXISTS puntaje_ultimo SMALLINT,
    ADD COLUMN IF NOT EXISTS puntaje_mejor SMALLINT,
    ADD COLUMN IF NOT EXISTS fecha_ultimo_intento TIMESTAMPTZ;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'actividades_asignadas_puntaje_ultimo_check'
    ) THEN
      ALTER TABLE actividades_asignadas
        ADD CONSTRAINT actividades_asignadas_puntaje_ultimo_check
        CHECK (puntaje_ultimo BETWEEN 0 AND 100);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'actividades_asignadas_puntaje_mejor_check'
    ) THEN
      ALTER TABLE actividades_asignadas
        ADD CONSTRAINT actividades_asignadas_puntaje_mejor_check
        CHECK (puntaje_mejor BETWEEN 0 AND 100);
    END IF;
  END $$;
`);

console.log('Campos de resultados de actividades listos.');
await BD.close?.();

