import BD from '../src/db/BD.js';

// Fase 6 — Cuestionario de onboarding del perteneciente.
// Este flag distingue un nivel de apoyo "sugerido" por el propio
// cuestionario (respondido por el perteneciente sobre si mismo) de uno
// confirmado por un profesional o cargado por un tutor. Nunca se usa para
// bloquear funciones: solo es informativo para quien mira el perfil.
const sql = `
  ALTER TABLE pertenecientes ADD COLUMN IF NOT EXISTS nivel_apoyo_sugerido BOOLEAN NOT NULL DEFAULT false;
`;

try {
  await BD.query(sql);
  console.log('Columna pertenecientes.nivel_apoyo_sugerido creada correctamente.');
} catch (error) {
  console.error('Error creando pertenecientes.nivel_apoyo_sugerido:', error.message);
}

process.exit(0);
