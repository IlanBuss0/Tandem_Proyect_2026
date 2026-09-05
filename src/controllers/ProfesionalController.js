import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import ProfesionalService from '../services/ProfesionalService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const currentService = new ProfesionalService();
router.use(authMiddleware);

function sendError(res, error, fallback = StatusCodes.INTERNAL_SERVER_ERROR) {
  const status = Number(error?.statusCode || error?.status || fallback);
  return res.status(status).json({ error: error?.message || 'Error interno.' });
}

router.get('/mine', async (req, res) => {
  try {
    const entity = await currentService.getMineAsync(req.user.id);
    if (entity != null) return res.status(StatusCodes.OK).json(entity);
    return res.status(StatusCodes.NOT_FOUND).send('No tenes un perfil profesional creado.');
  } catch (error) {
    return sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.post('/mine', async (req, res) => {
  try {
    const { profesion, especialidad, matricula, institucion } = req.body || {};
    const newId = await currentService.createMineAsync(req.user.id, { profesion, especialidad, matricula, institucion });
    return res.status(StatusCodes.CREATED).json({ message: `Se creo el profesional con id: ${newId}`, id: newId });
  } catch (error) {
    return sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.put('/mine', async (req, res) => {
  try {
    const { profesion, especialidad, matricula, institucion } = req.body || {};
    const rowsAffected = await currentService.updateMineAsync(req.user.id, { profesion, especialidad, matricula, institucion });
    return res.status(StatusCodes.OK).json({ message: 'Se actualizo tu perfil profesional.', rowsAffected });
  } catch (error) {
    return sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.get('', async (req, res) => {
  try {
    const returnArray = await currentService.getAllPublicAsync();
    return res.status(StatusCodes.OK).json(returnArray ?? []);
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/usuario/:idUsuario', async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario);
    const returnEntity = await currentService.getByUsuarioIdPublicAsync(idUsuario);
    if (returnEntity != null) return res.status(StatusCodes.OK).json(returnEntity);
    return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el profesional del usuario con id: ${idUsuario}.`);
  } catch (error) {
    return sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const returnEntity = await currentService.getByIdPublicAsync(id);
    if (returnEntity != null) return res.status(StatusCodes.OK).json(returnEntity);
    return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el profesional con id: ${id}.`);
  } catch (error) {
    return sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

export default router;
