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
  return null;
}
