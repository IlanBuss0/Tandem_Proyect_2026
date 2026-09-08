import AcompanamientoRepository from '../repositories/AcompanamientoRepository.js';
import AuthorizationService from './AuthorizationService.js';
import { PROFESIONAL_PERMISSIONS } from '../modules/security/permissions.constants.js';
import PertenecienteRepository from '../repositories/PertenecienteRepository.js';
import UsuarioRepository from '../repositories/UsuarioRepository.js';
import SesionProfesionalRepository from '../repositories/SesionProfesionalRepository.js';
import AiReportService from './AiReportService.js';

const MAX_NOTE_LENGTH = 2000;
const MAX_AGREEMENT_LENGTH = 500;

export default class AcompanamientoService {
  constructor() {
    this.repository = new AcompanamientoRepository();
    this.pertenecienteRepository = new PertenecienteRepository();
    this.usuarioRepository = new UsuarioRepository();
    this.sesionRepository = new SesionProfesionalRepository();
    this.aiReportService = new AiReportService();
  }

  assertPertenecienteId = (value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new Error('El perteneciente es invalido.');
    return id;
  };

  assertId = (value, label = 'El id') => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} es invalido.`);
    return id;
  };

  assertText = (value, label, maxLength) => {
    const text = String(value || '').trim();
    if (!text) throw new Error(`${label} es obligatorio.`);
    if (text.length > maxLength) throw new Error(`${label} supera el maximo permitido.`);
    return text;
  };

  assertCanReadAsync = async (idUsuario, idPerteneciente) => {
    await AuthorizationService.assertCanReadPertenecienteResource(
      idUsuario,
      idPerteneciente,
      PROFESIONAL_PERMISSIONS.VER_HISTORIAL,
    );
  };

  assertCanManageObjectiveAsync = async (idUsuario, idPerteneciente) => {
    const context = await AuthorizationService.getUserContext(idUsuario);
    if (!context?.profesional?.id) throw Object.assign(new Error('Solo un profesional puede gestionar objetivos.'), { statusCode: 403 });
    await this.assertCanReadAsync(idUsuario, idPerteneciente);
  };

  getForUserAsync = async (idUsuario, idPerteneciente) => {
    const id = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanReadAsync(idUsuario, id);
    const [notas, objetivos, acuerdos] = await Promise.all([
      this.repository.getSharedNotesAsync(id),
      this.repository.getObjectivesAsync(id),
      this.repository.getAgreementsAsync(id),
    ]);
    return { id_perteneciente: id, notas, objetivos, acuerdos };
  };

  createNoteAsync = async (idUsuario, idPerteneciente, contenido) => {
    const id = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanReadAsync(idUsuario, id);
    const note = await this.repository.createSharedNoteAsync({
      idPerteneciente: id,
      idUsuarioAutor: idUsuario,
      contenido: this.assertText(contenido, 'El contenido', MAX_NOTE_LENGTH),
    });
    return this.getForUserAsync(idUsuario, id);
  };

  deleteNoteAsync = async (idUsuario, idPerteneciente, noteId) => {
    const belongingId = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanReadAsync(idUsuario, belongingId);
    const affected = await this.repository.deleteSharedNoteAsync(this.assertId(noteId, 'La nota'), belongingId);
    if (!affected) throw Object.assign(new Error('Nota compartida no encontrada.'), { statusCode: 404 });
    return this.getForUserAsync(idUsuario, belongingId);
  };

  createObjectiveAsync = async (idUsuario, idPerteneciente, payload) => {
    const id = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanManageObjectiveAsync(idUsuario, id);
    await this.repository.createObjectiveAsync({
      idPerteneciente: id,
      idUsuarioCreador: idUsuario,
      titulo: this.assertText(payload?.titulo, 'El titulo', 160),
      descripcion: payload?.descripcion ? this.assertText(payload.descripcion, 'La descripcion', 2000) : null,
    });
    return this.getForUserAsync(idUsuario, id);
  };

  updateObjectiveAsync = async (idUsuario, idPerteneciente, objectiveId, payload) => {
    const belongingId = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanManageObjectiveAsync(idUsuario, belongingId);
    const progreso = payload?.progreso === undefined ? undefined : Number(payload.progreso);
    if (progreso !== undefined && (!Number.isInteger(progreso) || progreso < 0 || progreso > 100)) throw new Error('El progreso debe estar entre 0 y 100.');
    const updated = await this.repository.updateObjectiveAsync({
      id: this.assertId(objectiveId, 'El objetivo'), idPerteneciente: belongingId,
      titulo: payload?.titulo === undefined ? undefined : this.assertText(payload.titulo, 'El titulo', 160),
      descripcion: payload?.descripcion === undefined ? undefined : String(payload.descripcion).trim().slice(0, 2000),
      estado: ['activo', 'pausado', 'completado'].includes(payload?.estado) ? payload.estado : undefined,
      progreso,
    });
    if (!updated) throw Object.assign(new Error('Objetivo no encontrado.'), { statusCode: 404 });
    return this.getForUserAsync(idUsuario, belongingId);
  };

  deleteObjectiveAsync = async (idUsuario, idPerteneciente, objectiveId) => {
    const belongingId = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanManageObjectiveAsync(idUsuario, belongingId);
    const affected = await this.repository.deleteObjectiveAsync(this.assertId(objectiveId, 'El objetivo'), belongingId);
    if (!affected) throw Object.assign(new Error('Objetivo no encontrado.'), { statusCode: 404 });
    return this.getForUserAsync(idUsuario, belongingId);
  };

  createAgreementAsync = async (idUsuario, idPerteneciente, texto) => {
    const id = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanReadAsync(idUsuario, id);
    await this.repository.createAgreementAsync({ idPerteneciente: id, idUsuarioCreador: idUsuario, texto: this.assertText(texto, 'El acuerdo', MAX_AGREEMENT_LENGTH) });
    return this.getForUserAsync(idUsuario, id);
  };

  updateAgreementAsync = async (idUsuario, idPerteneciente, agreementId, payload) => {
    const belongingId = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanReadAsync(idUsuario, belongingId);
    const updated = await this.repository.updateAgreementAsync({
      id: this.assertId(agreementId, 'El acuerdo'), idPerteneciente: belongingId,
      texto: payload?.texto === undefined ? undefined : this.assertText(payload.texto, 'El acuerdo', MAX_AGREEMENT_LENGTH),
      completado: payload?.completado === undefined ? undefined : Boolean(payload.completado),
    });
    if (!updated) throw Object.assign(new Error('Acuerdo no encontrado.'), { statusCode: 404 });
    return this.getForUserAsync(idUsuario, belongingId);
  };

  deleteAgreementAsync = async (idUsuario, idPerteneciente, agreementId) => {
    const belongingId = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanReadAsync(idUsuario, belongingId);
    const affected = await this.repository.deleteAgreementAsync(this.assertId(agreementId, 'El acuerdo'), belongingId);
    if (!affected) throw Object.assign(new Error('Acuerdo no encontrado.'), { statusCode: 404 });
    return this.getForUserAsync(idUsuario, belongingId);
  };

  askSharedQuestionAsync = async (idUsuario, idPerteneciente, pregunta) => {
    const id = this.assertPertenecienteId(idPerteneciente);
    await this.assertCanReadAsync(idUsuario, id);
    const question = this.assertText(pregunta, 'La pregunta', 500);
    const context = await this.getForUserAsync(idUsuario, id);
    const belonging = await this.pertenecienteRepository.getByIdAsync(id);
    const user = belonging ? await this.usuarioRepository.getByIdAsync(belonging.id_usuario) : null;
    if (!belonging || !user) throw Object.assign(new Error('Perteneciente no encontrado.'), { statusCode: 404 });
    const sessions = (await this.sesionRepository.getByPertenecienteIdAsync(id)).map((session) => ({
      titulo: session.titulo, fecha_sesion: session.fecha_sesion, estado: session.estado,
    }));
    return this.aiReportService.answerSharedSupportQuestionAsync({
      personaNombre: user.nombre || user.nombre_usuario || 'Perteneciente',
      pregunta: question,
      notas: context.notas,
      objetivos: context.objetivos,
      acuerdos: context.acuerdos,
      sesiones: sessions,
    });
  };
}
