import BD from '../src/db/BD.js';

async function main() {
  const rows = await BD.query(`
    SELECT
      CASE
        WHEN contrasena_hash LIKE '$argon2id$%' THEN 'argon2id'
        WHEN contrasena_hash LIKE 'sha256$%' THEN 'sha256_legacy'
        ELSE 'formato_desconocido'
      END AS formato,
      COUNT(*)::int AS cantidad
    FROM usuarios
    GROUP BY formato
    ORDER BY formato
  `);

  console.table(rows);
  const unknown = rows.find((row) => row.formato === 'formato_desconocido')?.cantidad ?? 0;
  process.exitCode = unknown > 0 ? 2 : 0;
}

main()
  .catch((error) => {
    console.error('No se pudo auditar el formato de las contrasenas:', error.message);
    process.exitCode = 1;
  })
  .finally(() => BD.pool.end());
