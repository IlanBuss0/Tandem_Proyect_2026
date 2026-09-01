import AppError from '../modules/errors/AppError.js';
import crypto from 'crypto';
import axios from 'axios';
import BD from '../db/BD.js';
import AuthRepository from '../repositories/AuthRepository.js';
import RefreshTokenRepository from '../repositories/RefreshTokenRepository.js';
import EmailVerificationRepository from '../repositories/EmailVerificationRepository.js';
import PasswordResetRepository from '../repositories/PasswordResetRepository.js';
import UsuarioServiceClass from './UsuarioService.js';
import PertenecienteServiceClass from './PertenecienteService.js';
import TutorServiceClass from './TutorService.js';
import ProfesionalServiceClass from './ProfesionalService.js';
import EmailServiceClass from './EmailService.js';
import { compareValue, hashValue, shouldRehashValue } from '../modules/security/hash.helper.js';
import { getJwtExpiresAt, signJwt } from '../modules/security/jwt.helper.js';
import {
  createSessionFamilyId,
  generateRefreshToken,
  getRefreshExpiresAt,
  hashRefreshToken,
} from '../modules/security/refresh-token.helper.js';
import { envConfig } from '../configs/env.config.js';
import ValidacionProfesionalServiceClass from './ValidacionProfesionalService.js';
import { VERIFICATION_STATUS } from '../modules/professional-verification/verification.constants.js';

const UsuarioService = new UsuarioServiceClass();
const PertenecienteService = new PertenecienteServiceClass();
const TutorService = new TutorServiceClass();
const ProfesionalService = new ProfesionalServiceClass();
const EmailService = new EmailServiceClass();
const ValidacionProfesionalService = new ValidacionProfesionalServiceClass();

const EMAIL_TOKEN_EXPIRES_MS = 24 * 60 * 60 * 1000; // 24hs
const PASSWORD_RESET_EXPIRES_MS = 60 * 60 * 1000; // 1h
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

// Unicos roles alcanzables desde el registro publico. Administrador (4) queda
// deliberadamente afuera: antes el register copiaba el body crudo y cualquiera
// podia mandar id_tipo_usuario:4 para crearse una cuenta de admin.
const ROLES_REGISTRABLES = Object.freeze({
  perteneciente: 1,
  tutor: 2,
  profesional: 3,
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 8+ caracteres, al menos una letra y un numero.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

class AuthService {
  async createSession(user, familyId = createSessionFamilyId(), db = BD) {
    const accessToken = signJwt({ id: user.id, correo: user.correo, nombre_usuario: user.nombre_usuario });
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const refreshExpiresAt = getRefreshExpiresAt();

    await RefreshTokenRepository.create({
      idUsuario: user.id,
      tokenHash: refreshTokenHash,
      familyId,
      expiresAt: refreshExpiresAt,
    }, db);

    return {
      user,
      token: accessToken,
      accessToken,
      expiresAt: getJwtExpiresAt(),
      csrfToken: crypto.randomBytes(32).toString('base64url'),
      refreshToken,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  async register(data, dniFrente = null) {
    const rol = String(data?.rol || '').trim().toLowerCase();
    const idTipoUsuario = ROLES_REGISTRABLES[rol];

    if (!idTipoUsuario) {
      throw new AppError('rol es obligatorio y debe ser perteneciente, tutor o profesional.', 400);
    }

    const correo = String(data?.correo || '').trim();
    if (!EMAIL_REGEX.test(correo)) {
      throw new AppError('El correo no tiene un formato valido.', 400);
    }

    if (!PASSWORD_REGEX.test(String(data?.contrasena || ''))) {
      throw new AppError('La contrasena debe tener al menos 8 caracteres, con letras y numeros.', 400);
    }

    const nombreUsuario = String(data?.nombre_usuario || '').trim();
    const nombre = String(data?.nombre || '').trim();
    const apellido = String(data?.apellido || '').trim();

    if (!nombreUsuario || !nombre || !apellido) {
      throw new AppError('nombre_usuario, nombre y apellido son obligatorios.', 400);
    }

    if (idTipoUsuario === ROLES_REGISTRABLES.profesional && !dniFrente?.buffer) {
      throw new AppError('La fotografia del frente del DNI es obligatoria para profesionales.', 400);
    }

    // Whitelist estricta: nunca se aceptan contrasena_hash, activo, ni
    // id_tipo_usuario crudo desde el body (ver comentario de ROLES_REGISTRABLES).
    const entity = {
      id_tipo_usuario: idTipoUsuario,
      nombre_usuario: nombreUsuario,
      contrasena_hash: await hashValue(data.contrasena),
      nombre,
      apellido,
      correo,
      telefono: data?.telefono ?? null,
      fecha_nacimiento: data?.fecha_nacimiento ?? null,
      fecha_ingreso: new Date(),
    };

    const newId = await UsuarioService.createAsync(entity);

    try {
      await this._createRoleProfile(newId, idTipoUsuario, data);
    } catch (error) {
      // Sin perfil asociado el usuario queda sin rol efectivo (ver
      // AuthorizationService, que arma los roles a partir de la existencia de
      // esas filas). No hay hard-delete de usuarios, asi que se desactiva en
      // vez de dejarlo huerfano.
      await UsuarioService.deleteByIdAsync(newId).catch(() => {});
      throw error;
    }

    const user = await AuthRepository.findSafeById(newId);
    let professionalVerification;
    if (idTipoUsuario === ROLES_REGISTRABLES.profesional) {
      professionalVerification = await this._verifyProfessionalRegistrationSafely({
        idUsuario: newId,
        imageBuffer: dniFrente.buffer,
        declaredIdentity: { nombre, apellido },
      });
    }

    // Best-effort: si Resend esta caido o sin configurar no debe romper el
    // registro (EmailService ya loguea el link en consola como fallback).
    this._issueAndSendVerificationEmail(user).catch((error) => {
      console.error('[AuthService] No se pudo enviar el mail de verificacion:', error.message);
    });

    const session = await this.createSession(user);
    return professionalVerification ? { ...session, professionalVerification } : session;
  }

  _issueAndSendVerificationEmail = async (user) => {
    await EmailVerificationRepository.invalidatePendingForUser(user.id);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashRefreshToken(token);
    const expiresAt = new Date(Date.now() + EMAIL_TOKEN_EXPIRES_MS);

    await EmailVerificationRepository.create({ idUsuario: user.id, tokenHash, expiresAt });

    const verifyUrl = `${envConfig.appPublicUrl.replace(/\/$/, '')}/verificar-email?token=${token}`;

    return EmailService.sendVerificationEmailAsync({ to: user.correo, nombre: user.nombre, verifyUrl });
  };

  async verifyEmail(token) {
    if (!token) throw new AppError('token es obligatorio.', 400);

    const tokenHash = hashRefreshToken(String(token));
    await BD.transaction(async (client) => {
      const record = await EmailVerificationRepository.findByTokenHashForUpdate(tokenHash, client);
      if (!record) throw new AppError('El link de verificacion no es valido.', 400);
      if (record.used_at) throw new AppError('Este link ya fue usado.', 400);
      if (new Date(record.expires_at).getTime() <= Date.now()) throw new AppError('El link de verificacion expiro. Pedi uno nuevo.', 400);
      await EmailVerificationRepository.markUsed(record.id, client);
      await AuthRepository.markEmailVerified(record.id_usuario, client);
    });

    return { verified: true };
  }

  async resendVerification(idUsuario) {
    const user = await AuthRepository.findSafeById(idUsuario);
    if (!user) throw new AppError('Usuario no encontrado.', 404);
    if (user.email_verificado) throw new AppError('Tu email ya esta verificado.', 400);

    await this._issueAndSendVerificationEmail(user);
    return { sent: true };
  }

  async requestPasswordReset(data) {
    const correo = String(data?.correo || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(correo)) throw new AppError('El correo no tiene un formato valido.', 400);

    const user = await AuthRepository.findByCorreoOrNombreUsuario(correo);
    if (user?.activo !== false && user?.correo?.toLowerCase() === correo) {
      await PasswordResetRepository.invalidatePendingForUser(user.id);
      const token = crypto.randomBytes(32).toString('hex');
      await PasswordResetRepository.create({
        idUsuario: user.id,
        tokenHash: hashRefreshToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRES_MS),
      });
      const resetUrl = `${envConfig.appPublicUrl.replace(/\/$/, '')}/restablecer-contrasena?token=${token}`;
      await EmailService.sendPasswordResetEmailAsync({ to: user.correo, nombre: user.nombre, resetUrl });
    }

    return { sent: true };
  }

  async resetPassword(data) {
    const token = String(data?.token || '');
    const newPassword = String(data?.contrasena_nueva || '');
    if (!token) throw new AppError('token es obligatorio.', 400);
    if (!PASSWORD_REGEX.test(newPassword)) {
      throw new AppError('La nueva contrasena debe tener al menos 8 caracteres, con letras y numeros.', 400);
    }

    const tokenHash = hashRefreshToken(token);
    const passwordHash = await hashValue(newPassword);
    await BD.transaction(async (client) => {
      const record = await PasswordResetRepository.findByTokenHashForUpdate(tokenHash, client);
      if (!record || record.used_at || new Date(record.expires_at).getTime() <= Date.now()) {
        throw new AppError('El link de recuperacion no es valido o expiro.', 400);
      }
      await AuthRepository.updatePasswordHash(record.id_usuario, passwordHash, client);
      await PasswordResetRepository.markUsed(record.id, client);
      await RefreshTokenRepository.revokeAllForUser(record.id_usuario, client);
    });
    return { changed: true };
  }

  async getTutorAccount(idUsuario) {
    const account = await AuthRepository.findAccountById(idUsuario);
    if (!account) throw new AppError('Usuario no encontrado.', 404);
    if (!account.id_tutor) throw new AppError('Esta cuenta no pertenece a un tutor.', 403);
    return account;
  }

  async updateTutorAccount(idUsuario, data) {
    const current = await this.getTutorAccount(idUsuario);
    const nombre = String(data?.nombre || '').trim();
    const apellido = String(data?.apellido || '').trim();
    const correo = String(data?.correo || '').trim().toLowerCase();
    const parentesco = String(data?.parentesco || '').trim() || null;
    const telefono = String(data?.telefono || '').replace(/[^0-9]/g, '') || null;

    if (!nombre || !apellido) throw new AppError('Nombre y apellido son obligatorios.', 400);
    if (!EMAIL_REGEX.test(correo)) throw new AppError('El correo no tiene un formato valido.', 400);

    const emailChanged = correo !== String(current.correo).toLowerCase();
    if (emailChanged) {
      const password = String(data?.contrasena_actual || '');
      const credentials = await AuthRepository.findByCorreoOrNombreUsuario(current.nombre_usuario);
      if (!password || !credentials || !(await compareValue(password, credentials.contrasena_hash))) {
        throw new AppError('La contrasena actual es incorrecta.', 401);
      }
      const duplicate = await AuthRepository.findByCorreoOrNombreUsuario(correo);
      if (duplicate && Number(duplicate.id) !== Number(idUsuario)) {
        throw new AppError('El correo ya esta registrado.', 409);
      }
    }

    const updated = await AuthRepository.updateTutorAccount(idUsuario, { nombre, apellido, correo, telefono, parentesco });
    if (emailChanged) {
      await this._issueAndSendVerificationEmail(updated);
    }
    return updated;
  }

  async changePassword(idUsuario, data) {
    const currentPassword = String(data?.contrasena_actual || '');
    const newPassword = String(data?.contrasena_nueva || '');
    if (!PASSWORD_REGEX.test(newPassword)) {
      throw new AppError('La nueva contrasena debe tener al menos 8 caracteres, con letras y numeros.', 400);
    }

    const user = await AuthRepository.findSafeById(idUsuario);
    const credentials = user && await AuthRepository.findByCorreoOrNombreUsuario(user.nombre_usuario);
    if (!credentials || !(await compareValue(currentPassword, credentials.contrasena_hash))) {
      throw new AppError('La contrasena actual es incorrecta.', 401);
    }
    if (await compareValue(newPassword, credentials.contrasena_hash)) {
      throw new AppError('La nueva contrasena debe ser diferente de la actual.', 400);
    }

    const passwordHash = await hashValue(newPassword);
    await BD.transaction(async (client) => {
      await AuthRepository.updatePasswordHash(idUsuario, passwordHash, client);
      await RefreshTokenRepository.revokeAllForUser(idUsuario, client);
    });
    return { changed: true };
  }

  async changeEmail(idUsuario, data) {
    const correo = String(data?.correo_nuevo || '').trim().toLowerCase();
    const currentPassword = String(data?.contrasena_actual || '');
    if (!EMAIL_REGEX.test(correo)) throw new AppError('El correo no tiene un formato valido.', 400);

    const user = await AuthRepository.findSafeById(idUsuario);
    if (!user) throw new AppError('Usuario no encontrado.', 404);
    if (String(user.correo).toLowerCase() === correo) throw new AppError('El correo nuevo debe ser diferente del actual.', 400);

    const credentials = await AuthRepository.findByCorreoOrNombreUsuario(user.nombre_usuario);
    if (!currentPassword || !credentials || !(await compareValue(currentPassword, credentials.contrasena_hash))) {
      throw new AppError('La contrasena actual es incorrecta.', 401);
    }
    const duplicate = await AuthRepository.findByCorreoOrNombreUsuario(correo);
    if (duplicate && Number(duplicate.id) !== Number(idUsuario)) throw new AppError('El correo ya esta registrado.', 409);

    await BD.transaction(async (client) => {
      await AuthRepository.updateEmail(idUsuario, correo, client);
      await RefreshTokenRepository.revokeAllForUser(idUsuario, client);
    });
    const updated = await AuthRepository.findSafeById(idUsuario);
    await this._issueAndSendVerificationEmail(updated);
    return { correo: updated.correo, email_verificado: updated.email_verificado };
  }

  async loginWithGoogle(accessToken, rol, data = {}, dniFrente = null) {
    if (!accessToken) throw new AppError('accessToken es obligatorio.', 400);

    const requestedRole = String(rol || '').trim().toLowerCase();
    if (requestedRole === 'profesional' && !dniFrente?.buffer) {
      throw new AppError('La fotografia del frente del DNI es obligatoria para profesionales.', 400);
    }

    if (!envConfig.googleClientId) throw new AppError('El login con Google no esta configurado en el servidor.', 503);

    let payload;
    try {
      // Se valida contra el endpoint oficial de Google en vez de decodificar
      // el token a mano: si el access token es invalido, expirado o fue
      // revocado, Google mismo responde 401 y cortamos aca.
      const response = await axios.get(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
      payload = response.data;
    } catch {
      throw new AppError('Token de Google invalido.', 401);
    }

    if (!payload?.email) {
      throw new AppError('No se pudo obtener el email de la cuenta de Google.', 401);
    }

    const existing = await AuthRepository.findByCorreoOrNombreUsuario(payload.email);
    if (existing) {
      if (existing.activo === false) throw new AppError('Esta cuenta esta desactivada.', 403);
      delete existing.contrasena_hash;
      return this.createSession(existing);
    }

    const rolNormalizado = requestedRole;
    const idTipoUsuario = ROLES_REGISTRABLES[rolNormalizado];

    if (!idTipoUsuario) {
      // El front usa este code puntual para saber que tiene que pedirle el
      // rol al usuario antes de reintentar (todavia no existe la cuenta).
      throw new AppError('Elegi tu rol para terminar de crear tu cuenta.', 422, 'GOOGLE_NEEDS_ROL');
    }

    if (idTipoUsuario === ROLES_REGISTRABLES.profesional && (!data?.profesion || !data?.matricula)) {
      throw new AppError('profesion y matricula son obligatorios para registrarte como profesional.', 400);
    }

    const nombreUsuario = await this._generateUsernameFromEmail(payload.email);
    // Password inutilizable: esta cuenta solo entra por Google. Se genera
    // igual porque contrasena_hash es NOT NULL en la tabla.
    const randomPassword = crypto.randomBytes(32).toString('hex');

    const entity = {
      id_tipo_usuario: idTipoUsuario,
      nombre_usuario: nombreUsuario,
      contrasena_hash: await hashValue(randomPassword),
      nombre: payload.given_name || payload.name || 'Usuario',
      apellido: payload.family_name || '',
      correo: payload.email,
      telefono: null,
      fecha_nacimiento: null,
      fecha_ingreso: new Date(),
    };

    const newId = await UsuarioService.createAsync(entity);

    try {
      await this._createRoleProfile(newId, idTipoUsuario, data);
    } catch (error) {
      await UsuarioService.deleteByIdAsync(newId).catch(() => {});
      throw error;
    }

    // Google ya verifico este email — no hace falta mandar el link propio.
    await AuthRepository.markEmailVerified(newId);

    const user = await AuthRepository.findSafeById(newId);
    let professionalVerification;
    if (idTipoUsuario === ROLES_REGISTRABLES.profesional) {
      professionalVerification = await this._verifyProfessionalRegistrationSafely({
        idUsuario: newId,
        imageBuffer: dniFrente.buffer,
        declaredIdentity: {
          nombre: payload.given_name || payload.name || 'Usuario',
          apellido: payload.family_name || '',
        },
      });
    }
    const session = await this.createSession(user);
    return professionalVerification ? { ...session, professionalVerification } : session;
  }

  _verifyProfessionalRegistrationSafely = async ({ idUsuario, imageBuffer, declaredIdentity }) => {
    try {
      return await ValidacionProfesionalService.verifyRegistrationAsync({ idUsuario, imageBuffer, declaredIdentity });
    } catch (error) {
      console.error('[ProfessionalVerification] automated verification persistence failed:', error.message);
      return {
        status: VERIFICATION_STATUS.VERIFICATION_ERROR,
        reviewStatus: VERIFICATION_STATUS.MANUAL_REVIEW,
        messageCode: 'PROFESSIONAL_VERIFICATION_PENDING',
      };
    }
  };

  _generateUsernameFromEmail = async (email) => {
    const base = String(email).split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 20) || 'usuario';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = await BD.queryOne('SELECT id FROM usuarios WHERE LOWER(nombre_usuario) = LOWER($1)', [candidate]);
      if (!existing) return candidate;
    }

    return `${base}${Date.now()}`;
  };

  _createRoleProfile = async (idUsuario, idTipoUsuario, data) => {
    if (idTipoUsuario === ROLES_REGISTRABLES.perteneciente) {
      const [nivelApoyo, autonomia] = await Promise.all([
        BD.queryOne('SELECT id FROM niveles_apoyos ORDER BY orden ASC NULLS LAST, id ASC LIMIT 1'),
        BD.queryOne('SELECT id FROM autonomias_operativas ORDER BY orden ASC NULLS LAST, id ASC LIMIT 1'),
      ]);

      if (!nivelApoyo?.id || !autonomia?.id) {
        throw new AppError('Faltan catalogos de nivel de apoyo o autonomia para crear el perfil.', 500);
      }

      await PertenecienteService.createAsync({
        id_usuario: idUsuario,
        id_nivel_apoyo: nivelApoyo.id,
        id_autonomia_operativa: autonomia.id,
        puede_autogestionarse: false,
      });
      return;
    }

    if (idTipoUsuario === ROLES_REGISTRABLES.tutor) {
      await TutorService.createAsync({
        id_usuario: idUsuario,
        parentesco: data?.parentesco ? String(data.parentesco).trim() : null,
      });
      return;
    }

    if (idTipoUsuario === ROLES_REGISTRABLES.profesional) {
      await ProfesionalService.createMineAsync(idUsuario, {
        profesion: data?.profesion,
        especialidad: data?.especialidad ?? null,
        matricula: data?.matricula,
        institucion: data?.institucion ?? null,
      });
    }
  };

  async login({ correo, nombre_usuario, contrasena }) {
    const identificador = correo || nombre_usuario;
    const contrasenaIngresada = contrasena;

    if (!identificador || !contrasenaIngresada) throw new AppError('correo o nombre_usuario y contrasena son obligatorios', 400);

    const user = await AuthRepository.findByCorreoOrNombreUsuario(identificador);

    if (!user) throw new AppError('Credenciales invalidas', 401);
    if (user.activo === false) throw new AppError('Cuenta no disponible', 401);

    const valid = await compareValue(contrasenaIngresada, user.contrasena_hash);

    if (!valid) throw new AppError('Credenciales invalidas', 401);

    if (shouldRehashValue(user.contrasena_hash)) {
      await AuthRepository.updatePasswordHash(user.id, await hashValue(contrasenaIngresada));
    }

    delete user.contrasena_hash;

    return this.createSession(user);
  }

  async refresh(refreshToken) {
    if (!refreshToken) throw new AppError('No autenticado', 401);

    const tokenHash = hashRefreshToken(refreshToken);
    const result = await BD.transaction(async (client) => {
      const previous = await RefreshTokenRepository.findByTokenHashForUpdate(tokenHash, client);

      if (!previous) return null;

      if (previous.revoked_at) {
        await RefreshTokenRepository.revokeFamily(previous.family_id, client);
        return null;
      }

      if (new Date(previous.expires_at).getTime() <= Date.now()) {
        await RefreshTokenRepository.revoke(tokenHash, null, client);
        return null;
      }

      const user = await AuthRepository.findSafeById(previous.id_usuario, client);
      if (!user || user.activo === false) {
        await RefreshTokenRepository.revokeFamily(previous.family_id, client);
        return null;
      }

      const session = await this.createSession(user, previous.family_id, client);
      await RefreshTokenRepository.revoke(tokenHash, hashRefreshToken(session.refreshToken), client);

      return session;
    });

    if (!result) throw new AppError('No autenticado', 401);

    return result;
  }

  async logout(refreshToken) {
    if (!refreshToken) return { revoked: false };

    const tokenHash = hashRefreshToken(refreshToken);
    const existing = await RefreshTokenRepository.findByTokenHash(tokenHash);

    if (!existing) return { revoked: false };

    await RefreshTokenRepository.revoke(tokenHash);
    return { revoked: true };
  }

  async me(req) {
    if (!req.user?.id) throw new AppError('No autenticado', 401);

    const user = await AuthRepository.findSafeById(req.user.id);

    if (!user) throw new AppError('Usuario no encontrado', 404);

    return user;
  }
}

export default new AuthService();
