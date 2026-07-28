import AppError from '../modules/errors/AppError.js';
import crypto from 'crypto';
import axios from 'axios';
import BD from '../db/BD.js';
import AuthRepository from '../repositories/AuthRepository.js';
import RefreshTokenRepository from '../repositories/RefreshTokenRepository.js';
import EmailVerificationRepository from '../repositories/EmailVerificationRepository.js';
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

const UsuarioService = new UsuarioServiceClass();
const PertenecienteService = new PertenecienteServiceClass();
const TutorService = new TutorServiceClass();
const ProfesionalService = new ProfesionalServiceClass();
const EmailService = new EmailServiceClass();

const EMAIL_TOKEN_EXPIRES_MS = 24 * 60 * 60 * 1000; // 24hs
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

  async register(data) {
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

    // Best-effort: si Resend esta caido o sin configurar no debe romper el
    // registro (EmailService ya loguea el link en consola como fallback).
    this._issueAndSendVerificationEmail(user).catch((error) => {
      console.error('[AuthService] No se pudo enviar el mail de verificacion:', error.message);
    });

    return this.createSession(user);
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
    const record = await EmailVerificationRepository.findByTokenHash(tokenHash);

    if (!record) throw new AppError('El link de verificacion no es valido.', 400);
    if (record.used_at) throw new AppError('Este link ya fue usado.', 400);
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      throw new AppError('El link de verificacion expiro. Pedi uno nuevo.', 400);
    }

    await EmailVerificationRepository.markUsed(record.id);
    await AuthRepository.markEmailVerified(record.id_usuario);

    return { verified: true };
  }

  async resendVerification(idUsuario) {
    const user = await AuthRepository.findSafeById(idUsuario);
    if (!user) throw new AppError('Usuario no encontrado.', 404);
    if (user.email_verificado) throw new AppError('Tu email ya esta verificado.', 400);

    await this._issueAndSendVerificationEmail(user);
    return { sent: true };
  }

  async loginWithGoogle(accessToken, rol, data = {}) {
    if (!envConfig.googleClientId) throw new AppError('El login con Google no esta configurado en el servidor.', 503);
    if (!accessToken) throw new AppError('accessToken es obligatorio.', 400);

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

    const rolNormalizado = String(rol || '').trim().toLowerCase();
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
    return this.createSession(user);
  }

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
