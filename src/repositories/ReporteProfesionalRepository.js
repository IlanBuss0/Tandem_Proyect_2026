import BD from '../db/BD.js';
import { decryptFieldInRow, decryptFieldInRows, encryptField } from '../modules/security/field-encryption.helper.js';

const REPORTE_COLUMNS = `id, id_profesional, id_perteneciente, titulo, contenido, id_tipo,
  fecha_generacion, enviado_al_tutor, fecha_envio`;

export default class ReporteProfesionalRepository {
  constructor() {
    console.log('Estoy en: ReporteProfesionalRepository.constructor()');
  }

  createAsync = async (entity) => {
    console.log(`ReporteProfesionalRepository.createAsync(${JSON.stringify({ ...entity, contenido: `[${entity?.contenido?.length ?? 0} chars]` })})`);
    const sql = `
      INSERT INTO reportes_profesionales (id_profesional, id_perteneciente, titulo, contenido, id_tipo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ${REPORTE_COLUMNS}
    `;
    const values = [entity?.id_profesional, entity?.id_perteneciente, entity?.titulo, encryptField(entity?.contenido), entity?.id_tipo ?? 'manual'];
    return decryptFieldInRow(await BD.queryOne(sql, values), 'contenido');
  };

  getByIdAsync = async (id) => {
    console.log(`ReporteProfesionalRepository.getByIdAsync(${id})`);
    const sql = `SELECT ${REPORTE_COLUMNS} FROM reportes_profesionales WHERE id = $1`;
    return decryptFieldInRow(await BD.queryOne(sql, [id]), 'contenido');
  };

  getByProfesionalIdAsync = async (idProfesional, idPerteneciente = null) => {
    console.log(`ReporteProfesionalRepository.getByProfesionalIdAsync(${idProfesional}, ${idPerteneciente})`);
    if (idPerteneciente) {
      const sql = `SELECT ${REPORTE_COLUMNS} FROM reportes_profesionales WHERE id_profesional = $1 AND id_perteneciente = $2 ORDER BY fecha_generacion DESC`;
      return decryptFieldInRows(await BD.query(sql, [idProfesional, idPerteneciente]), 'contenido');
    }
    const sql = `SELECT ${REPORTE_COLUMNS} FROM reportes_profesionales WHERE id_profesional = $1 ORDER BY fecha_generacion DESC`;
    return decryptFieldInRows(await BD.query(sql, [idProfesional]), 'contenido');
  };

  /** Reportes enviados a un tutor: recorre pertenecientes -> vinculos_tutor_pertenecientes -> tutores. */
  getByTutorUserIdAsync = async (idUsuarioTutor) => {
    console.log(`ReporteProfesionalRepository.getByTutorUserIdAsync(${idUsuarioTutor})`);
    const sql = `
      SELECT r.id, r.id_profesional, r.id_perteneciente, r.titulo, r.contenido, r.id_tipo,
             r.fecha_generacion, r.enviado_al_tutor, r.fecha_envio,
             up.nombre AS profesional_nombre,
             upp.nombre AS paciente_nombre
      FROM reportes_profesionales r
      JOIN vinculos_tutor_pertenecientes vtp ON vtp.id_perteneciente = r.id_perteneciente AND vtp.fecha_fin IS NULL
      JOIN tutores t ON t.id = vtp.id_tutor
      JOIN profesionales p ON p.id = r.id_profesional
      JOIN usuarios up ON up.id = p.id_usuario
      JOIN pertenecientes pe ON pe.id = r.id_perteneciente
      JOIN usuarios upp ON upp.id = pe.id_usuario
      WHERE t.id_usuario = $1 AND r.enviado_al_tutor = true
      ORDER BY r.fecha_generacion DESC
    `;
    return decryptFieldInRows(await BD.query(sql, [idUsuarioTutor]), 'contenido');
  };

  markSentAsync = async (id) => {
    console.log(`ReporteProfesionalRepository.markSentAsync(${id})`);
    const sql = `UPDATE reportes_profesionales SET enviado_al_tutor = true, fecha_envio = $2 WHERE id = $1 RETURNING ${REPORTE_COLUMNS}`;
    return decryptFieldInRow(await BD.queryOne(sql, [id, new Date()]), 'contenido');
  };
}
