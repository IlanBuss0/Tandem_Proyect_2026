import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import ContactoService from '../services/ContactoService.js';
import Contacto from '../entities/Contacto.js';
import AppError from '../modules/errors/AppError.js';

const router = Router();
const currentService = new ContactoService();

// Contacto es una solicitud de conexion entre dos usuarios
// (id_usuario_menor / id_usuario_mayor / id_usuario_solicitante). Ownership:
// solo alguna de las tres partes involucradas puede ver/tocar la fila.
function assertInvolved(req, entity) {
  const userId = Number(req.user.id);
  const involved = [entity?.id_usuario_menor, entity?.id_usuario_mayor, entity?.id_usuario_solicitante]
    .map(Number);
  if (!involved.includes(userId)) {
    throw new AppError('No autorizado para acceder a este contacto.', StatusCodes.FORBIDDEN);
  }
}

router.get('', async (req, res) => {
  try {
    console.log('ContactoController.getAll');
    const r = await currentService.getAllAsync();
    const userId = Number(req.user.id);
    const mine = (r || []).filter((item) =>
      [item.id_usuario_menor, item.id_usuario_mayor, item.id_usuario_solicitante].map(Number).includes(userId),
    );
    res.status(StatusCodes.OK).json(mine);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`ContactoController.getById(${id})`);
    const r = await currentService.getByIdAsync(id);
    if (r == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el contacto con id: ${id}.`);
    assertInvolved(req, r);
    res.status(StatusCodes.OK).json(r);
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('ContactoController.create');
    const entity = new Contacto(req.body);
    // Solo se puede crear una solicitud en nombre propio.
    assertInvolved(req, { id_usuario_solicitante: entity.id_usuario_solicitante });
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({ message: `Se creo el contacto con id: ${newId}`, id: newId });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({ message: 'No se pudo crear el contacto.' });
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new Contacto(req.body);
    console.log(`ContactoController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST).send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el contacto con id: ${id}.`);
    assertInvolved(req, previous);
    entity.id = id;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({ message: `Se actualizo el contacto con id: ${id}`, rowsAffected });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el contacto con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`ContactoController.delete(${id})`);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el contacto con id: ${id}.`);
    assertInvolved(req, previous);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({ message: `Se elimino el contacto con id: ${id}`, rowsAffected: rowCount });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el contacto con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
