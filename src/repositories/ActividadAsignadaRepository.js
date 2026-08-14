import BD from '../db/BD.js';

export default class ActividadAsignadaRepository {
  constructor() {
    console.log('Estoy en: ActividadAsignadaRepository.constructor()');
  }

  getAllAsync = async () => {
    console.log('ActividadAsignadaRepository.getAllAsync()');

    const sql = `
      SELECT
        id,
        id_actividad,
        id_actividad_personalizada,
        id_perteneciente,
        id_usuario_asignador,
        id_estado_actividad,
        fecha_asignacion,
        fecha_completada,
        puntaje_ultimo,
        puntaje_mejor,
        fecha_ultimo_intento
      FROM actividades_asignadas
      ORDER BY id DESC
    `;

    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`ActividadAsignadaRepository.getByIdAsync(${id})`);

    const sql = `
      SELECT
        id,
        id_actividad,
        id_actividad_personalizada,
        id_perteneciente,
        id_usuario_asignador,
        id_estado_actividad,
        fecha_asignacion,
        fecha_completada,
        puntaje_ultimo,
        puntaje_mejor,
        fecha_ultimo_intento
      FROM actividades_asignadas
      WHERE id = $1
    `;

    return await BD.queryOne(sql, [id]);
  };

  getByPertenecienteIdAsync = async (idPerteneciente) => {
    console.log(`ActividadAsignadaRepository.getByPertenecienteIdAsync(${idPerteneciente})`);

    const sql = `
      SELECT
        id,
        id_actividad,
        id_actividad_personalizada,
        id_perteneciente,
        id_usuario_asignador,
        id_estado_actividad,
        fecha_asignacion,
        fecha_completada,
        puntaje_ultimo,
        puntaje_mejor,
        fecha_ultimo_intento
      FROM actividades_asignadas
      WHERE id_perteneciente = $1
      ORDER BY id DESC
    `;

    return await BD.query(sql, [idPerteneciente]);
  };

  createAsync = async (entity) => {
    console.log(`ActividadAsignadaRepository.createAsync(${JSON.stringify(entity)})`);

    const sql = `
      INSERT INTO actividades_asignadas (
        id_actividad,
        id_actividad_personalizada,
        id_perteneciente,
        id_usuario_asignador,
        id_estado_actividad,
        fecha_asignacion,
        fecha_completada
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      )
      RETURNING id
    `;

    const values = [
      entity?.id_actividad ?? null,
      entity?.id_actividad_personalizada ?? null,
      entity?.id_perteneciente,
      entity?.id_usuario_asignador,
      entity?.id_estado_actividad,
      entity?.fecha_asignacion,
      entity?.fecha_completada ?? null,
    ];

    const result = await BD.queryOne(sql, values);

    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    console.log(`ActividadAsignadaRepository.updateAsync(${JSON.stringify(entity)})`);

    const id = entity.id;

    const previousEntity = await this.getByIdAsync(id);

    if (previousEntity == null) return 0;

    const sql = `
      UPDATE actividades_asignadas
      SET
        id_actividad = $2,
        id_actividad_personalizada = $3,
        id_perteneciente = $4,
        id_usuario_asignador = $5,
        id_estado_actividad = $6,
        fecha_asignacion = $7,
        fecha_completada = $8
      WHERE id = $1
    `;

    const values = [
      id,
      entity?.id_actividad ?? previousEntity.id_actividad,
      entity?.id_actividad_personalizada ?? previousEntity.id_actividad_personalizada,
      entity?.id_perteneciente ?? previousEntity.id_perteneciente,
      entity?.id_usuario_asignador ?? previousEntity.id_usuario_asignador,
      entity?.id_estado_actividad ?? previousEntity.id_estado_actividad,
      entity?.fecha_asignacion ?? previousEntity.fecha_asignacion,
      entity?.fecha_completada ?? previousEntity.fecha_completada,
    ];

    return await BD.execute(sql, values);
  };

  completeAsync = async (id, score = null) => {
    const sql = `
      UPDATE actividades_asignadas
      SET
        id_estado_actividad = COALESCE(
          (SELECT id FROM estados_actividades WHERE LOWER(nombre) LIKE '%complet%' ORDER BY id LIMIT 1),
          id_estado_actividad
        ),
        fecha_completada = COALESCE(fecha_completada, NOW()),
        puntaje_ultimo = CASE WHEN $2::smallint IS NULL THEN puntaje_ultimo ELSE $2 END,
        puntaje_mejor = CASE
          WHEN $2::smallint IS NULL THEN puntaje_mejor
          ELSE GREATEST(COALESCE(puntaje_mejor, $2), $2)
        END,
        fecha_ultimo_intento = CASE WHEN $2::smallint IS NULL THEN fecha_ultimo_intento ELSE NOW() END
      WHERE id = $1
      RETURNING
        id,
        id_estado_actividad,
        fecha_completada,
        puntaje_ultimo,
        puntaje_mejor,
        fecha_ultimo_intento
    `;

    return await BD.queryOne(sql, [id, score]);
  };

  getResultsByCustomActivityIdAsync = async (idActividadPersonalizada) => {
    const sql = `
      SELECT
        aa.id AS id_actividad_asignada,
        aa.id_perteneciente,
        p.id_usuario AS id_usuario_perteneciente,
        TRIM(CONCAT(u.nombre, ' ', u.apellido)) AS nombre,
        aa.fecha_completada IS NOT NULL AS completada,
        aa.puntaje_ultimo,
        aa.puntaje_mejor,
        aa.fecha_ultimo_intento
      FROM actividades_asignadas aa
      INNER JOIN pertenecientes p ON p.id = aa.id_perteneciente
      INNER JOIN usuarios u ON u.id = p.id_usuario
      WHERE aa.id_actividad_personalizada = $1
      ORDER BY u.nombre, u.apellido, aa.id
    `;

    return await BD.query(sql, [idActividadPersonalizada]);
  };

  deleteByIdAsync = async (id) => {
    console.log(`ActividadAsignadaRepository.deleteByIdAsync(${id})`);

    const sql = `
      DELETE FROM actividades_asignadas
      WHERE id = $1
    `;

    return await BD.execute(sql, [id]);
  };
}
