import BD from '../src/db/BD.js';

(async () => {
  try {
    await BD.transaction(async (client) => {
      const states = [
        ['PENDING', 10], ['VERIFIED', 20], ['MANUAL_REVIEW', 30],
        ['NOT_FOUND', 40], ['DATA_MISMATCH', 50], ['VERIFICATION_ERROR', 60],
      ];
      for (const [name, order] of states) {
        await client.query(`
          INSERT INTO estados_validaciones_profesionales (nombre, orden)
          SELECT $1::varchar, $2::integer
          WHERE NOT EXISTS (
            SELECT 1 FROM estados_validaciones_profesionales
            WHERE UPPER(REPLACE(nombre, ' ', '_')) = $1::varchar
          )
        `, [name, order]);
      }
      await client.query(`
        ALTER TABLE validaciones_profesionales
          ADD COLUMN IF NOT EXISTS fuente VARCHAR(40),
          ADD COLUMN IF NOT EXISTS profesion_refeps VARCHAR(160),
          ADD COLUMN IF NOT EXISTS jurisdiccion_refeps VARCHAR(120),
          ADD COLUMN IF NOT EXISTS metodo_verificacion VARCHAR(80),
          ADD COLUMN IF NOT EXISTS resultado_automatico VARCHAR(40)
      `);
    });
    console.log('Verificacion profesional actualizada correctamente.');
    process.exit(0);
  } catch (error) {
    console.error('No se pudo actualizar la verificacion profesional:', error.message);
    process.exit(1);
  }
})();
