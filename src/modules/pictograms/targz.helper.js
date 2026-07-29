import zlib from 'zlib';

// Lector minimo de .tar.gz, sin dependencias externas.
//
// Por que existe: los catalogos de Mulberry (3.436 SVG) y OpenMoji (4.495 SVG)
// se bajan de GitHub. Traerlos archivo por archivo serian ~8.000 requests por
// sync; el tarball del repo es UN solo request. El proyecto no tiene ninguna
// libreria de zip/tar instalada, y TAR es un formato lo bastante simple
// (headers de 512 bytes con campos en texto plano, sin compresion por entrada)
// como para leerlo aca en vez de sumar una dependencia nueva.
//
// Solo se implementa lo necesario para leer tarballs de GitHub:
// archivos normales y nombres largos estilo GNU. No soporta sparse files,
// hard links ni otras rarezas que GitHub no genera.

const BLOCK_SIZE = 512;

function readString(buffer, offset, length) {
  const raw = buffer.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8').trim();
}

function readOctal(buffer, offset, length) {
  const text = readString(buffer, offset, length).replace(/[^0-7]/g, '');
  return text ? Number.parseInt(text, 8) : 0;
}

/**
 * Descomprime un .tar.gz y devuelve sus archivos.
 *
 * @param {Buffer} gzBuffer contenido crudo del .tar.gz
 * @param {(path: string) => boolean} [filter] se llama con la ruta de cada
 *   entrada; si devuelve false, el contenido no se guarda en memoria (util
 *   para no cargar 8.000 archivos cuando solo interesan algunos).
 * @returns {Map<string, Buffer>} ruta -> contenido
 */
export function extractTarGz(gzBuffer, filter) {
  const tar = zlib.gunzipSync(gzBuffer);
  const files = new Map();

  let offset = 0;
  // Nombre pendiente cuando la entrada anterior fue un header GNU de nombre
  // largo (typeflag 'L'): el nombre real viene en el bloque de datos.
  let pendingLongName = null;

  while (offset + BLOCK_SIZE <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK_SIZE);

    // Dos bloques en cero seguidos = fin del archivo.
    if (header.every((byte) => byte === 0)) break;

    const name = pendingLongName ?? readString(header, 0, 100);
    const size = readOctal(header, 124, 12);
    const typeFlag = readString(header, 156, 1) || '0';
    pendingLongName = null;

    offset += BLOCK_SIZE;
    const dataEnd = offset + size;

    if (typeFlag === 'L') {
      // GNU long name: el contenido de este bloque ES el nombre de la
      // siguiente entrada.
      pendingLongName = tar.subarray(offset, dataEnd).toString('utf8').replace(/\0+$/, '').trim();
    } else if (typeFlag === '0' || typeFlag === '') {
      // Archivo normal.
      if (!filter || filter(name)) {
        files.set(name, Buffer.from(tar.subarray(offset, dataEnd)));
      }
    }
    // typeFlag '5' (directorio) y el resto se ignoran.

    // Los datos se redondean al bloque de 512 siguiente.
    offset = dataEnd + ((BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE);
  }

  return files;
}

/**
 * GitHub prefija todo el contenido del tarball con `<repo>-<ref>/`.
 * Esta funcion saca ese primer segmento para poder trabajar con rutas
 * estables (`EN/apple.svg` en vez de `mulberry-symbols-master/EN/apple.svg`).
 */
export function stripRootDir(filePath) {
  const index = filePath.indexOf('/');
  return index === -1 ? filePath : filePath.slice(index + 1);
}
