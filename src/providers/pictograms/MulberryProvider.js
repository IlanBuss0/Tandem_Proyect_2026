import axios from 'axios';
import { extractTarGz, stripRootDir } from '../../modules/pictograms/targz.helper.js';
import { resolveCompositeCategory } from './categoryMapper.js';

// Mulberry Symbols — nucleo de CAA del catalogo de Tandem.
//
// Se baja DIRECTO del repo oficial, sin pasar por la API de Global Symbols.
// Motivo: buscando por terminos en Global Symbols, Mulberry aparecia con 1-2
// resultados por concepto (sus etiquetas ahi estan casi todas en ingles),
// mientras que el repo tiene las 3.436 ilustraciones completas + un CSV con
// categorias y tags. Un tarball = 1 request (~13MB) en vez de 3.436.
//
// Por que Mulberry como principal: esta disenado especificamente para
// *adultos* con dificultades del lenguaje, no para chicos. Es el que mejor
// encaja con la mision de Tandem de des-infantilizar.
//
// Licencia: CC BY-SA 4.0 — confirmada en el LICENSE.txt del propio repo
// ("This work is licensed under the Creative Commons Attribution-Share Alike
// License" + link a by-sa/4.0). Ojo: mulberrysymbols.org cita 2.0 UK en su
// pie de pagina; se toma el LICENSE.txt del repo como fuente canonica porque
// es el que acompana a los archivos que efectivamente se distribuyen.
const TARBALL_URL = 'https://codeload.github.com/mulberrysymbols/mulberry-symbols/tar.gz/refs/heads/master';
const SVG_DIR = 'EN/';
const METADATA_PATH = 'scripts/data/symbol-info-en.csv';
const LICENSE_PATH = 'LICENSE.txt';
const DOWNLOAD_TIMEOUT_MS = 180000;

export const MULBERRY_LICENSE = Object.freeze({
  licenseCode: 'CC-BY-SA-4.0',
  licenseVersion: '4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  author: 'Garry Paxton (2008-2017), Steve Lee (2018-2020)',
  sourceUrl: 'https://mulberrysymbols.org/',
  attributionText: 'Mulberry Symbols, copyright Garry Paxton y Steve Lee. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
});

/**
 * Parser CSV minimo con soporte de campos entrecomillados. El CSV de Mulberry
 * usa comas como separador y sus tags van separados por espacios, pero se
 * maneja el caso con comillas por si upstream agrega comas dentro de un campo.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') { inQuotes = true; }
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') { field += char; }
  }

  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Convierte `a_-_lower_case` / `Advent_calendar` en `a - lower case` / `Advent calendar`. */
function humanizeSymbolName(fileBaseName) {
  return String(fileBaseName || '')
    .replace(/_-_/g, ' - ')
    .replace(/_/g, ' ')
    .trim();
}

export default class MulberryProvider {
  key = 'MULBERRY';
  commercialUseAllowed = true;

  /**
   * Baja el catalogo completo y lo devuelve normalizado.
   *
   * Cada item incluye `svgBuffer` con el contenido del SVG ya en memoria, para
   * que el importador lo suba a storage sin hacer un segundo request por
   * archivo.
   */
  async syncCatalog({ language = 'es' } = {}) {
    const response = await axios.get(TARBALL_URL, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      headers: { 'User-Agent': 'tandem-pictogram-sync' },
    });

    const files = extractTarGz(Buffer.from(response.data), (path) => {
      const rel = stripRootDir(path);
      return (rel.startsWith(SVG_DIR) && rel.endsWith('.svg')) || rel === METADATA_PATH || rel === LICENSE_PATH;
    });

    // Reindexar por ruta relativa (el tarball de GitHub prefija todo con
    // `mulberry-symbols-master/`).
    const byRelPath = new Map();
    for (const [path, buffer] of files) byRelPath.set(stripRootDir(path), buffer);

    const metadata = this._parseMetadata(byRelPath.get(METADATA_PATH));
    const licenseText = byRelPath.get(LICENSE_PATH)?.toString('utf8') ?? null;

    const pictograms = [];
    for (const [relPath, svgBuffer] of byRelPath) {
      if (!relPath.startsWith(SVG_DIR) || !relPath.endsWith('.svg')) continue;

      const fileBaseName = relPath.slice(SVG_DIR.length, -'.svg'.length);
      const meta = metadata.get(fileBaseName) ?? null;

      pictograms.push(this._normalize({ fileBaseName, svgBuffer, meta, language }));
    }

    return { pictograms, licenseText };
  }

  /** symbol-id,symbol,grammar,category-id,category,rated,tags -> Map por nombre de archivo */
  _parseMetadata(csvBuffer) {
    const byName = new Map();
    if (!csvBuffer) return byName;

    const rows = parseCsv(csvBuffer.toString('utf8'));
    if (rows.length === 0) return byName;

    const header = rows[0].map((h) => h.trim());
    const col = (name) => header.indexOf(name);
    const iSymbol = col('symbol');
    const iGrammar = col('grammar');
    const iCategory = col('category');
    const iTags = col('tags');

    for (const row of rows.slice(1)) {
      const symbol = row[iSymbol]?.trim();
      if (!symbol) continue;
      byName.set(symbol, {
        grammar: row[iGrammar]?.trim() || null,
        category: row[iCategory]?.trim() || null,
        // Los tags vienen separados por espacios ("alphabet letter").
        tags: (row[iTags] || '').split(/\s+/).map((t) => t.trim()).filter(Boolean),
      });
    }

    return byName;
  }

  _normalize({ fileBaseName, svgBuffer, meta, language }) {
    // La categoria de Mulberry es compuesta ("Food Fruit", "Transport Road")
    // y viene con el tipo gramatical aparte. resolveCompositeCategory prioriza
    // la compuesta y deja `grammar` como red de contencion — ver el comentario
    // de esa funcion: hacerlo al reves manda el 82% del catalogo a 'objetos'.
    const category = resolveCompositeCategory({
      composite: meta?.category,
      partOfSpeech: meta?.grammar,
    });

    return {
      id: `mulberry:${fileBaseName}`,
      arasaacId: null,
      // Nombre en ingles: lo traduce despues el paso de traduccion
      // (scripts/translate-pictogram-labels.mjs). Se guarda el original en
      // metadata para poder re-traducir sin volver a bajar el catalogo.
      name: humanizeSymbolName(fileBaseName),
      emoji: '',
      category,
      tags: meta?.tags ?? [],
      language,
      source: this.key,
      author: MULBERRY_LICENSE.author,
      license: MULBERRY_LICENSE.licenseCode,
      licenseCode: MULBERRY_LICENSE.licenseCode,
      licenseVersion: MULBERRY_LICENSE.licenseVersion,
      licenseUrl: MULBERRY_LICENSE.licenseUrl,
      attributionText: MULBERRY_LICENSE.attributionText,
      sourceUrl: MULBERRY_LICENSE.sourceUrl,
      commercialUseAllowed: this.commercialUseAllowed,
      shareAlikeRequired: true,
      symbolsetSlug: 'mulberry',
      symbolsetName: 'Mulberry Symbols',
      // Contenido listo para subir a storage, sin segundo request.
      svgBuffer,
      metadata: {
        originalName: humanizeSymbolName(fileBaseName),
        originalCategory: meta?.category ?? null,
        grammar: meta?.grammar ?? null,
        fileBaseName,
      },
    };
  }
}
