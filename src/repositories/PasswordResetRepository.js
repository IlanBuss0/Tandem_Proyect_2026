import BD from '../db/BD.js';

class PasswordResetRepository {
  create({ idUsuario, tokenHash, expiresAt }) {
    return BD.queryOne(
      `INSERT INTO password_reset_tokens (id_usuario, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [idUsuario, tokenHash, expiresAt],
    );
  }

  async findByTokenHashForUpdate(tokenHash, db) {
    const result = await db.query('SELECT * FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1 FOR UPDATE', [tokenHash]);
    return result.rows[0] || null;
  }

  invalidatePendingForUser(idUsuario) {
    return BD.execute(
      'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id_usuario = $1 AND used_at IS NULL',
      [idUsuario],
    );
  }

  markUsed(id, db) {
    return db.query('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
  }
}

export default new PasswordResetRepository();
