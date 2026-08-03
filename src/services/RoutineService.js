import RoutineRepository from '../repositories/RoutineRepository.js';
import AppError from '../modules/errors/AppError.js';

// Unica responsabilidad: orquestar rutinas ("Mi dia") y traducir entre el
// shape que manda el frontend (DayRoutine/RoutineItem, en ingles, ver
// mockData.ts) y las columnas de la tabla (en espanol, ver
// RoutineRepository.js). El repository no sabe nada del frontend; este
// service es la unica frontera entre los dos vocabularios.
function toDbRoutine(routine) {
  return {
    id: routine.id,
    nombre: routine.name,
    dia_semana: routine.dayOfWeek ?? null,
    fecha: routine.date ?? null,
    items: (routine.items || []).map((item) => ({
      id: item.id,
      hora: item.time,
      titulo: item.title,
      icono: item.icon || null,
      categoria: item.category || null,
      completado: Boolean(item.completed),
      reminders: item.reminders,
      id_pictograma: item.pictogramId || null,
      pictograma_url: item.pictogramImageUrl || null,
      pictograma_nombre: item.pictogramName || null,
      pictograma_confianza: item.pictogramConfidence || null,
      pictograma_resuelto_para: item.pictogramResolvedFor || null,
      pictograma_label: item.pictogramLabel || null,
    })),
  };
}

function fromDbRoutine(row) {
  return {
    id: row.id,
    name: row.nombre,
    dayOfWeek: row.dia_semana,
    date: row.fecha || undefined,
    items: (row.items || []).map((item) => ({
      id: item.id,
      time: item.hora,
      title: item.titulo,
      icon: item.icono || '⭐',
      category: item.categoria || 'mañana',
      completed: Boolean(item.completado),
      reminders: item.reminders || undefined,
      pictogramId: item.id_pictograma || undefined,
      pictogramImageUrl: item.pictograma_url || undefined,
      pictogramName: item.pictograma_nombre || undefined,
      pictogramConfidence: item.pictograma_confianza || undefined,
      pictogramResolvedFor: item.pictograma_resuelto_para || undefined,
      pictogramLabel: item.pictograma_label || undefined,
    })),
  };
}

// Mapa de campos aceptados por el PATCH granular de un item, de la forma
// del frontend (camelCase) a la columna real.
const ITEM_PATCH_FIELD_MAP = {
  time: 'hora', title: 'titulo', icon: 'icono', category: 'categoria', completed: 'completado',
  pictogramId: 'id_pictograma', pictogramImageUrl: 'pictograma_url', pictogramName: 'pictograma_nombre',
  pictogramConfidence: 'pictograma_confianza', pictogramResolvedFor: 'pictograma_resuelto_para',
  pictogramLabel: 'pictograma_label', reminders: 'reminders',
};

export default class RoutineService {
  constructor() {
    this.RoutineRepository = new RoutineRepository();
    this.schemaReady = null;
  }

  async ensureSchemaAsync() {
    if (!this.schemaReady) this.schemaReady = this.RoutineRepository.ensureSchemaAsync();
    return await this.schemaReady;
  }

  getForUsuarioAsync = async (idUsuario) => {
    await this.ensureSchemaAsync();
    const rows = await this.RoutineRepository.getForUsuarioAsync(idUsuario);
    return rows.map(fromDbRoutine);
  };

  replaceAllForUsuarioAsync = async (idUsuario, routines) => {
    await this.ensureSchemaAsync();
    await this.RoutineRepository.replaceAllForUsuarioAsync(idUsuario, (routines || []).map(toDbRoutine));
    return await this.getForUsuarioAsync(idUsuario);
  };

  updateItemAsync = async (itemId, idUsuario, patch) => {
    await this.ensureSchemaAsync();
    const ownerId = await this.RoutineRepository.getItemOwnerUsuarioIdAsync(itemId);
    if (!ownerId || Number(ownerId) !== Number(idUsuario)) {
      throw new AppError('Paso de rutina no encontrado.', 404);
    }
    const dbPatch = {};
    for (const [field, column] of Object.entries(ITEM_PATCH_FIELD_MAP)) {
      if (patch[field] === undefined) continue;
      dbPatch[column] = patch[field];
    }
    await this.RoutineRepository.updateItemAsync(itemId, dbPatch);
  };
}
