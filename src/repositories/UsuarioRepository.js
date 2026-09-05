import BD from '../db/BD.js';

export default class UsuarioRepository {
  constructor() {
    console.log('Estoy en: UsuarioRepository.constructor()');
  }

  getAllAsync = async () => {
    console.log('UsuarioRepository.getAllAsync()');

    const sql = `
      SELECT
        id,
        id_tipo_usuario,
        nombre_usuario,
        nombre,
        apellido,
        correo,
        telefono,
        fecha_nacimiento,
        fecha_ingreso,
        activo
      FROM usuarios
      ORDER BY id DESC
    `;

    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`UsuarioRepository.getByIdAsync(${id})`);

    const sql = `
      SELECT
        id,
        id_tipo_usuario,
        nombre_usuario,
        nombre,
        apellido,
        correo,
        telefono,
        fecha_nacimiento,
        fecha_ingreso,
        activo
      FROM usuarios
      WHERE id = $1
    `;

    return await BD.queryOne(sql, [id]);
  };

  getByIdsAsync = async (ids) => {
    console.log(`UsuarioRepository.getByIdsAsync(${ids?.length ?? 0})`);
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const sql = `
      SELECT
        id,
        id_tipo_usuario,
        nombre_usuario,
        nombre,
        apellido,
        correo,
        telefono,
        fecha_nacimiento,
        fecha_ingreso,
        activo
      FROM usuarios
      WHERE id = ANY($1::int[])
    `;

    return await BD.query(sql, [ids]);
  };

  getByCorreoAsync = async (correo) => {
    console.log(`UsuarioRepository.getByCorreoAsync(${correo})`);

    const sql = `
      SELECT
        id,
        id_tipo_usuario,
        nombre_usuario,
        nombre,
        apellido,
        correo,
        telefono,
        fecha_nacimiento,
        fecha_ingreso,
        activo
      FROM usuarios
      WHERE LOWER(correo) = LOWER($1)
    `;

    return await BD.queryOne(sql, [correo]);
  };

  getByNombreUsuarioAsync = async (nombreUsuario) => {
    console.log(`UsuarioRepository.getByNombreUsuarioAsync(${nombreUsuario})`);

    const sql = `
      SELECT
        id,
        id_tipo_usuario,
        nombre_usuario,
        nombre,
        apellido,
        correo,
        telefono,
        fecha_nacimiento,
        fecha_ingreso,
        activo
      FROM usuarios
      WHERE LOWER(nombre_usuario) = LOWER($1)
    `;

    return await BD.queryOne(sql, [nombreUsuario]);
  };

  getByIdForUpdateAsync = async (id) => {
    console.log(`UsuarioRepository.getByIdForUpdateAsync(${id})`);

    const sql = `
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
        activo
      FROM usuarios
      WHERE id = $1
    `;

    return await BD.queryOne(sql, [id]);
  };

  createAsync = async (entity) => {
    console.log('UsuarioRepository.createAsync()');

    const sql = `
      INSERT INTO usuarios (
        id_tipo_usuario,
        nombre_usuario,
        contrasena_hash,
        nombre,
        apellido,
        correo,
        telefono,
        fecha_nacimiento,
        fecha_ingreso,
        activo
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        COALESCE($10, true)
      )
      RETURNING id
    `;

    const values = [
      entity?.id_tipo_usuario,
      entity?.nombre_usuario,
      entity?.contrasena_hash,
      entity?.nombre,
      entity?.apellido,
      entity?.correo,
      entity?.telefono ?? null,
      entity?.fecha_nacimiento ?? null,
      entity?.fecha_ingreso,
      entity?.activo ?? true,
    ];

    const result = await BD.queryOne(sql, values);

    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    console.log('UsuarioRepository.updateAsync()');

    const id = entity.id;

    const previousEntity = await this.getByIdForUpdateAsync(id);

    if (previousEntity == null) return 0;

    const sql = `
      UPDATE usuarios
      SET
        id_tipo_usuario = $2,
        nombre_usuario = $3,
        contrasena_hash = $4,
        nombre = $5,
        apellido = $6,
        correo = $7,
        telefono = $8,
        fecha_nacimiento = $9,
        fecha_ingreso = $10,
        activo = $11
      WHERE id = $1
    `;

    const values = [
      id,
      entity?.id_tipo_usuario ?? previousEntity.id_tipo_usuario,
      entity?.nombre_usuario ?? previousEntity.nombre_usuario,
      entity?.contrasena_hash ?? previousEntity.contrasena_hash,
      entity?.nombre ?? previousEntity.nombre,
      entity?.apellido ?? previousEntity.apellido,
      entity?.correo ?? previousEntity.correo,
      entity?.telefono ?? previousEntity.telefono,
      entity?.fecha_nacimiento ?? previousEntity.fecha_nacimiento,
      entity?.fecha_ingreso ?? previousEntity.fecha_ingreso,
      entity?.activo ?? previousEntity.activo,
    ];

    return await BD.execute(sql, values);
  };

  deleteByIdAsync = async (id) => {
    console.log(`UsuarioRepository.deleteByIdAsync(${id})`);

    const sql = `
      UPDATE usuarios
      SET activo = false
      WHERE id = $1
    `;

    return await BD.execute(sql, [id]);
  };
}
