import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import UsuarioService from '../services/UsuarioService.js';
import PertenecienteRepository from '../repositories/PertenecienteRepository.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { PERTENECIENTE_PERMISSIONS } from '../modules/security/permissions.constants.js';
import { pickEditableUserFields, toPublicUser } from '../modules/security/account-update.policy.js';

const router = Router();
const currentService = new UsuarioService();
const pertenecienteRepository = new PertenecienteRepository();

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
      const requester = await currentService.getByIdAsync(Number(req.user.id));
      const isAdmin = Number(requester?.id_tipo_usuario) === 4;
      res.status(StatusCodes.OK).json(returnArray.map(isAdmin ? stripHash : toPublicUser));
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
      const requester = await currentService.getByIdAsync(Number(req.user.id));
      const canSeePrivate = Number(req.user.id) === id || Number(requester?.id_tipo_usuario) === 4;
      res.status(StatusCodes.OK).json(canSeePrivate ? stripHash(returnEntity) : toPublicUser(returnEntity));
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el usuario con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  res.status(StatusCodes.FORBIDDEN).json({ error: 'Las cuentas solo pueden crearse mediante el registro seguro.' });
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    console.log(`UsuarioController.update(${id})`);

    const isSelf = Number(req.user.id) === id;
    if (!isSelf) {
      // No es el propio usuario: el unico otro caso legitimo es un
      // tutor/profesional autorizado editando los datos basicos del
      // perteneciente que tiene vinculado (nombre, correo, telefono, etc).
      // Se delega en el mismo chequeo que ya protege PertenecienteController.
      const perteneciente = await pertenecienteRepository.getByUsuarioIdAsync(id);
      if (!perteneciente) {
        return res
          .status(StatusCodes.FORBIDDEN)
          .send('No autorizado para modificar este usuario.');
      }

      try {
        await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, perteneciente.id, {
          pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL,
          allowTutor: true,
        });
      } catch (authError) {
        return res
          .status(authError?.statusCode ?? StatusCodes.FORBIDDEN)
          .send('No autorizado para modificar este usuario.');
      }
    }

    // Correo, contrasena, rol, estado y fecha de ingreso solo cambian por
    // flujos dedicados. La whitelist tambien evita reactivar una cuenta por
    // el valor por defecto de la entidad Usuario.
    const entity = { id, ...pickEditableUserFields(req.body, { self: isSelf }) };

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
  res.status(StatusCodes.FORBIDDEN).json({ error: 'La desactivacion de cuentas requiere un flujo administrativo seguro.' });
});

export default router;
