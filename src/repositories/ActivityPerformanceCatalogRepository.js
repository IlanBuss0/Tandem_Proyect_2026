import BD from '../db/BD.js';

export default class ActivityPerformanceCatalogRepository {
  getDomainsAsync = async () => {
    const sql = `
      SELECT id, codigo, nombre, descripcion, version, activo, orden
      FROM dominios_actividad
      WHERE activo = TRUE
      ORDER BY orden ASC, id ASC
    `;
    return await BD.query(sql);
  };

  getCategoriesAsync = async () => {
    const sql = `
      SELECT
        c.id,
        c.id_dominio,
        d.codigo AS codigo_dominio,
        c.codigo,
        c.nombre,
        c.descripcion,
        c.version,
        c.activo,
        c.orden
      FROM categorias_actividad c
      INNER JOIN dominios_actividad d ON d.id = c.id_dominio
      WHERE c.activo = TRUE AND d.activo = TRUE
      ORDER BY c.orden ASC, c.id ASC
    `;
    return await BD.query(sql);
  };

  getSkillsAsync = async () => {
    const sql = `
      SELECT id, codigo, nombre, dominio, descripcion, version, activo, orden
      FROM actividad_habilidades
      WHERE activo = TRUE
      ORDER BY orden ASC, id ASC
    `;
    return await BD.query(sql);
  };
}
