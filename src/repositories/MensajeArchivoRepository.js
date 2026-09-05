import BD from '../db/BD.js';

export default class MensajeArchivoRepository {
  constructor() {
    console.log('Estoy en: MensajeArchivoRepository.constructor()');
  }

  getAllAsync = async () => {
    console.log('MensajeArchivoRepository.getAllAsync()');
    const sql = `SELECT id, id_mensaje, id_archivo FROM mensajes_archivos ORDER BY id DESC`;
    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`MensajeArchivoRepository.getByIdAsync(${id})`);
    const sql = `SELECT id, id_mensaje, id_archivo FROM mensajes_archivos WHERE id = $1`;
    return await BD.queryOne(sql, [id]);
  };

  createAsync = async (entity) => {
    console.log(`MensajeArchivoRepository.createAsync(${JSON.stringify(entity)})`);
    const sql = `INSERT INTO mensajes_archivos (id_mensaje, id_archivo) VALUES ($1, $2) RETURNING id`;
    const values = [entity?.id_mensaje ?? null, entity?.id_archivo ?? null];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  createManyAsync = async (entities) => {
    console.log(`MensajeArchivoRepository.createManyAsync(${entities?.length ?? 0})`);
    if (!Array.isArray(entities) || entities.length === 0) return [];
    const values = [];
    const placeholders = entities.map((entity, index) => {
      const base = index * 2;
      values.push(entity?.id_mensaje ?? null, entity?.id_archivo ?? null);
      return `($${base + 1}, $${base + 2})`;
    });
    const sql = `INSERT INTO mensajes_archivos (id_mensaje, id_archivo) VALUES ${placeholders.join(', ')} RETURNING id`;
    const rows = await BD.query(sql, values);
    return rows.map((row) => row.id);
  };

  updateAsync = async (entity) => {
    console.log(`MensajeArchivoRepository.updateAsync(${JSON.stringify(entity)})`);
    const id = entity.id;
    const previousEntity = await this.getByIdAsync(id);
    if (previousEntity == null) return 0;
    const sql = `UPDATE mensajes_archivos SET id_mensaje = $2, id_archivo = $3 WHERE id = $1`;
    const values = [id, entity?.id_mensaje ?? previousEntity.id_mensaje, entity?.id_archivo ?? previousEntity.id_archivo];
    return await BD.execute(sql, values);
  };

  getByMensajeIdAsync = async (idMensaje) => {
    console.log(`MensajeArchivoRepository.getByMensajeIdAsync(${idMensaje})`);
    const sql = `SELECT id, id_mensaje, id_archivo FROM mensajes_archivos WHERE id_mensaje = $1`;
    return await BD.query(sql, [idMensaje]);
  };

  deleteByIdAsync = async (id) => {
    console.log(`MensajeArchivoRepository.deleteByIdAsync(${id})`);
    const sql = `DELETE FROM mensajes_archivos WHERE id = $1`;
    return await BD.execute(sql, [id]);
  };
}
