import AppError from '../modules/errors/AppError.js';
import AuthorizationRepository from '../repositories/AuthorizationRepository.js';
import { cacheService } from './CacheService.js';
import {
  AUTH_ACTIONS,
  PERTENECIENTE_DEFAULTS,
  PERTENECIENTE_PERMISSIONS,
  PROFESIONAL_DEFAULTS,
  PROFESIONAL_PERMISSIONS,
} from '../modules/security/permissions.constants.js';
import { isVerifiedProfessionalStatus } from '../modules/professional-verification/professional-status.js';

class AuthorizationService {
  async getUserContext(idUsuario) {
    const usuario = await AuthorizationRepository.getUsuarioById(idUsuario);
    if (!usuario?.activo) return null;

    const [perteneciente, tutor, profesional] = await Promise.all([
      AuthorizationRepository.getPertenecienteByUsuarioId(idUsuario),
      AuthorizationRepository.getTutorByUsuarioId(idUsuario),
      AuthorizationRepository.getProfesionalByUsuarioId(idUsuario),
    ]);

    return { usuario, perteneciente, tutor, profesional };
  }

  async getEffectivePertenecientePermissions(idPerteneciente) {
    const cacheKey = `auth.permisos.pert.${idPerteneciente}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const perteneciente = await AuthorizationRepository.getPertenecienteById(idPerteneciente);
    if (!perteneciente?.usuario_activo) throw new AppError('Perteneciente no encontrado o inactivo', 404);

    const mode = perteneciente.puede_autogestionarse ? 'AUTOGESTIONADO' : 'TUTELADO';
    const defaults = PERTENECIENTE_DEFAULTS[mode];
    const permisos = {};

    for (const [nombre, defaultValue] of Object.entries(defaults)) {
      const row = await AuthorizationRepository.getPertenecientePermission(idPerteneciente, nombre);
      permisos[nombre] = {
        habilitado: row?.habilitado ?? defaultValue,
        source: row ? 'otorgado' : 'default',
      };
    }

    const result = {
      id_perteneciente: idPerteneciente,
      puede_autogestionarse: perteneciente.puede_autogestionarse,
      mode,
      permisos,
    };

    await cacheService.set(cacheKey, result, 60);
    return result;
  }

  async getEffectiveProfesionalPermissions(idVinculoProfesionalPerteneciente) {
    const cacheKey = `auth.permisos.prof.${idVinculoProfesionalPerteneciente}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const vinculo = await AuthorizationRepository.getVinculoProfesionalById(idVinculoProfesionalPerteneciente);
    if (!vinculo) throw new AppError('Vinculo profesional-perteneciente no encontrado', 404);

    const permisos = {};
    for (const [nombre, defaultValue] of Object.entries(PROFESIONAL_DEFAULTS)) {
      const row = await AuthorizationRepository.getProfesionalPermission(idVinculoProfesionalPerteneciente, nombre);
      const resolvedDefault = await this.resolveProfesionalDefault(nombre, vinculo, defaultValue);
      permisos[nombre] = {
        habilitado: row?.habilitado ?? resolvedDefault,
        source: row ? 'otorgado' : 'default',
      };
    }

    const result = {
      id_vinculo_profesional_perteneciente: idVinculoProfesionalPerteneciente,
      vinculo_aprobado: this.isProfessionalLinkApproved(vinculo),
      permisos,
    };

    await cacheService.set(cacheKey, result, 60);
    return result;
  }

  async getPermissionContext(idUsuario) {
    const cacheKey = `auth.context.${idUsuario}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const userContext = await this.getUserContext(idUsuario);
    if (!userContext) throw new AppError('Usuario no encontrado o inactivo', 404);

    const roles = [];
    if (userContext.tutor) roles.push('Tutor');
    if (userContext.perteneciente) roles.push('Perteneciente');
    if (userContext.profesional) roles.push('Profesional');

    const data = {
      rol: roles[0] ?? 'Usuario',
      roles,
      usuario: userContext.usuario,
    };

    if (userContext.tutor) {
      const pertenecientes = await AuthorizationRepository.getTutorPertenecientes(userContext.tutor.id);
      data.tutor = userContext.tutor;
      data.pertenecientes = await Promise.all(pertenecientes.map(async (row) => {
        const profesionales = await AuthorizationRepository.getProfesionalVinculosByPertenecienteId(row.id_perteneciente);

        return {
          id: row.id_perteneciente,
          usuario: this.mapContextUsuario(row),
          perteneciente: this.mapContextPerteneciente(row),
          vinculo: this.mapContextTutorVinculo(row),
          permisos_efectivos: await this.getEffectivePertenecientePermissions(row.id_perteneciente),
          profesionales_vinculados: await Promise.all(profesionales.map(async (profesionalRow) => ({
            id_vinculo: profesionalRow.id_vinculo_profesional_perteneciente,
            profesional: this.mapContextProfesional(profesionalRow),
            vinculo: this.mapContextProfesionalVinculo(profesionalRow),
            permisos_efectivos: await this.getEffectiveProfesionalPermissions(
              profesionalRow.id_vinculo_profesional_perteneciente,
            ),
          }))),
        };
      }));
    }

    if (userContext.perteneciente) {
      data.perteneciente = {
        ...userContext.perteneciente,
        permisos_efectivos: await this.getEffectivePertenecientePermissions(userContext.perteneciente.id),
      };
    }

    if (userContext.profesional) {
      const vinculos = await AuthorizationRepository.getProfesionalVinculos(userContext.profesional.id);
      data.profesional = userContext.profesional;
      data.vinculos = await Promise.all(vinculos.map(async (row) => ({
        id_vinculo: row.id_vinculo_profesional_perteneciente,
        perteneciente: {
          id: row.id_perteneciente,
          usuario: this.mapContextUsuario(row),
          ...this.mapContextPerteneciente(row),
        },
        vinculo: this.mapContextProfesionalVinculo(row),
        permisos_efectivos: await this.getEffectiveProfesionalPermissions(row.id_vinculo_profesional_perteneciente),
      })));
    }

    await cacheService.set(cacheKey, data, 60);
    return data;
  }

  async can(idUsuario, action, context = {}) {
    const userContext = await this.getUserContext(idUsuario);
    if (!userContext) return this.deny('Usuario no encontrado o inactivo');

    switch (action) {
      case AUTH_ACTIONS.PERTENECIENTE_ACTIVIDAD_COMPLETAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.COMPLETAR_ACTIVIDADES);
      case AUTH_ACTIONS.PERTENECIENTE_CHAT_ENVIAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.ENVIAR_MENSAJES);
      case AUTH_ACTIONS.PERTENECIENTE_CHAT_PROFESIONAL_ENVIAR:
        return await this.canPertenecienteChatProfesional(userContext, context);
      case AUTH_ACTIONS.PERTENECIENTE_UBICACION_COMPARTIR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.COMPARTIR_UBICACION);
      case AUTH_ACTIONS.PERTENECIENTE_PUNTOS_GASTAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.GASTAR_PUNTOS);
      case AUTH_ACTIONS.PERTENECIENTE_ACTIVIDAD_CREAR_PROPIA:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.CREAR_ACTIVIDADES_PROPIAS);
      case AUTH_ACTIONS.PERTENECIENTE_PERFIL_EDITAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL);
      case AUTH_ACTIONS.PERTENECIENTE_PERFIL_SENSIBLE_EDITAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL_SENSIBLE);
      case AUTH_ACTIONS.PERTENECIENTE_MI_DIA_USAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.USAR_MI_DIA);
      case AUTH_ACTIONS.PERTENECIENTE_CALENDARIO_USAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.USAR_CALENDARIO);
      case AUTH_ACTIONS.PERTENECIENTE_EMOCIONES_REGISTRAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.REGISTRAR_EMOCIONES);
      case AUTH_ACTIONS.PERTENECIENTE_PICTOGRAMAS_USAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.USAR_PICTOGRAMAS);
      case AUTH_ACTIONS.PERTENECIENTE_CHAT_USAR:
        return await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.USAR_CHAT);
      case AUTH_ACTIONS.TUTOR_PERMISOS_MODIFICAR:
      case AUTH_ACTIONS.TUTOR_VINCULO_PROFESIONAL_APROBAR:
        return await this.canTutorActOnPerteneciente(userContext, context, { requirePrincipal: true });
      case AUTH_ACTIONS.PROFESIONAL_HISTORIAL_VER:
        return await this.canProfesionalPermission(userContext, context, PROFESIONAL_PERMISSIONS.VER_HISTORIAL);
      case AUTH_ACTIONS.PROFESIONAL_UBICACION_VER:
        return await this.canProfesionalPermission(userContext, context, PROFESIONAL_PERMISSIONS.VER_UBICACION);
      case AUTH_ACTIONS.PROFESIONAL_ACTIVIDAD_ASIGNAR:
        return await this.canProfesionalPermission(userContext, context, PROFESIONAL_PERMISSIONS.ASIGNAR_ACTIVIDADES);
      case AUTH_ACTIONS.PROFESIONAL_ACTIVIDAD_PERSONALIZADA_CREAR:
        return await this.canProfesionalPermission(userContext, context, PROFESIONAL_PERMISSIONS.CREAR_ACTIVIDADES_PERSONALIZADAS);
      case AUTH_ACTIONS.PROFESIONAL_SESION_AGENDAR:
        return await this.canProfesionalPermission(userContext, context, PROFESIONAL_PERMISSIONS.AGENDAR_SESIONES);
      case AUTH_ACTIONS.PROFESIONAL_CHAT_ENVIAR:
        return await this.canProfesionalPermission(userContext, context, PROFESIONAL_PERMISSIONS.ENVIAR_MENSAJES);
      default:
        return this.deny('Accion de autorizacion desconocida');
    }
  }

  async assertCan(idUsuario, action, context = {}) {
    const result = await this.can(idUsuario, action, context);
    if (!result.allowed) throw new AppError(result.reason || 'No autorizado', 403);
    return result;
  }

  async assertCanReadPertenecientePermissions(idUsuario, idPerteneciente) {
    const userContext = await this.getUserContext(idUsuario);
    if (!userContext) throw new AppError('No autorizado', 403);

    if (userContext.perteneciente?.id === idPerteneciente) return this.allow();

    if (userContext.tutor?.id) {
      const tutorAccess = await this.canTutorActOnPerteneciente(userContext, { id_perteneciente: idPerteneciente });
      if (tutorAccess.allowed) return tutorAccess;
    }

    throw new AppError('No autorizado para consultar permisos de este perteneciente', 403);
  }

  async assertCanReadProfesionalPermissions(idUsuario, idVinculoProfesionalPerteneciente) {
    const userContext = await this.getUserContext(idUsuario);
    if (!userContext) throw new AppError('No autorizado', 403);

    const vinculo = await AuthorizationRepository.getVinculoProfesionalById(idVinculoProfesionalPerteneciente);
    if (!vinculo) throw new AppError('Vinculo profesional-perteneciente no encontrado', 404);

    if (userContext.profesional?.id === vinculo.id_profesional) return this.allow();

    if (userContext.tutor?.id) {
      const tutorAccess = await this.canTutorActOnPerteneciente(userContext, { id_perteneciente: vinculo.id_perteneciente });
      if (tutorAccess.allowed) return tutorAccess;
    }

    throw new AppError('No autorizado para consultar permisos de este vinculo profesional', 403);
  }

  async assertCanModifyProfesionalPermissions(idUsuario, idVinculoProfesionalPerteneciente) {
    const userContext = await this.getUserContext(idUsuario);
    if (!userContext?.tutor?.id) throw new AppError('Solo un tutor activo puede modificar permisos profesionales', 403);

    const vinculo = await AuthorizationRepository.getVinculoProfesionalById(idVinculoProfesionalPerteneciente);
    if (!vinculo) throw new AppError('Vinculo profesional-perteneciente no encontrado', 404);

    const tutorAccess = await this.canTutorActOnPerteneciente(userContext, {
      id_perteneciente: vinculo.id_perteneciente,
    });

    if (!tutorAccess.allowed) throw new AppError(tutorAccess.reason || 'No autorizado', 403);
    return tutorAccess;
  }

  async assertCanReadPertenecienteResource(idUsuario, idPerteneciente, profesionalPermissionName = null) {
    const userContext = await this.getUserContext(idUsuario);
    if (!userContext) throw new AppError('No autorizado', 403);

    if (userContext.perteneciente?.id === idPerteneciente) return this.allow();

    if (userContext.tutor?.id) {
      const tutorAccess = await this.canTutorActOnPerteneciente(userContext, { id_perteneciente: idPerteneciente });
      if (tutorAccess.allowed) return tutorAccess;
    }

    if (userContext.profesional?.id && profesionalPermissionName) {
      const profesionalAccess = await this.canProfesionalPermission(
        userContext,
        { id_perteneciente: idPerteneciente },
        profesionalPermissionName,
      );
      if (profesionalAccess.allowed) return profesionalAccess;
    }

    throw new AppError('No autorizado para acceder a este recurso', 403);
  }

  /**
   * Igual que assertCanReadPertenecienteResource pero recibiendo el ID DE
   * USUARIO del target en vez del id_perteneciente — es lo que necesitan
   * las rutas de configuraciones_usuarios (routines.mi-dia, calendar.events,
   * emotion:*), donde el recurso esta indexado por id_usuario, no por
   * id_perteneciente. Se resuelve idUsuario->perteneciente y se delega.
   *
   * Si el usuario objetivo no tiene un perfil de perteneciente asociado
   * (p.ej. es otro tutor/profesional sin relacion), no hay forma de que sea
   * legitimo leerlo salvo que sea uno mismo.
   */
  async assertCanReadUsuarioConfig(idUsuario, targetIdUsuario) {
    if (Number(idUsuario) === Number(targetIdUsuario)) return this.allow();

    const perteneciente = await AuthorizationRepository.getPertenecienteByUsuarioId(targetIdUsuario);
    if (!perteneciente) throw new AppError('No autorizado para acceder a este recurso', 403);

    return await this.assertCanReadPertenecienteResource(
      idUsuario,
      perteneciente.id,
      PROFESIONAL_PERMISSIONS.VER_HISTORIAL,
    );
  }

  async assertCanWritePertenecienteResource(idUsuario, idPerteneciente, options = {}) {
    const {
      pertenecientePermissionName = null,
      profesionalPermissionName = null,
      allowTutor = true,
    } = options;

    const userContext = await this.getUserContext(idUsuario);
    if (!userContext) throw new AppError('No autorizado', 403);

    if (userContext.perteneciente?.id === idPerteneciente) {
      if (!pertenecientePermissionName) return this.allow();
      return await this.assertCan(idUsuario, this.actionForPertenecientePermission(pertenecientePermissionName), {
        id_perteneciente: idPerteneciente,
      });
    }

    if (allowTutor && userContext.tutor?.id) {
      const tutorAccess = await this.canTutorActOnPerteneciente(userContext, { id_perteneciente: idPerteneciente });
      if (tutorAccess.allowed) return tutorAccess;
    }

    if (userContext.profesional?.id && profesionalPermissionName) {
      const profesionalAccess = await this.canProfesionalPermission(
        userContext,
        { id_perteneciente: idPerteneciente },
        profesionalPermissionName,
      );
      if (profesionalAccess.allowed) return profesionalAccess;
    }

    throw new AppError('No autorizado para modificar este recurso', 403);
  }

  async assertCanAccessDispositivoLocation(idUsuario, idDispositivo, mode = 'read') {
    const perteneciente = await AuthorizationRepository.getPertenecienteByDispositivoId(idDispositivo);
    if (!perteneciente?.usuario_activo) throw new AppError('Dispositivo no encontrado o inactivo', 404);

    if (mode === 'write') {
      return await this.assertCanWritePertenecienteResource(idUsuario, perteneciente.id, {
        pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.COMPARTIR_UBICACION,
        allowTutor: false,
      });
    }

    return await this.assertCanReadPertenecienteResource(
      idUsuario,
      perteneciente.id,
      PROFESIONAL_PERMISSIONS.VER_UBICACION,
    );
  }

  async assertCanAccessUbicacionActual(idUsuario, idUbicacion, mode = 'read') {
    const perteneciente = await AuthorizationRepository.getPertenecienteByUbicacionActualId(idUbicacion);
    if (!perteneciente?.usuario_activo) throw new AppError('Ubicacion actual no encontrada', 404);

    if (mode === 'write') {
      return await this.assertCanWritePertenecienteResource(idUsuario, perteneciente.id, {
        pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.COMPARTIR_UBICACION,
        allowTutor: false,
      });
    }

    return await this.assertCanReadPertenecienteResource(
      idUsuario,
      perteneciente.id,
      PROFESIONAL_PERMISSIONS.VER_UBICACION,
    );
  }

  async assertCanAccessUbicacionHistorial(idUsuario, idUbicacion, mode = 'read') {
    const perteneciente = await AuthorizationRepository.getPertenecienteByUbicacionHistorialId(idUbicacion);
    if (!perteneciente?.usuario_activo) throw new AppError('Historial de ubicacion no encontrado', 404);

    if (mode === 'write') {
      return await this.assertCanWritePertenecienteResource(idUsuario, perteneciente.id, {
        pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.COMPARTIR_UBICACION,
        allowTutor: false,
      });
    }

    return await this.assertCanReadPertenecienteResource(
      idUsuario,
      perteneciente.id,
      PROFESIONAL_PERMISSIONS.VER_UBICACION,
    );
  }

  async assertCanAccessZonaSegura(idUsuario, idZonaSegura, mode = 'read') {
    const perteneciente = await AuthorizationRepository.getPertenecienteByZonaSeguraId(idZonaSegura);
    if (!perteneciente?.usuario_activo) throw new AppError('Zona segura no encontrada', 404);

    if (mode === 'write') {
      return await this.assertCanWritePertenecienteResource(idUsuario, perteneciente.id, {
        allowTutor: true,
      });
    }

    return await this.assertCanReadPertenecienteResource(
      idUsuario,
      perteneciente.id,
      PROFESIONAL_PERMISSIONS.VER_UBICACION,
    );
  }

  async assertCanUsePertenecienteFeatureByUsuarioId(idUsuarioActor, idUsuarioTarget, permissionName) {
    const perteneciente = await AuthorizationRepository.getPertenecienteByUsuarioId(idUsuarioTarget);
    if (!perteneciente) throw new AppError('Perteneciente no encontrado o inactivo', 404);

    return await this.assertCanWritePertenecienteResource(idUsuarioActor, perteneciente.id, {
      pertenecientePermissionName: permissionName,
      allowTutor: true,
    });
  }

  async canPertenecientePermission(userContext, context, permissionName) {
    const idPerteneciente = Number(context.id_perteneciente ?? userContext.perteneciente?.id);
    if (!idPerteneciente) return this.deny('id_perteneciente requerido');
    if (userContext.perteneciente?.id !== idPerteneciente) return this.deny('El usuario no es el perteneciente indicado');

    const effective = await this.getEffectivePertenecientePermissions(idPerteneciente);
    if (effective.permisos[permissionName]?.habilitado === true) return this.allow();
    return this.deny(`Permiso ${permissionName} deshabilitado`);
  }

  async canTutorActOnPerteneciente(userContext, context, options = {}) {
    const idPerteneciente = Number(context.id_perteneciente);
    if (!idPerteneciente) return this.deny('id_perteneciente requerido');
    if (!userContext.tutor?.id) return this.deny('El usuario no es tutor');

    const ok = await AuthorizationRepository.isTutorActivoForPerteneciente(userContext.tutor.id, idPerteneciente);
    if (!ok) return this.deny('No existe vinculo tutor activo con el perteneciente');

    if (options.requirePrincipal) {
      const isPrincipal = await AuthorizationRepository.isTutorPrincipalForPerteneciente(userContext.tutor.id, idPerteneciente);
      if (!isPrincipal) return this.deny('Solo el tutor principal puede modificar vinculos y permisos');
    }

    return this.allow();
  }

  async canProfesionalPermission(userContext, context, permissionName) {
    const idPerteneciente = Number(context.id_perteneciente);
    if (!idPerteneciente) return this.deny('id_perteneciente requerido');
    if (!userContext.profesional?.id) return this.deny('El usuario no es profesional');

    const vinculo = await AuthorizationRepository.getApprovedProfessionalLink(userContext.profesional.id, idPerteneciente);
    if (!this.isProfessionalLinkApproved(vinculo)) return this.deny('No existe vinculo profesional aprobado');

    const row = await AuthorizationRepository.getProfesionalPermission(vinculo.id, permissionName);
    const defaultValue = await this.resolveProfesionalDefault(permissionName, vinculo, PROFESIONAL_DEFAULTS[permissionName] ?? false);
    const habilitado = row?.habilitado ?? defaultValue;

    return habilitado ? this.allow({ id_vinculo_profesional_perteneciente: vinculo.id }) : this.deny(`Permiso ${permissionName} deshabilitado`);
  }

  async canPertenecienteChatProfesional(userContext, context) {
    const base = await this.canPertenecientePermission(userContext, context, PERTENECIENTE_PERMISSIONS.CHATEAR_CON_PROFESIONAL);
    if (!base.allowed) return base;

    const idProfesional = Number(context.id_profesional);
    const idPerteneciente = Number(context.id_perteneciente ?? userContext.perteneciente?.id);

    if (!idProfesional) return this.deny('id_profesional requerido');

    const vinculo = await AuthorizationRepository.getApprovedProfessionalLink(idProfesional, idPerteneciente);
    if (!this.isProfessionalLinkApproved(vinculo)) return this.deny('No existe vinculo profesional aprobado');

    return this.allow({ id_vinculo_profesional_perteneciente: vinculo.id });
  }

  async getProfessionalPertenecienteChatContext(idChat, idUsuarioEmisor) {
    return await AuthorizationRepository.getProfessionalPertenecienteChatContext(idChat, idUsuarioEmisor);
  }

  async assertCanSendMessageToChat(idUsuarioEmisor, idChat) {
    const userContext = await this.getUserContext(idUsuarioEmisor);
    if (!userContext) throw new AppError('Usuario no encontrado o inactivo', 403);

    if (userContext.perteneciente?.id) {
      await this.assertCan(idUsuarioEmisor, AUTH_ACTIONS.PERTENECIENTE_CHAT_ENVIAR, {
        id_perteneciente: userContext.perteneciente.id,
      });
    }

    const chatContext = await this.getProfessionalPertenecienteChatContext(idChat, idUsuarioEmisor);
    if (!chatContext) return this.allow();

    if (chatContext.emisor_tipo === 'profesional') {
      return await this.assertCan(idUsuarioEmisor, AUTH_ACTIONS.PROFESIONAL_CHAT_ENVIAR, {
        id_perteneciente: chatContext.id_perteneciente,
      });
    }

    if (chatContext.emisor_tipo === 'perteneciente') {
      return await this.assertCan(idUsuarioEmisor, AUTH_ACTIONS.PERTENECIENTE_CHAT_PROFESIONAL_ENVIAR, {
        id_perteneciente: chatContext.id_perteneciente,
        id_profesional: chatContext.id_profesional,
      });
    }

    throw new AppError('No autorizado para enviar mensajes en este chat', 403);
  }

  async resolveProfesionalDefault(permissionName, vinculo, fallback) {
    if (permissionName !== PROFESIONAL_PERMISSIONS.ENVIAR_MENSAJES) return fallback;

    const perteneciente = await AuthorizationRepository.getPertenecienteById(vinculo.id_perteneciente);
    if (perteneciente?.puede_autogestionarse === true) return true;

    return fallback;
  }

  isProfessionalLinkApproved(vinculo) {
    if (!vinculo) return false;

    const estadoVinculo = String(vinculo.estado_vinculo ?? '').toLowerCase();
    const estadoValidacion = String(vinculo.estado_validacion_profesional ?? '').toLowerCase();
    const vinculoActivo = ['activo', 'activa', 'aprobado', 'aprobada', 'aceptado', 'aceptada'].includes(estadoVinculo);
    const profesionalValidado = isVerifiedProfessionalStatus(estadoValidacion);
    const aprobadoPorTutor = !vinculo.requiere_aprobacion_tutor || (vinculo.fue_aprobado_por_tutor && vinculo.id_tutor_aprobador);

    return Boolean(
      vinculoActivo
        && profesionalValidado
        && vinculo.usuario_profesional_activo
        && vinculo.usuario_perteneciente_activo
        && aprobadoPorTutor,
    );
  }

  allow(extra = {}) {
    return { allowed: true, ...extra };
  }

  deny(reason) {
    return { allowed: false, reason };
  }

  async invalidateUserContext(idUsuario) {
    if (!idUsuario) {
      await cacheService.delByPattern('auth.context.*');
      return;
    }

    await cacheService.delByPattern(`auth.context.${idUsuario}`);
  }

  async invalidatePertenecientePermissions(idPerteneciente) {
    await cacheService.delByPattern(`auth.permisos.pert.${idPerteneciente}`);
    await cacheService.delByPattern('auth.context.*');
  }

  async invalidateProfesionalPermissions(idVinculo) {
    await cacheService.delByPattern(`auth.permisos.prof.${idVinculo}`);
    await cacheService.delByPattern('auth.context.*');
  }

  async invalidateAllForUser(idUsuario) {
    if (idUsuario) {
      await cacheService.delByPattern(`auth.context.${idUsuario}`);
    } else {
      await cacheService.delByPattern('auth.context.*');
    }

    await cacheService.delByPattern(`auth.permisos.*`);
  }

  actionForPertenecientePermission(permissionName) {
    switch (permissionName) {
      case PERTENECIENTE_PERMISSIONS.COMPLETAR_ACTIVIDADES:
        return AUTH_ACTIONS.PERTENECIENTE_ACTIVIDAD_COMPLETAR;
      case PERTENECIENTE_PERMISSIONS.CREAR_ACTIVIDADES_PROPIAS:
        return AUTH_ACTIONS.PERTENECIENTE_ACTIVIDAD_CREAR_PROPIA;
      case PERTENECIENTE_PERMISSIONS.COMPARTIR_UBICACION:
        return AUTH_ACTIONS.PERTENECIENTE_UBICACION_COMPARTIR;
      case PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL:
        return AUTH_ACTIONS.PERTENECIENTE_PERFIL_EDITAR;
      case PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL_SENSIBLE:
        return AUTH_ACTIONS.PERTENECIENTE_PERFIL_SENSIBLE_EDITAR;
      case PERTENECIENTE_PERMISSIONS.USAR_MI_DIA:
        return AUTH_ACTIONS.PERTENECIENTE_MI_DIA_USAR;
      case PERTENECIENTE_PERMISSIONS.USAR_CALENDARIO:
        return AUTH_ACTIONS.PERTENECIENTE_CALENDARIO_USAR;
      case PERTENECIENTE_PERMISSIONS.REGISTRAR_EMOCIONES:
        return AUTH_ACTIONS.PERTENECIENTE_EMOCIONES_REGISTRAR;
      case PERTENECIENTE_PERMISSIONS.USAR_PICTOGRAMAS:
        return AUTH_ACTIONS.PERTENECIENTE_PICTOGRAMAS_USAR;
      case PERTENECIENTE_PERMISSIONS.USAR_CHAT:
        return AUTH_ACTIONS.PERTENECIENTE_CHAT_USAR;
      case PERTENECIENTE_PERMISSIONS.ENVIAR_MENSAJES:
        return AUTH_ACTIONS.PERTENECIENTE_CHAT_ENVIAR;
      case PERTENECIENTE_PERMISSIONS.CHATEAR_CON_PROFESIONAL:
        return AUTH_ACTIONS.PERTENECIENTE_CHAT_PROFESIONAL_ENVIAR;
      case PERTENECIENTE_PERMISSIONS.GASTAR_PUNTOS:
        return AUTH_ACTIONS.PERTENECIENTE_PUNTOS_GASTAR;
      default:
        throw new AppError(`No existe accion para el permiso ${permissionName}`, 500);
    }
  }

  mapContextUsuario(row) {
    return {
      id: row.id_usuario_perteneciente,
      nombre_usuario: row.nombre_usuario,
      nombre: row.nombre,
      apellido: row.apellido,
      correo: row.correo,
      activo: row.usuario_activo,
    };
  }

  mapContextPerteneciente(row) {
    return {
      id: row.id_perteneciente,
      id_usuario: row.id_usuario_perteneciente,
      id_nivel_apoyo: row.id_nivel_apoyo,
      id_autonomia_operativa: row.id_autonomia_operativa,
      puede_autogestionarse: row.puede_autogestionarse,
      observacion_general: row.observacion_general,
    };
  }

  mapContextTutorVinculo(row) {
    return {
      id: row.id_vinculo_tutor_perteneciente,
      id_tutor: row.id_tutor,
      id_perteneciente: row.id_perteneciente,
      es_tutor_principal: row.es_tutor_principal,
      id_estado_vinculo: row.id_estado_vinculo,
      estado_vinculo: row.estado_vinculo,
      fecha_alta: row.fecha_alta,
      fecha_fin: row.fecha_fin,
    };
  }

  mapContextProfesionalVinculo(row) {
    return {
      id: row.id_vinculo_profesional_perteneciente,
      id_profesional: row.id_profesional,
      id_perteneciente: row.id_perteneciente,
      id_estado_vinculo: row.id_estado_vinculo,
      estado_vinculo: row.estado_vinculo,
      requiere_aprobacion_tutor: row.requiere_aprobacion_tutor,
      fue_aprobado_por_tutor: row.fue_aprobado_por_tutor,
      id_tutor_aprobador: row.id_tutor_aprobador,
      fecha_solicitud: row.fecha_solicitud,
      fecha_resolucion: row.fecha_resolucion,
    };
  }

  mapContextProfesional(row) {
    return {
      id: row.id_profesional,
      id_usuario: row.id_usuario_profesional,
      usuario: {
        id: row.id_usuario_profesional,
        nombre_usuario: row.nombre_usuario,
        nombre: row.nombre,
        apellido: row.apellido,
        correo: row.correo,
        activo: row.usuario_activo,
      },
      profesion: row.profesion,
      especialidad: row.especialidad,
      matricula: row.matricula,
      institucion: row.institucion,
      id_estado_validacion: row.id_estado_validacion,
      estado_validacion: row.estado_validacion_profesional,
    };
  }
}

export default new AuthorizationService();
