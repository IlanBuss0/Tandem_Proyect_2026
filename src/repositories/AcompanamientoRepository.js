import BD from '../db/BD.js';

const AUTHOR_SQL = `
  SELECT u.id AS id_usuario, COALESCE(NULLIF(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), u.nombre_usuario) AS autor_nombre,
         CASE WHEN p.id IS NOT NULL THEN 'Profesional' WHEN t.id IS NOT NULL THEN 'Tutor' ELSE 'Red de apoyo' END AS autor_rol
  FROM usuarios u
  LEFT JOIN profesionales p ON p.id_usuario = u.id
  LEFT JOIN tutores t ON t.id_usuario = u.id
`;

export default class AcompanamientoRepository {
  getSharedNotesAsync = async (idPerteneciente) => BD.query(`
    SELECT n.id, n.id_perteneciente, n.id_usuario_autor, n.contenido,
           n.fecha_creacion, n.fecha_actualizacion,
           a.autor_nombre, a.autor_rol
    FROM acompanamiento_notas_compartidas n
    JOIN (${AUTHOR_SQL}) a ON a.id_usuario = n.id_usuario_autor
    WHERE n.id_perteneciente = $1
    ORDER BY n.fecha_creacion DESC
  `, [idPerteneciente]);

  createSharedNoteAsync = async ({ idPerteneciente, idUsuarioAutor, contenido }) => BD.queryOne(`
    INSERT INTO acompanamiento_notas_compartidas (id_perteneciente, id_usuario_autor, contenido)
    VALUES ($1, $2, $3)
    RETURNING id, id_perteneciente, id_usuario_autor, contenido, fecha_creacion, fecha_actualizacion
  `, [idPerteneciente, idUsuarioAutor, contenido]);

  deleteSharedNoteAsync = async (id, idPerteneciente) => BD.execute(
    'DELETE FROM acompanamiento_notas_compartidas WHERE id = $1 AND id_perteneciente = $2',
    [id, idPerteneciente],
  );

  getObjectivesAsync = async (idPerteneciente) => BD.query(`
    SELECT id, id_perteneciente, id_usuario_creador, titulo, descripcion, estado, progreso,
           fecha_creacion, fecha_actualizacion
    FROM acompanamiento_objetivos
    WHERE id_perteneciente = $1
    ORDER BY CASE estado WHEN 'activo' THEN 0 WHEN 'pausado' THEN 1 ELSE 2 END, fecha_actualizacion DESC
  `, [idPerteneciente]);

  createObjectiveAsync = async ({ idPerteneciente, idUsuarioCreador, titulo, descripcion }) => BD.queryOne(`
    INSERT INTO acompanamiento_objetivos (id_perteneciente, id_usuario_creador, titulo, descripcion)
    VALUES ($1, $2, $3, $4)
    RETURNING id, id_perteneciente, id_usuario_creador, titulo, descripcion, estado, progreso, fecha_creacion, fecha_actualizacion
  `, [idPerteneciente, idUsuarioCreador, titulo, descripcion || null]);

  updateObjectiveAsync = async ({ id, idPerteneciente, titulo, descripcion, estado, progreso }) => BD.queryOne(`
    UPDATE acompanamiento_objetivos
    SET titulo = COALESCE($3, titulo), descripcion = COALESCE($4, descripcion),
        estado = COALESCE($5, estado), progreso = COALESCE($6, progreso), fecha_actualizacion = NOW()
    WHERE id = $1 AND id_perteneciente = $2
    RETURNING id, id_perteneciente, id_usuario_creador, titulo, descripcion, estado, progreso, fecha_creacion, fecha_actualizacion
  `, [id, idPerteneciente, titulo || null, descripcion ?? null, estado || null, progreso ?? null]);

  deleteObjectiveAsync = async (id, idPerteneciente) => BD.execute(
    'DELETE FROM acompanamiento_objetivos WHERE id = $1 AND id_perteneciente = $2',
    [id, idPerteneciente],
  );

  getAgreementsAsync = async (idPerteneciente) => BD.query(`
    SELECT id, id_perteneciente, id_usuario_creador, texto, completado, fecha_creacion, fecha_actualizacion
    FROM acompanamiento_acuerdos
    WHERE id_perteneciente = $1
    ORDER BY completado ASC, fecha_creacion DESC
  `, [idPerteneciente]);

  createAgreementAsync = async ({ idPerteneciente, idUsuarioCreador, texto }) => BD.queryOne(`
    INSERT INTO acompanamiento_acuerdos (id_perteneciente, id_usuario_creador, texto)
    VALUES ($1, $2, $3)
    RETURNING id, id_perteneciente, id_usuario_creador, texto, completado, fecha_creacion, fecha_actualizacion
  `, [idPerteneciente, idUsuarioCreador, texto]);

  updateAgreementAsync = async ({ id, idPerteneciente, texto, completado }) => BD.queryOne(`
    UPDATE acompanamiento_acuerdos
    SET texto = COALESCE($3, texto), completado = COALESCE($4, completado), fecha_actualizacion = NOW()
    WHERE id = $1 AND id_perteneciente = $2
    RETURNING id, id_perteneciente, id_usuario_creador, texto, completado, fecha_creacion, fecha_actualizacion
  `, [id, idPerteneciente, texto || null, completado ?? null]);

  deleteAgreementAsync = async (id, idPerteneciente) => BD.execute(
    'DELETE FROM acompanamiento_acuerdos WHERE id = $1 AND id_perteneciente = $2',
    [id, idPerteneciente],
  );
}
