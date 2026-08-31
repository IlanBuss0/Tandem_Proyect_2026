import multer from 'multer';

const ALLOWED_MIMETYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const MAGIC_BYTES = {
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/jpeg': [0xFF, 0xD8],
  'image/gif': [0x47, 0x49, 0x46],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

function validateMagicBytes(buffer, mimetype) {
  const magic = MAGIC_BYTES[mimetype];
  if (!magic) return true;
  if (buffer.length < magic.length) return false;
  return magic.every((byte, i) => buffer[i] === byte);
}

const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const normalized = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;

  if (!ALLOWED_MIMETYPES.has(normalized)) {
    return cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Permitidos: PNG, JPG, GIF, WebP, PDF, DOC, DOCX, TXT.`), false);
  }

  file.mimetype = normalized;
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

export const uploadDniFrente = multer({
  storage,
  fileFilter(_req, file, cb) {
    const mimetype = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimetype)) {
      return cb(new Error('El frente del DNI debe ser una imagen PNG, JPG o WebP.'), false);
    }
    file.mimetype = mimetype;
    cb(null, true);
  },
  limits: { fileSize: MAX_SIZE_BYTES },
});

export { validateMagicBytes, MAX_SIZE_BYTES as UPLOAD_MAX_SIZE };
