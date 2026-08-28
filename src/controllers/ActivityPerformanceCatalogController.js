import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import ActivityPerformanceCatalogService from '../services/ActivityPerformanceCatalogService.js';

const router = Router();
const currentService = new ActivityPerformanceCatalogService();

router.get('/dominios-actividad', async (req, res, next) => {
  try {
    const domains = await currentService.getDomainsAsync();
    res.status(StatusCodes.OK).json(domains);
  } catch (error) {
    next(error);
  }
});

router.get('/categorias-actividad', async (req, res, next) => {
  try {
    const categories = await currentService.getCategoriesAsync();
    res.status(StatusCodes.OK).json(categories);
  } catch (error) {
    next(error);
  }
});

router.get('/habilidades', async (req, res, next) => {
  try {
    const skills = await currentService.getSkillsAsync();
    res.status(StatusCodes.OK).json(skills);
  } catch (error) {
    next(error);
  }
});

export default router;
