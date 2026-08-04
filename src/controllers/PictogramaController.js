import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import PictogramaService from '../services/PictogramaService.js';
import AuthorizationService from '../services/AuthorizationService.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { csrfMiddleware } from '../middlewares/csrf.middleware.js';
import { PERTENECIENTE_PERMISSIONS } from '../modules/security/permissions.constants.js';
import AiPictogramService from '../services/AiPictogramService.js';
import { upload } from '../middlewares/upload.middleware.js';
import PictogramizationService, { MAX_PHRASES_PER_REQUEST } from '../services/PictogramizationService.js';
import PersonalVocabularyStore from '../modules/pictograms/personal-vocabulary.js';
import StylePreferenceStore from '../modules/pictograms/style-preference.js';
import NotificationProducerService from '../services/NotificationProducerService.js';
import UsageEventService from '../services/UsageEventService.js';
import { USAGE_EVENT_TYPES } from '../modules/usage/event-types.js';
import { VISUAL_STYLES } from '../modules/pictograms/visual-styles.js';
import { NUCLEO_VOCABULARIO, TABLEROS_SITUACIONALES } from '../modules/communication/nucleo-vocabulario.js';
import { simplifyToLecturaFacilAsync, MAX_LECTURA_FACIL_CHARS } from '../modules/pictograms/lectura-facil.js';
import MemoryProfileService from '../services/MemoryProfileService.js';
import PertenecienteRepository from '../repositories/PertenecienteRepository.js';

const router = Router();
const currentService = new PictogramaService();
const memoryProfileService = new MemoryProfileService();
const pertenecienteRepository = new PertenecienteRepository();
const aiService = new AiPictogramService();
const pictogramizationService = new PictogramizationService();
const personalVocabularyStore = new PersonalVocabularyStore();
const stylePreferenceStore = new StylePreferenceStore();
const notificationProducerService = new NotificationProducerService();
const usageEventService = new UsageEventService();

const authIfTargetPerteneciente = (req, res, next) => {
  const targetPertenecienteId = req.query.targetPertenecienteId || req.query.id_perteneciente_destino;
  if (targetPertenecienteId || req.query.boostForUsuarioId) return authMiddleware(req, res, next);
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

// Motor de pictogramizacion (Sesion 1): frase -> pictograma, sin que nadie
// tenga que escribir ni elegir nada. Consume cuota de Groq, por eso requiere
// auth (no puede quedar anonima). Nunca devuelve 5xx por culpa de Groq: si
// no hay API key o Groq esta caido, degrada al heuristico y responde 200
// igual (ver engine.degraded en la respuesta).
router.post('/pictogramize', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    const { phrases, language, minConfidence, targetPertenecienteId, preferredStyleOverride } = req.body || {};

    if (!Array.isArray(phrases) || phrases.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'phrases es obligatorio y no puede estar vacio.' });
    }
    if (phrases.length > MAX_PHRASES_PER_REQUEST) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: `phrases no puede tener mas de ${MAX_PHRASES_PER_REQUEST} elementos.` });
    }

    if (targetPertenecienteId) {
      const targetIds = String(targetPertenecienteId).split(',').map(Number).filter(Boolean);
      for (const targetId of targetIds) {
        await AuthorizationService.assertCanReadPertenecienteResource(req.user.id, targetId);
      }
    }

    const result = await pictogramizationService.pictogramizeAsync({
      phrases,
      language,
      minConfidence,
      targetPertenecienteId: targetPertenecienteId || null,
      userId: req.user.id,
      preferredStyleOverride: Object.values(VISUAL_STYLES).includes(preferredStyleOverride) ? preferredStyleOverride : null,
    });

    res.status(StatusCodes.OK).json(result);
  } catch (error) {
    next(error);
  }
});

// Vocabulario personal (Sesion 2): cuando el perteneciente elige un
// pictograma a mano para un paso, se recuerda para ese texto exacto. La
// proxima vez que aparezca el mismo texto, /pictogramize lo devuelve directo
// sin gastar Groq ni volver a buscar en el catalogo. De paso, tambien queda
// registrado el estilo visual de lo elegido, para preferirlo en futuros
// matches automaticos aunque sea de otro texto.
// `targetUsuarioId` (Sesion 8, circuito de correccion): un tutor puede
// corregir el pictograma de un perteneciente que tutela, no solo el suyo
// propio. Se autoriza igual que cualquier otra escritura sobre "Mi dia"
// (mismo permiso, mismo allowTutor:true que ya usaba el guardado de
// rutinas) y se avisa al perteneciente por notificacion.
router.post('/vocabulary', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    const { text, pictogramId, targetUsuarioId } = req.body || {};
    if (typeof text !== 'string' || !text.trim() || !pictogramId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'text y pictogramId son obligatorios.' });
    }

    let ownerUsuarioId = req.user.id;
    let isCorrectionForOther = false;
    if (targetUsuarioId && Number(targetUsuarioId) !== Number(req.user.id)) {
      await AuthorizationService.assertCanUsePertenecienteFeatureByUsuarioId(
        req.user.id,
        Number(targetUsuarioId),
        PERTENECIENTE_PERMISSIONS.USAR_MI_DIA,
      );
      ownerUsuarioId = Number(targetUsuarioId);
      isCorrectionForOther = true;
    }

    await personalVocabularyStore.rememberAsync(ownerUsuarioId, text, pictogramId);

    const pictogram = await currentService.getByIdAsync(pictogramId);
    if (pictogram?.visualStyle) {
      await stylePreferenceStore.registerChoiceAsync(ownerUsuarioId, pictogram.visualStyle);
    }

    // Corregir un pictograma es la señal de memoria mas fuerte que existe
    // (alguien la eligio a mano, a proposito). Sin esto, el catalogo y el
    // motor de pictogramizacion podian tardar hasta 1h (TTL del cache) en
    // reflejar la correccion — el tutor corrige, prueba, y parece que no
    // paso nada.
    await memoryProfileService.invalidateAsync(ownerUsuarioId);

    await usageEventService.logAsync({
      idUsuario: ownerUsuarioId,
      tipoEvento: isCorrectionForOther ? USAGE_EVENT_TYPES.PICTOGRAMA_CORREGIDO : USAGE_EVENT_TYPES.PICTOGRAMA_ELEGIDO,
      entidadTipo: 'texto',
      idPictograma: String(pictogramId),
      valor: { text },
      origen: isCorrectionForOther ? 'tutor' : 'perteneciente',
    });

    if (isCorrectionForOther) {
      // reference_id en la tabla notificaciones es INTEGER: el id de un
      // pictograma es un string compuesto ("mulberry:shower"), no un
      // numero, asi que no entra ahi. Sin referencia numerica valida, se
      // omite en vez de mandar un valor que rompe el INSERT en silencio.
      await notificationProducerService.createAsync({
        recipientUserId: ownerUsuarioId,
        actorUserId: req.user.id,
        typeName: 'Sistema',
        title: 'Tu tutor corrigió un pictograma',
        body: `Ahora "${text}" se muestra con un pictograma distinto.`,
      });
    }

    res.status(StatusCodes.OK).json({ message: 'Vocabulario actualizado.' });
  } catch (error) {
    next(error);
  }
});

// Vocabulario nucleo y tableros situacionales resueltos (Sesion 11 item 37,
// Sesion 12 item 38): contenido estatico (no cambia por request), asi que
// se resuelve una vez por idioma+catalogo y se sirve de memoria despues. Es
// SQL contra el catalogo (searchAsync), no Groq: no hay cuota que cuidar aca.
const wordListCache = new Map();

async function resolveWordListAsync(cacheKey, wordsByGroup, language) {
  const fullKey = `${cacheKey}.${language}`;
  if (!wordListCache.has(fullKey)) {
    const groups = await Promise.all(
      Object.entries(wordsByGroup).map(async ([group, words]) => {
        const resolved = await Promise.all(words.map(async (word) => {
          const { items } = await currentService.searchAsync({ search: word, language, limit: 1 });
          const pictogram = items[0] || null;
          return {
            word,
            pictogram: pictogram ? { id: pictogram.id, name: pictogram.name, imageUrl: pictogram.imageUrl, source: pictogram.source } : null,
          };
        }));
        return [group, resolved];
      }),
    );
    wordListCache.set(fullKey, Object.fromEntries(groups));
  }
  return wordListCache.get(fullKey);
}

router.get('/nucleo', authMiddleware, async (req, res, next) => {
  try {
    const language = req.query.language || req.query.lang || 'es';
    res.status(StatusCodes.OK).json(await resolveWordListAsync('nucleo', NUCLEO_VOCABULARIO, language));
  } catch (error) {
    next(error);
  }
});

// item 38: un tablero por situacion (casa, escuela, salir, medico) en vez
// del nucleo — vocabulario de "frontera", especifico de un contexto.
router.get('/tableros/:nombre', authMiddleware, async (req, res, next) => {
  try {
    const words = TABLEROS_SITUACIONALES[req.params.nombre];
    if (!words) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: `No existe el tablero '${req.params.nombre}'.` });
    }
    const language = req.query.language || req.query.lang || 'es';
    const resolved = await resolveWordListAsync(`tablero.${req.params.nombre}`, { [req.params.nombre]: words }, language);
    res.status(StatusCodes.OK).json(resolved[req.params.nombre]);
  } catch (error) {
    next(error);
  }
});

// item 15 "explicame esto": simplifica un texto a lectura facil y lo
// traduce a pictogramas en el mismo llamado, para que el frontend no
// tenga que orquestar dos requests. Nunca 5xx por culpa de Groq: si
// simplifyToLecturaFacilAsync degrada, se sigue igual con el heuristico.
router.post('/explicame', authMiddleware, csrfMiddleware, async (req, res, next) => {
  try {
    const { text, language } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'text es obligatorio.' });
    }
    if (text.length > MAX_LECTURA_FACIL_CHARS) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: `text no puede tener mas de ${MAX_LECTURA_FACIL_CHARS} caracteres.` });
    }

    const { sentences, usedGroq, degraded } = await simplifyToLecturaFacilAsync(text);
    const phrases = sentences.map((sentence, index) => ({ id: String(index), text: sentence }));
    const pictogramized = await pictogramizationService.pictogramizeAsync({ phrases, language, userId: req.user.id });

    res.status(StatusCodes.OK).json({ results: pictogramized.results, engine: { ...pictogramized.engine, lecturaFacilUsedGroq: usedGroq, lecturaFacilDegraded: degraded } });
  } catch (error) {
    next(error);
  }
});

router.get('/tableros', authMiddleware, async (req, res, next) => {
  try {
    res.status(StatusCodes.OK).json(Object.keys(TABLEROS_SITUACIONALES));
  } catch (error) {
    next(error);
  }
});

router.get('', authIfTargetPerteneciente, async (req, res, next) => {
  try {
    const targetPertenecienteId = req.query.targetPertenecienteId || req.query.id_perteneciente_destino;
    let targetIds = [];
    if (targetPertenecienteId) {
      targetIds = String(targetPertenecienteId).split(',').map(Number).filter(Boolean);
      for (const targetId of targetIds) {
        await AuthorizationService.assertCanReadPertenecienteResource(req.user.id, targetId);
      }
    }

    // Perfil de memoria (Sesion 25): solo tiene sentido personalizar cuando
    // se pide el catalogo de UNA persona puntual (el caso normal — un
    // perteneciente viendo el suyo, o un tutor/profesional viendo el de un
    // perteneciente especifico). Con 0 o 2+ ids no hay "esta persona" clara
    // a quien priorizarle nada, se sigue sin boost — nunca rompe, solo deja
    // de personalizar.
    let boostPictogramIds = [];
    if (targetIds.length === 1) {
      try {
        const perteneciente = await pertenecienteRepository.getByIdAsync(targetIds[0]);
        if (perteneciente?.id_usuario) {
          boostPictogramIds = await memoryProfileService.getFrequentPictogramIdsAsync(perteneciente.id_usuario);
        }
      } catch {
        boostPictogramIds = [];
      }
    } else if (req.query.boostForUsuarioId) {
      // Camino alternativo para pantallas que ya conocen el usuario destino
      // directo (no el id de perteneciente) — ej. el picker de correccion
      // de pasos (RoutinePictogramPicker.tsx), que recibe targetUsuarioId
      // de mas arriba en el arbol de componentes. Mismo chequeo de lectura
      // que el resto del perfil de memoria: quien pide tiene que poder leer
      // los datos de ese usuario.
      const boostUsuarioId = Number(req.query.boostForUsuarioId);
      if (Number.isInteger(boostUsuarioId) && boostUsuarioId > 0) {
        try {
          await AuthorizationService.assertCanReadUsuarioConfig(req.user.id, boostUsuarioId);
          boostPictogramIds = await memoryProfileService.getFrequentPictogramIdsAsync(boostUsuarioId);
        } catch {
          boostPictogramIds = [];
        }
      }
    }

    const result = await currentService.searchAsync({
      search: req.query.search || req.query.q,
      category: req.query.category,
      style: req.query.style,
      collection: req.query.collection,
      language: req.query.language || req.query.lang,
      limit: req.query.limit,
      page: req.query.page,
      targetPertenecienteId,
      boostPictogramIds,
    });

    // Compatibilidad: solo quien pide `page` explicitamente (la UI con
    // paginacion) recibe el objeto con total/paginas. Los llamadores viejos
    // (autocompletado de ActivityBuilder, AiPictogramStudio) no mandan `page`
    // y siguen recibiendo el array pelado de siempre.
    res.status(StatusCodes.OK).json(req.query.page ? result : result.items);
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

// Todas las opciones del panel de filtros (categorias, estilos visuales y
// colecciones) con su conteo real, en una sola llamada.
router.get('/filters', async (req, res) => {
  try {
    const filters = await currentService.getFilterOptionsAsync(req.query.language || req.query.lang);
    res.status(StatusCodes.OK).json(filters);
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
