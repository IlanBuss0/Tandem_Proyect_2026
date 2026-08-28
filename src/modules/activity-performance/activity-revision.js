import { validateActivityDefinitionV2 } from './activity-definition-v2.js';

export function validateActivityRevisionSource(source = {}) {
  const hasIntegratedActivity = source.idActividad != null;
  const hasCustomActivity = source.idActividadPersonalizada != null;

  if (hasIntegratedActivity === hasCustomActivity) {
    return 'La revision debe referenciar exactamente una actividad integrada o personalizada.';
  }

  return null;
}

export function validateActivityRevisionPayload(payload = {}) {
  const errors = [];
  const sourceError = validateActivityRevisionSource(payload.source);
  if (sourceError) errors.push(sourceError);

  const definitionValidation = validateActivityDefinitionV2(payload.definition);
  if (!definitionValidation.ok) errors.push(...definitionValidation.errors);

  return {
    ok: errors.length === 0,
    errors,
  };
}
