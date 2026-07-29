import axios from 'axios';
import { extractZip } from '../../modules/pictograms/zip.helper.js';
import { resolveCompositeCategory } from './categoryMapper.js';

// OpenMoji — complemento del catalogo (emociones, comida, objetos modernos,
// animales, profesiones, tecnologia).
//
// No reemplaza a Mulberry: un emoji puede ser ambiguo como pictograma de CAA
// (una carita puede leerse de varias formas), asi que se usa como ampliacion
// de vocabulario, no como nucleo.
//
// Se baja el release oficial `openmoji-svg-color.zip` (~5MB) en vez del
// tarball del repo, que pesa 153MB porque trae los fuentes, la version en
// negro y la fuente tipografica.
//
// Licencia: CC BY-SA 4.0 para los graficos. (Parte del codigo/herramientas del
// proyecto es LGPL, pero Tandem solo usa los graficos.)
const RELEASES_URL = 'https://api.github.com/repos/hfg-gmuend/openmoji/releases/latest';
const COLOR_ZIP_ASSET = 'openmoji-svg-color.zip';
const METADATA_URL = 'https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/data/openmoji.json';
const DOWNLOAD_TIMEOUT_MS = 180000;

export const OPENMOJI_LICENSE = Object.freeze({
  licenseCode: 'CC-BY-SA-4.0',
  licenseVersion: '4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  author: 'OpenMoji Project (HfG Schwabisch Gmund)',
  sourceUrl: 'https://openmoji.org',
  attributionText: 'Emojis e iconos disenados por el proyecto OpenMoji. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
});

// Grupos de OpenMoji -> categorias de Tandem. Se mapean a mano porque son
// pocos y estables, y el nombre del grupo ('smileys-emotion') es mas preciso
// que cualquier heuristica sobre el texto.
const GROUP_TO_CATEGORY = {
  'smileys-emotion': 'emociones',
  'people-body': 'personas',
  'animals-nature': 'naturaleza',
  'food-drink': 'comida',
  'travel-places': 'lugares',
  activities: 'ocio',
  objects: 'objetos',
  symbols: 'comunicacion',
  flags: 'lugares',
  'extras-openmoji': 'otros',
  'extras-unicode': 'otros',
  component: 'otros',
};

export default class OpenMojiProvider {
  key = 'OPENMOJI';
  commercialUseAllowed = true;

  async _resolveZipUrl() {
    const response = await axios.get(RELEASES_URL, {
      timeout: 30000,
      headers: { 'User-Agent': 'tandem-pictogram-sync', Accept: 'application/vnd.github+json' },
    });
    const asset = (response.data?.assets || []).find((item) => item.name === COLOR_ZIP_ASSET);
    if (!asset?.browser_download_url) {
      throw new Error(`El release de OpenMoji no incluye ${COLOR_ZIP_ASSET}.`);
    }
    return { url: asset.browser_download_url, version: response.data?.tag_name ?? null };
  }

  /**
   * Baja el catalogo completo y lo devuelve normalizado. Cada item trae
   * `svgBuffer` para que el importador lo suba sin un segundo request.
   */
  async syncCatalog({ language = 'es' } = {}) {
    const { url, version } = await this._resolveZipUrl();

    const [zipResponse, metadataResponse] = await Promise.all([
      axios.get(url, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: { 'User-Agent': 'tandem-pictogram-sync' },
      }),
      axios.get(METADATA_URL, { timeout: DOWNLOAD_TIMEOUT_MS, headers: { 'User-Agent': 'tandem-pictogram-sync' } }),
    ]);

    const files = extractZip(Buffer.from(zipResponse.data), (path) => path.endsWith('.svg'));

    // El nombre de archivo es el hexcode ('1F355.svg'), que es la clave de
    // openmoji.json.
    const byHexcode = new Map();
    for (const [path, buffer] of files) {
      const hexcode = path.split('/').pop().replace(/\.svg$/i, '');
      byHexcode.set(hexcode, buffer);
    }

    const metadata = Array.isArray(metadataResponse.data) ? metadataResponse.data : [];
    const pictograms = [];

    for (const entry of metadata) {
      const svgBuffer = byHexcode.get(entry.hexcode);
      if (!svgBuffer) continue; // en el JSON pero no en el zip de color

      // Las variantes de tono de piel son el mismo dibujo repetido 5 veces;
      // se importa solo la base para no inflar el catalogo con duplicados
      // visuales que no aportan vocabulario nuevo.
      if (entry.skintone) continue;

      pictograms.push(this._normalize({ entry, svgBuffer, language, version }));
    }

    return { pictograms, version };
  }

  _normalize({ entry, svgBuffer, language, version }) {
    const category = GROUP_TO_CATEGORY[entry.group]
      // Si aparece un grupo nuevo en una version futura, se cae a la
      // heuristica compartida en vez de mandar todo a 'otros'.
      ?? resolveCompositeCategory({ composite: `${entry.group} ${entry.subgroups}` });

    const tags = String(entry.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    return {
      id: `openmoji:${entry.hexcode}`,
      arasaacId: null,
      // annotation viene en ingles; lo traduce despues
      // scripts/translate-pictogram-labels.mjs.
      name: entry.annotation || `OpenMoji ${entry.hexcode}`,
      emoji: entry.emoji || '',
      category,
      tags,
      language,
      source: this.key,
      // El autor real del dibujo esta por emoji; se cita el proyecto y se
      // guarda el autor individual en metadata.
      author: OPENMOJI_LICENSE.author,
      license: OPENMOJI_LICENSE.licenseCode,
      licenseCode: OPENMOJI_LICENSE.licenseCode,
      licenseVersion: OPENMOJI_LICENSE.licenseVersion,
      licenseUrl: OPENMOJI_LICENSE.licenseUrl,
      attributionText: OPENMOJI_LICENSE.attributionText,
      sourceUrl: OPENMOJI_LICENSE.sourceUrl,
      commercialUseAllowed: this.commercialUseAllowed,
      shareAlikeRequired: true,
      symbolsetSlug: 'openmoji',
      symbolsetName: 'OpenMoji',
      svgBuffer,
      metadata: {
        originalName: entry.annotation || null,
        hexcode: entry.hexcode,
        group: entry.group ?? null,
        subgroups: entry.subgroups ?? null,
        emojiAuthor: entry.openmoji_author ?? null,
        openmojiVersion: version,
      },
    };
  }
}
