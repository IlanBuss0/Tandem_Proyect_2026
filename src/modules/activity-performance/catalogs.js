export const ACTIVITY_CATALOG_VERSION = 1;

export const ACTIVITY_DOMAINS = [
  {
    codigo: 'vida_cotidiana_autonomia',
    nombre: 'Vida cotidiana y autonomia',
    descripcion: 'Actividades vinculadas con autonomia diaria, hogar, salidas y autocuidado.',
    orden: 1,
  },
  {
    codigo: 'funciones_cognitivas_ejecutivas',
    nombre: 'Funciones cognitivas y ejecutivas',
    descripcion: 'Procesos de atencion, memoria, planificacion, flexibilidad y resolucion.',
    orden: 2,
  },
  {
    codigo: 'comunicacion',
    nombre: 'Comunicacion',
    descripcion: 'Comprension, expresion y uso funcional del lenguaje y apoyos visuales.',
    orden: 3,
  },
  {
    codigo: 'interaccion_social',
    nombre: 'Interaccion social',
    descripcion: 'Participacion social, pedido de ayuda y vinculacion con otras personas.',
    orden: 4,
  },
  {
    codigo: 'regulacion_bienestar_emocional',
    nombre: 'Regulacion y bienestar emocional',
    descripcion: 'Reconocimiento emocional, autorregulacion y estrategias de bienestar.',
    orden: 5,
  },
  {
    codigo: 'aprendizaje_academico',
    nombre: 'Aprendizaje academico',
    descripcion: 'Lectoescritura, numeracion, calculo y aprendizajes escolares funcionales.',
    orden: 6,
  },
  {
    codigo: 'seguridad_movilidad',
    nombre: 'Seguridad y movilidad',
    descripcion: 'Seguridad personal, transporte, movilidad y preparacion para salidas.',
    orden: 7,
  },
];

export const ACTIVITY_CATEGORIES = [
  { codigo: 'autonomia_personal', nombre: 'Autonomia personal', dominioCodigo: 'vida_cotidiana_autonomia', orden: 1 },
  { codigo: 'higiene', nombre: 'Higiene', dominioCodigo: 'vida_cotidiana_autonomia', orden: 2 },
  { codigo: 'organizacion', nombre: 'Organizacion', dominioCodigo: 'funciones_cognitivas_ejecutivas', orden: 3 },
  { codigo: 'escuela', nombre: 'Escuela', dominioCodigo: 'aprendizaje_academico', orden: 4 },
  { codigo: 'cocina_basica', nombre: 'Cocina basica', dominioCodigo: 'vida_cotidiana_autonomia', orden: 5 },
  { codigo: 'transporte', nombre: 'Transporte', dominioCodigo: 'seguridad_movilidad', orden: 6 },
  { codigo: 'compras', nombre: 'Compras', dominioCodigo: 'vida_cotidiana_autonomia', orden: 7 },
  { codigo: 'manejo_dinero', nombre: 'Manejo del dinero', dominioCodigo: 'vida_cotidiana_autonomia', orden: 8 },
  { codigo: 'emociones', nombre: 'Emociones', dominioCodigo: 'regulacion_bienestar_emocional', orden: 9 },
  { codigo: 'comunicacion', nombre: 'Comunicacion', dominioCodigo: 'comunicacion', orden: 10 },
  { codigo: 'vida_social', nombre: 'Vida social', dominioCodigo: 'interaccion_social', orden: 11 },
  { codigo: 'seguridad_personal', nombre: 'Seguridad personal', dominioCodigo: 'seguridad_movilidad', orden: 12 },
  { codigo: 'rutinas_hogar', nombre: 'Rutinas del hogar', dominioCodigo: 'vida_cotidiana_autonomia', orden: 13 },
  { codigo: 'regulacion_emocional', nombre: 'Regulacion emocional', dominioCodigo: 'regulacion_bienestar_emocional', orden: 14 },
  { codigo: 'preparacion_salidas', nombre: 'Preparacion para salidas', dominioCodigo: 'seguridad_movilidad', orden: 15 },
  { codigo: 'anticipacion_cambios', nombre: 'Anticipacion de cambios', dominioCodigo: 'funciones_cognitivas_ejecutivas', orden: 16 },
];

export const ACTIVITY_SKILLS = [
  { codigo: 'autocuidado_higiene', nombre: 'Autocuidado e higiene', orden: 1 },
  { codigo: 'alimentacion_cocina', nombre: 'Alimentacion y cocina', orden: 2 },
  { codigo: 'organizacion_domestica', nombre: 'Organizacion domestica', orden: 3 },
  { codigo: 'planificacion', nombre: 'Planificacion', orden: 4 },
  { codigo: 'secuenciacion', nombre: 'Secuenciacion', orden: 5 },
  { codigo: 'atencion_sostenida', nombre: 'Atencion sostenida', orden: 6 },
  { codigo: 'atencion_selectiva', nombre: 'Atencion selectiva', orden: 7 },
  { codigo: 'memoria_trabajo', nombre: 'Memoria de trabajo', orden: 8 },
  { codigo: 'memoria_visual', nombre: 'Memoria visual', orden: 9 },
  { codigo: 'flexibilidad_cognitiva', nombre: 'Flexibilidad cognitiva', orden: 10 },
  { codigo: 'resolucion_problemas', nombre: 'Resolucion de problemas', orden: 11 },
  { codigo: 'comprension_verbal', nombre: 'Comprension verbal', orden: 12 },
  { codigo: 'comprension_visual', nombre: 'Comprension visual', orden: 13 },
  { codigo: 'expresion_comunicacion_funcional', nombre: 'Expresion y comunicacion funcional', orden: 14 },
  { codigo: 'lectoescritura', nombre: 'Lectoescritura', orden: 15 },
  { codigo: 'numeracion_calculo', nombre: 'Numeracion y calculo', orden: 16 },
  { codigo: 'manejo_dinero', nombre: 'Manejo del dinero', orden: 17 },
  { codigo: 'interaccion_social', nombre: 'Interaccion social', orden: 18 },
  { codigo: 'pedido_ayuda_autodefensa', nombre: 'Pedido de ayuda y autodefensa', orden: 19 },
  { codigo: 'reconocimiento_emocional', nombre: 'Reconocimiento emocional', orden: 20 },
  { codigo: 'regulacion_emocional', nombre: 'Regulacion emocional', orden: 21 },
  { codigo: 'seguridad_personal', nombre: 'Seguridad personal', orden: 22 },
  { codigo: 'movilidad_transporte', nombre: 'Movilidad y transporte', orden: 23 },
  { codigo: 'coordinacion_motriz_digital', nombre: 'Coordinacion e interaccion motriz/digital', orden: 24 },
];

export const ACTIVITY_SUBSKILLS = [];

const uniqueCodes = (items) => new Set(items.map((item) => item.codigo)).size === items.length;

export function validateActivityCatalogs() {
  const domainCodes = new Set(ACTIVITY_DOMAINS.map((domain) => domain.codigo));
  const unknownCategoryDomain = ACTIVITY_CATEGORIES.find((category) => !domainCodes.has(category.dominioCodigo));

  return {
    ok:
      uniqueCodes(ACTIVITY_DOMAINS) &&
      uniqueCodes(ACTIVITY_CATEGORIES) &&
      uniqueCodes(ACTIVITY_SKILLS) &&
      unknownCategoryDomain == null &&
      ACTIVITY_DOMAINS.length >= 7 &&
      ACTIVITY_CATEGORIES.length >= 16 &&
      ACTIVITY_SKILLS.length >= 24,
    unknownCategoryDomain,
  };
}
