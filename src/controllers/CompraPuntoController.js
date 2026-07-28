import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import CompraPuntoService from '../services/CompraPuntoService.js';
import CompraPunto from '../entities/CompraPunto.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const currentService = new CompraPuntoService();

// El frontend nunca escribe en este endpoint (solo lee), ver mismo
// comentario en SaldoPuntoController.js. La ownership es por id_usuario
// directo (quien hizo la compra), no por perteneciente.
router.use(authMiddleware);

function assertOwnPurchase(req, idUsuario) {
  if (Number(req.user.id) !== Number(idUsuario)) {
    const error = new Error('No autorizado para modificar esta compra de puntos.');
    error.statusCode = StatusCodes.FORBIDDEN;
    throw error;
  }
}

router.get('', async (req, res) => {
  try {
    console.log('CompraPuntoController.getAll');
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
    console.log(`CompraPuntoController.getById(${id})`);
    const returnEntity = await currentService.getByIdAsync(id);
    if (returnEntity != null) {
      res.status(StatusCodes.OK).json(returnEntity);
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la compra de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('CompraPuntoController.create');
    const entity = new CompraPunto(req.body);
    assertOwnPurchase(req, entity.id_usuario);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({
        message: `Se creo la compra de puntos con id: ${newId}`,
        id: newId,
      });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        message: 'No se pudo crear la compra de puntos.',
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
    const entity = new CompraPunto(req.body);
    console.log(`CompraPuntoController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST)
        .send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la compra de puntos con id: ${id}.`);
    }
    // Se verifica contra la fila existente y se ignora cualquier
    // id_usuario distinto que venga en el body — evita que alguien marque
    // como propia (o "pagada") una compra ajena.
    assertOwnPurchase(req, previous.id_usuario);
    entity.id = id;
    entity.id_usuario = previous.id_usuario;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se actualizo la compra de puntos con id: ${id}`,
        rowsAffected,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la compra de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`CompraPuntoController.delete(${id})`);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la compra de puntos con id: ${id}.`);
    }
    assertOwnPurchase(req, previous.id_usuario);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se elimino la compra de puntos con id: ${id}`,
        rowsAffected: rowCount,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la compra de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
