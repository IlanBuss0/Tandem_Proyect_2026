import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import PermisoOtorgadoPertenecienteService from '../services/PermisoOtorgadoPertenecienteService.js';
import PermisoOtorgadoPerteneciente from '../entities/PermisoOtorgadoPerteneciente.js';
import AuthorizationService from '../services/AuthorizationService.js';
import AppError from '../modules/errors/AppError.js';

const router = Router();
const currentService = new PermisoOtorgadoPertenecienteService();

// Este endpoint decide que puede hacer un perteneciente dentro de la app.
// Solo el tutor PRINCIPAL puede otorgar/revocar permisos — nunca el propio
// perteneciente (se auto-otorgaria permisos elevados) ni un tutor
// secundario. Mismo requirePrincipal que ya usa AuthorizationService para
// vinculos y permisos en otros lados.
async function assertCanGrantPermissions(idUsuario, idPerteneciente) {
  if (!idPerteneciente) {
    throw new AppError('id_perteneciente es obligatorio.', 400);
  }
  const userContext = await AuthorizationService.getUserContext(idUsuario);
  if (!userContext) throw new AppError('No autorizado', 403);

  const tutorAccess = await AuthorizationService.canTutorActOnPerteneciente(
    userContext,
    { id_perteneciente: idPerteneciente },
    { requirePrincipal: true },
  );
  if (!tutorAccess.allowed) {
    throw new AppError('Solo el tutor principal puede otorgar o revocar permisos de este perteneciente.', 403);
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
    const entity = new PermisoOtorgadoPerteneciente(req.body);
    await assertCanGrantPermissions(req.user.id, entity.id_perteneciente);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      await AuthorizationService.invalidatePertenecientePermissions(entity.id_perteneciente);
      res.status(StatusCodes.CREATED).json({ id: newId });
    } else res.status(StatusCodes.BAD_REQUEST).send('No se pudo crear.');
  } catch (error) {
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new PermisoOtorgadoPerteneciente(req.body);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send('No encontrado.');
    // Se valida contra el perteneciente de la fila existente, no el que
    // venga en el body — evita reasignar el permiso a otro perteneciente.
    await assertCanGrantPermissions(req.user.id, previous.id_perteneciente);
    entity.id = id;
    entity.id_perteneciente = previous.id_perteneciente;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      await AuthorizationService.invalidatePertenecientePermissions(entity.id_perteneciente);
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
    await assertCanGrantPermissions(req.user.id, previous.id_perteneciente);
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
