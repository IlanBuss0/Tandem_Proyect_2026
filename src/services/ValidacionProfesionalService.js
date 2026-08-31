import ValidacionProfesionalRepository from '../repositories/ValidacionProfesionalRepository.js';
import ProfesionalRepository from '../repositories/ProfesionalRepository.js';
import AppError from '../modules/errors/AppError.js';
import DniExtractionService from './DniExtractionService.js';
import RefepsPublicProvider, { RefepsProviderError } from '../providers/professional-verification/RefepsPublicProvider.js';
import ProfessionalIdentityMatcher from './ProfessionalIdentityMatcher.js';
import { namesMatch } from '../modules/professional-verification/name-normalization.js';
import { VERIFICATION_METHOD, VERIFICATION_SOURCE, VERIFICATION_STATUS } from '../modules/professional-verification/verification.constants.js';

export default class ValidacionProfesionalService {
  constructor() {
    console.log('Estoy en: ValidacionProfesionalService.constructor()');
    this.ValidacionProfesionalRepository = new ValidacionProfesionalRepository();
    this.ProfesionalRepository = new ProfesionalRepository();
    this.DniExtractionService = new DniExtractionService();
    this.RefepsProvider = new RefepsPublicProvider();
    this.IdentityMatcher = new ProfessionalIdentityMatcher();
  }

  getMineAsync = async (idUsuario) => {
    console.log(`ValidacionProfesionalService.getMineAsync(${idUsuario})`);
    const profesional = await this.ProfesionalRepository.getByUsuarioIdAsync(idUsuario);
    if (!profesional) throw new AppError('No tenes un perfil profesional creado.', 404);
    return await this.ValidacionProfesionalRepository.getByProfesionalIdAsync(profesional.id);
  };

  getByIdForUserAsync = async (idUsuario, id) => {
    console.log(`ValidacionProfesionalService.getByIdForUserAsync(${idUsuario}, ${id})`);
    const validacion = await this.ValidacionProfesionalRepository.getByIdAsync(id);
    if (!validacion) return null;

    const profesional = await this.ProfesionalRepository.getByUsuarioIdAsync(idUsuario);
    if (!profesional || profesional.id !== validacion.id_profesional) {
      throw new AppError('No autorizado para consultar esta validacion.', 403);
    }

    return validacion;
  };

  createMineAsync = async (idUsuario, { numero_matricula, titulo_profesional, documento_dni_url } = {}) => {
    console.log(`ValidacionProfesionalService.createMineAsync(${idUsuario})`);

    const profesional = await this.ProfesionalRepository.getByUsuarioIdAsync(idUsuario);
    if (!profesional) throw new AppError('No tenes un perfil profesional creado.', 404);

    const estadoPendiente = await this.ValidacionProfesionalRepository.getEstadoValidacionPendienteAsync();
    if (!estadoPendiente?.id) {
      throw new AppError('No se encontro un estado de validacion inicial configurado.', 500);
    }

    const entity = {
      id_profesional: profesional.id,
      numero_matricula: numero_matricula ?? profesional.matricula,
      titulo_profesional,
      documento_dni_url,
      id_estado_validacion: estadoPendiente.id,
      observacion: null,
      id_administrador_validador: null,
      fecha_validacion: null,
    };

    return await this.ValidacionProfesionalRepository.createAsync(entity);
  };

  verifyRegistrationAsync = async ({ idUsuario, imageBuffer, declaredIdentity }) => {
    const profesional = await this.ProfesionalRepository.getByUsuarioIdAsync(idUsuario);
    if (!profesional) throw new AppError('No tenes un perfil profesional creado.', 404);

    const dniData = await this.DniExtractionService.extractAsync(imageBuffer);
    if (!dniData.success) {
      return this.persistResult(profesional, VERIFICATION_STATUS.MANUAL_REVIEW, { reason: dniData.reason });
    }
    if (!namesMatch(dniData.nombre, declaredIdentity.nombre) || !namesMatch(dniData.apellido, declaredIdentity.apellido)) {
      return this.persistResult(profesional, VERIFICATION_STATUS.DATA_MISMATCH, { reason: 'DECLARED_IDENTITY_MISMATCH' });
    }

    let refeps;
    try {
      refeps = await this.RefepsProvider.buscarPorMatricula(profesional.matricula);
    } catch (error) {
      const reason = error instanceof RefepsProviderError ? error.code : 'REFEPS_ERROR';
      return this.persistResult(profesional, VERIFICATION_STATUS.VERIFICATION_ERROR, { reason });
    }
    if (!refeps.found) return this.persistResult(profesional, VERIFICATION_STATUS.NOT_FOUND);

    const match = this.IdentityMatcher.match({ dniData, numeroMatricula: profesional.matricula, refepsResults: refeps.results });
    if (match.ambiguous) return this.persistResult(profesional, VERIFICATION_STATUS.MANUAL_REVIEW, { reason: 'AMBIGUOUS_RESULTS' });
    if (!match.matched) return this.persistResult(profesional, VERIFICATION_STATUS.DATA_MISMATCH);
    if (!match.active) return this.persistResult(profesional, VERIFICATION_STATUS.MANUAL_REVIEW, { reason: 'INACTIVE_LICENSE', result: match.result });

    console.info('[ProfessionalVerification] verification succeeded');
    return this.persistResult(profesional, VERIFICATION_STATUS.VERIFIED, { result: match.result });
  };

  persistResult = async (profesional, status, { reason = null, result = null } = {}) => {
    const effectiveStatus = [VERIFICATION_STATUS.VERIFICATION_ERROR, VERIFICATION_STATUS.NOT_FOUND].includes(status)
      ? VERIFICATION_STATUS.MANUAL_REVIEW
      : status;
    await this.ValidacionProfesionalRepository.createAutomatedResultAsync({
      id_profesional: profesional.id,
      numero_matricula: profesional.matricula,
      status,
      profile_status: effectiveStatus,
      source: VERIFICATION_SOURCE,
      verification_method: VERIFICATION_METHOD,
      profesion: result?.profesion ?? profesional.profesion,
      jurisdiccion: result?.jurisdiccion ?? null,
      observacion: reason,
      fecha_validacion: new Date(),
    });
    return { status, reviewStatus: effectiveStatus, messageCode: this.messageCode(status) };
  };

  messageCode(status) {
    if (status === VERIFICATION_STATUS.VERIFIED) return 'PROFESSIONAL_CREDENTIALS_VERIFIED';
    if (status === VERIFICATION_STATUS.DATA_MISMATCH) return 'PROFESSIONAL_DATA_MISMATCH';
    return 'PROFESSIONAL_VERIFICATION_PENDING';
  }
}
