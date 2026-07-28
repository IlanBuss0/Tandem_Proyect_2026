import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import PaquetePuntoService from '../services/PaquetePuntoService.js';
import PaquetePunto from '../entities/PaquetePunto.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const currentService = new PaquetePuntoService();

// Catalogo de paquetes de puntos comprables (tiene precio). Sin sistema de
// roles de admin todavia, el minimo real es exigir login para escribir —
// bloquea que cualquiera en internet cambie precios o cree paquetes falsos.

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
    const entity = new PaquetePunto(req.body);
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
    const entity = new PaquetePunto(req.body);
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
