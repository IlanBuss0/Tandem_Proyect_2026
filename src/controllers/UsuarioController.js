import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import UsuarioService from '../services/UsuarioService.js';
import Usuario from '../entities/Usuario.js';

const router = Router();
const currentService = new UsuarioService();

// El login usa AuthRepository (no este service) para comparar contrasena_hash,
// asi que nunca hace falta que el hash viaje en estas respuestas — se saca
// siempre, aca no hay ningun flujo legitimo que lo necesite.
function stripHash(usuario) {
  if (!usuario) return usuario;
  const { contrasena_hash, ...safe } = usuario;
  return safe;
}

router.get('', async (req, res) => {
  try {
    console.log('UsuarioController.getAll');

    const returnArray = await currentService.getAllAsync();

    if (returnArray != null) {
      res.status(StatusCodes.OK).json(returnArray.map(stripHash));
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

    console.log(`UsuarioController.getById(${id})`);

    const returnEntity = await currentService.getByIdAsync(id);

    if (returnEntity != null) {
      res.status(StatusCodes.OK).json(stripHash(returnEntity));
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el usuario con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('UsuarioController.create');

    const entity = new Usuario(req.body);

    const newId = await currentService.createAsync(entity);

    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({
        message: `Se creo el usuario con id: ${newId}`,
        id: newId,
      });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        message: 'No se pudo crear el usuario.',
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

    console.log(`UsuarioController.update(${id})`);

    if (Number(req.user.id) !== id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send('No autorizado para modificar este usuario.');
    }

    // contrasena_hash e id_tipo_usuario nunca se aceptan desde el body: un
    // hash propio ahi permitiria tomar cualquier cuenta, y el tipo de
    // usuario habilitaria escalar de rol. Se ignoran a proposito.
    const entity = new Usuario({
      ...req.body,
      id,
      contrasena_hash: undefined,
      id_tipo_usuario: undefined,
    });

    const rowsAffected = await currentService.updateAsync(entity);

    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se actualizo el usuario con id: ${id}`,
        rowsAffected,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el usuario con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    console.log(`UsuarioController.delete(${id})`);

    const rowCount = await currentService.deleteByIdAsync(id);

    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se elimino/desactivo el usuario con id: ${id}`,
        rowsAffected: rowCount,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el usuario con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;