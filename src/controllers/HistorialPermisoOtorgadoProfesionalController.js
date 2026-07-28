import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import HistorialPermisoOtorgadoProfesionalService from '../services/HistorialPermisoOtorgadoProfesionalService.js';
import HistorialPermisoOtorgadoProfesional from '../entities/HistorialPermisoOtorgadoProfesional.js';
import AuthorizationService from '../services/AuthorizationService.js';
import VinculoProfesionalPertenecienteRepository from '../repositories/VinculoProfesionalPertenecienteRepository.js';
import AppError from '../modules/errors/AppError.js';

const router = Router();
const currentService = new HistorialPermisoOtorgadoProfesionalService();
const vinculoRepository = new VinculoProfesionalPertenecienteRepository();

// Historial/auditoria de permisos de profesionales. Mismo criterio que
// PermisoOtorgadoProfesionalController: solo el tutor principal del
// perteneciente vinculado puede escribir aca.
async function assertCanWriteHistorial(idUsuario, idVinculo) {
  const vinculo = await vinculoRepository.getByIdAsync(idVinculo);
  if (!vinculo) throw new AppError('No se encontro el vinculo profesional indicado.', 404);

  const userContext = await AuthorizationService.getUserContext(idUsuario);
  if (!userContext) throw new AppError('No autorizado', 403);

  const tutorAccess = await AuthorizationService.canTutorActOnPerteneciente(
    userContext,
    { id_perteneciente: vinculo.id_perteneciente },
    { requirePrincipal: true },
  );
  if (!tutorAccess.allowed) {
    throw new AppError('No autorizado para modificar el historial de permisos de este vinculo profesional.', 403);
  }
}

router.get('', async (req, res) => {
  try {
    const r = await currentService.getAllAsync();
    res.status(StatusCodes.OK).json(r);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const r = await currentService.getByIdAsync(id);
    if (r != null) res.status(StatusCodes.OK).json(r);
    else res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    const entity = new HistorialPermisoOtorgadoProfesional(req.body);
    await assertCanWriteHistorial(req.user.id, entity.id_vinculo_profesional_perteneciente);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) res.status(StatusCodes.CREATED).json({ id: newId });
    else res.status(StatusCodes.BAD_REQUEST).send('No se pudo crear.');
  } catch (error) {
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new HistorialPermisoOtorgadoProfesional(req.body);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
    await assertCanWriteHistorial(req.user.id, previous.id_vinculo_profesional_perteneciente);
    entity.id = id;
    entity.id_vinculo_profesional_perteneciente = previous.id_vinculo_profesional_perteneciente;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) res.status(StatusCodes.OK).json({ rowsAffected });
    else res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
  } catch (error) {
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
    await assertCanWriteHistorial(req.user.id, previous.id_vinculo_profesional_perteneciente);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) res.status(StatusCodes.OK).json({ rowsAffected: rowCount });
    else res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
  } catch (error) {
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
