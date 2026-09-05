import MensajeRepository from '../repositories/MensajeRepository.js';
import MensajeArchivoRepository from '../repositories/MensajeArchivoRepository.js';
import ArchivoRepository from '../repositories/ArchivoRepository.js';
import PermisoArchivoRepository from '../repositories/PermisoArchivoRepository.js';
import ParticipanteChatService from './ParticipanteChatService.js';
import ChatNotificationJobService from './ChatNotificationJobService.js';
import AuthorizationService from './AuthorizationService.js';
import { enqueueChatMessageNotifications } from '../queues/notificationQueue.js';

export default class MensajeService {
  constructor() {
    console.log('Estoy en: MensajeService.constructor()');
    this.MensajeRepository = new MensajeRepository();
    this.MensajeArchivoRepository = new MensajeArchivoRepository();
    this.ArchivoRepository = new ArchivoRepository();
    this.PermisoArchivoRepository = new PermisoArchivoRepository();
    this.ParticipanteChatService = new ParticipanteChatService();  
    this.ChatNotificationJobService = new ChatNotificationJobService();
  }

  getAllAsync = async () => { console.log('MensajeService.getAllAsync()'); const r = await this.MensajeRepository.getAllAsync(); if (r == null) return null; return r; };
  getByIdAsync = async (id) => { console.log(`MensajeService.getByIdAsync(${id})`); if (!id || Number.isNaN(id)) { throw new Error('El id del mensaje es invalido.'); } return await this.MensajeRepository.getByIdAsync(id); };
  
  getByChatIdAsync = async (idChat, limit = 30, beforeId = null, afterId = null) => {
    console.log(`MensajeService.getByChatIdAsync(${idChat}, ${limit}, ${beforeId}, ${afterId})`);
    if (!idChat || Number.isNaN(idChat)) { throw new Error('El id del chat es invalido.'); }
    return await this.MensajeRepository.getByChatIdAsync(idChat, limit, beforeId, afterId);
  };

  getByChatForUserAsync = async (idChat, idUsuario, limit = 30, beforeId = null, afterId = null) => {
    await this.ParticipanteChatService.ensureActiveParticipantAsync(idChat, idUsuario);
    return await this.MensajeRepository.getByChatForParticipantAsync(idChat, idUsuario, limit, beforeId, afterId);
  };

  createAsync = async (entity) => { console.log(`MensajeService.createAsync(chat=${entity?.id_chat})`); this.validarMensajeParaCrear(entity); return await this.MensajeRepository.createAsync(entity); };

  createFromUserAsync = async (entity, idArchivos = []) => {
    console.log(`MensajeService.createFromUserAsync(chat=${entity?.id_chat}, emisor=${entity?.id_usuario_emisor})`);
    await this.ParticipanteChatService.ensureActiveParticipantAsync(entity?.id_chat, entity?.id_usuario_emisor);
    await AuthorizationService.assertCanSendMessageToChat(entity?.id_usuario_emisor, entity?.id_chat);
    this.validarMensajeParaCrear(entity);
    const attachmentIds = await this.validateAttachmentAccessAsync(entity?.id_usuario_emisor, entity?.id_chat, idArchivos);
    const newId = await this.MensajeRepository.createAsync(entity);
    const message = await this.MensajeRepository.getByIdAsync(newId);

    if (attachmentIds.length > 0) {
      await this.MensajeArchivoRepository.createManyAsync(
        attachmentIds.map((idArchivo) => ({ id_mensaje: message.id, id_archivo: idArchivo })),
      );

      message._archivos_ids = attachmentIds;
    }

    await this.enqueueNotificationsAsync(message);

    return message;
  };

  validateAttachmentAccessAsync = async (idUsuario, idChat, idArchivos = []) => {
    if (!Array.isArray(idArchivos) || idArchivos.length === 0) return [];

    const uniqueIds = Array.from(new Set(idArchivos.map((id) => parseInt(id)).filter((id) => Number.isInteger(id) && id > 0)));
    if (uniqueIds.length !== idArchivos.length) {
      const error = new Error('La lista de archivos contiene ids invalidos.');
      error.statusCode = 400;
      throw error;
    }

    // 1 query trae todos los archivos (antes: 1 getByIdAsync por archivo).
    const archivos = await this.ArchivoRepository.getByIdsAsync(uniqueIds);
    const archivoById = new Map(archivos.map((archivo) => [Number(archivo.id), archivo]));

    for (const idArchivo of uniqueIds) {
      const archivo = archivoById.get(idArchivo);
      if (!archivo || archivo.activo === false) {
        const error = new Error(`El archivo ${idArchivo} no existe o no esta activo.`);
        error.statusCode = 403;
        throw error;
      }
    }

    // 1 query resuelve los permisos de todos los archivos ajenos (antes: 1
    // hasAccessForUserOrChatAsync por archivo).
    const idsAjenos = uniqueIds.filter((idArchivo) => archivoById.get(idArchivo).id_usuario_creador !== idUsuario);
    if (idsAjenos.length > 0) {
      const idsConAcceso = new Set(
        await this.PermisoArchivoRepository.filterAccessibleForUserOrChatAsync(idsAjenos, idUsuario, idChat),
      );
      for (const idArchivo of idsAjenos) {
        if (!idsConAcceso.has(idArchivo)) {
          const error = new Error(`No tenes permiso para adjuntar el archivo ${idArchivo}.`);
          error.statusCode = 403;
          throw error;
        }
      }
    }

    return uniqueIds;
  };

  enqueueNotificationsAsync = async (message) => {
    const queued = await enqueueChatMessageNotifications({
      messageId: message.id,
      idChat: message.id_chat,
      idUsuarioEmisor: message.id_usuario_emisor,
    });

    if (queued) return;

    setImmediate(() => {
      this.ChatNotificationJobService
        .processMessageNotificationsAsync({ messageId: message.id })
        .catch((err) => console.error('Error notificaciones:', err.message));
    });
  };

  updateFromUserAsync = async (entity, idUsuario) => {
    console.log(`MensajeService.updateFromUserAsync(${entity.id}, ${idUsuario})`);
    const mensaje = await this.getByIdAsync(entity.id);
    if (!mensaje) throw new Error('Mensaje no encontrado.');
    if (mensaje.id_usuario_emisor !== idUsuario) {
        throw new Error('No tienes permiso para editar este mensaje.');
    }
    const updatedEntity = { ...mensaje, contenido: entity.contenido, fecha_edicion: new Date() };
    return await this.MensajeRepository.updateAsync(updatedEntity);
  };

  deleteFromUserAsync = async (id, idUsuario) => {
    console.log(`MensajeService.deleteFromUserAsync(${id}, ${idUsuario})`);
    const mensaje = await this.getByIdAsync(id);
    if (!mensaje) throw new Error('Mensaje no encontrado.');
    if (mensaje.id_usuario_emisor !== idUsuario) {
        throw new Error('No tienes permiso para eliminar este mensaje.');
    }
    return await this.MensajeRepository.deleteByIdAsync(id);
  };

  updateAsync = async (entity) => { console.log(`MensajeService.updateAsync(${JSON.stringify(entity)})`); if (!entity?.id || Number.isNaN(entity.id)) { throw new Error('El id del mensaje es obligatorio para actualizar.'); } const prev = await this.MensajeRepository.getByIdAsync(entity.id); if (prev == null) return 0; return await this.MensajeRepository.updateAsync(entity); };
  deleteByIdAsync = async (id) => { console.log(`MensajeService.deleteByIdAsync(${id})`); if (!id || Number.isNaN(id)) { throw new Error('El id del mensaje es invalido.'); } return await this.MensajeRepository.deleteByIdAsync(id); };

  validarMensajeParaCrear = (entity) => {
    if (!entity) throw new Error('El mensaje es obligatorio.');
    if (!entity.id_chat) throw new Error('id_chat es obligatorio.');
    if (!entity.id_usuario_emisor) throw new Error('id_usuario_emisor es obligatorio.');
    if (!entity.id_tipo_mensaje) throw new Error('id_tipo_mensaje es obligatorio.');
    if (!entity.fecha_envio) throw new Error('fecha_envio es obligatorio.');
  };
}
