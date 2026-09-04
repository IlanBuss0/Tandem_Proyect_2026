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

  verifyIdentityDataAsync = async ({ imageBuffer, matricula, declaredIdentity, pdf417Raw = null } = {}) => {
    const numeroMatricula = this.validateMatricula(matricula);
    const identity = {
      nombre: String(declaredIdentity?.nombre || '').trim(),
      apellido: String(declaredIdentity?.apellido || '').trim(),
    };

    if (!identity.nombre || !identity.apellido) {
      throw new AppError('Nombre y apellido son obligatorios para validar la identidad profesional.', 400);
    }

    const pdf417Data = pdf417Raw && typeof this.DniExtractionService.parseText === 'function'
      ? this.DniExtractionService.parseText(pdf417Raw, 100)
      : null;
    const dniData = pdf417Data?.success ? pdf417Data : await this.DniExtractionService.extractAsync(imageBuffer);
    if (!dniData.success) {
      return this.verificationResult(VERIFICATION_STATUS.MANUAL_REVIEW, { reason: dniData.reason, dniData });
    }
    if (this.isExpired(dniData.fechaVencimiento)) {
      return this.verificationResult(VERIFICATION_STATUS.EXPIRED_DOCUMENT, { reason: 'EXPIRED_DOCUMENT', dniData });
    }
    if (!namesMatch(dniData.nombre, identity.nombre) || !namesMatch(dniData.apellido, identity.apellido)) {
      return this.verificationResult(VERIFICATION_STATUS.DATA_MISMATCH, { reason: 'DECLARED_IDENTITY_MISMATCH', dniData });
    }

    let refeps;
    try {
      refeps = await this.RefepsProvider.buscarPorMatricula(numeroMatricula);
    } catch (error) {
      const reason = error instanceof RefepsProviderError ? error.code : 'REFEPS_ERROR';
      return this.verificationResult(VERIFICATION_STATUS.VERIFICATION_ERROR, { reason, dniData });
    }
    if (!refeps.found) return this.verificationResult(VERIFICATION_STATUS.NOT_FOUND, { dniData });

    const match = this.IdentityMatcher.match({ dniData, numeroMatricula, refepsResults: refeps.results });
    if (match.ambiguous) return this.verificationResult(VERIFICATION_STATUS.MANUAL_REVIEW, { reason: 'AMBIGUOUS_RESULTS', dniData });
    if (!match.matched) return this.verificationResult(VERIFICATION_STATUS.DATA_MISMATCH, { dniData });
    if (!match.active) {
      return this.verificationResult(VERIFICATION_STATUS.MANUAL_REVIEW, { reason: 'INACTIVE_LICENSE', result: match.result, dniData });
    }

    return this.verificationResult(VERIFICATION_STATUS.VERIFIED, { result: match.result, dniData });
  };

  verifyRegistrationAsync = async ({ idUsuario, imageBuffer, declaredIdentity }) => {
    const profesional = await this.ProfesionalRepository.getByUsuarioIdAsync(idUsuario);
    if (!profesional) throw new AppError('No tenes un perfil profesional creado.', 404);

    const result = await this.verifyIdentityDataAsync({
      imageBuffer,
      matricula: profesional.matricula,
      declaredIdentity,
    });
    if (result.status !== VERIFICATION_STATUS.VERIFIED) {
      return this.persistResult(profesional, result.status, { reason: result.reason, result: result.result });
    }

    console.info('[ProfessionalVerification] verification succeeded');
    return this.persistResult(profesional, VERIFICATION_STATUS.VERIFIED, { result: result.result });
  };

  validateMatricula(value) {
    const matricula = String(value || '').trim();
    if (!/^\d{4,}$/.test(matricula)) {
      throw new AppError('La matricula debe tener al menos 4 digitos y solo numeros.', 400, 'INVALID_LICENSE');
    }
    return matricula;
  }

  isExpired(value, now = new Date()) {
    if (!value) return true;
    const expiry = new Date(`${value}T23:59:59.999Z`);
    return Number.isNaN(expiry.getTime()) || expiry.getTime() < now.getTime();
  }

  verificationResult(status, { reason = null, result = null, dniData = null } = {}) {
    const reviewStatus = [VERIFICATION_STATUS.VERIFICATION_ERROR, VERIFICATION_STATUS.NOT_FOUND].includes(status)
      ? VERIFICATION_STATUS.MANUAL_REVIEW
      : status;
    return {
      status,
      reviewStatus,
      verified: status === VERIFICATION_STATUS.VERIFIED,
      reason,
      result,
      dni: dniData ? {
        nombre: dniData.nombre,
        apellido: dniData.apellido,
        dni: dniData.dni,
        nombreCompleto: dniData.nombreCompleto,
        fechaVencimiento: dniData.fechaVencimiento,
        confidence: dniData.confidence,
        structureScore: dniData.structureScore,
        detectedFields: dniData.detectedFields,
      } : null,
      messageCode: this.messageCode(status),
    };
  }

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
