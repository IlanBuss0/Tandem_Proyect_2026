import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import TutorService from '../services/TutorService.js';
import Tutor from '../entities/Tutor.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const currentService = new TutorService();

router.get('', async (req, res) => {
  try {
    const returnArray = await currentService.getAllAsync();
    if (returnArray != null) res.status(StatusCodes.OK).json(returnArray);
    else res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Error interno.');
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/usuario/:idUsuario', async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario);
    const returnEntity = await currentService.getByUsuarioIdAsync(idUsuario);
    if (returnEntity != null) res.status(StatusCodes.OK).json(returnEntity);
    else res.status(StatusCodes.NOT_FOUND).send(`No se encontro el tutor del usuario con id: ${idUsuario}.`);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const returnEntity = await currentService.getByIdAsync(id);
    if (returnEntity != null) res.status(StatusCodes.OK).json(returnEntity);
    else res.status(StatusCodes.NOT_FOUND).send(`No se encontro el tutor con id: ${id}.`);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  res.status(StatusCodes.FORBIDDEN).json({
    message: 'Los perfiles de tutor solo se crean mediante el registro seguro.',
  });
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el tutor con id: ${id}.`);
    }

    const isOwner = Number(previous.id_usuario) === Number(req.user.id);
    const isAdmin = Number(req.account?.id_tipo_usuario) === 4;
    if (!isOwner && !isAdmin) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'No autorizado para modificar este tutor.' });
    }

    const entity = new Tutor({
      ...previous,
      id,
      parentesco: req.body?.parentesco ?? previous.parentesco,
    });
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) res.status(StatusCodes.OK).json({ message: `Se actualizo el tutor con id: ${id}`, rowsAffected });
    else res.status(StatusCodes.NOT_FOUND).send(`No se encontro el tutor con id: ${id}.`);
  } catch (error) {
    res.status(StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  res.status(StatusCodes.FORBIDDEN).json({
    message: 'La eliminacion de perfiles de tutor no esta disponible desde este endpoint.',
  });
});

export default router;
