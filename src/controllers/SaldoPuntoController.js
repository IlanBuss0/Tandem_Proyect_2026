import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import SaldoPuntoService from '../services/SaldoPuntoService.js';
import SaldoPunto from '../entities/SaldoPunto.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();
const currentService = new SaldoPuntoService();

// El frontend nunca escribe en este endpoint (solo lee con getAll() y filtra
// del lado del cliente), asi que exigir login en todas las rutas y ownership
// real en las de escritura no rompe nada — y cierra el agujero de "cualquiera
// se regala puntos" sin login.
router.use(authMiddleware);

router.get('', async (req, res) => {
  try {
    console.log('SaldoPuntoController.getAll');
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
    console.log(`SaldoPuntoController.getById(${id})`);
    const returnEntity = await currentService.getByIdAsync(id);
    if (returnEntity != null) {
      res.status(StatusCodes.OK).json(returnEntity);
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el saldo de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('SaldoPuntoController.create');
    const entity = new SaldoPunto(req.body);
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, entity.id_perteneciente, {
      allowTutor: true,
    });
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({
        message: `Se creo el saldo de puntos con id: ${newId}`,
        id: newId,
      });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        message: 'No se pudo crear el saldo de puntos.',
      });
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new SaldoPunto(req.body);
    console.log(`SaldoPuntoController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST)
        .send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el saldo de puntos con id: ${id}.`);
    }
    // Se verifica la fila EXISTENTE, no el body: asi nadie puede escribir un
    // id_perteneciente ajeno en el body para colarse en un saldo que no es
    // suyo, y tampoco reasignar el saldo a otro perteneciente.
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, previous.id_perteneciente, {
      allowTutor: true,
    });
    entity.id = id;
    entity.id_perteneciente = previous.id_perteneciente;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se actualizo el saldo de puntos con id: ${id}`,
        rowsAffected,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el saldo de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`SaldoPuntoController.delete(${id})`);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el saldo de puntos con id: ${id}.`);
    }
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, previous.id_perteneciente, {
      allowTutor: true,
    });
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se elimino el saldo de puntos con id: ${id}`,
        rowsAffected: rowCount,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el saldo de puntos con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
