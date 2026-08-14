import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import ActividadPersonalizadaService from '../services/ActividadPersonalizadaService.js';
import ActividadPersonalizada from '../entities/ActividadPersonalizada.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { PERTENECIENTE_PERMISSIONS, PROFESIONAL_PERMISSIONS } from '../modules/security/permissions.constants.js';

const router = Router();
const currentService = new ActividadPersonalizadaService();

router.use(authMiddleware);

function sendError(res, error, fallbackStatus = StatusCodes.INTERNAL_SERVER_ERROR) {
  console.log(error);
  res.status(error.statusCode ?? fallbackStatus).send(`Error: ${error.message}`);
}

router.get('', async (req, res) => {
  try {
    console.log('ActividadPersonalizadaController.getAll');
    const idPerteneciente = Number(req.query.id_perteneciente);

    if (idPerteneciente) {
      await AuthorizationService.assertCanReadPertenecienteResource(
        req.user.id,
        idPerteneciente,
        PROFESIONAL_PERMISSIONS.VER_HISTORIAL,
      );
      const returnArray = await currentService.getByPertenecienteIdAsync(idPerteneciente);
      return res.status(StatusCodes.OK).json(returnArray ?? []);
    }

    const returnArray = await currentService.getByUsuarioCreadorAsync(req.user.id);

    if (returnArray != null) {
      res.status(StatusCodes.OK).json(returnArray);
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Error interno.');
    }
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id/resultados', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const results = await currentService.getResultsForCreatorAsync(id, req.user.id);
    res.status(StatusCodes.OK).json(results);
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    console.log(`ActividadPersonalizadaController.getById(${id})`);

    const returnEntity = await currentService.getByIdAsync(id);

    if (returnEntity != null) {
      if (returnEntity.id_usuario_creador !== req.user.id) {
        return res.status(StatusCodes.FORBIDDEN).json({ error: 'No autorizado para consultar esta actividad personalizada.' });
      }
      res.status(StatusCodes.OK).json(returnEntity);
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad personalizada con id: ${id}.`);
    }
  } catch (error) {
    sendError(res, error);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('ActividadPersonalizadaController.create');

    const entity = new ActividadPersonalizada(req.body);
    const context = await AuthorizationService.getUserContext(req.user.id);
    if (context?.perteneciente?.id) {
      await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, context.perteneciente.id, {
        pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.CREAR_ACTIVIDADES_PROPIAS,
        allowTutor: false,
      });
    }
    entity.id_usuario_creador = req.user.id;

    const newId = await currentService.createAsync(entity);

    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({
        message: `Se creo la actividad personalizada con id: ${newId}`,
        id: newId,
      });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        message: 'No se pudo crear la actividad personalizada.',
      });
    }
  } catch (error) {
    sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new ActividadPersonalizada(req.body);

    console.log(`ActividadPersonalizadaController.update(${id})`);

    if (entity.id && parseInt(entity.id) !== id) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }

    entity.id = id;
    const previousEntity = await currentService.getByIdAsync(id);
    if (previousEntity == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad personalizada con id: ${id}.`);
    }
    if (previousEntity.id_usuario_creador !== req.user.id) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'No autorizado para modificar esta actividad personalizada.' });
    }
    entity.id_usuario_creador = previousEntity.id_usuario_creador;

    const rowsAffected = await currentService.updateAsync(entity);

    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se actualizo la actividad personalizada con id: ${id}`,
        rowsAffected,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad personalizada con id: ${id}.`);
    }
  } catch (error) {
    sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    console.log(`ActividadPersonalizadaController.delete(${id})`);
    const previousEntity = await currentService.getByIdAsync(id);
    if (previousEntity == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad personalizada con id: ${id}.`);
    }
    if (previousEntity.id_usuario_creador !== req.user.id) {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'No autorizado para desactivar esta actividad personalizada.' });
    }

    const rowCount = await currentService.deleteByIdAsync(id);

    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se desactivo la actividad personalizada con id: ${id}`,
        rowsAffected: rowCount,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad personalizada con id: ${id}.`);
    }
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
