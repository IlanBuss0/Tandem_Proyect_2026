import zlib from 'zlib';

// Lector minimo de .zip, sin dependencias externas.
//
// Por que existe: el catalogo de OpenMoji se distribuye como release oficial
// `openmoji-svg-color.zip` (5.1MB). El tarball del repo completo pesa 153MB
// porque incluye los fuentes, la version en negro y la fuente tipografica —
// bajar 153MB cada mes para usar 5MB no tiene sentido. El proyecto no tiene
// ninguna libreria de zip instalada y el formato es acotado, asi que se lee
// aca en vez de sumar una dependencia.
//
// Se implementa solo lo que usan los releases de GitHub: entradas STORED
// (metodo 0) y DEFLATE (metodo 8), leyendo el directorio central. No soporta
// ZIP64, cifrado ni multi-volumen.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const CENTRAL_ENTRY_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** Busca el End Of Central Directory recorriendo desde el final del buffer. */
function findEocdOffset(buffer) {
  // El comentario final puede ocupar hasta 65535 bytes; no hace falta mirar
  // mas atras que eso.
  const minOffset = Math.max(0, buffer.length - EOCD_MIN_SIZE - 0xffff);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('ZIP invalido: no se encontro el End Of Central Directory.');
}

/**
 * Descomprime un .zip y devuelve sus archivos.
 *
 * @param {Buffer} zipBuffer contenido crudo del .zip
 * @param {(path: string) => boolean} [filter] si devuelve false, la entrada no
 *   se descomprime ni se guarda en memoria.
 * @returns {Map<string, Buffer>} ruta -> contenido
 */
export function extractZip(zipBuffer, filter) {
  const eocdOffset = findEocdOffset(zipBuffer);
  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  const files = new Map();
  let cursor = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (zipBuffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new Error(`ZIP invalido: entrada ${index} del directorio central corrupta.`);
    }

    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const nameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraLength = zipBuffer.readUInt16LE(cursor + 30);
    const commentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localOffset = zipBuffer.readUInt32LE(cursor + 42);
    const name = zipBuffer.subarray(cursor + CENTRAL_ENTRY_SIZE, cursor + CENTRAL_ENTRY_SIZE + nameLength).toString('utf8');

    cursor += CENTRAL_ENTRY_SIZE + nameLength + extraLength + commentLength;

    // Directorios: terminan en '/' y no tienen contenido.
    if (name.endsWith('/')) continue;
    if (filter && !filter(name)) continue;

    if (zipBuffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new Error(`ZIP invalido: header local corrupto para ${name}.`);
    }

    // El header local repite los tamanos, pero las longitudes de nombre/extra
    // pueden diferir de las del directorio central, asi que se leen de aca.
    const localNameLength = zipBuffer.readUInt16LE(localOffset + 26);
    const localExtraLength = zipBuffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + LOCAL_HEADER_SIZE + localNameLength + localExtraLength;
    const raw = zipBuffer.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === METHOD_STORED) {
      files.set(name, Buffer.from(raw));
    } else if (compressionMethod === METHOD_DEFLATE) {
      files.set(name, zlib.inflateRawSync(raw));
    } else {
      throw new Error(`ZIP: metodo de compresion no soportado (${compressionMethod}) en ${name}.`);
    }
  }

  return files;
}
