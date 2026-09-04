import BD from '../db/BD.js';

const PROFILE_COLUMNS = `id, id_profesional, descripcion, experiencia, precio_sesion,
  informacion_precio, visible_en_tienda, modalidad, disponibilidad,
  correo_contacto, whatsapp_contacto, publicar_correo, publicar_whatsapp`;

export default class PerfilProfesionalRepository {
  getByIdAsync = async (id) => BD.queryOne(
    `SELECT ${PROFILE_COLUMNS} FROM perfiles_profesionales WHERE id = $1`, [id],
  );

  getByProfessionalIdAsync = async (idProfessional) => BD.queryOne(
    `SELECT ${PROFILE_COLUMNS} FROM perfiles_profesionales WHERE id_profesional = $1`, [idProfessional],
  );

  upsertForProfessionalAsync = async (idProfessional, entity) => BD.queryOne(`
    INSERT INTO perfiles_profesionales (
      id_profesional, descripcion, experiencia, precio_sesion, informacion_precio,
      visible_en_tienda, modalidad, disponibilidad, correo_contacto,
      whatsapp_contacto, publicar_correo, publicar_whatsapp
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id_profesional) DO UPDATE SET
      descripcion = EXCLUDED.descripcion, experiencia = EXCLUDED.experiencia,
      precio_sesion = EXCLUDED.precio_sesion, informacion_precio = EXCLUDED.informacion_precio,
      visible_en_tienda = EXCLUDED.visible_en_tienda, modalidad = EXCLUDED.modalidad,
      disponibilidad = EXCLUDED.disponibilidad, correo_contacto = EXCLUDED.correo_contacto,
      whatsapp_contacto = EXCLUDED.whatsapp_contacto, publicar_correo = EXCLUDED.publicar_correo,
      publicar_whatsapp = EXCLUDED.publicar_whatsapp
    RETURNING ${PROFILE_COLUMNS}
  `, [
    idProfessional, entity.descripcion, entity.experiencia, entity.precio_sesion,
    entity.informacion_precio, entity.visible_en_tienda, entity.modalidad,
    entity.disponibilidad, entity.correo_contacto, entity.whatsapp_contacto,
    entity.publicar_correo, entity.publicar_whatsapp,
  ]);

  getDirectoryAsync = async () => BD.query(`
    SELECT pf.id, p.id AS id_profesional,
      CONCAT_WS(' ', u.nombre, u.apellido) AS nombre,
      p.profesion, p.especialidad, p.institucion,
      pf.descripcion, pf.experiencia, pf.precio_sesion, pf.informacion_precio,
      pf.modalidad, pf.disponibilidad,
      CASE WHEN pf.publicar_correo THEN pf.correo_contacto ELSE NULL END AS correo_contacto,
      CASE WHEN pf.publicar_whatsapp THEN pf.whatsapp_contacto ELSE NULL END AS whatsapp_contacto
    FROM perfiles_profesionales pf
    INNER JOIN profesionales p ON p.id = pf.id_profesional
    INNER JOIN usuarios u ON u.id = p.id_usuario AND u.activo = TRUE
    INNER JOIN estados_validaciones_profesionales ev ON ev.id = p.id_estado_validacion
    WHERE pf.visible_en_tienda = TRUE
      AND LOWER(ev.nombre) IN ('verified', 'validado', 'aprobado', 'verificado', 'verificada')
    ORDER BY u.apellido NULLS LAST, u.nombre NULLS LAST
  `);
}
