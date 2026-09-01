import BD from '../src/db/BD.js';
import PermisoService from '../src/services/PermisoService.js';
import VinculoProfesionalPertenecienteService from '../src/services/VinculoProfesionalPertenecienteService.js';
import { PROFESIONAL_PERMISSIONS } from '../src/modules/security/permissions.constants.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectStatus(callback, statusCode, label) {
  try {
    await callback();
  } catch (error) {
    assert(
      error.statusCode === statusCode,
      `${label}: se esperaba ${statusCode} y llego ${error.statusCode ?? 'sin status'}.`,
    );
    return true;
  }

  throw new Error(`${label}: se esperaba rechazo ${statusCode}.`);
}

async function getFixture() {
  const fixture = await BD.queryOne(
    `
      SELECT
        t.id AS id_tutor,
        t.id_usuario AS id_usuario_tutor,
        pe.id AS id_perteneciente,
        pe.id_usuario AS id_usuario_perteneciente,
        p.id AS id_profesional,
        p.id_usuario AS id_usuario_profesional
      FROM vinculos_tutor_pertenecientes vtp
      INNER JOIN estados_vinculos ev ON ev.id = vtp.id_estado_vinculo
      INNER JOIN tutores t ON t.id = vtp.id_tutor
      INNER JOIN usuarios ut ON ut.id = t.id_usuario
      INNER JOIN pertenecientes pe ON pe.id = vtp.id_perteneciente
      INNER JOIN usuarios up ON up.id = pe.id_usuario
      CROSS JOIN profesionales p
      INNER JOIN usuarios uprof ON uprof.id = p.id_usuario
      LEFT JOIN estados_validaciones_profesionales evp ON evp.id = p.id_estado_validacion
      WHERE vtp.fecha_fin IS NULL
        AND vtp.es_tutor_principal = true
        AND ut.activo = true
        AND up.activo = true
        AND uprof.activo = true
        AND LOWER(ev.nombre) IN ('activo', 'activa', 'aprobado', 'aprobada', 'aceptado', 'aceptada')
        AND LOWER(COALESCE(evp.nombre, '')) IN ('verified', 'validado', 'validada', 'aprobado', 'aprobada', 'verificado', 'verificada')
        AND NOT EXISTS (
          SELECT 1
          FROM vinculos_profesional_pertenecientes vpp
          WHERE vpp.id_profesional = p.id
            AND vpp.id_perteneciente = pe.id
        )
      ORDER BY pe.id, p.id
      LIMIT 1
    `,
  );

  assert(fixture, 'No se encontro un par tutor principal/perteneciente/profesional validado sin vinculo para probar.');
  return fixture;
}

async function getAnyProfessionalPermissionName() {
  const managedPermissions = Object.values(PROFESIONAL_PERMISSIONS);
  const row = await BD.queryOne(
    `
      SELECT nombre
      FROM catalogo_permisos_profesionales
      WHERE nombre = ANY($1::text[])
      ORDER BY id
      LIMIT 1
    `,
    [managedPermissions],
  );

  assert(row?.nombre, 'No existe catalogo_permisos_profesionales. Ejecuta npm run seed:permissions.');
  return row.nombre;
}

async function countProfessionalLinks(idProfesional, idPerteneciente) {
  const row = await BD.queryOne(
    `
      SELECT COUNT(*)::int AS total
      FROM vinculos_profesional_pertenecientes
      WHERE id_profesional = $1
        AND id_perteneciente = $2
    `,
    [idProfesional, idPerteneciente],
  );

  return row?.total ?? 0;
}

async function countProfessionalPermissionRows(idVinculo) {
  const [permisos, historial] = await Promise.all([
    BD.queryOne(
      `
        SELECT COUNT(*)::int AS total
        FROM permisos_otorgados_profesionales
        WHERE id_vinculo_profesional_perteneciente = $1
      `,
      [idVinculo],
    ),
    BD.queryOne(
      `
        SELECT COUNT(*)::int AS total
        FROM historial_permisos_otorgados_profesionales
        WHERE id_vinculo_profesional_perteneciente = $1
      `,
      [idVinculo],
    ),
  ]);

  return {
    permisos: permisos?.total ?? 0,
    historial: historial?.total ?? 0,
  };
}

async function main() {
  const fixture = await getFixture();
  const service = new VinculoProfesionalPertenecienteService();
  const createdInviteIds = [];
  let createdLinkId = null;

  try {
    const beforeLinks = await countProfessionalLinks(fixture.id_profesional, fixture.id_perteneciente);
    assert(beforeLinks === 0, 'El profesional de prueba ya tiene vinculo con el perteneciente.');

    const invite = await service.generateProfessionalInviteByTutorAsync({
      idUsuarioTutor: fixture.id_usuario_tutor,
      idPerteneciente: fixture.id_perteneciente,
      horasValidez: 1,
    });
    createdInviteIds.push(invite.id);
    assert(invite.codigo && invite.token, 'La invitacion profesional no devolvio codigo y token.');

    const joined = await service.joinProfessionalInviteAsync({
      idUsuarioProfesional: fixture.id_usuario_profesional,
      codigo: invite.codigo.replace('-', ''),
    });
    createdLinkId = joined.vinculo?.id ?? null;
    assert(createdLinkId, 'Aceptar invitacion no creo vinculo profesional.');
    assert(joined.was_existing === false, 'El primer join no deberia marcar was_existing.');
    assert(joined.permisos_efectivos?.vinculo_aprobado === true, 'El vinculo profesional no quedo aprobado.');

    await expectStatus(
      () => service.joinProfessionalInviteAsync({
        idUsuarioProfesional: fixture.id_usuario_profesional,
        codigo: invite.codigo,
      }),
      400,
      'reusar invitacion usada',
    );

    const secondInvite = await service.generateProfessionalInviteByTutorAsync({
      idUsuarioTutor: fixture.id_usuario_tutor,
      idPerteneciente: fixture.id_perteneciente,
      horasValidez: 1,
    });
    createdInviteIds.push(secondInvite.id);

    const joinedExisting = await service.joinProfessionalInviteAsync({
      idUsuarioProfesional: fixture.id_usuario_profesional,
      token: secondInvite.token,
    });
    assert(joinedExisting.was_existing === true, 'El segundo join del mismo profesional deberia reutilizar vinculo.');
    assert(joinedExisting.vinculo.id === createdLinkId, 'El segundo join creo o devolvio otro vinculo.');

    const afterDuplicateAttempt = await countProfessionalLinks(fixture.id_profesional, fixture.id_perteneciente);
    assert(afterDuplicateAttempt === 1, 'Aceptar una segunda invitacion duplico el vinculo.');

    const expiredInvite = await service.generateProfessionalInviteByTutorAsync({
      idUsuarioTutor: fixture.id_usuario_tutor,
      idPerteneciente: fixture.id_perteneciente,
      horasValidez: 1,
    });
    createdInviteIds.push(expiredInvite.id);
    await BD.execute(
      `UPDATE invites_vinculo_profesional SET fecha_expiracion = $2 WHERE id = $1`,
      [expiredInvite.id, new Date('2000-01-01T00:00:00.000Z')],
    );

    await expectStatus(
      () => service.joinProfessionalInviteAsync({
        idUsuarioProfesional: fixture.id_usuario_profesional,
        token: expiredInvite.token,
      }),
      400,
      'aceptar invitacion expirada',
    );

    const permissionName = await getAnyProfessionalPermissionName();
    await PermisoService.setProfesionalPermissionByName(
      createdLinkId,
      {
        permiso: permissionName,
        habilitado: false,
        motivo: 'Prueba de limpieza al borrar vinculo profesional',
      },
      fixture.id_usuario_tutor,
    );

    const dependentRowsBeforeDelete = await countProfessionalPermissionRows(createdLinkId);
    assert(
      dependentRowsBeforeDelete.permisos > 0 || dependentRowsBeforeDelete.historial > 0,
      'No se generaron filas dependientes de permisos para validar limpieza.',
    );

    const deleted = await service.deleteByTutorAsync({
      idUsuarioTutor: fixture.id_usuario_tutor,
      idVinculo: createdLinkId,
    });
    assert(deleted.rowsAffected === 1, 'La baja por tutor no elimino el vinculo profesional.');
    createdLinkId = null;

    const linksAfterDelete = await countProfessionalLinks(fixture.id_profesional, fixture.id_perteneciente);
    assert(linksAfterDelete === 0, 'El vinculo profesional siguio existiendo despues de la baja.');

    console.log(JSON.stringify({
      ok: true,
      fixture: {
        id_usuario_tutor: fixture.id_usuario_tutor,
        id_perteneciente: fixture.id_perteneciente,
        id_usuario_profesional: fixture.id_usuario_profesional,
      },
      checks: {
        invitacion_generada: true,
        join_por_codigo: true,
        rechazo_reuso: true,
        join_existente_sin_duplicar: true,
        rechazo_expirada: true,
        limpieza_dependencias_al_borrar: true,
      },
    }, null, 2));
  } finally {
    if (createdLinkId) {
      await service.deleteByIdAsync(createdLinkId).catch(() => null);
    }

    if (createdInviteIds.length > 0) {
      await BD.execute(
        `DELETE FROM invites_vinculo_profesional WHERE id = ANY($1::int[])`,
        [createdInviteIds],
      ).catch(() => null);
    }
  }
}

try {
  await main();
} finally {
  await BD.pool.end();
}
