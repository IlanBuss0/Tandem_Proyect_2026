import BD from '../db/BD.js';

export default class PermisoArchivoRepository {
  constructor() {
    console.log('Estoy en: PermisoArchivoRepository.constructor()');
  }

  getAllAsync = async () => {
    console.log('PermisoArchivoRepository.getAllAsync()');
    const sql = `SELECT id, id_archivo, id_alcance_archivo, id_tipo_permiso_archivo, id_usuario, id_chat FROM permisos_archivos ORDER BY id DESC`;
    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`PermisoArchivoRepository.getByIdAsync(${id})`);
    const sql = `SELECT id, id_archivo, id_alcance_archivo, id_tipo_permiso_archivo, id_usuario, id_chat FROM permisos_archivos WHERE id = $1`;
    return await BD.queryOne(sql, [id]);
  };

  hasAccessForUserOrChatAsync = async (idArchivo, idUsuario, idChat) => {
    console.log(`PermisoArchivoRepository.hasAccessForUserOrChatAsync(${idArchivo}, ${idUsuario}, ${idChat})`);
    const sql = `
      SELECT id
      FROM permisos_archivos
      WHERE id_archivo = $1
        AND (
          id_usuario = $2
          OR id_chat = $3
        )
      LIMIT 1
    `;
    return Boolean(await BD.queryOne(sql, [idArchivo, idUsuario, idChat]));
  };

  // Version en lote de hasAccessForUserOrChatAsync: devuelve el subconjunto
  // de idArchivos que tienen un permiso para este usuario o este chat.
  filterAccessibleForUserOrChatAsync = async (idArchivos, idUsuario, idChat) => {
    console.log(`PermisoArchivoRepository.filterAccessibleForUserOrChatAsync(${idArchivos?.length ?? 0}, ${idUsuario}, ${idChat})`);
    if (!Array.isArray(idArchivos) || idArchivos.length === 0) return [];
    const sql = `
      SELECT DISTINCT id_archivo
      FROM permisos_archivos
      WHERE id_archivo = ANY($1::int[])
        AND (
          id_usuario = $2
          OR id_chat = $3
        )
    `;
    const rows = await BD.query(sql, [idArchivos, idUsuario, idChat]);
    return rows.map((row) => row.id_archivo);
  };

  createAsync = async (entity) => {
    console.log(`PermisoArchivoRepository.createAsync(${JSON.stringify(entity)})`);
    const sql = `INSERT INTO permisos_archivos (id_archivo, id_alcance_archivo, id_tipo_permiso_archivo, id_usuario, id_chat) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
    const values = [entity?.id_archivo ?? null, entity?.id_alcance_archivo ?? null, entity?.id_tipo_permiso_archivo ?? null, entity?.id_usuario ?? null, entity?.id_chat ?? null];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    console.log(`PermisoArchivoRepository.updateAsync(${JSON.stringify(entity)})`);
    const id = entity.id;
    const previousEntity = await this.getByIdAsync(id);
    if (previousEntity == null) return 0;
    const sql = `UPDATE permisos_archivos SET id_archivo = $2, id_alcance_archivo = $3, id_tipo_permiso_archivo = $4, id_usuario = $5, id_chat = $6 WHERE id = $1`;
    const values = [id, entity?.id_archivo ?? previousEntity.id_archivo, entity?.id_alcance_archivo ?? previousEntity.id_alcance_archivo, entity?.id_tipo_permiso_archivo ?? previousEntity.id_tipo_permiso_archivo, entity?.id_usuario ?? previousEntity.id_usuario, entity?.id_chat ?? previousEntity.id_chat];
    return await BD.execute(sql, values);
  };

  deleteByIdAsync = async (id) => {
    console.log(`PermisoArchivoRepository.deleteByIdAsync(${id})`);
    const sql = `DELETE FROM permisos_archivos WHERE id = $1`;
    return await BD.execute(sql, [id]);
  };
}
