import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import PertenecienteService from '../services/PertenecienteService.js';
import Perteneciente from '../entities/Perteneciente.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { PERTENECIENTE_PERMISSIONS } from '../modules/security/permissions.constants.js';

const router = Router();
const currentService = new PertenecienteService();

router.get('', async (req, res) => {
  try {
    const returnArray = await currentService.getAllAsync();
    if (returnArray != null) res.status(StatusCodes.OK).json(returnArray);
    else res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Error interno.');
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/usuario/:idUsuario', async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario);
    const returnEntity = await currentService.getByUsuarioIdAsync(idUsuario);
    if (returnEntity != null) res.status(StatusCodes.OK).json(returnEntity);
    else res.status(StatusCodes.NOT_FOUND).send(`No se encontro el perteneciente del usuario con id: ${idUsuario}.`);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const returnEntity = await currentService.getByIdAsync(id);
    if (returnEntity != null) res.status(StatusCodes.OK).json(returnEntity);
    else res.status(StatusCodes.NOT_FOUND).send(`No se encontro el perteneciente con id: ${id}.`);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    const entity = new Perteneciente(req.body);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) res.status(StatusCodes.CREATED).json({ message: `Se creo el perteneciente con id: ${newId}`, id: newId });
    else res.status(StatusCodes.BAD_REQUEST).json({ message: 'No se pudo crear el perteneciente.' });
  } catch (error) {
    res.status(StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

function hasSensitiveProfileChanges(body, previous) {
  return (
    (body.id_nivel_apoyo !== undefined && Number(body.id_nivel_apoyo) !== Number(previous.id_nivel_apoyo))
    || (body.id_autonomia_operativa !== undefined && Number(body.id_autonomia_operativa) !== Number(previous.id_autonomia_operativa))
    || (body.puede_autogestionarse !== undefined && Boolean(body.puede_autogestionarse) !== Boolean(previous.puede_autogestionarse))
  );
}

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new Perteneciente(req.body);
    if (entity.id && parseInt(entity.id) !== id) {
        return res.status(StatusCodes.BAD_REQUEST).send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el perteneciente con id: ${id}.`);
    }

    const sensitiveChange = hasSensitiveProfileChanges(req.body ?? {}, previous);

    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, id, {
      pertenecientePermissionName: sensitiveChange
        ? PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL_SENSIBLE
        : PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL,
      allowTutor: true,
    });

    entity.id = id;
    entity.id_usuario = previous.id_usuario;
    // Este endpoint lo usa un tutor/profesional (o el propio perteneciente
    // autogestionado) para confirmar o corregir el nivel de apoyo. Si el
    // body trae id_nivel_apoyo, es porque alguien con permiso de edicion
    // sensible lo tuvo delante y lo guardo a proposito (haya cambiado el
    // valor o no) — eso ya cuenta como confirmacion, asi que se apaga el
    // flag de "sugerido por el cuestionario".
    entity.nivel_apoyo_sugerido = req.body?.id_nivel_apoyo !== undefined ? false : previous.nivel_apoyo_sugerido;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) res.status(StatusCodes.OK).json({ message: `Se actualizo el perteneciente con id: ${id}`, rowsAffected });
    else res.status(StatusCodes.NOT_FOUND).send(`No se encontro el perteneciente con id: ${id}.`);
  } catch (error) {
    res.status(StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id/onboarding', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el perteneciente con id: ${id}.`);
    }

    // El cuestionario de onboarding es una autoevaluacion: solo lo puede
    // completar el propio perteneciente sobre si mismo, nunca un tutor en
    // su nombre (por eso allowTutor: false y no se pide ningun permiso
    // especifico — el chequeo de "es este mismo perteneciente" ya alcanza).
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, id, {
      allowTutor: false,
    });

    const { id_nivel_apoyo, id_autonomia_operativa } = req.body ?? {};
    const entity = new Perteneciente({
      ...previous,
      id,
      id_nivel_apoyo: id_nivel_apoyo ?? previous.id_nivel_apoyo,
      id_autonomia_operativa: id_autonomia_operativa ?? previous.id_autonomia_operativa,
      // Marcado como sugerido: adapta la interfaz pero no bloquea nada, y
      // queda a la vista del profesional/tutor para que lo confirme.
      nivel_apoyo_sugerido: true,
    });

    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) res.status(StatusCodes.OK).json({ message: 'Se guardo la sugerencia del cuestionario.', rowsAffected });
    else res.status(StatusCodes.NOT_FOUND).send(`No se encontro el perteneciente con id: ${id}.`);
  } catch (error) {
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await AuthorizationService.assertCanWritePertenecienteResource(req.user.id, id, {
      pertenecientePermissionName: PERTENECIENTE_PERMISSIONS.EDITAR_PERFIL_SENSIBLE,
      allowTutor: true,
    });
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) res.status(StatusCodes.OK).json({ message: `Se elimino el perteneciente con id: ${id}`, rowsAffected: rowCount });
    else res.status(StatusCodes.NOT_FOUND).send(`No se encontro el perteneciente con id: ${id}.`);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
