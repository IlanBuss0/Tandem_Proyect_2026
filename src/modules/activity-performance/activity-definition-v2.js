export const ACTIVITY_DEFINITION_SCHEMA_VERSION = 2;

export const ACTIVITY_PURPOSES = new Set(['practica', 'evaluacion', 'generalizacion']);
export const ACTIVITY_DIFFICULTIES = new Set(['facil', 'medio', 'avanzado']);

export const DEFAULT_SUCCESS_CRITERIA_WEIGHTS = {
  precision: 40,
  independencia: 25,
  completitud: 15,
  ayudas: 10,
  tiempoEsperado: 10,
};

export function buildDefaultEvaluationConfig(gameType = 'guided-activity') {
  return {
    proposito: gameType === 'routine-sequence' ? 'practica' : 'evaluacion',
    criteriosExito: { ...DEFAULT_SUCCESS_CRITERIA_WEIGHTS },
    configuracionDificultad: {},
    configuracionApoyos: {
      pictogramas: true,
      lecturaVozAlta: false,
      repeticionInstrucciones: true,
      maximoPistas: null,
      feedback: 'inmediato',
    },
  };
}

export function validateSkillWeights(skills = []) {
  if (!Array.isArray(skills) || skills.length === 0) {
    return 'Debe indicarse al menos una habilidad.';
  }

  const principalCount = skills.filter((skill) => skill.esPrincipal === true).length;
  if (principalCount !== 1) {
    return 'Debe existir exactamente una habilidad principal.';
  }

  const totalWeight = skills.reduce((total, skill) => total + Number(skill.peso ?? 0), 0);
  if (skills.some((skill) => Number(skill.peso ?? 0) <= 0)) {
    return 'Todos los pesos de habilidades deben ser positivos.';
  }

  if (totalWeight !== 100) {
    return 'La suma de pesos de habilidades debe ser 100.';
  }

  return null;
}

export function validateSuccessCriteriaWeights(criteria = {}) {
  const values = Object.values(criteria).map((value) => Number(value));

  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    return 'Los criterios de exito deben tener pesos numericos no negativos.';
  }

  const totalWeight = values.reduce((total, value) => total + value, 0);
  if (totalWeight !== 100) {
    return 'La suma de criterios de exito debe ser 100.';
  }

  return null;
}

export function validateActivityDefinitionV2(definition = {}) {
  const errors = [];

  if (definition.schemaVersion !== ACTIVITY_DEFINITION_SCHEMA_VERSION) {
    errors.push('schemaVersion debe ser 2.');
  }

  if (!definition.titulo || String(definition.titulo).trim().length < 3) {
    errors.push('titulo es obligatorio.');
  }

  if (!definition.idCategoria && !definition.codigoCategoria) {
    errors.push('Debe indicarse categoria.');
  }

  if (!ACTIVITY_PURPOSES.has(definition.proposito)) {
    errors.push('proposito debe ser practica, evaluacion o generalizacion.');
  }

  if (!ACTIVITY_DIFFICULTIES.has(definition.dificultadGeneral)) {
    errors.push('dificultadGeneral debe ser facil, medio o avanzado.');
  }

  if (
    definition.duracionEsperadaMinutos != null &&
    (!Number.isInteger(definition.duracionEsperadaMinutos) || definition.duracionEsperadaMinutos <= 0)
  ) {
    errors.push('duracionEsperadaMinutos debe ser un entero positivo.');
  }

  const skillError = validateSkillWeights(definition.habilidades);
  if (skillError) errors.push(skillError);

  const criteriaError = validateSuccessCriteriaWeights(definition.criteriosExito);
  if (criteriaError) errors.push(criteriaError);

  return {
    ok: errors.length === 0,
    errors,
  };
}
