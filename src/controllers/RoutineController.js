import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import RoutineService from '../services/RoutineService.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { csrfMiddleware } from '../middlewares/csrf.middleware.js';
import { PERTENECIENTE_PERMISSIONS } from '../modules/security/permissions.constants.js';

const router = Router();
const routineService = new RoutineService();

// "Mi dia" es exclusivo de pertenecientes (a diferencia del calendario, que
// tutores/profesionales tambien usan para su agenda personal) — no hace
// falta el carve-out de "escribir el propio sin ser perteneciente" que
// tiene CalendarEventController.
async function assertCanWriteRoutines(req, idUsuarioTarget) {
  await AuthorizationService.assertCanUsePertenecienteFeatureByUsuarioId(
    req.user.id,
    idUsuarioTarget,
    PERTENECIENTE_PERMISSIONS.USAR_MI_DIA,
  );
}

router.get('/usuario/:idUsuario', authMiddleware, async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario, 10);
    await AuthorizationService.assertCanReadUsuarioConfig(req.user.id, idUsuario);
    const routines = await routineService.getForUsuarioAsync(idUsuario);
    res.status(StatusCodes.OK).json(routines);
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

// Reemplaza el dia completo — mismo comportamiento que el guardado bulk de
// hoy, para que RoutinesContext.tsx no necesite reescribirse en esta
// migracion (sigue debounce-guardando el array entero).
router.put('/usuario/:idUsuario', authMiddleware, csrfMiddleware, async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario, 10);
    await assertCanWriteRoutines(req, idUsuario);
    const routines = await routineService.replaceAllForUsuarioAsync(idUsuario, req.body.routines || []);
    res.status(StatusCodes.OK).json(routines);
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

// Granular: togglear completado o corregir el pictograma de UN paso sin
// reenviar el dia entero (lo usa TutorRoutinePictogramReview.tsx).
router.patch('/item/:itemId', authMiddleware, csrfMiddleware, async (req, res) => {
  try {
    const idUsuario = parseInt(req.body.idUsuario, 10);
    await assertCanWriteRoutines(req, idUsuario);
    await routineService.updateItemAsync(req.params.itemId, idUsuario, req.body);
    res.status(StatusCodes.OK).json({ updated: true });
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

export default router;
