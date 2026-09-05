import axios from 'axios';
import { envConfig } from '../configs/env.config.js';

function isConfigured() {
  return Boolean(envConfig.supabaseUrl && envConfig.supabaseServiceRoleKey && envConfig.supabaseFilesBucket);
}

function buildStorageUrl(path) {
  return `${envConfig.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${envConfig.supabaseFilesBucket}/${path}`;
}

function getPublicUrl(path) {
  return `${envConfig.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${envConfig.supabaseFilesBucket}/${path}`;
}

const REQUEST_TIMEOUT_UPLOAD = 60000;
const REQUEST_TIMEOUT_DELETE = 15000;

// Los archivos de chat/notas usan un path con timestamp propio y nunca se
// pisan, asi que se pueden cachear fuerte y para siempre. Los callers que
// re-suben con upsert:true (catalogo de pictogramas, pictogramas de IA)
// pasan un cacheControl mas corto.
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export default class FileStorageService {
  uploadAsync = async ({
    buffer,
    contentType,
    fileName,
    userId,
    path: requestedPath = null,
    upsert = false,
    cacheControl = DEFAULT_CACHE_CONTROL,
  }) => {
    if (!isConfigured()) {
      throw new Error('FileStorageService no configurado.');
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('buffer debe ser un Buffer no vacio.');
    }
    if (!contentType || typeof contentType !== 'string') {
      throw new Error('contentType es obligatorio.');
    }
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('fileName es obligatorio.');
    }
    if (!userId) {
      throw new Error('userId es obligatorio.');
    }

    let path = requestedPath;
    if (!path) {
      const timestamp = Date.now();
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
      const safeName = ext ? `${baseName}.${ext}` : baseName;
      path = `usuarios/${userId}/${timestamp}-${safeName}`;
    }

    await axios.put(buildStorageUrl(path), buffer, {
      timeout: REQUEST_TIMEOUT_UPLOAD,
      headers: {
        apikey: envConfig.supabaseServiceRoleKey,
        Authorization: `Bearer ${envConfig.supabaseServiceRoleKey}`,
        'Content-Type': contentType,
        'cache-control': cacheControl,
        ...(upsert ? { 'x-upsert': 'true' } : {}),
      },
    });

    return { url: getPublicUrl(path), path, contentType, fileName };
  };

  getPublicUrl = (path) => getPublicUrl(path);

  getDownloadUrl = (path) => buildStorageUrl(path);

  deleteAsync = async (path) => {
    if (!isConfigured()) {
      throw new Error('FileStorageService no configurado.');
    }
    if (!path || typeof path !== 'string') {
      throw new Error('path es obligatorio.');
    }

    await axios.delete(buildStorageUrl(path), {
      timeout: REQUEST_TIMEOUT_DELETE,
      headers: {
        apikey: envConfig.supabaseServiceRoleKey,
        Authorization: `Bearer ${envConfig.supabaseServiceRoleKey}`,
      },
    });
  };
}
