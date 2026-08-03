import crypto from 'crypto';
import CalendarEventRepository from '../repositories/CalendarEventRepository.js';
import AppError from '../modules/errors/AppError.js';

// Unica responsabilidad: orquestar CRUD de eventos de calendario. Mismo
// patron que UsageEventService.js — memoiza ensureSchemaAsync, valida lo
// minimo antes de tocar la BD, delega todo lo demas al repository.
export default class CalendarEventService {
  constructor() {
    this.CalendarEventRepository = new CalendarEventRepository();
    this.schemaReady = null;
  }

  async ensureSchemaAsync() {
    if (!this.schemaReady) this.schemaReady = this.CalendarEventRepository.ensureSchemaAsync();
    return await this.schemaReady;
  }

  getForUsuarioAsync = async (idUsuario) => {
    await this.ensureSchemaAsync();
    return await this.CalendarEventRepository.getForUsuarioAsync(idUsuario);
  };

  createAsync = async (idUsuario, data) => {
    await this.ensureSchemaAsync();
    if (!data.titulo || !data.fecha || !data.hora) {
      throw new AppError('Falta titulo, fecha u hora del evento.', 400);
    }
    const event = {
      id: data.id || `ce-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      idUsuario,
      ...data,
    };
    // `inserted` es un detalle interno para el script de migracion
    // (idempotencia via ON CONFLICT DO NOTHING) — no forma parte de la
    // respuesta publica de la API.
    const { inserted: _inserted, ...created } = await this.CalendarEventRepository.createAsync(event);
    return created;
  };

  updateAsync = async (id, idUsuario, patch) => {
    await this.ensureSchemaAsync();
    const existing = await this.CalendarEventRepository.getByIdAsync(id);
    if (!existing || Number(existing.id_usuario) !== Number(idUsuario)) {
      throw new AppError('Evento no encontrado.', 404);
    }
    return await this.CalendarEventRepository.updateAsync(id, patch);
  };

  deleteAsync = async (id, idUsuario) => {
    await this.ensureSchemaAsync();
    const existing = await this.CalendarEventRepository.getByIdAsync(id);
    if (!existing || Number(existing.id_usuario) !== Number(idUsuario)) {
      throw new AppError('Evento no encontrado.', 404);
    }
    await this.CalendarEventRepository.deleteAsync(id);
  };
}
