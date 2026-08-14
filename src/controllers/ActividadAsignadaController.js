import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import ActividadAsignadaService from '../services/ActividadAsignadaService.js';
import ActividadAsignada from '../entities/ActividadAsignada.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { PERTENECIENTE_PERMISSIONS, PROFESIONAL_PERMISSIONS } from '../modules/security/permissions.constants.js';

const router = Router();
const currentService = new ActividadAsignadaService();

router.use(authMiddleware);

function sendError(res, error, fallbackStatus = StatusCodes.INTERNAL_SERVER_ERROR) {
  console.log(error);
  res.status(error.statusCode ?? fallbackStatus).send(`Error: ${error.message}`);
}

router.get('', async (req, res) => {
  try {
    console.log('ActividadAsignadaController.getAll');
    const idPerteneciente = Number(req.query.id_perteneciente);
    if (!idPerteneciente) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: 'id_perteneciente es obligatorio para listar actividades asignadas.',
      });
    }
    await AuthorizationService.assertCanReadPertenecienteResource(
      req.user.id,
      idPerteneciente,
      PROFESIONAL_PERMISSIONS.VER_HISTORIAL,
    );
    const returnArray = await currentService.getByPertenecienteIdAsync(idPerteneciente);
    if (returnArray != null) {
      res.status(StatusCodes.OK).json(returnArray);
    } else {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Error interno.');
    }
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`ActividadAsignadaController.getById(${id})`);
    const returnEntity = await currentService.getByIdAsync(id);
    if (returnEntity != null) {
      await AuthorizationService.assertCanReadPertenecienteResource(
        req.user.id,
        returnEntity.id_perteneciente,
        PROFESIONAL_PERMISSIONS.VER_HISTORIAL,
      );
      res.status(StatusCodes.OK).json(returnEntity);
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad asignada con id: ${id}.`);
    }
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/completar', async (req, res) => {
  try {
    const score = req.body?.puntaje === undefined || req.body?.puntaje === null
      ? null
      : Number(req.body.puntaje);
    const result = await currentService.completeForUserAsync(req.params.id, req.user.id, score);
    res.status(StatusCodes.OK).json(result);
  } catch (error) {
    sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('ActividadAsignadaController.create');
    const entity = new ActividadAsignada(req.body);
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, Number(entity.id_perteneciente), {
      pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.CREAR_ACTIVIDADES_PROPIAS,
      profesionalPermissionName: PROFESIONAL_PERMISSIONS.ASIGNAR_ACTIVIDADES,
    });
    entity.id_usuario_asignador = req.user.id;
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({
        message: `Se creo la actividad asignada con id: ${newId}`,
        id: newId,
      });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        message: 'No se pudo crear la actividad asignada.',
      });
    }
  } catch (error) {
    sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new ActividadAsignada(req.body);
    console.log(`ActividadAsignadaController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST)
        .send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    entity.id = id;
    const previousEntity = await currentService.getByIdAsync(id);
    if (previousEntity == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad asignada con id: ${id}.`);
    }
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, previousEntity.id_perteneciente, {
      pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.COMPLETAR_ACTIVIDADES,
      profesionalPermissionName: PROFESIONAL_PERMISSIONS.ASIGNAR_ACTIVIDADES,
    });
    entity.id_perteneciente = previousEntity.id_perteneciente;
    entity.id_usuario_asignador = previousEntity.id_usuario_asignador;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se actualizo la actividad asignada con id: ${id}`,
        rowsAffected,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad asignada con id: ${id}.`);
    }
  } catch (error) {
    sendError(res, error, StatusCodes.BAD_REQUEST);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`ActividadAsignadaController.delete(${id})`);
    const previousEntity = await currentService.getByIdAsync(id);
    if (previousEntity == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad asignada con id: ${id}.`);
    }
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, previousEntity.id_perteneciente, {
      profesionalPermissionName: PROFESIONAL_PERMISSIONS.ASIGNAR_ACTIVIDADES,
    });
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se elimino la actividad asignada con id: ${id}`,
        rowsAffected: rowCount,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la actividad asignada con id: ${id}.`);
    }
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
