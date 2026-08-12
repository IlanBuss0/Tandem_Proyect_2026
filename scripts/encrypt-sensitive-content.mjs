import BD from '../src/db/BD.js';
import { encryptField, isEncryptedValue } from '../src/modules/security/field-encryption.helper.js';

const targets = [
  { table: 'mensajes', field: 'contenido' },
  { table: 'reportes_profesionales', field: 'contenido' },
];

async function encryptTarget({ table, field }) {
  const rows = await BD.query(`SELECT id, ${field} FROM ${table} WHERE ${field} IS NOT NULL`);
  const pending = rows.filter((row) => !isEncryptedValue(row[field]));

  await BD.transaction(async (client) => {
    for (const row of pending) {
      await client.query(`UPDATE ${table} SET ${field} = $2 WHERE id = $1`, [row.id, encryptField(row[field])]);
    }
  });

  console.log(`${table}.${field}: ${pending.length} filas cifradas; ${rows.length - pending.length} ya estaban cifradas.`);
}

async function main() {
  for (const target of targets) await encryptTarget(target);
}

main()
  .catch((error) => {
    console.error('No se pudo cifrar el contenido sensible:', error.message);
    process.exitCode = 1;
  })
  .finally(() => BD.pool.end());
