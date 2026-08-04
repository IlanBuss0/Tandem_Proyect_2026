// Unica responsabilidad: el catalogo de tipos de evento de uso validos, y
// la validacion pura de un evento antes de guardarlo (Sesion 9). No sabe
// nada de BD ni de HTTP — eso vive en UsageEventRepository/Service.
//
// Por que un catalogo cerrado y no texto libre: todo el bloque F (deteccion
// de patrones, informe de vocabulario, evolucion en el tiempo) depende de
// poder agrupar por tipo con GROUP BY. Un tipo nuevo se agrega aca, no se
// inventa en el momento desde el frontend.
export const USAGE_EVENT_TYPES = Object.freeze({
  RUTINA_PASO_COMPLETADO: 'rutina_paso_completado',
  EMOCION_REGISTRADA: 'emocion_registrada',
  PICTOGRAMA_ELEGIDO: 'pictograma_elegido',
  PICTOGRAMA_CORREGIDO: 'pictograma_corregido',
  TARJETA_AUTONOMIA_USADA: 'tarjeta_autonomia_usada',
  ENUNCIADO_HABLADO: 'enunciado_hablado',
  // Item 29 "pedir cosas para su dia": el perteneciente propone algo para
  // agregar a su rutina, en vez de solo recibir lo que le asignan. No hay
  // flujo de aprobacion automatico todavia — el tutor lo ve en su
  // timeline y lo agrega el mismo con las herramientas que ya tiene
  // (Sesion 8). El primer paso de "co-decidir" es que el pedido exista y
  // se vea, no un motor de aprobaciones completo.
  PEDIDO_DIA: 'pedido_dia',
  RUTINA_SECUENCIA_COMPLETADA: 'rutina_secuencia_completada',
});

const VALID_TYPES = new Set(Object.values(USAGE_EVENT_TYPES));

export function isValidTipoEvento(tipoEvento) {
  return VALID_TYPES.has(tipoEvento);
}

/**
 * Valida la forma minima de un evento antes de persistirlo.
 * @returns {string|null} mensaje de error, o null si es valido
 */
export function validateUsageEvent(event) {
  if (!event || typeof event !== 'object') return 'El evento es obligatorio.';
  if (!isValidTipoEvento(event.tipoEvento)) return `tipoEvento invalido: ${event.tipoEvento}`;
  if (event.valor !== undefined && event.valor !== null && typeof event.valor !== 'object') {
    return 'valor debe ser un objeto si se manda.';
  }
  if (event.tipoEvento === USAGE_EVENT_TYPES.RUTINA_SECUENCIA_COMPLETADA) {
    const value = event.valor || {};
    if (!value.executionId || typeof value.executionId !== 'string' || value.executionId.length > 100) return 'executionId es obligatorio.';
    if (!['order', 'next', 'missing', 'detective', 'plan-b'].includes(value.mode)) return 'mode invalido.';
    if (!Number.isFinite(value.score) || value.score < 40 || value.score > 100) return 'score invalido.';
    if (!Number.isInteger(value.attempts) || value.attempts < 1) return 'attempts invalido.';
    if (!Number.isInteger(value.hintsUsed) || value.hintsUsed < 0 || value.hintsUsed > 4) return 'hintsUsed invalido.';
    if (!Number.isFinite(value.durationMs) || value.durationMs < 0) return 'durationMs invalido.';
    if (!Array.isArray(value.conflictStepIds) || value.conflictStepIds.some((id) => typeof id !== 'string' || id.length > 100)) return 'conflictStepIds invalido.';
  }
  return null;
}
