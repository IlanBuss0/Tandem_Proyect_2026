import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import PictogramaService from '../services/PictogramaService.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { csrfMiddleware } from '../middlewares/csrf.middleware.js';
import { PERTENECIENTE_PERMISSIONS } from '../modules/security/permissions.constants.js';
import AiPictogramService from '../services/AiPictogramService.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = Router();
const currentService = new PictogramaService();
const aiService = new AiPictogramService();

const authIfTargetPerteneciente = (req, res, next) => {
  const targetPertenecienteId = req.query.targetPertenecienteId || req.query.id_perteneciente_destino;
  if (targetPertenecienteId) return authMiddleware(req, res, next);
  return next();
};

router.get('/ai/targets', authMiddleware, async (req, res, next) => {
  try { res.json(await aiService.getTargetsAsync(req.user.id)); } catch (error) { next(error); }
});

router.post('/ai/generations', authMiddleware, csrfMiddleware, upload.single('reference'), async (req, res, next) => {
  try {
    const result = await aiService.generateAsync({ userId: req.user.id, body: req.body || {}, file: req.file });
    res.status(StatusCodes.CREATED).json(result);
  } catch (error) { next(error); }
});

router.get('/ai/generations/:id', authMiddleware, async (req, res, next) => {
  try { res.json(await aiService.getGenerationForOwnerAsync(req.params.id, req.user.id)); } catch (error) { next(error); }
});

router.post('/ai/generations/:id/revise', authMiddleware, csrfMiddleware, upload.single('reference'), async (req, res, next) => {
  try {
    const result = await aiService.reviseGenerationAsync({
      id: req.params.id,
      userId: req.user.id,
      body: req.body || {},
      file: req.file,
    });
    res.status(StatusCodes.OK).json(result);
  } catch (error) { next(error); }
});

router.post('/ai/generations/:id/save', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try { res.status(StatusCodes.CREATED).json(await aiService.saveAsync(req.params.id, req.user.id, req.body || {})); } catch (error) { next(error); }
});

router.delete('/ai/generations/:id', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try { res.json(await aiService.discardAsync(req.params.id, req.user.id)); } catch (error) { next(error); }
});

router.get('/ai/creations/mine', authMiddleware, async (req, res, next) => {
  try { res.json(await aiService.listMineAsync(req.user.id)); } catch (error) { next(error); }
});

router.get('/ai/creations/available', authMiddleware, async (req, res, next) => {
  try { res.json(await aiService.listAvailableAsync(req.user.id)); } catch (error) { next(error); }
});

router.patch('/ai/creations/:id', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try { res.json(await aiService.updateCreationAsync(req.params.id, req.user.id, req.body || {})); } catch (error) { next(error); }
});

router.post('/ai/creations/:id/submit', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try { res.json(await aiService.submitAsync(req.params.id, req.user.id)); } catch (error) { next(error); }
});

router.get('/ai/moderation', authMiddleware, async (req, res, next) => {
  try { res.json(await aiService.listModerationAsync(req.user.id)); } catch (error) { next(error); }
});

router.post('/ai/moderation/:id/review', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try { res.json(await aiService.reviewAsync(req.params.id, req.user.id, req.body || {})); } catch (error) { next(error); }
});

router.get('', authIfTargetPerteneciente, async (req, res, next) => {
  try {
    const targetPertenecienteId = req.query.targetPertenecienteId || req.query.id_perteneciente_destino;
    if (targetPertenecienteId) {
      const targetIds = String(targetPertenecienteId).split(',').map(Number).filter(Boolean);
      for (const targetId of targetIds) {
        await AuthorizationService.assertCanReadPertenecienteResource(req.user.id, targetId);
      }
    }

    const pictograms = await currentService.searchAsync({
      search: req.query.search || req.query.q,
      category: req.query.category,
      language: req.query.language || req.query.lang,
      limit: req.query.limit,
      targetPertenecienteId,
    });

    res.status(StatusCodes.OK).json(pictograms);
  } catch (error) {
    next(error);
  }
});

router.get('/attributions', async (req, res) => {
  try {
    const attributions = await currentService.getAttributionsAsync();
    res.status(StatusCodes.OK).json(attributions);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.BAD_GATEWAY).json({ message: error.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const categories = await currentService.getCategoriesAsync(req.query.language || req.query.lang);
    res.status(StatusCodes.OK).json(categories);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.BAD_GATEWAY).json({ message: error.message });
  }
});

router.get('/favorites', authMiddleware, async (req, res) => {
  try {
    const userId = req.query.userId || req.query.id_usuario;
    await AuthorizationService.assertCanUsePertenecienteFeatureByUsuarioId(
      req.user.id,
      Number(userId),
      PERTENECIENTE_PERMISSIONS.USAR_PICTOGRAMAS,
    );

    const favorites = await currentService.getFavoritesAsync(
      userId,
      req.query.language || req.query.lang,
    );
    res.status(StatusCodes.OK).json(favorites);
  } catch (error) {
    console.log(error);
    res.status(error.statusCode ?? StatusCodes.BAD_REQUEST).json({ message: error.message });
  }
});

router.get('/:id/image', async (req, res) => {
  try {
    // Resuelve el pictograma en la base local primero para saber de que
    // proveedor es (cada uno arma su URL de forma distinta) y solo cae al
    // comportamiento legado de ARASAAC si no se encuentra.
    const imageUrl = await currentService.getImageUrlAsync(req.params.id, req.query.resolution);
    res.redirect(StatusCodes.TEMPORARY_REDIRECT, imageUrl);
  } catch (error) {
    res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const file = await currentService.downloadAsync(req.params.id, req.query.language || req.query.lang);

    if (!file) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el pictograma con id: ${req.params.id}.`);
    }

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.status(StatusCodes.OK).send(file.data);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.BAD_GATEWAY).json({ message: error.message });
  }
});

router.post('/:id/save', authMiddleware, csrfMiddleware, async (req, res) => {
  try {
    const userId = req.body?.userId || req.body?.id_usuario || req.query.userId || req.query.id_usuario;
    await AuthorizationService.assertCanUsePertenecienteFeatureByUsuarioId(
      req.user.id,
      Number(userId),
      PERTENECIENTE_PERMISSIONS.USAR_PICTOGRAMAS,
    );

    const pictogram = await currentService.markSavedAsync(
      req.params.id,
      req.body?.language || req.query.language || req.query.lang,
      userId,
    );

    if (!pictogram) {
      return res.status(StatusCodes.NOT_FOUND).send(`No se encontro el pictograma con id: ${req.params.id}.`);
    }

    res.status(StatusCodes.OK).json({ message: 'Pictograma guardado.', pictogram });
  } catch (error) {
    console.log(error);
    res.status(error.statusCode ?? StatusCodes.BAD_GATEWAY).json({ message: error.message });
  }
});

router.delete('/:id/save', authMiddleware, csrfMiddleware, async (req, res) => {
  try {
    const userId = req.body?.userId || req.body?.id_usuario || req.query.userId || req.query.id_usuario;
    await AuthorizationService.assertCanUsePertenecienteFeatureByUsuarioId(
      req.user.id,
      Number(userId),
      PERTENECIENTE_PERMISSIONS.USAR_PICTOGRAMAS,
    );

    const rowsAffected = await currentService.unmarkSavedAsync(
      req.params.id,
      req.body?.language || req.query.language || req.query.lang,
      userId,
    );

    res.status(StatusCodes.OK).json({ message: 'Pictograma quitado de favoritos.', rowsAffected });
  } catch (error) {
    console.log(error);
    res.status(error.statusCode ?? StatusCodes.BAD_REQUEST).json({ message: error.message });
  }
});

router.post('/sync', authMiddleware, csrfMiddleware, async (req, res) => {
  try {
    const result = await currentService.syncFromArasaacAsync({
      language: req.body?.language || req.query.language || req.query.lang,
    });

    res.status(StatusCodes.OK).json(result);
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.BAD_GATEWAY).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pictogram = await currentService.getByIdAsync(req.params.id, req.query.language || req.query.lang);

    if (pictogram != null) {
      res.status(StatusCodes.OK).json(pictogram);
    } else {
      res.status(StatusCodes.NOT_FOUND).send(`No se encontro el pictograma con id: ${req.params.id}.`);
    }
  } catch (error) {
    console.log(error);
    res.status(StatusCodes.BAD_GATEWAY).json({ message: error.message });
  }
});

export default router;
