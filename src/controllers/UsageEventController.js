import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import UsageEventService from '../services/UsageEventService.js';
import AuthorizationService from '../services/AuthorizationService.js';
import ConfiguracionUsuarioService from '../services/ConfiguracionUsuarioService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { csrfMiddleware } from '../middlewares/csrf.middleware.js';
import { buildVocabularyReport } from '../modules/usage/vocabulary-report.js';
import { USAGE_EVENT_TYPES } from '../modules/usage/event-types.js';
import { parseCalendarEventsFromConfigs, parseEmotionsFromConfigs } from '../modules/usage/config-parsing.js';
import { detectEventTypePatterns, evaluateAnticipationSupport } from '../modules/usage/pattern-detection.js';

const router = Router();
const usageEventService = new UsageEventService();
const configuracionUsuarioService = new ConfiguracionUsuarioService();

// Registro de uso (Sesion 9): siempre se registra a nombre de QUIEN LLAMA
// (req.user.id) — un perteneciente registra su propio uso. No hay "en
// nombre de otro" aca (eso es lo que corrige el circuito de correccion de
// pictogramas, un mecanismo distinto). Acepta un evento o un array, para
// que el hook del frontend pueda mandar en lote sin logica extra.
router.post('', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    const body = req.body || {};
    const rawEvents = Array.isArray(body) ? body : Array.isArray(body.events) ? body.events : [body];
    const events = rawEvents.map((e) => ({
      idUsuario: req.user.id,
      tipoEvento: e.tipoEvento,
      entidadTipo: e.entidadTipo,
      entidadId: e.entidadId,
      idPictograma: e.idPictograma,
      valor: e.valor,
      origen: e.origen,
      ocurrioEn: e.ocurrioEn,
    }));

    const saved = await usageEventService.logManyAsync(events);
    res.status(StatusCodes.OK).json({ saved, total: events.length });
  } catch (error) {
    next(error);
  }
});

// Timeline de uso de un usuario (perteneciente): uno mismo, o su tutor/
// profesional con acceso. Reusa el mismo guard que configuraciones_usuarios
// (Sesion 6) — es exactamente la misma pregunta: "puede X leer datos del
// usuario Y".
router.get('/usuario/:idUsuario', authMiddleware, async (req, res, next) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario, 10);
    await AuthorizationService.assertCanReadUsuarioConfig(req.user.id, idUsuario);

    const events = await usageEventService.getForUsuarioAsync(idUsuario, {
      tipoEvento: req.query.tipoEvento,
      limit: req.query.limit,
    });
    res.status(StatusCodes.OK).json(events);
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

// Informe de vocabulario (Sesion 19, item 42): que palabras del nucleo
// (Sesion 11) uso esta persona en sus enunciados hablados, y cuales nunca
// uso. Mismo guard de lectura que el resto de los endpoints de usuario.
router.get('/usuario/:idUsuario/informe-vocabulario', authMiddleware, async (req, res, next) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario, 10);
    await AuthorizationService.assertCanReadUsuarioConfig(req.user.id, idUsuario);

    const events = await usageEventService.getForUsuarioAsync(idUsuario, {
      tipoEvento: USAGE_EVENT_TYPES.ENUNCIADO_HABLADO,
      limit: 500,
    });
    res.status(StatusCodes.OK).json(buildVocabularyReport(events));
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

// Deteccion de patrones (Sesion 20, item 41 ⭐) + que apoyos funcionan
// (item 43). Cruza calendario y emociones (viven en configuraciones_
// usuarios, ver ConfiguracionUsuarioController) con los eventos "se vio la
// historia social" (registrados desde SocialStoryView con tipoEvento
// 'pictograma_elegido' y entidadTipo 'historia_social', Sesion 15). Todo
// el calculo honesto (piso minimo de datos) vive en el modulo puro
// pattern-detection.js — aca solo se junta la data cruda.
router.get('/usuario/:idUsuario/patrones', authMiddleware, async (req, res, next) => {
  try {
    const idUsuario = parseInt(req.params.idUsuario, 10);
    await AuthorizationService.assertCanReadUsuarioConfig(req.user.id, idUsuario);

    const [configs, choiceEvents] = await Promise.all([
      configuracionUsuarioService.getByUsuarioIdAsync(idUsuario),
      usageEventService.getForUsuarioAsync(idUsuario, { tipoEvento: USAGE_EVENT_TYPES.PICTOGRAMA_ELEGIDO, limit: 1000 }),
    ]);

    const events = parseCalendarEventsFromConfigs(configs);
    const emotions = parseEmotionsFromConfigs(configs);
    const socialStoryViewedEventIds = new Set(
      (choiceEvents || [])
        .filter((e) => e.entidad_tipo === 'historia_social' && e.entidad_id)
        .map((e) => String(e.entidad_id)),
    );

    res.status(StatusCodes.OK).json({
      eventTypePatterns: detectEventTypePatterns(events, emotions),
      anticipationSupport: evaluateAnticipationSupport(events, emotions, socialStoryViewedEventIds),
    });
  } catch (error) {
    res.status(error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR).send(`Error: ${error.message}`);
  }
});

export default router;
