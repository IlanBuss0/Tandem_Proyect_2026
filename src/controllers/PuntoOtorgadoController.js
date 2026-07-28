import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import PuntoOtorgadoService from '../services/PuntoOtorgadoService.js';
import PuntoOtorgado from '../entities/PuntoOtorgado.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const currentService = new PuntoOtorgadoService();

// Catalogo (tipos de puntos otorgados). No hay un sistema de roles de admin
// en el backend todavia, asi que el minimo real es exigir login para
// escribir — bloquea la manipulacion anonima del catalogo desde internet.
// La lectura queda publica porque se usa para popular selects en el front.

router.get('', async (req, res) => {
  try {
    const r = await currentService.getAllAsync();
    res.status(StatusCodes.OK).json(r);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const r = await currentService.getByIdAsync(id);
    if (r != null) res.status(StatusCodes.OK).json(r);
    else res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', authMiddleware, async (req, res) => {
  try {
    const entity = new PuntoOtorgado(req.body);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) res.status(StatusCodes.CREATED).json({ id: newId });
    else res.status(StatusCodes.BAD_REQUEST).send('No se pudo crear.');
  } catch (error) {
    res.status(StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new PuntoOtorgado(req.body);
    entity.id = id;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) res.status(StatusCodes.OK).json({ rowsAffected });
    else res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
  } catch (error) {
    res.status(StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) res.status(StatusCodes.OK).json({ rowsAffected: rowCount });
    else res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
