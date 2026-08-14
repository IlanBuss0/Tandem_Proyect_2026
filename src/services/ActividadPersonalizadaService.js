import ActividadPersonalizadaRepository from '../repositories/ActividadPersonalizadaRepository.js';
import ActividadAsignadaRepository from '../repositories/ActividadAsignadaRepository.js';
import AppError from '../modules/errors/AppError.js';
import { validateResourceScenarioMetadata } from '../modules/activities/resource-scenario.validation.js';

export default class ActividadPersonalizadaService {
  constructor() {
    console.log('Estoy en: ActividadPersonalizadaService.constructor()');
    this.ActividadPersonalizadaRepository = new ActividadPersonalizadaRepository();
    this.ActividadAsignadaRepository = new ActividadAsignadaRepository();
  }

  getAllAsync = async () => {
    console.log('ActividadPersonalizadaService.getAllAsync()');
    const returnArray = await this.ActividadPersonalizadaRepository.getAllAsync();
    if (returnArray == null) return null;
    return returnArray;
  };

  getByIdAsync = async (id) => {
    console.log(`ActividadPersonalizadaService.getByIdAsync(${id})`);
    if (!id || Number.isNaN(id)) {
      throw new Error('El id de la actividad personalizada es invalido.');
    }
    const returnEntity = await this.ActividadPersonalizadaRepository.getByIdAsync(id);
    return returnEntity;
  };

  getByUsuarioCreadorAsync = async (idUsuarioCreador) => {
    console.log(`ActividadPersonalizadaService.getByUsuarioCreadorAsync(${idUsuarioCreador})`);
    if (!idUsuarioCreador || Number.isNaN(idUsuarioCreador)) {
      throw new Error('El id del usuario creador es invalido.');
    }
    return await this.ActividadPersonalizadaRepository.getByUsuarioCreadorAsync(idUsuarioCreador);
  };

  getByPertenecienteIdAsync = async (idPerteneciente) => {
    console.log(`ActividadPersonalizadaService.getByPertenecienteIdAsync(${idPerteneciente})`);
    if (!idPerteneciente || Number.isNaN(idPerteneciente)) {
      throw new Error('El id del perteneciente es invalido.');
    }
    return await this.ActividadPersonalizadaRepository.getByPertenecienteIdAsync(idPerteneciente);
  };

  createAsync = async (entity) => {
    console.log(`ActividadPersonalizadaService.createAsync(${JSON.stringify(entity)})`);
    this.validarActividadPersonalizadaParaCrear(entity);
    validateResourceScenarioMetadata(entity.descripcion);
    const newId = await this.ActividadPersonalizadaRepository.createAsync(entity);
    return newId;
  };

  updateAsync = async (entity) => {
    console.log(`ActividadPersonalizadaService.updateAsync(${JSON.stringify(entity)})`);
    if (!entity?.id || Number.isNaN(entity.id)) {
      throw new Error('El id de la actividad personalizada es obligatorio para actualizar.');
    }
    const previousEntity = await this.ActividadPersonalizadaRepository.getByIdAsync(entity.id);
    if (previousEntity == null) return 0;
    validateResourceScenarioMetadata(entity.descripcion ?? previousEntity.descripcion);
    const rowsAffected = await this.ActividadPersonalizadaRepository.updateAsync(entity);
    return rowsAffected;
  };

  getResultsForCreatorAsync = async (id, requesterUserId) => {
    const activity = await this.getByIdAsync(id);
    if (!activity) throw new AppError('Actividad personalizada no encontrada.', 404);
    if (Number(activity.id_usuario_creador) !== Number(requesterUserId)) {
      throw new AppError('No autorizado para consultar estos resultados.', 403);
    }
    return await this.ActividadAsignadaRepository.getResultsByCustomActivityIdAsync(id);
  };

  deleteByIdAsync = async (id) => {
    console.log(`ActividadPersonalizadaService.deleteByIdAsync(${id})`);
    if (!id || Number.isNaN(id)) {
      throw new Error('El id de la actividad personalizada es invalido.');
    }
    const rowsAffected = await this.ActividadPersonalizadaRepository.deleteByIdAsync(id);
    return rowsAffected;
  };

  validarActividadPersonalizadaParaCrear = (entity) => {
    if (!entity) {
      throw new Error('La actividad personalizada es obligatoria.');
    }
    if (!entity.id_tipo_actividad) {
      throw new Error('id_tipo_actividad es obligatorio.');
    }
    if (!entity.id_punto_otorgado) {
      throw new Error('id_punto_otorgado es obligatorio.');
    }
    if (!entity.id_usuario_creador) {
      throw new Error('id_usuario_creador es obligatorio.');
    }
    if (!entity.titulo) {
      throw new Error('titulo es obligatorio.');
    }
    if (!entity.fecha_creacion) {
      throw new Error('fecha_creacion es obligatorio.');
    }
  };
}
