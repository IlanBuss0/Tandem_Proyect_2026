import AppError from '../modules/errors/AppError.js';
import { verifyJwt } from '../modules/security/jwt.helper.js';
import { ACCESS_COOKIE_NAME } from '../configs/auth-cookies.config.js';
import AuthRepository from '../repositories/AuthRepository.js';

export async function authMiddleware(req, res, next) {
  const token = req.cookies?.[ACCESS_COOKIE_NAME];

  if (!token) {
    return next(new AppError('Token requerido', 401));
  }

  const payload = verifyJwt(token);

  if (!payload) {
    return next(new AppError('Token invalido', 401));
  }

  try {
    const account = await AuthRepository.findSafeById(payload.id);
    if (!account?.activo) return next(new AppError('Cuenta no disponible', 401));
    req.user = payload;
    req.account = account;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function verifiedAccountMiddleware(req, res, next) {
  if (!req.account?.email_verificado) return next(new AppError('Verifica tu correo para continuar', 403, 'EMAIL_NOT_VERIFIED'));
  return next();
}
