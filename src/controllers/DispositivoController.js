import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import DispositivoService from '../services/DispositivoService.js';
import Dispositivo from '../entities/Dispositivo.js';
import AppError from '../modules/errors/AppError.js';

const router = Router();
const currentService = new DispositivoService();

// Dispositivo tiene id_usuario directo. Ownership simple: solo el dueno del
// dispositivo puede leerlo/editarlo/borrarlo (dato de ubicacion/identidad
// del dispositivo, privacidad fisica).
function assertOwnDevice(req, idUsuario) {
  if (Number(req.user.id) !== Number(idUsuario)) {
    throw new AppError('No autorizado para acceder a este dispositivo.', StatusCodes.FORBIDDEN);
  }
}

router.get('', async (req, res) => {
  try {
    console.log('DispositivoController.getAll');
    const r = await currentService.getAllAsync();
    const mine = (r || []).filter((item) => Number(item.id_usuario) === Number(req.user.id));
    res.status(StatusCodes.OK).json(mine);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`DispositivoController.getById(${id})`);
    const r = await currentService.getByIdAsync(id);
    if (r == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el dispositivo con id: ${id}.`);
    assertOwnDevice(req, r.id_usuario);
    res.status(StatusCodes.OK).json(r);
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('DispositivoController.create');
    const entity = new Dispositivo(req.body);
    assertOwnDevice(req, entity.id_usuario);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({ message: `Se creo el dispositivo con id: ${newId}`, id: newId });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({ message: 'No se pudo crear el dispositivo.' });
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new Dispositivo(req.body);
    console.log(`DispositivoController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST).send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el dispositivo con id: ${id}.`);
    assertOwnDevice(req, previous.id_usuario);
    entity.id = id;
    entity.id_usuario = previous.id_usuario;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({ message: `Se actualizo el dispositivo con id: ${id}`, rowsAffected });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el dispositivo con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`DispositivoController.delete(${id})`);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el dispositivo con id: ${id}.`);
    assertOwnDevice(req, previous.id_usuario);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({ message: `Se desactivo el dispositivo con id: ${id}`, rowsAffected: rowCount });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el dispositivo con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
