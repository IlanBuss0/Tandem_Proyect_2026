import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import BloqueoUsuarioService from '../services/BloqueoUsuarioService.js';
import BloqueoUsuario from '../entities/BloqueoUsuario.js';
import AppError from '../modules/errors/AppError.js';

const router = Router();
const currentService = new BloqueoUsuarioService();

// Solo el usuario que bloqueo (id_usuario_bloqueador) puede administrar su
// propio bloqueo — nadie mas deberia poder crear/deshacer un bloqueo en
// nombre de otro usuario.
function assertOwnBlock(req, idUsuarioBloqueador) {
  if (Number(req.user.id) !== Number(idUsuarioBloqueador)) {
    throw new AppError('No autorizado para administrar este bloqueo.', StatusCodes.FORBIDDEN);
  }
}

router.get('', async (req, res) => {
  try {
    console.log('BloqueoUsuarioController.getAll');
    const r = await currentService.getAllAsync();
    const userId = Number(req.user.id);
    const mine = (r || []).filter((item) => Number(item.id_usuario_bloqueador) === userId);
    res.status(StatusCodes.OK).json(mine);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`BloqueoUsuarioController.getById(${id})`);
    const r = await currentService.getByIdAsync(id);
    if (r == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el bloqueo con id: ${id}.`);
    assertOwnBlock(req, r.id_usuario_bloqueador);
    res.status(StatusCodes.OK).json(r);
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('BloqueoUsuarioController.create');
    const entity = new BloqueoUsuario(req.body);
    assertOwnBlock(req, entity.id_usuario_bloqueador);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({ message: `Se creo el bloqueo con id: ${newId}`, id: newId });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({ message: 'No se pudo crear el bloqueo.' });
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new BloqueoUsuario(req.body);
    console.log(`BloqueoUsuarioController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST).send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el bloqueo con id: ${id}.`);
    assertOwnBlock(req, previous.id_usuario_bloqueador);
    entity.id = id;
    entity.id_usuario_bloqueador = previous.id_usuario_bloqueador;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({ message: `Se actualizo el bloqueo con id: ${id}`, rowsAffected });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el bloqueo con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`BloqueoUsuarioController.delete(${id})`);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el bloqueo con id: ${id}.`);
    assertOwnBlock(req, previous.id_usuario_bloqueador);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({ message: `Se desactivo el bloqueo con id: ${id}`, rowsAffected: rowCount });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el bloqueo con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
