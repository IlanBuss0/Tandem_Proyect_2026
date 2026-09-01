import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import RefepsPublicProvider from '../providers/professional-verification/RefepsPublicProvider.js';

const router = Router();
const refepsProvider = new RefepsPublicProvider();

router.post('/search-refeps', async (req, res) => {
  try {
    const matricula = String(req.body?.matricula || '').trim();
    if (!matricula) {
      return res.status(StatusCodes.BAD_REQUEST).json({ ok: false, error: 'matricula es obligatoria.' });
    }

    const result = await refepsProvider.buscarPorMatricula(matricula);
    return res.status(StatusCodes.OK).json({ ok: true, data: result });
  } catch (error) {
    console.error('[RefepsSearch] Error:', error.message);
    return res.status(StatusCodes.BAD_GATEWAY).json({ ok: false, error: 'No se pudo consultar REFEPS. Intentá nuevamente.' });
  }
});

export default router;
