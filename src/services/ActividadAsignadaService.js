import ActividadAsignadaRepository from '../repositories/ActividadAsignadaRepository.js';
import { cacheService } from './CacheService.js';
import PertenecienteRepository from '../repositories/PertenecienteRepository.js';
import NotificationProducerService from './NotificationProducerService.js';
import ActividadPersonalizadaRepository from '../repositories/ActividadPersonalizadaRepository.js';
import AppError from '../modules/errors/AppError.js';
import AuthorizationService from './AuthorizationService.js';
import { PERTENECIENTE_PERMISSIONS } from '../modules/security/permissions.constants.js';

export default class ActividadAsignadaService {
  constructor() {
    console.log('Estoy en: ActividadAsignadaService.constructor()');
    this.ActividadAsignadaRepository = new ActividadAsignadaRepository();
    this.PertenecienteRepository = new PertenecienteRepository();
    this.NotificationProducerService = new NotificationProducerService();
    this.ActividadPersonalizadaRepository = new ActividadPersonalizadaRepository();
  }

  getAllAsync = async () => {
    console.log('ActividadAsignadaService.getAllAsync()');
    const returnArray = await this.ActividadAsignadaRepository.getAllAsync();
    if (returnArray == null) return null;
    return returnArray;
  };

  getByIdAsync = async (id) => {
    console.log(`ActividadAsignadaService.getByIdAsync(${id})`);
    if (!id || Number.isNaN(id)) {
      throw new Error('El id de la actividad asignada es invalido.');
    }
    const cacheKey = `actividad-asignada.${id}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;
    const returnEntity = await this.ActividadAsignadaRepository.getByIdAsync(id);
    if (returnEntity) await cacheService.set(cacheKey, returnEntity, 300);
    return returnEntity;
  };

  getByPertenecienteIdAsync = async (idPerteneciente) => {
    console.log(`ActividadAsignadaService.getByPertenecienteIdAsync(${idPerteneciente})`);
    if (!idPerteneciente || Number.isNaN(idPerteneciente)) {
      throw new Error('El id del perteneciente es invalido.');
    }
    const cacheKey = `actividad-asignada.perteneciente.${idPerteneciente}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;
    const result = await this.ActividadAsignadaRepository.getByPertenecienteIdAsync(idPerteneciente);
    if (result) await cacheService.set(cacheKey, result, 300);
    return result;
  };

  createAsync = async (entity) => {
    console.log(`ActividadAsignadaService.createAsync(${JSON.stringify(entity)})`);
    this.validarActividadAsignadaParaCrear(entity);
    if (entity.id_actividad_personalizada) {
      const [activity, perteneciente] = await Promise.all([
        this.ActividadPersonalizadaRepository.getByIdAsync(entity.id_actividad_personalizada),
        this.PertenecienteRepository.getByIdAsync(entity.id_perteneciente),
      ]);
      const gameLine = String(activity?.descripcion || '').split('\n').find((line) => line.trim().startsWith('Juego:'));
      if (gameLine) {
        try {
          const metadata = JSON.parse(gameLine.replace(/^Juego:\s*/i, ''));
          const sourceUserId = metadata?.gameData?.routineSequence?.sourceRoutine?.sourceUserId;
          if (sourceUserId && Number(sourceUserId) !== Number(perteneciente?.id_usuario)) {
            throw new AppError('La instantanea de rutina solo puede asignarse al perteneciente de origen.', 403);
          }
        } catch (error) {
          if (error instanceof AppError) throw error;
        }
      }
    }
    const newId = await this.ActividadAsignadaRepository.createAsync(entity);
    await cacheService.delByPattern(`actividad-asignada.perteneciente.${entity.id_perteneciente}`);
    const perteneciente = await this.PertenecienteRepository.getByIdAsync(entity.id_perteneciente);
    if (perteneciente) {
      await this.NotificationProducerService.createAsync({
        recipientUserId: perteneciente.id_usuario,
        actorUserId: entity.id_usuario_asignador,
        contextUserId: perteneciente.id_usuario,
        typeName: 'Información',
        title: 'Nueva actividad asignada',
        body: 'Tenés una nueva actividad disponible.',
        referenceType: 'activity',
        referenceId: newId,
      });
    }
    return newId;
  };

  updateAsync = async (entity) => {
    console.log(`ActividadAsignadaService.updateAsync(${JSON.stringify(entity)})`);
    if (!entity?.id || Number.isNaN(entity.id)) {
      throw new Error('El id de la actividad asignada es obligatorio para actualizar.');
    }
    const previousEntity = await this.ActividadAsignadaRepository.getByIdAsync(entity.id);
    if (previousEntity == null) return 0;
    const rowsAffected = await this.ActividadAsignadaRepository.updateAsync(entity);
    await cacheService.delByPattern('actividad-asignada.*');
    if (rowsAffected > 0 && !previousEntity.fecha_completada && entity.fecha_completada) {
      const perteneciente = await this.PertenecienteRepository.getByIdAsync(previousEntity.id_perteneciente);
      if (perteneciente && previousEntity.id_usuario_asignador !== perteneciente.id_usuario) {
        await this.NotificationProducerService.createAsync({
          recipientUserId: previousEntity.id_usuario_asignador,
          actorUserId: perteneciente.id_usuario,
          contextUserId: perteneciente.id_usuario,
          typeName: 'Información',
          title: 'Actividad completada',
          body: 'Se completó una actividad asignada.',
          referenceType: 'activity',
          referenceId: entity.id,
        });
      }
    }
    return rowsAffected;
  };

  completeForUserAsync = async (id, idUsuario, score = null) => {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new AppError('El id de la actividad asignada es invalido.', 400);
    }
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) {
      throw new AppError('El puntaje debe ser un entero entre 0 y 100.', 400);
    }

    const previousEntity = await this.ActividadAsignadaRepository.getByIdAsync(numericId);
    if (!previousEntity) throw new AppError('Actividad asignada no encontrada.', 404);

    const context = await AuthorizationService.getUserContext(idUsuario);
    if (Number(context?.perteneciente?.id) !== Number(previousEntity.id_perteneciente)) {
      throw new AppError('Solo el perteneciente asignado puede completar esta actividad.', 403);
    }
    await AuthorizationService.assertCanWritePertenecienteResource(idUsuario, previousEntity.id_perteneciente, {
      pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.COMPLETAR_ACTIVIDADES,
      allowTutor: false,
    });

    const completed = await this.ActividadAsignadaRepository.completeAsync(numericId, score);
    await cacheService.delByPattern(`actividad-asignada.${numericId}`);
    await cacheService.delByPattern(`actividad-asignada.perteneciente.${previousEntity.id_perteneciente}`);

    if (!previousEntity.fecha_completada && previousEntity.id_usuario_asignador !== Number(idUsuario)) {
      await this.NotificationProducerService.createAsync({
        recipientUserId: previousEntity.id_usuario_asignador,
        actorUserId: Number(idUsuario),
        contextUserId: Number(idUsuario),
        typeName: 'InformaciÃ³n',
        title: 'Actividad completada',
        body: 'Se completÃ³ una actividad asignada.',
        referenceType: 'activity',
        referenceId: numericId,
      });
    }

    return completed;
  };

  deleteByIdAsync = async (id) => {
    console.log(`ActividadAsignadaService.deleteByIdAsync(${id})`);
    if (!id || Number.isNaN(id)) {
      throw new Error('El id de la actividad asignada es invalido.');
    }
    const rowsAffected = await this.ActividadAsignadaRepository.deleteByIdAsync(id);
    await cacheService.delByPattern('actividad-asignada.*');
    return rowsAffected;
  };

  validarActividadAsignadaParaCrear = (entity) => {
    if (!entity) {
      throw new Error('La actividad asignada es obligatoria.');
    }
    if (!entity.id_actividad && !entity.id_actividad_personalizada) {
      throw new Error('Se debe indicar id_actividad o id_actividad_personalizada.');
    }
    if (entity.id_actividad && entity.id_actividad_personalizada) {
      throw new Error('Solo se puede indicar id_actividad o id_actividad_personalizada, no ambos.');
    }
    if (!entity.id_perteneciente) {
      throw new Error('id_perteneciente es obligatorio.');
    }
    if (!entity.id_usuario_asignador) {
      throw new Error('id_usuario_asignador es obligatorio.');
    }
    if (!entity.id_estado_actividad) {
      throw new Error('id_estado_actividad es obligatorio.');
    }
    if (!entity.fecha_asignacion) {
      throw new Error('fecha_asignacion es obligatorio.');
    }
  };
}
