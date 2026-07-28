import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import MovimientoPuntoService from '../services/MovimientoPuntoService.js';
import MovimientoPunto from '../entities/MovimientoPunto.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const currentService = new MovimientoPuntoService();

// El frontend nunca escribe en este endpoint (solo lee), ver mismo
// comentario en SaldoPuntoController.js.
router.use(authMiddleware);

router.get('', async (req, res) => {
  try {
    console.log('MovimientoPuntoController.getAll');
    const returnArray = await currentService.getAllAsync();
    if (returnArray != null) {
      res.status(StatusCodes.OK).json(returnArray);
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Error interno.');
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`MovimientoPuntoController.getById(${id})`);
    const returnEntity = await currentService.getByIdAsync(id);
    if (returnEntity != null) {
      res.status(StatusCodes.OK).json(returnEntity);
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el movimiento de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('MovimientoPuntoController.create');
    const entity = new MovimientoPunto(req.body);
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, entity.id_perteneciente, {
      allowTutor: true,
    });
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({
        message: `Se creo el movimiento de puntos con id: ${newId}`,
        id: newId,
      });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        message: 'No se pudo crear el movimiento de puntos.',
      });
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new MovimientoPunto(req.body);
    console.log(`MovimientoPuntoController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST)
        .send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el movimiento de puntos con id: ${id}.`);
    }
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, previous.id_perteneciente, {
      allowTutor: true,
    });
    entity.id = id;
    entity.id_perteneciente = previous.id_perteneciente;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se actualizo el movimiento de puntos con id: ${id}`,
        rowsAffected,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el movimiento de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`MovimientoPuntoController.delete(${id})`);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el movimiento de puntos con id: ${id}.`);
    }
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, previous.id_perteneciente, {
      allowTutor: true,
    });
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se elimino el movimiento de puntos con id: ${id}`,
        rowsAffected: rowCount,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el movimiento de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
