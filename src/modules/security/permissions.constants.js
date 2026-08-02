// Checklist para agregar un permiso de perteneciente nuevo (Sesion 6: esto
// ya se rompio una vez — USAR_CHAT existia aca pero faltaba en 4 lugares
// mas, y las rutas que lo usaban tiraban 500 en vez de autorizar):
//
// 1. Agregarlo a PERTENECIENTE_PERMISSIONS (aca abajo).
// 2. Agregarle su accion en AUTH_ACTIONS (aca abajo), formato
//    'perteneciente.<algo>.<verbo>'.
// 3. Mapear el permiso -> accion en
//    AuthorizationService.actionForPertenecientePermission() (el switch
//    tira 500 si falta un caso, no lo deja pasar en silencio — pero solo
//    en tiempo de ejecucion, no en tiempo de compilacion).
// 4. Agregarle su caso en el switch de AuthorizationService.can().
// 5. Agregar el default para AUTOGESTIONADO y TUTELADO en
//    PERTENECIENTE_DEFAULTS (aca abajo).
// 6. Espejarlo en el frontend: src/hooks/usePermissions.ts
//    (PERTENECIENTE_PERMISSIONS) — no hay chequeo automatico de que estos
//    dos objetos esten sincronizados entre backend y frontend.
// 7. Si el permiso gatea una tab/UI nueva del tutor, agregarla a la UI de
//    gestion de permisos (TutorConnections.tsx en el frontend).
export const PERTENECIENTE_PERMISSIONS = Object.freeze({
  EDITAR_PERFIL: 'EditarPerfil',
  EDITAR_PERFIL_SENSIBLE: 'EditarPerfilSensible',
  COMPLETAR_ACTIVIDADES: 'CompletarActividades',
  ENVIAR_MENSAJES: 'EnviarMensajes',
  CHATEAR_CON_PROFESIONAL: 'ChatearConProfesional',
  CREAR_ACTIVIDADES_PROPIAS: 'CrearActividadesPropias',
  COMPARTIR_UBICACION: 'CompartirUbicacion',
  GASTAR_PUNTOS: 'GastarPuntos',
  USAR_MI_DIA: 'UsarMiDia',
  USAR_CALENDARIO: 'UsarCalendario',
  REGISTRAR_EMOCIONES: 'RegistrarEmociones',
  USAR_PICTOGRAMAS: 'UsarPictogramas',
  USAR_CHAT: 'UsarChat',
});

export const PROFESIONAL_PERMISSIONS = Object.freeze({
  ASIGNAR_ACTIVIDADES: 'AsignarActividades',
  CREAR_ACTIVIDADES_PERSONALIZADAS: 'CrearActividadesPersonalizadas',
  VER_HISTORIAL: 'VerHistorial',
  VER_UBICACION: 'VerUbicacion',
  AGENDAR_SESIONES: 'AgendarSesiones',
  ENVIAR_MENSAJES: 'EnviarMensajes',
  EDITAR_PERFIL_PROFESIONAL: 'EditarPerfilProfesional',
});

export const AUTH_ACTIONS = Object.freeze({
  PERTENECIENTE_ACTIVIDAD_COMPLETAR: 'perteneciente.actividad.completar',
  PERTENECIENTE_CHAT_ENVIAR: 'perteneciente.chat.enviar',
  PERTENECIENTE_CHAT_PROFESIONAL_ENVIAR: 'perteneciente.chat_profesional.enviar',
  PERTENECIENTE_UBICACION_COMPARTIR: 'perteneciente.ubicacion.compartir',
  PERTENECIENTE_PUNTOS_GASTAR: 'perteneciente.puntos.gastar',
  PERTENECIENTE_ACTIVIDAD_CREAR_PROPIA: 'perteneciente.actividad.crear_propia',
  PERTENECIENTE_PERFIL_EDITAR: 'perteneciente.perfil.editar',
  PERTENECIENTE_PERFIL_SENSIBLE_EDITAR: 'perteneciente.perfil_sensible.editar',
  PERTENECIENTE_MI_DIA_USAR: 'perteneciente.mi_dia.usar',
  PERTENECIENTE_CALENDARIO_USAR: 'perteneciente.calendario.usar',
  PERTENECIENTE_EMOCIONES_REGISTRAR: 'perteneciente.emociones.registrar',
  PERTENECIENTE_PICTOGRAMAS_USAR: 'perteneciente.pictogramas.usar',
  PERTENECIENTE_CHAT_USAR: 'perteneciente.chat.usar',
  TUTOR_PERMISOS_MODIFICAR: 'tutor.permisos.modificar',
  TUTOR_VINCULO_PROFESIONAL_APROBAR: 'tutor.vinculo_profesional.aprobar',
  PROFESIONAL_HISTORIAL_VER: 'profesional.historial.ver',
  PROFESIONAL_UBICACION_VER: 'profesional.ubicacion.ver',
  PROFESIONAL_ACTIVIDAD_ASIGNAR: 'profesional.actividad.asignar',
  PROFESIONAL_ACTIVIDAD_PERSONALIZADA_CREAR: 'profesional.actividad_personalizada.crear',
  PROFESIONAL_SESION_AGENDAR: 'profesional.sesion.agendar',
  PROFESIONAL_CHAT_ENVIAR: 'profesional.chat.enviar',
});

export const PERTENECIENTE_DEFAULTS = Object.freeze({
  AUTOGESTIONADO: Object.freeze({
    [PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL]: true,
    [PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL_SENSIBLE]: true,
    [PERTENECIENTE_PERMISSIONS.COMPLETAR_ACTIVIDADES]: true,
    [PERTENECIENTE_PERMISSIONS.ENVIAR_MENSAJES]: true,
    [PERTENECIENTE_PERMISSIONS.CHATEAR_CON_PROFESIONAL]: true,
    [PERTENECIENTE_PERMISSIONS.CREAR_ACTIVIDADES_PROPIAS]: true,
    [PERTENECIENTE_PERMISSIONS.COMPARTIR_UBICACION]: false,
    [PERTENECIENTE_PERMISSIONS.GASTAR_PUNTOS]: true,
    [PERTENECIENTE_PERMISSIONS.USAR_MI_DIA]: true,
    [PERTENECIENTE_PERMISSIONS.USAR_CALENDARIO]: true,
    [PERTENECIENTE_PERMISSIONS.REGISTRAR_EMOCIONES]: true,
    [PERTENECIENTE_PERMISSIONS.USAR_PICTOGRAMAS]: true,
    [PERTENECIENTE_PERMISSIONS.USAR_CHAT]: true,
  }),
  TUTELADO: Object.freeze({
    [PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL]: true,
    [PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL_SENSIBLE]: false,
    [PERTENECIENTE_PERMISSIONS.COMPLETAR_ACTIVIDADES]: true,
    [PERTENECIENTE_PERMISSIONS.ENVIAR_MENSAJES]: false,
    [PERTENECIENTE_PERMISSIONS.CHATEAR_CON_PROFESIONAL]: false,
    [PERTENECIENTE_PERMISSIONS.CREAR_ACTIVIDADES_PROPIAS]: false,
    [PERTENECIENTE_PERMISSIONS.COMPARTIR_UBICACION]: false,
    [PERTENECIENTE_PERMISSIONS.GASTAR_PUNTOS]: false,
    [PERTENECIENTE_PERMISSIONS.USAR_MI_DIA]: true,
    [PERTENECIENTE_PERMISSIONS.USAR_CALENDARIO]: true,
    [PERTENECIENTE_PERMISSIONS.REGISTRAR_EMOCIONES]: true,
    [PERTENECIENTE_PERMISSIONS.USAR_PICTOGRAMAS]: true,
    [PERTENECIENTE_PERMISSIONS.USAR_CHAT]: false,
  }),
});

export const PROFESIONAL_DEFAULTS = Object.freeze({
  [PROFESIONAL_PERMISSIONS.ASIGNAR_ACTIVIDADES]: true,
  [PROFESIONAL_PERMISSIONS.CREAR_ACTIVIDADES_PERSONALIZADAS]: true,
  [PROFESIONAL_PERMISSIONS.VER_HISTORIAL]: true,
  [PROFESIONAL_PERMISSIONS.AGENDAR_SESIONES]: true,
  [PROFESIONAL_PERMISSIONS.ENVIAR_MENSAJES]: false,
  [PROFESIONAL_PERMISSIONS.VER_UBICACION]: false,
});
