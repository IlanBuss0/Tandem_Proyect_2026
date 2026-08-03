// Unica responsabilidad: la parte PURA del perfil de memoria por
// perteneciente (Sesion 25, item nuevo "memoria activa"). No hace queries
// ni sabe de donde salen los datos — solo junta lo que ya calculan los
// modulos de la Sesion 19-21 (vocabulario, patrones, evolucion) y agrega
// el unico calculo nuevo que faltaba: cuales tarjetas de autonomia usa de
// verdad esta persona.
//
// Regla de honestidad, la misma de siempre: nada se considera "preferido"
// con menos de MIN_USES usos. Un solo toque accidental no debe reordenar
// nada — ni el catalogo de pictogramas ni las tarjetas de crisis.
export const MIN_USES = 3;

/**
 * Cuenta cuantas veces se uso cada tarjeta de autonomia (autonomia,
 * modo "no puedo hablar", "arrancar tarea" — las 3 comparten el tipo de
 * evento 'tarjeta_autonomia_usada', distinguidas por entidad_tipo +
 * entidad_id, ver AutonomyCards.tsx / CantSpeakMode.tsx / StartTaskHint.tsx).
 * Solo devuelve las que superan el piso minimo de uso.
 *
 * @param {{entidad_tipo: string, entidad_id: string, valor?: {label?: string, stepTitle?: string}}[]} tarjetaEvents
 */
export function computeAutonomyCardUsage(tarjetaEvents) {
  const counts = new Map();

  for (const event of tarjetaEvents || []) {
    if (!event?.entidad_tipo || !event?.entidad_id) continue;
    const key = `${event.entidad_tipo}:${event.entidad_id}`;
    if (!counts.has(key)) {
      counts.set(key, {
        entidadTipo: event.entidad_tipo,
        entidadId: event.entidad_id,
        label: event.valor?.label || event.valor?.stepTitle || event.entidad_id,
        count: 0,
      });
    }
    counts.get(key).count += 1;
  }

  return Array.from(counts.values())
    .filter((entry) => entry.count >= MIN_USES)
    .sort((a, b) => b.count - a.count);
}
