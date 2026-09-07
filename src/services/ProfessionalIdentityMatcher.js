import { namesMatch, normalizeDocument } from '../modules/professional-verification/name-normalization.js';

export default class ProfessionalIdentityMatcher {
  match({ dniData, numeroMatricula, refepsResults }) {
    const sameMatricula = refepsResults.filter(item => String(item.matricula).trim() === String(numeroMatricula).trim());
    const sameIdentity = sameMatricula.filter(item =>
      namesMatch(dniData.nombre, item.nombre)
      && namesMatch(dniData.apellido, item.apellido)
      && /^\d{7,8}$/.test(normalizeDocument(item.dni))
      && normalizeDocument(item.dni) === normalizeDocument(dniData.dni));
    return {
      matched: sameIdentity.length === 1,
      ambiguous: sameIdentity.length > 1,
      active: sameIdentity.length === 1 && sameIdentity[0].habilitado,
      result: sameIdentity.length === 1 ? sameIdentity[0] : null,
    };
  }
}
