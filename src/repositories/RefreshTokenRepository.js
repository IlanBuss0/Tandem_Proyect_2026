import BD from '../db/BD.js';

function queryOne(db, sql, params) {
  if (typeof db.queryOne === 'function') return db.queryOne(sql, params);

  return db.query(sql, params).then((result) => {
    const rows = Array.isArray(result) ? result : result.rows;
    return rows[0] || null;
  });
}

function execute(db, sql, params) {
  if (typeof db.execute === 'function') return db.execute(sql, params);

  return db.query(sql, params).then((result) => {
    if (Array.isArray(result)) return result.length;
    return result.rowCount;
  });
}

class RefreshTokenRepository {
  create({ idUsuario, tokenHash, familyId, expiresAt }, db = BD) {
    return queryOne(
      db,
      `
        INSERT INTO refresh_tokens (id_usuario, token_hash, family_id, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [idUsuario, tokenHash, familyId, expiresAt],
    );
  }

  findByTokenHash(tokenHash) {
    return BD.queryOne('SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1', [tokenHash]);
  }

  findByTokenHashForUpdate(tokenHash, db) {
    return queryOne(db, 'SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1 FOR UPDATE', [tokenHash]);
  }

  revoke(tokenHash, replacedByTokenHash = null, db = BD) {
    return execute(
      db,
      `
        UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
            replaced_by_token_hash = COALESCE(replaced_by_token_hash, $2)
        WHERE token_hash = $1
      `,
      [tokenHash, replacedByTokenHash],
    );
  }

  revokeFamily(familyId, db = BD) {
    return execute(
      db,
      `
        UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE family_id = $1
      `,
      [familyId],
    );
  }

  revokeAllForUser(idUsuario, db = BD) {
    return execute(db, 'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id_usuario = $1', [idUsuario]);
  }
}

export default new RefreshTokenRepository();
