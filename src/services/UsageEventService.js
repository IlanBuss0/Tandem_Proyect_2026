import UsageEventRepository from '../repositories/UsageEventRepository.js';
import { validateUsageEvent } from '../modules/usage/event-types.js';

// Unica responsabilidad: orquestar el guardado de un evento de uso.
// Fire-and-forget por diseno (misma disciplina que NotificationProducerService):
// registrar que alguien completo un paso o registro una emocion NUNCA debe
// poder romper la accion real que la origino. Si el log falla, se traga el
// error y se loguea server-side, no se propaga.
export default class UsageEventService {
  constructor() {
    this.UsageEventRepository = new UsageEventRepository();
    this.schemaReady = null;
  }

  async ensureSchemaAsync() {
    if (!this.schemaReady) this.schemaReady = this.UsageEventRepository.ensureSchemaAsync();
    return await this.schemaReady;
  }

  async logAsync(event) {
    try {
      const error = validateUsageEvent(event);
      if (error) throw new Error(error);
      if (!event.idUsuario) throw new Error('idUsuario es obligatorio.');

      await this.ensureSchemaAsync();
      if (event.valor?.executionId) return await this.UsageEventRepository.createIdempotentAsync(event, event.valor.executionId);
      return await this.UsageEventRepository.createAsync(event);
    } catch (error) {
      console.error('[UsageEvent] no se pudo registrar', { event, error: error.message });
      return null;
    }
  }

  async logManyAsync(events) {
    const results = await Promise.all((events || []).map((event) => this.logAsync(event)));
    return results.filter((id) => id !== null).length;
  }

  async getForUsuarioAsync(idUsuario, options) {
    await this.ensureSchemaAsync();
    return await this.UsageEventRepository.getForUsuarioAsync(idUsuario, options);
  }
}
