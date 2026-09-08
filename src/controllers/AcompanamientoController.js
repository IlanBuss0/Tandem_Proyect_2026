import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import AcompanamientoService from '../services/AcompanamientoService.js';

const router = Router();
const service = new AcompanamientoService();

function idFrom(req) {
  const id = Number(req.params.idPerteneciente);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('idPerteneciente invalido.');
    error.statusCode = StatusCodes.BAD_REQUEST;
    throw error;
  }
  return id;
}

function sendError(res, error) {
  const status = Number(error?.statusCode || error?.status || StatusCodes.BAD_REQUEST);
  return res.status(status).json({ error: error?.message || 'No se pudo completar la operacion.' });
}

router.get('/perteneciente/:idPerteneciente', async (req, res) => {
  try { return res.status(StatusCodes.OK).json(await service.getForUserAsync(req.user.id, idFrom(req))); } catch (error) { return sendError(res, error); }
});

router.post('/perteneciente/:idPerteneciente/notas', async (req, res) => {
  try { return res.status(StatusCodes.CREATED).json(await service.createNoteAsync(req.user.id, idFrom(req), req.body?.contenido)); } catch (error) { return sendError(res, error); }
});

router.delete('/perteneciente/:idPerteneciente/notas/:idNota', async (req, res) => {
  try { return res.status(StatusCodes.OK).json(await service.deleteNoteAsync(req.user.id, idFrom(req), req.params.idNota)); } catch (error) { return sendError(res, error); }
});

router.post('/perteneciente/:idPerteneciente/objetivos', async (req, res) => {
  try { return res.status(StatusCodes.CREATED).json(await service.createObjectiveAsync(req.user.id, idFrom(req), req.body)); } catch (error) { return sendError(res, error); }
});

router.patch('/perteneciente/:idPerteneciente/objetivos/:idObjetivo', async (req, res) => {
  try { return res.status(StatusCodes.OK).json(await service.updateObjectiveAsync(req.user.id, idFrom(req), req.params.idObjetivo, req.body)); } catch (error) { return sendError(res, error); }
});

router.delete('/perteneciente/:idPerteneciente/objetivos/:idObjetivo', async (req, res) => {
  try { return res.status(StatusCodes.OK).json(await service.deleteObjectiveAsync(req.user.id, idFrom(req), req.params.idObjetivo)); } catch (error) { return sendError(res, error); }
});

router.post('/perteneciente/:idPerteneciente/acuerdos', async (req, res) => {
  try { return res.status(StatusCodes.CREATED).json(await service.createAgreementAsync(req.user.id, idFrom(req), req.body?.texto)); } catch (error) { return sendError(res, error); }
});

router.patch('/perteneciente/:idPerteneciente/acuerdos/:idAcuerdo', async (req, res) => {
  try { return res.status(StatusCodes.OK).json(await service.updateAgreementAsync(req.user.id, idFrom(req), req.params.idAcuerdo, req.body)); } catch (error) { return sendError(res, error); }
});

router.delete('/perteneciente/:idPerteneciente/acuerdos/:idAcuerdo', async (req, res) => {
  try { return res.status(StatusCodes.OK).json(await service.deleteAgreementAsync(req.user.id, idFrom(req), req.params.idAcuerdo)); } catch (error) { return sendError(res, error); }
});

router.post('/perteneciente/:idPerteneciente/ia/preguntar', async (req, res) => {
  try { return res.status(StatusCodes.OK).json(await service.askSharedQuestionAsync(req.user.id, idFrom(req), req.body?.pregunta)); } catch (error) { return sendError(res, error); }
});

export default router;
