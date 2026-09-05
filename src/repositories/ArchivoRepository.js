import BD from '../db/BD.js';

export default class ArchivoRepository {
  constructor() {
    console.log('Estoy en: ArchivoRepository.constructor()');
    this.metadataColumnsReady = false;
  }

  ensureMetadataColumnsAsync = async () => {
    if (this.metadataColumnsReady) return;
    try {
      await BD.execute(`ALTER TABLE archivos ADD COLUMN IF NOT EXISTS content_type TEXT`);
      await BD.execute(`ALTER TABLE archivos ADD COLUMN IF NOT EXISTS peso_bytes INTEGER`);
      this.metadataColumnsReady = true;
    } catch (error) {
      console.warn(`No se pudieron preparar columnas de metadata de archivos: ${error.message}`);
      this.metadataColumnsReady = false;
    }
  };

  getAllAsync = async () => {
    console.log('ArchivoRepository.getAllAsync()');
    await this.ensureMetadataColumnsAsync();
    const sql = this.metadataColumnsReady
      ? `SELECT id, id_usuario_creador, id_tipo_archivo, nombre_archivo, url, content_type, peso_bytes, fecha_subida, activo FROM archivos ORDER BY id DESC`
      : `SELECT id, id_usuario_creador, id_tipo_archivo, nombre_archivo, url, fecha_subida, activo FROM archivos ORDER BY id DESC`;
    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`ArchivoRepository.getByIdAsync(${id})`);
    await this.ensureMetadataColumnsAsync();
    const sql = this.metadataColumnsReady
      ? `SELECT id, id_usuario_creador, id_tipo_archivo, nombre_archivo, url, content_type, peso_bytes, fecha_subida, activo FROM archivos WHERE id = $1`
      : `SELECT id, id_usuario_creador, id_tipo_archivo, nombre_archivo, url, fecha_subida, activo FROM archivos WHERE id = $1`;
    return await BD.queryOne(sql, [id]);
  };

  getByIdsAsync = async (ids) => {
    console.log(`ArchivoRepository.getByIdsAsync(${ids?.length ?? 0})`);
    if (!Array.isArray(ids) || ids.length === 0) return [];
    await this.ensureMetadataColumnsAsync();
    const sql = this.metadataColumnsReady
      ? `SELECT id, id_usuario_creador, id_tipo_archivo, nombre_archivo, url, content_type, peso_bytes, fecha_subida, activo FROM archivos WHERE id = ANY($1::int[])`
      : `SELECT id, id_usuario_creador, id_tipo_archivo, nombre_archivo, url, fecha_subida, activo FROM archivos WHERE id = ANY($1::int[])`;
    return await BD.query(sql, [ids]);
  };

  createAsync = async (entity) => {
    console.log(`ArchivoRepository.createAsync(${JSON.stringify(entity)})`);
    await this.ensureMetadataColumnsAsync();
    const sql = this.metadataColumnsReady
      ? `INSERT INTO archivos (id_usuario_creador, id_tipo_archivo, nombre_archivo, url, content_type, peso_bytes, fecha_subida, activo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`
      : `INSERT INTO archivos (id_usuario_creador, id_tipo_archivo, nombre_archivo, url, fecha_subida, activo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
    const values = this.metadataColumnsReady
      ? [entity?.id_usuario_creador ?? null, entity?.id_tipo_archivo ?? null, entity?.nombre_archivo ?? null, entity?.url ?? null, entity?.content_type ?? null, entity?.peso_bytes ?? null, entity?.fecha_subida ?? null, entity?.activo ?? null]
      : [entity?.id_usuario_creador ?? null, entity?.id_tipo_archivo ?? null, entity?.nombre_archivo ?? null, entity?.url ?? null, entity?.fecha_subida ?? null, entity?.activo ?? null];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    console.log(`ArchivoRepository.updateAsync(${JSON.stringify(entity)})`);
    await this.ensureMetadataColumnsAsync();
    const id = entity.id;
    const previousEntity = await this.getByIdAsync(id);
    if (previousEntity == null) return 0;
    const sql = this.metadataColumnsReady
      ? `UPDATE archivos SET id_usuario_creador = $2, id_tipo_archivo = $3, nombre_archivo = $4, url = $5, content_type = $6, peso_bytes = $7, fecha_subida = $8, activo = $9 WHERE id = $1`
      : `UPDATE archivos SET id_usuario_creador = $2, id_tipo_archivo = $3, nombre_archivo = $4, url = $5, fecha_subida = $6, activo = $7 WHERE id = $1`;
    const values = this.metadataColumnsReady
      ? [id, entity?.id_usuario_creador ?? previousEntity.id_usuario_creador, entity?.id_tipo_archivo ?? previousEntity.id_tipo_archivo, entity?.nombre_archivo ?? previousEntity.nombre_archivo, entity?.url ?? previousEntity.url, entity?.content_type ?? previousEntity.content_type, entity?.peso_bytes ?? previousEntity.peso_bytes, entity?.fecha_subida ?? previousEntity.fecha_subida, entity?.activo ?? previousEntity.activo]
      : [id, entity?.id_usuario_creador ?? previousEntity.id_usuario_creador, entity?.id_tipo_archivo ?? previousEntity.id_tipo_archivo, entity?.nombre_archivo ?? previousEntity.nombre_archivo, entity?.url ?? previousEntity.url, entity?.fecha_subida ?? previousEntity.fecha_subida, entity?.activo ?? previousEntity.activo];
    return await BD.execute(sql, values);
  };

  deleteByIdAsync = async (id) => {
    console.log(`ArchivoRepository.deleteByIdAsync(${id})`);
    const sql = `DELETE FROM archivos WHERE id = $1`;
    return await BD.execute(sql, [id]);
  };
}
