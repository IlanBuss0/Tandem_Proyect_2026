import BD from '../src/db/BD.js';
import { hashValue } from '../src/modules/security/hash.helper.js';

const apply = process.argv.includes('--apply');

async function main() {
  const rows = await BD.query(`
    SELECT id, contrasena_hash
    FROM usuarios
    WHERE contrasena_hash NOT LIKE '$argon2%'
      AND contrasena_hash NOT LIKE 'sha256$%'
    ORDER BY id
  `);

  if (!apply) {
    console.log(`Cuentas con formato legacy directo: ${rows.length}. No se hicieron cambios.`);
    console.log('Ejecutar con --apply para convertirlas transaccionalmente a Argon2id.');
    return;
  }

  await BD.transaction(async (client) => {
    for (const row of rows) {
      const replacement = await hashValue(row.contrasena_hash);
      const result = await client.query(
        'UPDATE usuarios SET contrasena_hash = $2 WHERE id = $1 AND contrasena_hash = $3',
        [row.id, replacement, row.contrasena_hash],
      );
      if (result.rowCount !== 1) throw new Error(`La cuenta ${row.id} cambio durante la migracion`);
    }
  });

  console.log(`Cuentas convertidas a Argon2id: ${rows.length}.`);
}

main()
  .catch((error) => {
    console.error('No se pudieron migrar las contrasenas legacy:', error.message);
    process.exitCode = 1;
  })
  .finally(() => BD.pool.end());
