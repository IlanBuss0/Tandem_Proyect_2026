import BD from '../db/BD.js';

export default class ValidacionProfesionalRepository {
  constructor() {
    console.log('Estoy en: ValidacionProfesionalRepository.constructor()');
  }

  getAllAsync = async () => {
    console.log('ValidacionProfesionalRepository.getAllAsync()');
    const sql = `SELECT id, id_profesional, numero_matricula, titulo_profesional, documento_dni_url, id_estado_validacion, observacion, id_administrador_validador, fecha_validacion FROM validaciones_profesionales ORDER BY id DESC`;
    return await BD.query(sql);
  };

  getByIdAsync = async (id) => {
    console.log(`ValidacionProfesionalRepository.getByIdAsync(${id})`);
    const sql = `SELECT id, id_profesional, numero_matricula, titulo_profesional, documento_dni_url, id_estado_validacion, observacion, id_administrador_validador, fecha_validacion FROM validaciones_profesionales WHERE id = $1`;
    return await BD.queryOne(sql, [id]);
  };

  getByProfesionalIdAsync = async (idProfesional) => {
    console.log(`ValidacionProfesionalRepository.getByProfesionalIdAsync(${idProfesional})`);
    const sql = `SELECT id, id_profesional, numero_matricula, titulo_profesional, documento_dni_url, id_estado_validacion, observacion, id_administrador_validador, fecha_validacion FROM validaciones_profesionales WHERE id_profesional = $1 ORDER BY id DESC`;
    return await BD.query(sql, [idProfesional]);
  };

  createAsync = async (entity) => {
    console.log(`ValidacionProfesionalRepository.createAsync(${JSON.stringify(entity)})`);
    const sql = `INSERT INTO validaciones_profesionales (id_profesional, numero_matricula, titulo_profesional, documento_dni_url, id_estado_validacion, observacion, id_administrador_validador, fecha_validacion) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
    const values = [entity?.id_profesional ?? null, entity?.numero_matricula ?? null, entity?.titulo_profesional ?? null, entity?.documento_dni_url ?? null, entity?.id_estado_validacion ?? null, entity?.observacion ?? null, entity?.id_administrador_validador ?? null, entity?.fecha_validacion ?? null];
    const result = await BD.queryOne(sql, values);
    return result?.id ?? 0;
  };

  updateAsync = async (entity) => {
    console.log(`ValidacionProfesionalRepository.updateAsync(${JSON.stringify(entity)})`);
    const id = entity.id;
    const previousEntity = await this.getByIdAsync(id);
    if (previousEntity == null) return 0;
    const sql = `UPDATE validaciones_profesionales SET id_profesional = $2, numero_matricula = $3, titulo_profesional = $4, documento_dni_url = $5, id_estado_validacion = $6, observacion = $7, id_administrador_validador = $8, fecha_validacion = $9 WHERE id = $1`;
    const values = [id, entity?.id_profesional ?? previousEntity.id_profesional, entity?.numero_matricula ?? previousEntity.numero_matricula, entity?.titulo_profesional ?? previousEntity.titulo_profesional, entity?.documento_dni_url ?? previousEntity.documento_dni_url, entity?.id_estado_validacion ?? previousEntity.id_estado_validacion, entity?.observacion ?? previousEntity.observacion, entity?.id_administrador_validador ?? previousEntity.id_administrador_validador, entity?.fecha_validacion ?? previousEntity.fecha_validacion];
    return await BD.execute(sql, values);
  };

  deleteByIdAsync = async (id) => {
    console.log(`ValidacionProfesionalRepository.deleteByIdAsync(${id})`);
    const sql = `DELETE FROM validaciones_profesionales WHERE id = $1`;
    return await BD.execute(sql, [id]);
  };

  getEstadoValidacionPendienteAsync = async () => {
    console.log('ValidacionProfesionalRepository.getEstadoValidacionPendienteAsync()');
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

  createAutomatedResultAsync = async (entity) => BD.transaction(async (client) => {
    const stateResult = await client.query(
      `SELECT id FROM estados_validaciones_profesionales WHERE UPPER(REPLACE(nombre, ' ', '_')) = $1 LIMIT 1`,
      [entity.profile_status],
    );
    const state = stateResult.rows[0];
    if (!state?.id) throw new Error(`Estado de validacion no configurado: ${entity.profile_status}`);

    const result = await client.query(`
      INSERT INTO validaciones_profesionales (
        id_profesional, numero_matricula, titulo_profesional, documento_dni_url,
        id_estado_validacion, observacion, fecha_validacion, fuente,
        profesion_refeps, jurisdiccion_refeps, metodo_verificacion, resultado_automatico
      ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      entity.id_profesional, entity.numero_matricula, entity.profesion, state.id,
      entity.observacion, entity.fecha_validacion, entity.source, entity.profesion,
      entity.jurisdiccion, entity.verification_method, entity.status,
    ]);
    await client.query('UPDATE profesionales SET id_estado_validacion = $2 WHERE id = $1', [entity.id_profesional, state.id]);
    return result.rows[0]?.id ?? 0;
  });
}
