import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import EvaluacionAutonomiaService from '../services/EvaluacionAutonomiaService.js';
import EvaluacionAutonomia from '../entities/EvaluacionAutonomia.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { PROFESIONAL_PERMISSIONS } from '../modules/security/permissions.constants.js';
import AppError from '../modules/errors/AppError.js';

const router = Router();
const currentService = new EvaluacionAutonomiaService();

// Evaluacion clinica de autonomia/nivel de apoyo. Lectura: el propio
// perteneciente, su tutor, o un profesional vinculado con permiso de ver
// historial. Escritura: solo un profesional vinculado — no existe un
// permiso "EvaluarAutonomia" dedicado en el catalogo, asi que se reusa
// VER_HISTORIAL como gate minimo (quien no puede ver el historial clinico
// tampoco deberia poder escribir una evaluacion nueva).
async function assertCanWriteEvaluacion(idUsuario, idPerteneciente) {
  if (!idPerteneciente) throw new AppError('id_perteneciente es obligatorio.', 400);
  const userContext = await AuthorizationService.getUserContext(idUsuario);
  if (!userContext) throw new AppError('No autorizado', 403);
  if (!userContext.profesional?.id) {
    throw new AppError('Solo un profesional vinculado puede registrar una evaluacion de autonomia.', 403);
  }
  const access = await AuthorizationService.canProfesionalPermission(
    userContext,
    { id_perteneciente: idPerteneciente },
    PROFESIONAL_PERMISSIONS.VER_HISTORIAL,
  );
  if (!access.allowed) {
    throw new AppError('No autorizado para registrar una evaluacion de este perteneciente.', 403);
  }
}

router.get('', async (req, res) => {
  try {
    console.log('EvaluacionAutonomiaController.getAll');
    const returnArray = await currentService.getAllAsync();
    const userContext = await AuthorizationService.getUserContext(req.user.id);
    const mine = (returnArray || []).filter((item) => {
      if (userContext?.perteneciente?.id === item.id_perteneciente) return true;
      if (userContext?.profesional?.id === item.id_profesional) return true;
      return false;
    });
    res.status(StatusCodes.OK).json(mine);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`EvaluacionAutonomiaController.getById(${id})`);
    const returnEntity = await currentService.getByIdAsync(id);
    if (returnEntity == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la evaluacion con id: ${id}.`);
    await AuthorizationService.assertCanReadPertenecienteResource(
      req.user.id,
      returnEntity.id_perteneciente,
      PROFESIONAL_PERMISSIONS.VER_HISTORIAL,
    );
    res.status(StatusCodes.OK).json(returnEntity);
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('EvaluacionAutonomiaController.create');
    const entity = new EvaluacionAutonomia(req.body);
    await assertCanWriteEvaluacion(req.user.id, entity.id_perteneciente);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({
        message: `Se creo la evaluacion de autonomia con id: ${newId}`,
        id: newId,
      });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({
        message: 'No se pudo crear la evaluacion de autonomia.',
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
    const entity = new EvaluacionAutonomia(req.body);
    console.log(`EvaluacionAutonomiaController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST)
        .send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la evaluacion con id: ${id}.`);
    await assertCanWriteEvaluacion(req.user.id, previous.id_perteneciente);
    entity.id = id;
    entity.id_perteneciente = previous.id_perteneciente;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se actualizo la evaluacion de autonomia con id: ${id}`,
        rowsAffected,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la evaluacion con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`EvaluacionAutonomiaController.delete(${id})`);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro la evaluacion con id: ${id}.`);
    await assertCanWriteEvaluacion(req.user.id, previous.id_perteneciente);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({
        message: `Se elimino la evaluacion de autonomia con id: ${id}`,
        rowsAffected: rowCount,
      });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro la evaluacion con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
