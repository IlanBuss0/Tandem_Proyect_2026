import crypto from 'crypto';
import axios from 'axios';
import sharp from 'sharp';
import AiPictogramRepository from '../repositories/AiPictogramRepository.js';
import PictogramaRepository from '../repositories/PictogramaRepository.js';
import FileStorageService from './FileStorageService.js';
import AuthorizationService from './AuthorizationService.js';
import StylePreferenceStore from '../modules/pictograms/style-preference.js';
import AppError from '../modules/errors/AppError.js';
import { envConfig } from '../configs/env.config.js';
import { falImageProvider, pollinationsImageProvider } from '../providers/ai/aiProviders.js';

const QUICK_MODEL = 'fal-ai/flux/schnell';
const FINAL_MODEL = 'fal-ai/flux-2-pro';
const FINAL_EDIT_MODEL = 'fal-ai/flux-2-pro/edit';
const ALLOWED_CATEGORIES = new Set([
  'acciones y rutinas', 'actividades', 'casa', 'comida', 'comunicacion',
  'compras y dinero', 'conceptos', 'emociones', 'escuela y aprendizaje',
  'higiene', 'lugares', 'naturaleza', 'objetos', 'ocio', 'personas',
  'salud y cuerpo', 'tecnologia', 'tiempo', 'transporte', 'vida diaria', 'otros',
]);
const BLOCKED_TEXT = /(?:porn|desnud|sexual|arma|sangre|suicid|autolesi|odio|nazi)/i;

function cleanText(value, max) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function visualOnlyText(value) {
  return cleanText(value, 1200)
    .replace(/\bque\s+dij[ae]\s+([^.,;]+)/gi, 'representando visualmente la idea de "$1"')
    .replace(/\bque\s+escriba\s+([^.,;]+)/gi, 'representando visualmente la idea de "$1"')
    .replace(/\bcon\s+texto\s+(?:de\s+)?([^.,;]+)/gi, 'representando visualmente la idea de "$1"');
}

function getProviderError(error) {
  const status = error?.response?.status;
  let message = error?.message || 'Error desconocido';
  const data = error?.response?.data;

  if (Buffer.isBuffer(data)) {
    try {
      const parsed = JSON.parse(data.toString('utf8'));
      message = parsed?.message || parsed?.error || message;
    } catch {
      message = data.toString('utf8').slice(0, 180) || message;
    }
  } else if (data && typeof data === 'object') {
    message = data.message || data.error || message;
  } else if (typeof data === 'string') {
    message = data.slice(0, 180);
  }

  return { status, message };
}

function getTechnicalErrorDetails(error) {
  return {
    timestamp: new Date().toISOString(),
    status: error?.response?.status || error?.statusCode || error?.cause?.response?.status || 'sin estado',
    code: error?.code || error?.cause?.code || error?.name || 'Error',
  };
}

function splitStoredList(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinStoredList(items) {
  return Array.from(new Set((items || []).filter(Boolean))).join('\n') || null;
}

// Sesion 25 (perfil de memoria), arreglo de consistencia: el motor de
// pictogramizacion automatico ya prioriza el estilo que cada persona
// eligio mas seguido (StylePreferenceStore) — este generador con IA
// (usado por un tutor, con foto de referencia) generaba sin saber nada
// de eso. Solo se traducen los estilos que tienen sentido como pedido de
// generacion; emoji/icono/propio no son un "estilo de dibujo" que un
// modelo de imagenes pueda perseguir.
const STYLE_PROMPT_HINTS = {
  realista: 'Prefer a realistic, photo-like illustration style.',
  ilustracion: 'Prefer a soft, friendly flat-illustration style.',
  dibujo: 'Prefer a playful cartoon style.',
  'alto-contraste': 'Use bold outlines and strong, high-contrast color blocks.',
};

export function buildPrompt(name, description, revisionInstructions = '', preferredStyle = null) {
  const visualDescription = visualOnlyText(description);
  const visualRevision = visualOnlyText(revisionInstructions);
  const parts = [
    `Create one accessible AAC pictogram representing: ${name}.`,
    `Meaning and context: ${visualDescription}.`,
    'Square composition, one clear centered subject, simple flat vector illustration, thick rounded outlines, high contrast, friendly neutral appearance.',
    'Plain white or transparent-looking background, no scenery unless essential to meaning, no written words, no letters, no logos, no watermark, no border.',
    'If the user asks for words, labels, speech bubbles, or written phrases, represent that message visually without drawing text.',
    'The result must be immediately understandable for a person who uses augmentative and alternative communication.',
  ];

  if (preferredStyle && STYLE_PROMPT_HINTS[preferredStyle]) {
    parts.push(STYLE_PROMPT_HINTS[preferredStyle]);
  }

  if (visualRevision) {
    parts.push(`Edit the provided pictogram preview using the visual references. Revision request: ${visualRevision}. Preserve the AAC pictogram style and only change what the request implies.`);
  }

  return parts.join(' ');
}

function keywordSymbol(text) {
  const normalized = String(text || '').toLowerCase();
  if (/(viaje|avion|aeropuerto|volar|salir)/.test(normalized)) return { icon: 'M512 170 132 395l55 45 136-42 76 79-85 119 53 41 128-94 139 145 62-47-76-176 141-103 92 22 43-51-385-163Z', color: '#2f80ed' };
  if (/(comer|comida|almorz|cenar)/.test(normalized)) return { icon: 'M325 160h42v245h-42V160Zm-74 0h42v245h-42V160Zm-74 0h42v245h-42V160Zm238 0h70c82 0 147 67 147 149v399h-72V505H415V160Z', color: '#f2994a' };
  if (/(casa|hogar|habitacion)/.test(normalized)) return { icon: 'M166 474 512 194l346 280-45 56-62-50v298H274V480l-62 50-46-56Zm180 246h106V572h120v148h106V422L512 288 346 422v298Z', color: '#27ae60' };
  if (/(dolor|salud|medic|cuerpo)/.test(normalized)) return { icon: 'M462 180h100v132h132v100H562v132H462V412H330V312h132V180Zm50 504c-134 0-244-109-244-244s110-244 244-244 244 109 244 244-110 244-244 244Z', color: '#eb5757' };
  return { icon: 'M512 174c121 0 220 96 220 214 0 161-220 342-220 342S292 549 292 388c0-118 99-214 220-214Zm0 112a92 92 0 1 0 0 184 92 92 0 0 0 0-184Z', color: '#6b4c9a' };
}

async function createLocalPictogramBuffer({ name, description }) {
  const symbol = keywordSymbol(`${name} ${description}`);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <rect width="1024" height="1024" fill="#ffffff"/>
      <circle cx="512" cy="512" r="356" fill="#f7f8fb" stroke="#1f2937" stroke-width="28"/>
      <path d="${symbol.icon}" fill="${symbol.color}" stroke="#1f2937" stroke-width="18" stroke-linejoin="round"/>
    </svg>
  `;
  return await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export default class AiPictogramService {
  constructor() {
    this.repository = new AiPictogramRepository();
    this.pictograms = new PictogramaRepository();
    this.storage = new FileStorageService();
    this.StylePreferenceStore = new StylePreferenceStore();
    this.falImageProvider = falImageProvider;
    this.pollinationsImageProvider = pollinationsImageProvider;
  }

  ensureSchemaAsync = async () => {
    await this.pictograms.ensureSchemaAsync();
    await this.repository.ensureSchemaAsync();
  };

  // usuarioId (ademas del id de perteneciente) para que consumidores que
  // solo conocen el usuario de la persona (como TutorRoutinePictogramReview,
  // Sesion 8) puedan resolver a que perteneciente generarle un pictograma
  // sin tener que adivinar por nombre (Sesion 23, item 16).
  getTargetsAsync = async (userId) => {
    const context = await AuthorizationService.getPermissionContext(userId);
    if (context.tutor) {
      return (context.pertenecientes || []).map(item => ({
        id: item.id,
        usuarioId: item.usuario?.id ?? null,
        name: `${item.usuario?.nombre || ''} ${item.usuario?.apellido || ''}`.trim() || item.usuario?.nombre_usuario,
      }));
    }
    if (context.profesional) {
      return (context.vinculos || [])
        .filter(item => item.vinculo?.fue_aprobado_por_tutor !== false)
        .map(item => ({
          id: item.perteneciente.id,
          usuarioId: item.perteneciente.usuario?.id ?? null,
          name: `${item.perteneciente.usuario?.nombre || ''} ${item.perteneciente.usuario?.apellido || ''}`.trim()
            || item.perteneciente.usuario?.nombre_usuario,
        }));
    }
    throw new AppError('Solo tutores y profesionales pueden crear pictogramas con IA.', 403);
  };

  assertTargetAsync = async (userId, targetId) => {
    const targets = await this.getTargetsAsync(userId);
    if (!targets.some(item => Number(item.id) === Number(targetId))) {
      throw new AppError('No tenes un vinculo activo con el perteneciente seleccionado.', 403);
    }
  };

  prepareReferenceAsync = async ({ file, referencePictogramId, userId, generationId }) => {
    if (file) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
        throw new AppError('La referencia debe ser PNG, JPG o WebP.', 400);
      }
      if (file.size > 8 * 1024 * 1024) throw new AppError('La referencia no puede superar 8 MB.', 400);
      let buffer;
      try {
        buffer = await sharp(file.buffer, { failOn: 'error' })
          .rotate().resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
          .png({ compressionLevel: 9 }).toBuffer();
      } catch {
        throw new AppError('La imagen de referencia no es valida.', 400);
      }
      try {
        const stored = await this.storage.uploadAsync({
          buffer, contentType: 'image/png', fileName: 'reference.png', userId,
          path: `pictograms-ai/temp/${generationId}/reference.png`, upsert: true,
        });
        return { type: 'upload', url: stored.url, path: stored.path };
      } catch (error) {
        const providerError = getProviderError(error);
        throw new AppError(`No se pudo guardar la referencia (${providerError.status || 'sin estado'}).`, 502);
      }
    }
    if (referencePictogramId) {
      const pictogram = await this.pictograms.getByExternalIdAsync(referencePictogramId, 'es');
      if (!pictogram?.imageUrl) throw new AppError('El pictograma de referencia no existe.', 404);
      return { type: 'catalog', url: pictogram.imageUrl, pictogramId: pictogram.id };
    }
    return null;
  };

  callPollinationsAsync = async ({ prompt, referenceUrls = [] }) => {
    return await this.pollinationsImageProvider.generateImage({ prompt, referenceUrls });
  };

  callFalAsync = async ({ model, prompt, referenceUrls = [] }) => {
    return await this.falImageProvider.generateImage({ model, prompt, referenceUrls });
  };

  createImageBufferAsync = async ({ model, prompt, referenceUrls, name, description }) => {
    const hasFalKey = envConfig.falKey && envConfig.falKey !== 'replace-with-fal-api-key';
    let providerRequestId = null;
    let seed = null;
    let imageBuffer;

    if (hasFalKey) {
      try {
        const result = await this.callFalAsync({ model, prompt, referenceUrls });
        const downloaded = await axios.get(result.image.url, { responseType: 'arraybuffer', timeout: 60000 });
        imageBuffer = await sharp(Buffer.from(downloaded.data)).resize(1024, 1024, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
        providerRequestId = result.requestId;
        seed = result.seed;
      } catch (falError) {
        console.warn('Fal AI failed. Falling back to Pollinations AI...', getTechnicalErrorDetails(falError));
        try {
          const rawBuffer = await this.callPollinationsAsync({ prompt, referenceUrls });
          imageBuffer = await sharp(rawBuffer).resize(1024, 1024, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
        } catch (pollinationsError) {
          console.warn('Pollinations failed. Falling back to local pictogram...', getTechnicalErrorDetails(pollinationsError));
          imageBuffer = await createLocalPictogramBuffer({ name, description });
        }
      }
    } else {
      try {
        const rawBuffer = await this.callPollinationsAsync({ prompt, referenceUrls });
        imageBuffer = await sharp(rawBuffer).resize(1024, 1024, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer();
      } catch (pollinationsError) {
        console.warn('Pollinations failed. Falling back to local pictogram...', getTechnicalErrorDetails(pollinationsError));
        imageBuffer = await createLocalPictogramBuffer({ name, description });
      }
    }

    return { imageBuffer, providerRequestId, seed };
  };

  generateAsync = async ({ userId, body, file }) => {
    await this.ensureSchemaAsync();
    const name = cleanText(body.name, 160);
    const description = cleanText(body.description, 1200);
    const category = cleanText(body.category, 100).toLowerCase() || 'otros';
    const mode = body.mode === 'quick' ? 'quick' : 'final';
    const targetPertenecienteId = Number(body.targetPertenecienteId);
    if (name.length < 2 || description.length < 5) throw new AppError('Completa nombre y descripcion.', 400);
    if (BLOCKED_TEXT.test(`${name} ${description}`)) throw new AppError('La solicitud no supera el control de contenido.', 422);
    if (!ALLOWED_CATEGORIES.has(category)) throw new AppError('La categoria no es valida.', 400);
    if (!Number.isInteger(targetPertenecienteId) || targetPertenecienteId <= 0) throw new AppError('Selecciona un perteneciente.', 400);
    const targets = await this.getTargetsAsync(userId);
    const target = targets.find((item) => Number(item.id) === targetPertenecienteId);
    if (!target) throw new AppError('No tenes un vinculo activo con el perteneciente seleccionado.', 403);

    const hasFalKey = envConfig.falKey && envConfig.falKey !== 'replace-with-fal-api-key';
    const id = crypto.randomUUID();
    const reference = await this.prepareReferenceAsync({
      file, referencePictogramId: body.referencePictogramId, userId, generationId: id,
    });

    if (mode === 'quick' && reference) {
      if (reference.path) await this.storage.deleteAsync(reference.path).catch(() => undefined);
      throw new AppError('Las referencias se aplican en modo final. Usa modo final o quita la referencia.', 400);
    }
    const model = hasFalKey ? (mode === 'quick' ? QUICK_MODEL : reference ? FINAL_EDIT_MODEL : FINAL_MODEL) : 'pollinations-flux';
    // Sesion 25: mismo estilo que el motor automatico ya prioriza para
    // esta persona (el que mas eligio, no el override de accesibilidad de
    // alto contraste — esto es una preferencia, no una necesidad).
    const preferredStyle = target.usuarioId ? await this.StylePreferenceStore.getPreferredStyleAsync(target.usuarioId) : null;
    const prompt = buildPrompt(name, description, '', preferredStyle);
    const generation = await this.repository.createGenerationAsync({
      id, creatorUserId: userId, targetPertenecienteId, name, description, category,
      mode, model, prompt, referenceType: reference?.type,
      referencePictogramId: reference?.pictogramId, referenceUrl: reference?.url,
      referencePath: reference?.path, referenceHadPeople: body.referenceHadPeople === 'true',
    });

    try {
      const { imageBuffer, providerRequestId, seed } = await this.createImageBufferAsync({
        model,
        prompt,
        referenceUrls: reference?.url ? [reference.url] : [],
        name,
        description,
      });

      let stored;
      try {
        stored = await this.storage.uploadAsync({
          buffer: imageBuffer, contentType: 'image/png', fileName: `${id}.png`, userId,
          path: `pictograms-ai/previews/${id}.png`, upsert: true,
        });
      } catch (error) {
        const providerError = getProviderError(error);
        throw new AppError(`No se pudo guardar la vista previa (${providerError.status || 'sin estado'}).`, 502);
      }
      return await this.repository.completeGenerationAsync(id, {
        previewUrl: stored.url, previewPath: stored.path, providerRequestId, seed,
      });
    } catch (error) {
      await this.repository.failGenerationAsync(id, error.message);
      throw error;
    }
  };

  reviseGenerationAsync = async ({ id, userId, body, file }) => {
    await this.ensureSchemaAsync();
    const generation = await this.getGenerationForOwnerAsync(id, userId);
    if (generation.status === 'saved') throw new AppError('Una creacion guardada no puede editarse desde la vista previa.', 409);
    if (!generation.previewUrl) throw new AppError('La vista previa original no esta disponible.', 409);

    const name = cleanText(body.name || generation.name, 160);
    const description = cleanText(body.description || generation.description, 1200);
    const category = cleanText(body.category || generation.category, 100).toLowerCase() || 'otros';
    const revisionInstructions = cleanText(body.revisionInstructions || description, 1200);
    if (name.length < 2 || description.length < 5) throw new AppError('Completa nombre y descripcion.', 400);
    if (BLOCKED_TEXT.test(`${name} ${description} ${revisionInstructions}`)) throw new AppError('La solicitud no supera el control de contenido.', 422);
    if (!ALLOWED_CATEGORIES.has(category)) throw new AppError('La categoria no es valida.', 400);

    const uploadedReference = await this.prepareReferenceAsync({
      file,
      userId,
      generationId: `${id}/revision`,
    });

    const referencePictogramId = cleanText(body.referencePictogramId, 120);
    let catalogReference = null;
    if (referencePictogramId) {
      const pictogram = await this.pictograms.getByExternalIdAsync(referencePictogramId, 'es');
      if (!pictogram?.imageUrl) throw new AppError('El pictograma de referencia no existe.', 404);
      catalogReference = { type: 'catalog', url: pictogram.imageUrl, pictogramId: pictogram.id };
    }

    const previousReferenceUrls = splitStoredList(generation.referenceUrl)
      .filter((url) => !url.includes('/pictograms-ai/previews/'))
      .filter(Boolean);
    const persistentReferenceUrls = Array.from(new Set([
      ...previousReferenceUrls,
      uploadedReference?.url,
      catalogReference?.url,
    ].filter(Boolean)));
    const referenceUrls = Array.from(new Set([generation.previewUrl, ...persistentReferenceUrls].filter(Boolean)));

    const hasFalKey = envConfig.falKey && envConfig.falKey !== 'replace-with-fal-api-key';
    const model = hasFalKey ? FINAL_EDIT_MODEL : 'pollinations-flux';
    const targets = await this.getTargetsAsync(userId);
    const target = targets.find((item) => Number(item.id) === Number(generation.targetPertenecienteId));
    const preferredStyle = target?.usuarioId ? await this.StylePreferenceStore.getPreferredStyleAsync(target.usuarioId) : null;
    const prompt = buildPrompt(name, description, revisionInstructions, preferredStyle);
    const { imageBuffer, providerRequestId, seed } = await this.createImageBufferAsync({
      model,
      prompt,
      referenceUrls,
      name,
      description,
    });

    let stored;
    try {
      stored = await this.storage.uploadAsync({
        buffer: imageBuffer,
        contentType: 'image/png',
        fileName: `${id}.png`,
        userId,
        path: `pictograms-ai/previews/${id}-${Date.now()}.png`,
        upsert: true,
      });
    } catch (error) {
      const providerError = getProviderError(error);
      throw new AppError(`No se pudo guardar la vista previa (${providerError.status || 'sin estado'}).`, 502);
    }

    const persistentReferencePaths = joinStoredList([
      ...splitStoredList(generation.referencePath),
      uploadedReference?.path,
    ]);

    const revised = await this.repository.updateGenerationRevisionAsync(id, {
      name,
      description,
      category,
      mode: 'final',
      model,
      prompt,
      referenceType: [uploadedReference?.type, catalogReference?.type, 'previous-preview'].filter(Boolean).join('+'),
      referencePictogramId: catalogReference?.pictogramId || generation.referencePictogramId,
      referenceUrl: joinStoredList(persistentReferenceUrls),
      referencePath: persistentReferencePaths,
      referenceHadPeople: generation.referenceHadPeople || body.referenceHadPeople === 'true',
      previewUrl: stored.url,
      previewPath: stored.path,
      providerRequestId,
      seed,
    });
    if (generation.previewPath && generation.previewPath !== stored.path) {
      await this.storage.deleteAsync(generation.previewPath).catch(() => undefined);
    }
    return revised;
  };

  getGenerationForOwnerAsync = async (id, userId) => {
    const generation = await this.repository.getGenerationAsync(id);
    if (!generation || Number(generation.creatorUserId) !== Number(userId)) throw new AppError('Generacion no encontrada.', 404);
    return generation;
  };

  saveAsync = async (id, userId, body) => {
    const generation = await this.getGenerationForOwnerAsync(id, userId);
    if (!['ready', 'saved'].includes(generation.status) || !generation.previewUrl) throw new AppError('La vista previa no esta lista.', 409);
    const targetIds = Array.from(new Set((Array.isArray(body?.targetPertenecienteIds)
      ? body.targetPertenecienteIds.map(Number).filter(Boolean)
      : []).filter(Boolean)));
    const effectiveTargetIds = targetIds.length > 0 ? targetIds : [Number(generation.targetPertenecienteId)];
    for (const targetId of effectiveTargetIds) {
      await this.assertTargetAsync(userId, targetId);
    }
    return await this.repository.saveGenerationAsync(generation, effectiveTargetIds);
  };

  discardAsync = async (id, userId) => {
    const generation = await this.getGenerationForOwnerAsync(id, userId);
    if (generation.status === 'saved') throw new AppError('Una creacion guardada no puede descartarse desde la vista previa.', 409);
    const pathsToDelete = Array.from(new Set([
      generation.previewPath,
      ...splitStoredList(generation.referencePath),
    ].filter(Boolean)));
    await Promise.all(pathsToDelete.map((path) => this.storage.deleteAsync(path).catch(() => undefined)));
    await this.repository.discardGenerationAsync(id);
    return { discarded: true };
  };

  listMineAsync = async (userId) => { await this.ensureSchemaAsync(); return this.repository.listPrivateAsync(userId); };
  listAvailableAsync = async (userId) => {
    await this.ensureSchemaAsync();
    const context = await AuthorizationService.getPermissionContext(userId);
    if (!context.perteneciente?.id) throw new AppError('Solo disponible para pertenecientes.', 403);
    return this.repository.listForTargetAsync(context.perteneciente.id);
  };
  submitAsync = async (id, userId) => {
    const result = await this.repository.submitAsync(id, userId);
    if (!result) throw new AppError('Pictograma no encontrado o no editable.', 404);
    return result;
  };
  updateCreationAsync = async (id, userId, body) => {
    const name = cleanText(body.name, 160);
    const description = cleanText(body.description, 1200);
    const category = cleanText(body.category, 100).toLowerCase();
    if (name.length < 2 || !ALLOWED_CATEGORIES.has(category)) throw new AppError('Nombre o categoria invalidos.', 400);
    const result = await this.repository.updateCreationAsync(id, userId, { name, category });
    if (!result) throw new AppError('Pictograma no encontrado o no editable.', 404);
    await this.repository.updateGenerationDescriptionAsync(id, userId, description);
    return { ...result, description };
  };

  assertAdminAsync = async (userId) => {
    const context = await AuthorizationService.getUserContext(userId);
    if (Number(context?.usuario?.id_tipo_usuario) !== 4) throw new AppError('Solo administradores.', 403);
  };
  listModerationAsync = async (userId) => { await this.assertAdminAsync(userId); return this.repository.listModerationAsync(); };
  reviewAsync = async (id, userId, body) => {
    await this.assertAdminAsync(userId);
    const approved = body.decision === 'approve';
    const reason = cleanText(body.reason, 600);
    if (!approved && reason.length < 3) throw new AppError('Indica el motivo del rechazo.', 400);
    const result = await this.repository.reviewAsync(id, userId, approved, reason);
    if (!result) throw new AppError('Pictograma pendiente no encontrado.', 404);
    return result;
  };
}
