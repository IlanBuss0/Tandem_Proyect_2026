import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import PermisoOtorgadoProfesionalService from '../services/PermisoOtorgadoProfesionalService.js';
import PermisoOtorgadoProfesional from '../entities/PermisoOtorgadoProfesional.js';
import AuthorizationService from '../services/AuthorizationService.js';
import VinculoProfesionalPertenecienteRepository from '../repositories/VinculoProfesionalPertenecienteRepository.js';
import AppError from '../modules/errors/AppError.js';

const router = Router();
const currentService = new PermisoOtorgadoProfesionalService();
const vinculoRepository = new VinculoProfesionalPertenecienteRepository();

// Este endpoint decide que puede ver/hacer un profesional sobre un
// perteneciente. Solo el tutor PRINCIPAL de ese perteneciente puede
// otorgar/revocar esos permisos — nunca el propio profesional.
async function assertCanGrantProfesionalPermissions(idUsuario, idVinculo) {
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
    throw new AppError('Solo el tutor principal puede otorgar o revocar permisos de profesionales sobre este perteneciente.', 403);
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
    const entity = new PermisoOtorgadoProfesional(req.body);
    await assertCanGrantProfesionalPermissions(req.user.id, entity.id_vinculo_profesional_perteneciente);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      await AuthorizationService.invalidateProfesionalPermissions(entity.id_vinculo_profesional_perteneciente);
      res.status(StatusCodes.CREATED).json({ id: newId });
    } else res.status(StatusCodes.BAD_REQUEST).send('No se pudo crear.');
  } catch (error) {
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new PermisoOtorgadoProfesional(req.body);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
    await assertCanGrantProfesionalPermissions(req.user.id, previous.id_vinculo_profesional_perteneciente);
    entity.id = id;
    entity.id_vinculo_profesional_perteneciente = previous.id_vinculo_profesional_perteneciente;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      await AuthorizationService.invalidateProfesionalPermissions(entity.id_vinculo_profesional_perteneciente);
      res.status(StatusCodes.OK).json({ rowsAffected });
    } else res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
  } catch (error) {
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
    await assertCanGrantProfesionalPermissions(req.user.id, previous.id_vinculo_profesional_perteneciente);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      await AuthorizationService.invalidateAllForUser();
      res.status(StatusCodes.OK).json({ rowsAffected: rowCount });
    } else res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
  } catch (error) {
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
