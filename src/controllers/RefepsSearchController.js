import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import RefepsPublicProvider from '../providers/professional-verification/RefepsPublicProvider.js';

const router = Router();
const refepsProvider = new RefepsPublicProvider();

router.post('/search-refeps', async (req, res) => {
  try {
    const matricula = String(req.body?.matricula || '').trim();
    const dni = String(req.body?.dni || '').trim();
    const hasMatricula = /^\d{4,}$/.test(matricula);
    const hasDni = /^\d{7,8}$/.test(dni.replace(/\D/g, ''));
    if (matricula && !dni && !hasMatricula) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        ok: false,
        error: 'La matricula debe tener al menos 4 digitos y solo numeros.',
        code: 'INVALID_LICENSE',
      });
    }
    if ((matricula && dni) || (!hasMatricula && !hasDni)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        ok: false,
        error: 'Ingresá una matrícula válida o un DNI válido.',
        code: 'INVALID_SEARCH',
      });
    }

    const result = hasDni
      ? await refepsProvider.buscarPorDni(dni.replace(/\D/g, ''))
      : await refepsProvider.buscarPorMatricula(matricula);
    return res.status(StatusCodes.OK).json({ ok: true, data: result });
  } catch (error) {
    console.error('[RefepsSearch] Error:', error.message);
    return res.status(StatusCodes.BAD_GATEWAY).json({ ok: false, error: 'No se pudo consultar REFEPS. Intentá nuevamente.' });
  }
});

export default router;
