import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import ReporteUsuarioService from '../services/ReporteUsuarioService.js';
import ReporteUsuario from '../entities/ReporteUsuario.js';
import AppError from '../modules/errors/AppError.js';

const router = Router();
const currentService = new ReporteUsuarioService();

// Solo quien reporto (id_usuario_reportante) puede ver/editar su propio
// reporte. El usuario reportado NO deberia poder ver que lo reportaron ni
// por que (evita que use la API para identificar y hostigar a quien lo
// denuncio).
function assertOwnReport(req, idUsuarioReportante) {
  if (Number(req.user.id) !== Number(idUsuarioReportante)) {
    throw new AppError('No autorizado para acceder a este reporte.', StatusCodes.FORBIDDEN);
  }
}

router.get('', async (req, res) => {
  try {
    console.log('ReporteUsuarioController.getAll');
    const r = await currentService.getAllAsync();
    const userId = Number(req.user.id);
    const mine = (r || []).filter((item) => Number(item.id_usuario_reportante) === userId);
    res.status(StatusCodes.OK).json(mine);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`ReporteUsuarioController.getById(${id})`);
    const r = await currentService.getByIdAsync(id);
    if (r == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el reporte con id: ${id}.`);
    assertOwnReport(req, r.id_usuario_reportante);
    res.status(StatusCodes.OK).json(r);
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

router.post('', async (req, res) => {
  try {
    console.log('ReporteUsuarioController.create');
    const entity = new ReporteUsuario(req.body);
    assertOwnReport(req, entity.id_usuario_reportante);
    const newId = await currentService.createAsync(entity);
    if (newId > 0) {
      res.status(StatusCodes.CREATED).json({ message: `Se creo el reporte con id: ${newId}`, id: newId });
    } else {
      res.status(StatusCodes.BAD_REQUEST).json({ message: 'No se pudo crear el reporte.' });
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entity = new ReporteUsuario(req.body);
    console.log(`ReporteUsuarioController.update(${id})`);
    if (entity.id && parseInt(entity.id) !== id) {
      return res.status(StatusCodes.BAD_REQUEST).send(`El id de la URL (${id}) no coincide con el id del body (${entity.id}).`);
    }
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el reporte con id: ${id}.`);
    assertOwnReport(req, previous.id_usuario_reportante);
    entity.id = id;
    entity.id_usuario_reportante = previous.id_usuario_reportante;
    const rowsAffected = await currentService.updateAsync(entity);
    if (rowsAffected !== 0) {
      res.status(StatusCodes.OK).json({ message: `Se actualizo el reporte con id: ${id}`, rowsAffected });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el reporte con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.BAD_REQUEST).send(`Error: ${error.message}`);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`ReporteUsuarioController.delete(${id})`);
    const previous = await currentService.getByIdAsync(id);
    if (previous == null) return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el reporte con id: ${id}.`);
    assertOwnReport(req, previous.id_usuario_reportante);
    const rowCount = await currentService.deleteByIdAsync(id);
    if (rowCount !== 0) {
      res.status(StatusCodes.OK).json({ message: `Se elimino el reporte con id: ${id}`, rowsAffected: rowCount });
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el reporte con id: ${id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(error?.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
