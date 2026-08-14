import BD from '../src/db/BD.js';

const sql = `
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_usuario ON password_reset_tokens(id_usuario);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
`;

try {
  await BD.query(sql);
  console.log('Tabla password_reset_tokens creada correctamente.');
} catch (error) {
  console.error('Error creando password_reset_tokens:', error.message);
  process.exitCode = 1;
} finally {
  await BD.pool.end();
}
