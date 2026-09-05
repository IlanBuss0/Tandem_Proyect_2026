import BD from '../db/BD.js';

export default class ProfesionalRepository {
  constructor() {
    console.log('Estoy en: ProfesionalRepository.constructor()');
  }

  getAllAsync = async () => {
    console.log('ProfesionalRepository.getAllAsync()');
    const sql = `SELECT id, id_usuario, profesion, especialidad, matricula, institucion, id_estado_validacion FROM profesionales ORDER BY id DESC`;
    return await BD.query(sql);
  };

  getAllPublicAsync = async () => {
    console.log('ProfesionalRepository.getAllPublicAsync()');
    const sql = `SELECT id, id_usuario, profesion, especialidad, institucion, id_estado_validacion FROM profesionales ORDER BY id DESC`;
    return await BD.query(sql);
  };

  getByIdPublicAsync = async (id) => {
    console.log(`ProfesionalRepository.getByIdPublicAsync(${id})`);
    const sql = `SELECT id, id_usuario, profesion, especialidad, institucion, id_estado_validacion FROM profesionales WHERE id = $1`;
    return await BD.queryOne(sql, [id]);
  };

  getByIdAsync = async (id) => {
    console.log(`ProfesionalRepository.getByIdAsync(${id})`);
    const sql = `SELECT id, id_usuario, profesion, especialidad, matricula, institucion, id_estado_validacion FROM profesionales WHERE id = $1`;
    return await BD.queryOne(sql, [id]);
  };

  getByUsuarioIdAsync = async (idUsuario) => {
    console.log(`ProfesionalRepository.getByUsuarioIdAsync(${idUsuario})`);
    const sql = `SELECT id, id_usuario, profesion, especialidad, matricula, institucion, id_estado_validacion FROM profesionales WHERE id_usuario = $1`;
    return await BD.queryOne(sql, [idUsuario]);
  };

  getByUsuarioIdPublicAsync = async (idUsuario) => {
    console.log(`ProfesionalRepository.getByUsuarioIdPublicAsync(${idUsuario})`);
    const sql = `SELECT id, id_usuario, profesion, especialidad, institucion, id_estado_validacion FROM profesionales WHERE id_usuario = $1`;
    return await BD.queryOne(sql, [idUsuario]);
  };

  getByMatriculaAsync = async (matricula) => {
    console.log(`ProfesionalRepository.getByMatriculaAsync(${matricula})`);
    const sql = `SELECT id, id_usuario, profesion, especialidad, matricula, institucion, id_estado_validacion FROM profesionales WHERE matricula = $1`;
    return await BD.queryOne(sql, [matricula]);
  };

  createAsync = async (entity) => {
    console.log(`ProfesionalRepository.createAsync(${JSON.stringify(entity)})`);
    const sql = `INSERT INTO profesionales (id_usuario, profesion, especialidad, matricula, institucion, id_estado_validacion) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
    const values = [entity?.id_usuario, entity?.profesion, entity?.especialidad ?? null, entity?.matricula, entity?.institucion ?? null, entity?.id_estado_validacion];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    console.log(`ProfesionalRepository.updateAsync(${JSON.stringify(entity)})`);
    const id = entity.id;
    const previousEntity = await this.getByIdAsync(id);
    if (previousEntity == null) return 0;
    const sql = `UPDATE profesionales SET id_usuario = $2, profesion = $3, especialidad = $4, matricula = $5, institucion = $6, id_estado_validacion = $7 WHERE id = $1`;
    const values = [id, entity?.id_usuario ?? previousEntity.id_usuario, entity?.profesion ?? previousEntity.profesion, entity?.especialidad ?? previousEntity.especialidad, entity?.matricula ?? previousEntity.matricula, entity?.institucion ?? previousEntity.institucion, entity?.id_estado_validacion ?? previousEntity.id_estado_validacion];
    return await BD.execute(sql, values);
  };

  deleteByIdAsync = async (id) => {
    console.log(`ProfesionalRepository.deleteByIdAsync(${id})`);
    const sql = `DELETE FROM profesionales WHERE id = $1`;
    return await BD.execute(sql, [id]);
  };

  getEstadoValidacionPendienteAsync = async () => {
    console.log('ProfesionalRepository.getEstadoValidacionPendienteAsync()');
    return await BD.queryOne(
      `
        SELECT id, nombre
        FROM estados_validaciones_profesionales
        WHERE LOWER(nombre) IN ('pendiente', 'en revision', 'en_revision', 'pendiente de revision')
        ORDER BY orden ASC NULLS LAST, id ASC
        LIMIT 1
      `,
    );
  };
}
