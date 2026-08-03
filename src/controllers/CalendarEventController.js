import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import CalendarEventService from '../services/CalendarEventService.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { csrfMiddleware } from '../middlewares/csrf.middleware.js';
import { PERTENECIENTE_PERMISSIONS } from '../modules/security/permissions.constants.js';

const router = Router();
const calendarEventService = new CalendarEventService();

// Mismo carve-out que tenia ConfiguracionUsuarioController.assertCanWriteConfig
// para las claves de calendario: si alguien escribe SU PROPIO calendario y
// no es un perteneciente (ej. un tutor gestionando "Mi Agenda" personal),
// no hay perfil de perteneciente para chequear el permiso USAR_CALENDARIO
// contra el — se deja pasar. En cualquier otro caso (escribir el calendario
// de otra persona, o ser un perteneciente escribiendo el propio) se exige
// el permiso de verdad, porque un tutor puede tener ese permiso apagado.
async function assertCanWriteCalendar(req, idUsuarioTarget) {
  if (Number(idUsuarioTarget) === Number(req.user.id)) {
    const userContext = await AuthorizationService.getUserContext(req.user.id);
    if (userContext && !userContext.perteneciente) return;
  }
  await AuthorizationService.assertCanUsePertenecienteFeatureByUsuarioId(
    req.user.id,
    idUsuarioTarget,
    PERTENECIENTE_PERMISSIONS.USAR_CALENDARIO,
  );
}

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await calendarEventService.getByIdAsync(req.params.id);
    await AuthorizationService.assertCanReadUsuarioConfig(req.user.id, event.id_usuario);
    res.status(StatusCodes.OK).json(event);
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/usuario/:idUsuario', authMiddleware, async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario, 10);
    await AuthorizationService.assertCanReadUsuarioConfig(req.user.id, idUsuario);
    const events = await calendarEventService.getForUsuarioAsync(idUsuario);
    res.status(StatusCodes.OK).json(events);
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', authMiddleware, csrfMiddleware, async (req, res) => {
  try {
    const idUsuario = parseInt(req.body.idUsuario, 10);
    await assertCanWriteCalendar(req, idUsuario);
    const event = await calendarEventService.createAsync(idUsuario, req.body);
    res.status(StatusCodes.CREATED).json(event);
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', authMiddleware, csrfMiddleware, async (req, res) => {
  try {
    const idUsuario = parseInt(req.body.idUsuario, 10);
    await assertCanWriteCalendar(req, idUsuario);
    const event = await calendarEventService.updateAsync(req.params.id, idUsuario, req.body);
    res.status(StatusCodes.OK).json(event);
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', authMiddleware, csrfMiddleware, async (req, res) => {
  try {
    const idUsuario = parseInt(req.query.idUsuario, 10);
    await assertCanWriteCalendar(req, idUsuario);
    await calendarEventService.deleteAsync(req.params.id, idUsuario);
    res.status(StatusCodes.OK).json({ deleted: true });
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

export default router;
