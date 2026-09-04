import NotificacionRepository from '../repositories/NotificacionRepository.js';

export default class NotificacionService {
  constructor() {
    this.NotificacionRepository = new NotificacionRepository();
  }

  getMineAsync = async (userId, limit) => {
    this.validateUserId(userId);
    return this.NotificacionRepository.getByUsuarioDestinoIdAsync(userId, limit);
  };

  markAsReadForUserAsync = async (notificationId, userId) => {
    this.validateUserId(userId);
    if (!Number.isInteger(Number(notificationId)) || Number(notificationId) <= 0) {
      throw new Error('El id de la notificacion es invalido.');
    }
    return this.NotificacionRepository.markAsReadForUserAsync(notificationId, userId);
  };

  markAllAsReadForUserAsync = async (userId) => {
    this.validateUserId(userId);
    return this.NotificacionRepository.markAllAsReadForUserAsync(userId);
  };

  validateUserId = (userId) => {
    if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
      throw new Error('El usuario autenticado es invalido.');
    }
  };
}
