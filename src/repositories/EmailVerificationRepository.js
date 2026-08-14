import BD from '../db/BD.js';

class EmailVerificationRepository {
  create({ idUsuario, tokenHash, expiresAt }, db = BD) {
    return db.queryOne(
      `
        INSERT INTO email_verification_tokens (id_usuario, token_hash, expires_at)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [idUsuario, tokenHash, expiresAt],
    );
  }

  async findByTokenHashForUpdate(tokenHash, db) {
    const result = await db.query('SELECT * FROM email_verification_tokens WHERE token_hash = $1 LIMIT 1 FOR UPDATE', [tokenHash]);
    return result.rows[0] || null;
  }

  markUsed(id, db = BD) {
    if (typeof db.execute === 'function') return db.execute('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    return db.query('UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  }

  invalidatePendingForUser(idUsuario) {
    return BD.execute(
      'UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id_usuario = $1 AND used_at IS NULL',
      [idUsuario],
    );
  }
}

export default new EmailVerificationRepository();
