import TutorRepository from '../repositories/TutorRepository.js';

export default class TutorService {
  constructor() {
    console.log('Estoy en: TutorService.constructor()');
    this.TutorRepository = new TutorRepository();
  }

  getAllAsync = async () => {
    console.log('TutorService.getAllAsync()');
    const returnArray = await this.TutorRepository.getAllAsync();
    if (returnArray == null) return null;
    return returnArray;
  };

  getByIdAsync = async (id) => {
    console.log(`TutorService.getByIdAsync(${id})`);
    if (!id || Number.isNaN(id)) {
      throw new Error('El id del tutor es invalido.');
    }
    const returnEntity = await this.TutorRepository.getByIdAsync(id);
    return returnEntity;
  };

  getByUsuarioIdAsync = async (idUsuario) => {
    console.log(`TutorService.getByUsuarioIdAsync(${idUsuario})`);
    if (!idUsuario || Number.isNaN(idUsuario)) {
      throw new Error('El id del usuario es invalido.');
    }
    return await this.TutorRepository.getByUsuarioIdAsync(idUsuario);
  };

  createAsync = async (entity) => {
    console.log(`TutorService.createAsync(${JSON.stringify(entity)})`);
    this.validarTutorParaCrear(entity);
    const tutorConMismoUsuario = await this.TutorRepository.getByUsuarioIdAsync(entity.id_usuario);
    if (tutorConMismoUsuario != null) {
      throw new Error(`Ya existe un tutor asociado al usuario con id ${entity.id_usuario}.`);
    }
    const newId = await this.TutorRepository.createAsync(entity);
    return newId;
  };

  updateAsync = async (entity) => {
    console.log(`TutorService.updateAsync(${JSON.stringify(entity)})`);
    if (!entity?.id || Number.isNaN(entity.id)) {
      throw new Error('El id del tutor es obligatorio para actualizar.');
    }
    const previousEntity = await this.TutorRepository.getByIdAsync(entity.id);
    if (previousEntity == null) return 0;
    if (entity.id_usuario && entity.id_usuario !== previousEntity.id_usuario) {
      const tutorConMismoUsuario = await this.TutorRepository.getByUsuarioIdAsync(entity.id_usuario);
      if (tutorConMismoUsuario != null) {
        throw new Error(`Ya existe un tutor asociado al usuario con id ${entity.id_usuario}.`);
      }
    }
    const rowsAffected = await this.TutorRepository.updateAsync(entity);
    return rowsAffected;
  };

  deleteByIdAsync = async (id) => {
    console.log(`TutorService.deleteByIdAsync(${id})`);
    if (!id || Number.isNaN(id)) {
      throw new Error('El id del tutor es invalido.');
    }
    const rowsAffected = await this.TutorRepository.deleteByIdAsync(id);
    return rowsAffected;
  };

  validarTutorParaCrear = (entity) => {
    if (!entity) throw new Error('El tutor es obligatorio.');
    if (!entity.id_usuario) throw new Error('id_usuario es obligatorio.');
  };
}
