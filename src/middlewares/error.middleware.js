import { StatusCodes } from 'http-status-codes';
import AppError from '../modules/errors/AppError.js';

export function errorMiddleware(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message, error: err.message, code: err.code || undefined });
  }
  if (err?.name === 'MulterError' || /^Tipo de archivo no permitido:/i.test(err?.message || '')) {
    const message = err?.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el tamaño permitido.'
      : err.message;
    return res.status(StatusCodes.BAD_REQUEST).json({ message, error: message });
  }
  console.error('Error no manejado:', err);
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    message: 'Error interno del servidor.',
    error: 'Error interno del servidor.',
  });
}
