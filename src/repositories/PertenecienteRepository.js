import BD from '../db/BD.js';

export default class PertenecienteRepository {
  constructor() {
    console.log('Estoy en: PertenecienteRepository.constructor()');
  }

  getAllAsync = async () => {
    console.log('PertenecienteRepository.getAllAsync()');

    const sql = `
      SELECT
        id,
        id_usuario,
        id_nivel_apoyo,
        id_autonomia_operativa,
        puede_autogestionarse,
        observacion_general,
        nivel_apoyo_sugerido
      FROM pertenecientes
      ORDER BY id DESC
    `;

    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`PertenecienteRepository.getByIdAsync(${id})`);

    const sql = `
      SELECT
        id,
        id_usuario,
        id_nivel_apoyo,
        id_autonomia_operativa,
        puede_autogestionarse,
        observacion_general,
        nivel_apoyo_sugerido
      FROM pertenecientes
      WHERE id = $1
    `;

    return await BD.queryOne(sql, [id]);
  };

  getByUsuarioIdAsync = async (idUsuario) => {
    console.log(`PertenecienteRepository.getByUsuarioIdAsync(${idUsuario})`);

    const sql = `
      SELECT
        id,
        id_usuario,
        id_nivel_apoyo,
        id_autonomia_operativa,
        puede_autogestionarse,
        observacion_general,
        nivel_apoyo_sugerido
      FROM pertenecientes
      WHERE id_usuario = $1
    `;

    return await BD.queryOne(sql, [idUsuario]);
  };

  createAsync = async (entity) => {
    console.log(`PertenecienteRepository.createAsync(${JSON.stringify(entity)})`);

    const sql = `
      INSERT INTO pertenecientes (
        id_usuario,
        id_nivel_apoyo,
        id_autonomia_operativa,
        puede_autogestionarse,
        observacion_general,
        nivel_apoyo_sugerido
      )
      VALUES (
        $1,
        $2,
        $3,
        COALESCE($4, false),
        $5,
        COALESCE($6, false)
      )
      RETURNING id
    `;

    const values = [
      entity?.id_usuario,
      entity?.id_nivel_apoyo,
      entity?.id_autonomia_operativa,
      entity?.puede_autogestionarse ?? false,
      entity?.observacion_general ?? null,
      entity?.nivel_apoyo_sugerido ?? false,
    ];

    const result = await BD.queryOne(sql, values);

    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    console.log(`PertenecienteRepository.updateAsync(${JSON.stringify(entity)})`);

    const id = entity.id;

    const previousEntity = await this.getByIdAsync(id);

    if (previousEntity == null) return 0;

    const sql = `
      UPDATE pertenecientes
      SET
        id_usuario = $2,
        id_nivel_apoyo = $3,
        id_autonomia_operativa = $4,
        puede_autogestionarse = $5,
        observacion_general = $6,
        nivel_apoyo_sugerido = $7
      WHERE id = $1
    `;

    const values = [
      id,
      entity?.id_usuario ?? previousEntity.id_usuario,
      entity?.id_nivel_apoyo ?? previousEntity.id_nivel_apoyo,
      entity?.id_autonomia_operativa ?? previousEntity.id_autonomia_operativa,
      entity?.puede_autogestionarse ?? previousEntity.puede_autogestionarse,
      entity?.observacion_general ?? previousEntity.observacion_general,
      entity?.nivel_apoyo_sugerido ?? previousEntity.nivel_apoyo_sugerido,
    ];

    return await BD.execute(sql, values);
  };

  deleteByIdAsync = async (id) => {
    console.log(`PertenecienteRepository.deleteByIdAsync(${id})`);

    const sql = `
      DELETE FROM pertenecientes
      WHERE id = $1
    `;

    return await BD.execute(sql, [id]);
  };
}