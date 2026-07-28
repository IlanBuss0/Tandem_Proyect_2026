import BD from '../db/BD.js';

function queryOne(db, sql, params) {
  if (typeof db.queryOne === 'function') return db.queryOne(sql, params);

  return db.query(sql, params).then((result) => {
    const rows = Array.isArray(result) ? result : result.rows;
    return rows[0] || null;
  });
}

class AuthRepository {
  findByCorreoOrNombreUsuario(identificador) {
    return BD.queryOne(
      `
        SELECT
          id,
          id_tipo_usuario,
          nombre_usuario,
          contrasena_hash,
          nombre,
          apellido,
          correo,
          telefono,
          fecha_nacimiento,
          fecha_ingreso,
          activo,
          email_verificado
        FROM usuarios
        WHERE LOWER(correo) = LOWER($1) OR LOWER(nombre_usuario) = LOWER($1)
        LIMIT 1
      `,
      [identificador],
    );
  }

  findSafeById(id, db = BD) {
    return queryOne(db, 'SELECT id, id_tipo_usuario, nombre_usuario, nombre, apellido, correo, telefono, fecha_nacimiento, fecha_ingreso, activo, email_verificado FROM usuarios WHERE id = $1', [id]);
  }

  updatePasswordHash(id, contrasenaHash) {
    return BD.execute('UPDATE usuarios SET contrasena_hash = $2 WHERE id = $1', [id, contrasenaHash]);
  }

  markEmailVerified(id) {
    return BD.execute('UPDATE usuarios SET email_verificado = true WHERE id = $1', [id]);
  }
}

export default new AuthRepository();
