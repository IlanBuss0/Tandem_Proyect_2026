import BD from '../db/BD.js';

class AuthorizationRepository {
  getUsuarioById = async (idUsuario) => {
    return await BD.queryOne(
      `
        SELECT id, id_tipo_usuario, nombre_usuario, nombre, apellido, correo, activo
        FROM usuarios
        WHERE id = $1
      `,
      [idUsuario],
    );
  };

  getPertenecienteByUsuarioId = async (idUsuario) => {
    return await BD.queryOne(
      `
        SELECT p.id, p.id_usuario, p.puede_autogestionarse
        FROM pertenecientes p
        INNER JOIN usuarios u ON u.id = p.id_usuario
        WHERE p.id_usuario = $1
          AND u.activo = true
        LIMIT 1
      `,
      [idUsuario],
    );
  };

  getTutorById = async (id) => {
    return await BD.queryOne(
      `SELECT id, id_usuario FROM tutores WHERE id = $1`,
      [id],
    );
  };

  getTutorByUsuarioId = async (idUsuario) => {
    return await BD.queryOne(
      `
        SELECT t.id, t.id_usuario
        FROM tutores t
        INNER JOIN usuarios u ON u.id = t.id_usuario
        WHERE t.id_usuario = $1
          AND u.activo = true
        LIMIT 1
      `,
      [idUsuario],
    );
  };

  getProfesionalByUsuarioId = async (idUsuario) => {
    return await BD.queryOne(
      `
        SELECT p.id, p.id_usuario, p.id_estado_validacion
        FROM profesionales p
        INNER JOIN usuarios u ON u.id = p.id_usuario
        WHERE p.id_usuario = $1
          AND u.activo = true
        LIMIT 1
      `,
      [idUsuario],
    );
  };

  getTutorPertenecientes = async (idTutor) => {
    return await BD.query(
      `
        SELECT
          vtp.id AS id_vinculo_tutor_perteneciente,
          vtp.id_tutor,
          vtp.id_perteneciente,
          vtp.es_tutor_principal,
          vtp.id_estado_vinculo,
          ev.nombre AS estado_vinculo,
          vtp.fecha_alta,
          vtp.fecha_fin,
          pe.id_usuario AS id_usuario_perteneciente,
          pe.id_nivel_apoyo,
          pe.id_autonomia_operativa,
          pe.puede_autogestionarse,
          pe.observacion_general,
          u.nombre_usuario,
          u.nombre,
          u.apellido,
          u.correo,
          u.activo AS usuario_activo
        FROM vinculos_tutor_pertenecientes vtp
        INNER JOIN estados_vinculos ev ON ev.id = vtp.id_estado_vinculo
        INNER JOIN pertenecientes pe ON pe.id = vtp.id_perteneciente
        INNER JOIN usuarios u ON u.id = pe.id_usuario
        WHERE vtp.id_tutor = $1
          AND vtp.fecha_fin IS NULL
          AND u.activo = true
          AND LOWER(ev.nombre) IN ('activo', 'activa', 'aprobado', 'aprobada', 'aceptado', 'aceptada')
        ORDER BY vtp.es_tutor_principal DESC, pe.id ASC
      `,
      [idTutor],
    );
  };

  getProfesionalVinculos = async (idProfesional) => {
    return await BD.query(
      `
        SELECT
          vpp.id AS id_vinculo_profesional_perteneciente,
          vpp.id_profesional,
          vpp.id_perteneciente,
          vpp.id_estado_vinculo,
          ev.nombre AS estado_vinculo,
          vpp.requiere_aprobacion_tutor,
          vpp.fue_aprobado_por_tutor,
          vpp.id_tutor_aprobador,
          vpp.fecha_solicitud,
          vpp.fecha_resolucion,
          pe.id_usuario AS id_usuario_perteneciente,
          pe.id_nivel_apoyo,
          pe.id_autonomia_operativa,
          pe.puede_autogestionarse,
          pe.observacion_general,
          u.nombre_usuario,
          u.nombre,
          u.apellido,
          u.correo,
          u.activo AS usuario_activo
        FROM vinculos_profesional_pertenecientes vpp
        INNER JOIN estados_vinculos ev ON ev.id = vpp.id_estado_vinculo
        INNER JOIN pertenecientes pe ON pe.id = vpp.id_perteneciente
        INNER JOIN usuarios u ON u.id = pe.id_usuario
        WHERE vpp.id_profesional = $1
          AND u.activo = true
        ORDER BY vpp.id DESC
      `,
      [idProfesional],
    );
  };

  getProfesionalVinculosByPertenecienteId = async (idPerteneciente) => {
    return await BD.query(
      `
        SELECT
          vpp.id AS id_vinculo_profesional_perteneciente,
          vpp.id_profesional,
          vpp.id_perteneciente,
          vpp.id_estado_vinculo,
          ev.nombre AS estado_vinculo,
          vpp.requiere_aprobacion_tutor,
          vpp.fue_aprobado_por_tutor,
          vpp.id_tutor_aprobador,
          vpp.fecha_solicitud,
          vpp.fecha_resolucion,
          p.id_usuario AS id_usuario_profesional,
          p.profesion,
          p.especialidad,
          p.matricula,
          p.institucion,
          p.id_estado_validacion,
          evp.nombre AS estado_validacion_profesional,
          u.nombre_usuario,
          u.nombre,
          u.apellido,
          u.correo,
          u.activo AS usuario_activo
        FROM vinculos_profesional_pertenecientes vpp
        INNER JOIN estados_vinculos ev ON ev.id = vpp.id_estado_vinculo
        INNER JOIN profesionales p ON p.id = vpp.id_profesional
        INNER JOIN usuarios u ON u.id = p.id_usuario
        LEFT JOIN estados_validaciones_profesionales evp ON evp.id = p.id_estado_validacion
        WHERE vpp.id_perteneciente = $1
          AND u.activo = true
        ORDER BY vpp.id DESC
      `,
      [idPerteneciente],
    );
  };

  getPertenecienteById = async (idPerteneciente) => {
    return await BD.queryOne(
      `
        SELECT p.id, p.id_usuario, p.puede_autogestionarse, u.activo AS usuario_activo
        FROM pertenecientes p
        INNER JOIN usuarios u ON u.id = p.id_usuario
        WHERE p.id = $1
      `,
      [idPerteneciente],
    );
  };

  getPertenecienteByDispositivoId = async (idDispositivo) => {
    return await BD.queryOne(
      `
        SELECT
          pe.id,
          pe.id_usuario,
          pe.puede_autogestionarse,
          u.activo AS usuario_activo
        FROM dispositivos d
        INNER JOIN usuarios u ON u.id = d.id_usuario
        INNER JOIN pertenecientes pe ON pe.id_usuario = u.id
        WHERE d.id = $1
          AND d.activo = true
        LIMIT 1
      `,
      [idDispositivo],
    );
  };

  getPertenecienteByUbicacionActualId = async (idUbicacion) => {
    return await BD.queryOne(
      `
        SELECT
          pe.id,
          pe.id_usuario,
          pe.puede_autogestionarse,
          u.activo AS usuario_activo
        FROM ubicaciones_actuales ua
        INNER JOIN dispositivos d ON d.id = ua.id_dispositivo
        INNER JOIN usuarios u ON u.id = d.id_usuario
        INNER JOIN pertenecientes pe ON pe.id_usuario = u.id
        WHERE ua.id = $1
          AND d.activo = true
        LIMIT 1
      `,
      [idUbicacion],
    );
  };

  getPertenecienteByUbicacionHistorialId = async (idUbicacion) => {
    return await BD.queryOne(
      `
        SELECT
          pe.id,
          pe.id_usuario,
          pe.puede_autogestionarse,
          u.activo AS usuario_activo
        FROM ubicaciones_historiales uh
        INNER JOIN dispositivos d ON d.id = uh.id_dispositivo
        INNER JOIN usuarios u ON u.id = d.id_usuario
        INNER JOIN pertenecientes pe ON pe.id_usuario = u.id
        WHERE uh.id = $1
          AND d.activo = true
        LIMIT 1
      `,
      [idUbicacion],
    );
  };

  getPertenecienteByZonaSeguraId = async (idZonaSegura) => {
    return await BD.queryOne(
      `
        SELECT
          pe.id,
          pe.id_usuario,
          pe.puede_autogestionarse,
          u.activo AS usuario_activo
        FROM zonas_seguras zs
        INNER JOIN pertenecientes pe ON pe.id = zs.id_perteneciente
        INNER JOIN usuarios u ON u.id = pe.id_usuario
        WHERE zs.id = $1
        LIMIT 1
      `,
      [idZonaSegura],
    );
  };

  getVinculoProfesionalById = async (idVinculo) => {
    return await BD.queryOne(
      `
        SELECT
          vpp.id,
          vpp.id_profesional,
          vpp.id_perteneciente,
          vpp.id_estado_vinculo,
          ev.nombre AS estado_vinculo,
          vpp.requiere_aprobacion_tutor,
          vpp.fue_aprobado_por_tutor,
          vpp.id_tutor_aprobador,
          p.id_estado_validacion,
          evp.nombre AS estado_validacion_profesional,
          up.activo AS usuario_profesional_activo,
          upe.activo AS usuario_perteneciente_activo
        FROM vinculos_profesional_pertenecientes vpp
        INNER JOIN estados_vinculos ev ON ev.id = vpp.id_estado_vinculo
        INNER JOIN profesionales p ON p.id = vpp.id_profesional
        INNER JOIN usuarios up ON up.id = p.id_usuario
        INNER JOIN pertenecientes pe ON pe.id = vpp.id_perteneciente
        INNER JOIN usuarios upe ON upe.id = pe.id_usuario
        LEFT JOIN estados_validaciones_profesionales evp ON evp.id = p.id_estado_validacion
        WHERE vpp.id = $1
        LIMIT 1
      `,
      [idVinculo],
    );
  };

  getProfessionalPertenecienteChatContext = async (idChat, idUsuarioEmisor) => {
    return await BD.queryOne(
      `
        WITH participantes_activos AS (
          SELECT id_chat, id_usuario
          FROM participantes_chats
          WHERE id_chat = $1
            AND fecha_salida IS NULL
        ),
        chat_directo AS (
          SELECT id_chat
          FROM participantes_activos
          GROUP BY id_chat
          HAVING COUNT(*) = 2
        )
        SELECT
          pa_sender.id_usuario AS id_usuario_emisor,
          prof.id AS id_profesional,
          prof.id_usuario AS id_usuario_profesional,
          pe.id AS id_perteneciente,
          pe.id_usuario AS id_usuario_perteneciente,
          CASE
            WHEN prof.id_usuario = pa_sender.id_usuario THEN 'profesional'
            WHEN pe.id_usuario = pa_sender.id_usuario THEN 'perteneciente'
            ELSE NULL
          END AS emisor_tipo
        FROM chat_directo cd
        INNER JOIN participantes_activos pa_sender
          ON pa_sender.id_chat = cd.id_chat
         AND pa_sender.id_usuario = $2
        INNER JOIN participantes_activos pa_other
          ON pa_other.id_chat = cd.id_chat
         AND pa_other.id_usuario <> pa_sender.id_usuario
        INNER JOIN profesionales prof
          ON prof.id_usuario IN (pa_sender.id_usuario, pa_other.id_usuario)
        INNER JOIN pertenecientes pe
          ON pe.id_usuario IN (pa_sender.id_usuario, pa_other.id_usuario)
        LIMIT 1
      `,
      [idChat, idUsuarioEmisor],
    );
  };

  getApprovedProfessionalLink = async (idProfesional, idPerteneciente) => {
    return await BD.queryOne(
      `
        SELECT
          vpp.id,
          vpp.id_profesional,
          vpp.id_perteneciente,
          vpp.id_estado_vinculo,
          ev.nombre AS estado_vinculo,
          vpp.requiere_aprobacion_tutor,
          vpp.fue_aprobado_por_tutor,
          vpp.id_tutor_aprobador,
          evp.nombre AS estado_validacion_profesional,
          up.activo AS usuario_profesional_activo,
          upe.activo AS usuario_perteneciente_activo
        FROM vinculos_profesional_pertenecientes vpp
        INNER JOIN estados_vinculos ev ON ev.id = vpp.id_estado_vinculo
        INNER JOIN profesionales p ON p.id = vpp.id_profesional
        INNER JOIN usuarios up ON up.id = p.id_usuario
        INNER JOIN pertenecientes pe ON pe.id = vpp.id_perteneciente
        INNER JOIN usuarios upe ON upe.id = pe.id_usuario
        LEFT JOIN estados_validaciones_profesionales evp ON evp.id = p.id_estado_validacion
        WHERE vpp.id_profesional = $1
          AND vpp.id_perteneciente = $2
        ORDER BY vpp.id DESC
        LIMIT 1
      `,
      [idProfesional, idPerteneciente],
    );
  };

  getApprovedProfessionalLinks = async (idProfesional) => {
    return await BD.query(
      `
        SELECT
          vpp.id,
          vpp.id_profesional,
          vpp.id_perteneciente,
          vpp.id_estado_vinculo,
          ev.nombre AS estado_vinculo,
          vpp.requiere_aprobacion_tutor,
          vpp.fue_aprobado_por_tutor,
          vpp.id_tutor_aprobador,
          evp.nombre AS estado_validacion_profesional,
          up.activo AS usuario_profesional_activo,
          upe.activo AS usuario_perteneciente_activo
        FROM vinculos_profesional_pertenecientes vpp
        INNER JOIN estados_vinculos ev ON ev.id = vpp.id_estado_vinculo
        INNER JOIN profesionales p ON p.id = vpp.id_profesional
        INNER JOIN usuarios up ON up.id = p.id_usuario
        INNER JOIN pertenecientes pe ON pe.id = vpp.id_perteneciente
        INNER JOIN usuarios upe ON upe.id = pe.id_usuario
        LEFT JOIN estados_validaciones_profesionales evp ON evp.id = p.id_estado_validacion
        WHERE vpp.id_profesional = $1
        ORDER BY vpp.id DESC
      `,
      [idProfesional],
    );
  };

  getUsuarioIdByPertenecienteId = async (idPerteneciente) => {
    const row = await BD.queryOne(
      `
        SELECT p.id_usuario
        FROM pertenecientes p
        WHERE p.id = $1
      `,
      [idPerteneciente],
    );
    return row?.id_usuario ?? null;
  };

  getUsuarioIdByVinculoProfesionalId = async (idVinculoProfesionalPerteneciente) => {
    const row = await BD.queryOne(
      `
        SELECT u.id AS id_usuario
        FROM vinculos_profesional_pertenecientes vpp
        INNER JOIN pertenecientes p ON p.id = vpp.id_perteneciente
        INNER JOIN usuarios u ON u.id = p.id_usuario
        WHERE vpp.id = $1
      `,
      [idVinculoProfesionalPerteneciente],
    );
    return row?.id_usuario ?? null;
  };

  isTutorPrincipalForPerteneciente = async (idTutor, idPerteneciente) => {
    const row = await BD.queryOne(
      `
        SELECT vtp.id
        FROM vinculos_tutor_pertenecientes vtp
        WHERE vtp.id_tutor = $1
          AND vtp.id_perteneciente = $2
          AND vtp.es_tutor_principal = true
          AND vtp.fecha_fin IS NULL
        LIMIT 1
      `,
      [idTutor, idPerteneciente],
    );

    return Boolean(row);
  };

  isTutorActivoForPerteneciente = async (idTutor, idPerteneciente) => {
    const row = await BD.queryOne(
      `
        SELECT vtp.id
        FROM vinculos_tutor_pertenecientes vtp
        INNER JOIN estados_vinculos ev ON ev.id = vtp.id_estado_vinculo
        INNER JOIN tutores t ON t.id = vtp.id_tutor
        INNER JOIN usuarios ut ON ut.id = t.id_usuario
        INNER JOIN pertenecientes p ON p.id = vtp.id_perteneciente
        INNER JOIN usuarios up ON up.id = p.id_usuario
        WHERE vtp.id_tutor = $1
          AND vtp.id_perteneciente = $2
          AND vtp.fecha_fin IS NULL
          AND ut.activo = true
          AND up.activo = true
          AND LOWER(ev.nombre) IN ('activo', 'activa', 'aprobado', 'aprobada', 'aceptado', 'aceptada')
        LIMIT 1
      `,
      [idTutor, idPerteneciente],
    );

    return Boolean(row);
  };

  getPertenecientePermission = async (idPerteneciente, nombrePermiso) => {
    return await BD.queryOne(
      `
        SELECT pop.habilitado
        FROM permisos_otorgados_pertenecientes pop
        INNER JOIN catalogo_permisos_pertenecientes cpp ON cpp.id = pop.id_permiso_perteneciente
        WHERE pop.id_perteneciente = $1
          AND LOWER(cpp.nombre) = LOWER($2)
        ORDER BY pop.fecha_modificacion DESC NULLS LAST, pop.id DESC
        LIMIT 1
      `,
      [idPerteneciente, nombrePermiso],
    );
  };

  getProfesionalPermission = async (idVinculoProfesionalPerteneciente, nombrePermiso) => {
    return await BD.queryOne(
      `
        SELECT pop.habilitado
        FROM permisos_otorgados_profesionales pop
        INNER JOIN catalogo_permisos_profesionales cpp ON cpp.id = pop.id_permiso_profesional
        WHERE pop.id_vinculo_profesional_perteneciente = $1
          AND LOWER(cpp.nombre) = LOWER($2)
        ORDER BY pop.fecha_modificacion DESC NULLS LAST, pop.id DESC
        LIMIT 1
      `,
      [idVinculoProfesionalPerteneciente, nombrePermiso],
    );
  };

  // Versiones bulk de los dos metodos de arriba: traen TODOS los permisos
  // otorgados de un perteneciente / vinculo en 1 query en vez de una por
  // permiso. DISTINCT ON + el mismo ORDER BY que la version individual para
  // quedarse con la fila mas reciente si hubiera nombres duplicados en el
  // catalogo. Devuelven [{ nombre (en minuscula), habilitado }].
  getAllPertenecientePermissionsAsync = async (idPerteneciente) => {
    return await BD.query(
      `
        SELECT DISTINCT ON (LOWER(cpp.nombre))
               LOWER(cpp.nombre) AS nombre,
               pop.habilitado
        FROM permisos_otorgados_pertenecientes pop
        INNER JOIN catalogo_permisos_pertenecientes cpp ON cpp.id = pop.id_permiso_perteneciente
        WHERE pop.id_perteneciente = $1
        ORDER BY LOWER(cpp.nombre), pop.fecha_modificacion DESC NULLS LAST, pop.id DESC
      `,
      [idPerteneciente],
    );
  };

  getAllProfesionalPermissionsAsync = async (idVinculoProfesionalPerteneciente) => {
    return await BD.query(
      `
        SELECT DISTINCT ON (LOWER(cpp.nombre))
               LOWER(cpp.nombre) AS nombre,
               pop.habilitado
        FROM permisos_otorgados_profesionales pop
        INNER JOIN catalogo_permisos_profesionales cpp ON cpp.id = pop.id_permiso_profesional
        WHERE pop.id_vinculo_profesional_perteneciente = $1
        ORDER BY LOWER(cpp.nombre), pop.fecha_modificacion DESC NULLS LAST, pop.id DESC
      `,
      [idVinculoProfesionalPerteneciente],
    );
  };
}

export default new AuthorizationRepository();
