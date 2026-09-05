import ProfesionalRepository from '../repositories/ProfesionalRepository.js';
import AppError from '../modules/errors/AppError.js';

export default class ProfesionalService {
  constructor() {
    console.log('Estoy en: ProfesionalService.constructor()');
    this.ProfesionalRepository = new ProfesionalRepository();
  }

  getAllPublicAsync = async () => {
    console.log('ProfesionalService.getAllPublicAsync()');
    return await this.ProfesionalRepository.getAllPublicAsync();
  };

  getByIdPublicAsync = async (id) => {
    console.log(`ProfesionalService.getByIdPublicAsync(${id})`);

    if (!id || Number.isNaN(id)) {
      throw new AppError('El id del profesional es invalido.', 400);
    }

    return await this.ProfesionalRepository.getByIdPublicAsync(id);
  };

  getMineAsync = async (idUsuario) => {
    console.log(`ProfesionalService.getMineAsync(${idUsuario})`);
    return await this.ProfesionalRepository.getByUsuarioIdAsync(idUsuario);
  };

  getByUsuarioIdPublicAsync = async (idUsuario) => {
    console.log(`ProfesionalService.getByUsuarioIdPublicAsync(${idUsuario})`);

    if (!idUsuario || Number.isNaN(idUsuario)) {
      throw new AppError('El id del usuario es invalido.', 400);
    }

    return await this.ProfesionalRepository.getByUsuarioIdPublicAsync(idUsuario);
  };

  createMineAsync = async (idUsuario, { profesion, especialidad = null, matricula, institucion = null } = {}) => {
    console.log(`ProfesionalService.createMineAsync(${idUsuario})`);

    const existente = await this.ProfesionalRepository.getByUsuarioIdAsync(idUsuario);
    if (existente != null) {
      throw new AppError('Ya existe un perfil profesional asociado a tu usuario.', 409);
    }

    const entity = { id_usuario: idUsuario, profesion, especialidad, matricula, institucion };
    this.validarProfesionalParaCrear(entity);

    const profesionalConMismaMatricula = await this.ProfesionalRepository.getByMatriculaAsync(entity.matricula);
    if (profesionalConMismaMatricula != null) {
      throw new AppError(`Ya existe un profesional con la matricula ${entity.matricula}.`, 409);
    }

    const estadoPendiente = await this.ProfesionalRepository.getEstadoValidacionPendienteAsync();
    entity.id_estado_validacion = estadoPendiente?.id ?? null;

    if (!entity.id_estado_validacion) {
      throw new AppError('No se encontro un estado de validacion inicial configurado.', 500);
    }

    return await this.ProfesionalRepository.createAsync(entity);
  };

  updateMineAsync = async (idUsuario, { profesion, especialidad, matricula, institucion } = {}) => {
    console.log(`ProfesionalService.updateMineAsync(${idUsuario})`);

    const previousEntity = await this.ProfesionalRepository.getByUsuarioIdAsync(idUsuario);
    if (previousEntity == null) {
      throw new AppError('No existe un perfil profesional asociado a tu usuario.', 404);
    }

    const entity = { id: previousEntity.id, id_usuario: previousEntity.id_usuario };
    if (profesion !== undefined) entity.profesion = profesion;
    if (especialidad !== undefined) entity.especialidad = especialidad;
    if (institucion !== undefined) entity.institucion = institucion;

    const matriculaCambio = matricula !== undefined && matricula !== previousEntity.matricula;
    if (matriculaCambio) {
      const profesionalConMismaMatricula = await this.ProfesionalRepository.getByMatriculaAsync(matricula);
      if (profesionalConMismaMatricula != null && profesionalConMismaMatricula.id !== previousEntity.id) {
        throw new AppError(`Ya existe un profesional con la matricula ${matricula}.`, 409);
      }
      entity.matricula = matricula;

      const estadoPendiente = await this.ProfesionalRepository.getEstadoValidacionPendienteAsync();
      if (estadoPendiente?.id) {
        entity.id_estado_validacion = estadoPendiente.id;
      }
    }

    return await this.ProfesionalRepository.updateAsync(entity);
  };

  validarProfesionalParaCrear = (entity) => {
    if (!entity) {
      throw new AppError('El profesional es obligatorio.', 400);
    }

    if (!entity.id_usuario) {
      throw new AppError('id_usuario es obligatorio.', 400);
    }

    if (!entity.profesion) {
      throw new AppError('profesion es obligatorio.', 400);
    }

    if (!entity.matricula) {
      throw new AppError('matricula es obligatorio.', 400);
    }
  };
}
