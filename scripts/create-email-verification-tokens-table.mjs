import BD from '../src/db/BD.js';

const sql = `
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT false;

  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_usuario ON email_verification_tokens(id_usuario);
  CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
`;

try {
  await BD.query(sql);
  console.log('Columna email_verificado y tabla email_verification_tokens creadas correctamente.');
} catch (error) {
  console.error('Error creando email_verificado / email_verification_tokens:', error.message);
}

process.exit(0);
