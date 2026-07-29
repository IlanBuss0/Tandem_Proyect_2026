import AppError from '../errors/AppError.js';

// Migracion de pictogramas hacia librerias con licencia comercial (freemium).
// ARASAAC es CC BY-NC-SA: la clausula NonCommercial es incompatible con un
// modelo freemium. Esta whitelist es el UNICO lugar donde se decide que
// licencia puede terminar marcada como uso_comercial_permitido = true.
//
// Ningun importador ni proveedor debe insertar un pictograma como "uso
// comercial permitido" sin pasar por assertLicenseAllowed() primero.

// Codigos de licencia que SI habilitan uso comercial (siempre respetando
// atribucion y, si aplica, ShareAlike). Todo lo que no este en esta lista
// -incluido "licencia desconocida"- se trata como bloqueado.
export const ALLOWED_LICENSES = new Set([
  'PUBLIC_DOMAIN',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC-BY-SA-2.0-UK',
  'CC-BY-SA-4.0',
  'MIT',
  'TANDEM_PROPIETARIO', // pictogramas propios generados con IA (AiPictogramService)
]);

// Licencias explicitamente prohibidas. No hace falta estar en esta lista
// para quedar bloqueado (ALLOWED_LICENSES ya es opt-in), pero sirve para
// que assertLicenseAllowed() de un mensaje de error mas claro.
export const BLOCKED_LICENSES = new Set([
  'CC-BY-NC-4.0',
  'CC-BY-NC-SA-4.0',
  'CC-BY-NC-ND-4.0',
]);

// IDs de symbolset de Global Symbols (globalsymbols.com/api/v1/symbolsets)
// verificados manualmente el 2026-07-28. Cada entrada se corresponde 1 a 1
// con una coleccion real, revisada individualmente -nunca se asume la
// licencia de una coleccion a partir del nombre de otra parecida-.
//
// OJO — esto es lo mas importante de este archivo:
//   - symbolset 17  = ARASAAC          -> CC BY-NC-SA 4.0 (bloqueado, no listado)
//   - symbolset 110 = picom-symbols    -> CC BY-NC 4.0    (bloqueado, no listado)
// Las otras 8 colecciones "PiCom" SI son CC BY-SA 4.0 y estan listadas.
// Mezclar todo lo que empieza con "PiCom" habria colado una licencia NC.
//
// El parametro `symbolset` del endpoint de busqueda de Global Symbols se
// ignora en silencio (probado: sigue devolviendo resultados de ARASAAC
// aunque se pase symbolset=13). Por eso este filtro se aplica SIEMPRE del
// lado nuestro, sobre `picto.symbolset_id` de cada resultado crudo.
export const GLOBAL_SYMBOLS_ALLOWED_SETS = new Map([
  [13, {
    slug: 'mulberry',
    name: 'Mulberry Symbols',
    publisher: 'Steve Lee',
    publisherUrl: 'https://mulberrysymbols.org/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    // La propia mulberrysymbols.org es ambigua: el encabezado dice BY-SA 4.0
    // pero el bloque de atribucion de esa misma pagina dice BY-SA 2.0 UK.
    // Se cita la version que reporta Global Symbols (4.0) pero se deja
    // constancia del conflicto para la pantalla de atribuciones.
    attributionText: 'Mulberry Symbols, copyright Steve Lee. Usados bajo Creative Commons Attribution-ShareAlike 4.0 (la pagina oficial tambien cita CC BY-SA 2.0 UK en su pie de atribucion).',
  }],
  [82, {
    slug: 'ocha-humanitarian-icons',
    name: 'OCHA Humanitarian Icons',
    publisher: 'OCHA Visual',
    publisherUrl: 'https://www.unocha.org/',
    licenseCode: 'PUBLIC_DOMAIN',
    licenseVersion: null,
    licenseUrl: null,
    attributionText: 'Iconos humanitarios de OCHA (dominio publico). No implica auspicio de OCHA ni de Naciones Unidas.',
  }],
  [83, {
    slug: 'openmoji',
    name: 'OpenMoji',
    publisher: 'OpenMoji Project',
    publisherUrl: 'https://openmoji.org',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Emojis e iconos disenados por el proyecto OpenMoji. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [88, {
    slug: 'otsimo',
    name: 'Otsimo Turkish',
    publisher: 'Otsimo (Ersin Kiymaz, Naz Yilmaz, Ersin Sinay)',
    publisherUrl: 'https://otsimo.com/en/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Simbolos Otsimo. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [129, {
    slug: 'ai-realistic-symbols-a-picom-collection',
    name: 'PiCom AI Realistic Symbols',
    publisher: 'Sensory App House con Global Symbols',
    publisherUrl: 'https://www.sensoryapphouse.com/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Algunos pictogramas pertenecen a Sensory App House y Global Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [202, {
    slug: 'picom-ai-sommi-action-symbols',
    name: 'PiCom AI Sommi Action Symbols',
    publisher: 'Sensory App House con Global Symbols',
    publisherUrl: 'https://www.sensoryapphouse.com/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Algunos pictogramas pertenecen a Sensory App House y Global Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [197, {
    slug: 'picom-high-contrast-symbols',
    name: 'PiCom High Contrast Symbols',
    publisher: 'Sensory App House con Global Symbols',
    publisherUrl: 'https://www.sensoryapphouse.com/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Algunos pictogramas pertenecen a Sensory App House y Global Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [15, {
    slug: 'tawasol',
    name: 'Tawasol',
    publisher: 'Mada',
    publisherUrl: 'http://tawasolsymbols.org',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Simbolos Tawasol, Mada. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [75, {
    slug: 'urdu-core-vocabulary-symbols',
    name: 'Adam Urdu Symbols',
    publisher: 'Misbah S Ansari, Dr Ayesha Kamal Butt & E.A Draffan',
    publisherUrl: null,
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Adam Urdu Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [205, {
    slug: 'additional-mulberry-symbols',
    name: 'Mulberry Additional Symbols',
    publisher: 'Verlag Karin Kestner GmbH',
    publisherUrl: 'https://www.kestner.de/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Mulberry Additional Symbols, Verlag Karin Kestner GmbH. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [86, {
    slug: 'corona-symbols',
    name: 'Mulberry Plus Collection',
    publisher: 'Mulberry y Global Symbols',
    publisherUrl: 'https://globalsymbols.com/symbolsets?locale=es',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Mulberry Plus Collection, Mulberry y Global Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [193, {
    slug: 'ai-cartoon-symbols-picom-core-fringe-set',
    name: 'PiCom AI Cartoon Symbols',
    publisher: 'Sensory App House con Global Symbols',
    publisherUrl: 'https://www.sensoryapphouse.com/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Algunos pictogramas pertenecen a Sensory App House y Global Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [201, {
    slug: 'picom-ai-cute-symbols',
    name: 'PiCom AI Cute Symbols',
    publisher: 'Sensory App House con Global Symbols',
    publisherUrl: 'https://www.sensoryapphouse.com/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Algunos pictogramas pertenecen a Sensory App House y Global Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [199, {
    slug: 'picom-auxiliary-verb-collection',
    name: 'PiCom Auxiliary Verb & Inflection Collection',
    publisher: 'Sensory App House con Global Symbols',
    publisherUrl: 'https://www.sensoryapphouse.com/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Algunos pictogramas pertenecen a Sensory App House y Global Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [221, {
    slug: 'picom-curriculum-symbols',
    name: 'PiCom Curriculum Symbols',
    publisher: 'Sensory App House Ltd',
    publisherUrl: 'https://www.sensoryapphouse.com/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'PiCom Curriculum Symbols, Sensory App House Ltd. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [183, {
    slug: 'legal-collection-ai-realistic-symbols',
    name: 'PiCom Legal AI Realistic Collection',
    publisher: 'Sensory App House con Global Symbols',
    publisherUrl: 'https://www.sensoryapphouse.com/',
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Algunos pictogramas pertenecen a Sensory App House y Global Symbols. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
  [133, {
    slug: 'stellar-symbols',
    name: 'Stellar Symbols',
    publisher: 'Colin McNamee',
    publisherUrl: null,
    licenseCode: 'CC-BY-SA-4.0',
    licenseVersion: '4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attributionText: 'Stellar Symbols, Colin McNamee. Usados bajo Creative Commons Attribution-ShareAlike 4.0.',
  }],
]);

// IDs de symbolset explicitamente excluidos, documentados para que nadie los
// agregue "por accidente" en una futura edicion de este archivo.
//
// Hay DOS motivos distintos de exclusion y no conviene confundirlos:
//   a) LEGAL   -> la licencia no permite uso comercial.
//   b) VISUAL  -> la licencia esta bien, pero las imagenes no se entienden
//                 para la poblacion de Tandem. Excluir por esto es una
//                 decision de producto, no legal.
export const GLOBAL_SYMBOLS_BLOCKED_SETS = new Map([
  // (a) Legal: NonCommercial, incompatible con freemium.
  [17, { slug: 'arasaac', name: 'ARASAAC', licenseCode: 'CC-BY-NC-SA-4.0', reason: 'legal' }],
  [110, { slug: 'picom-symbols', name: 'PiCom Symbols', licenseCode: 'CC-BY-NC-4.0', reason: 'legal' }],

  // (b) Visual: Blissymbolics es CC BY-SA 4.0 (legalmente usable) pero NO son
  // dibujos: es un sistema de escritura simbolica abstracta (un circulo, una
  // linea) que hay que aprender para poder leerlo. En la primera importacion
  // copo 315 de 324 pictogramas y el catalogo quedo ilegible, porque es la
  // coleccion con mas etiquetas en espanol de toda la API y el importador
  // buscaba en espanol. Queda afuera a proposito.
  [16, { slug: 'blissymbolics', name: 'Blissymbolics', licenseCode: 'CC-BY-SA-4.0', reason: 'visual' }],

  // (b) Visual: glifos Unicode minimos (~500 bytes), no ilustraciones. Sirven
  // como tipografia, no como pictograma de CAA.
  [228, { slug: 'picom-unicode-symbols', name: 'PiCom Unicode Symbols', licenseCode: 'PUBLIC_DOMAIN', reason: 'visual' }],
]);

/**
 * Unico punto de entrada para decidir si un pictograma puede insertarse con
 * uso_comercial_permitido = true. Se llama SIEMPRE antes de cualquier
 * insert/upsert que venga de un proveedor externo.
 *
 * @param {{ licenseCode?: string }} asset
 * @throws {AppError} si la licencia no esta en la whitelist
 */
export function assertLicenseAllowed(asset) {
  const licenseCode = asset?.licenseCode;

  if (!licenseCode) {
    throw new AppError('Pictograma sin licencia declarada: no se puede importar.', 400, 'PICTOGRAM_LICENSE_MISSING');
  }

  if (BLOCKED_LICENSES.has(licenseCode)) {
    throw new AppError(`Licencia no comercial bloqueada: ${licenseCode}`, 400, 'PICTOGRAM_LICENSE_BLOCKED');
  }

  if (!ALLOWED_LICENSES.has(licenseCode)) {
    throw new AppError(`Licencia no autorizada (no esta en la whitelist): ${licenseCode}`, 400, 'PICTOGRAM_LICENSE_NOT_WHITELISTED');
  }

  return true;
}

/**
 * Filtra un array de resultados crudos de Global Symbols dejando solo los
 * que pertenecen a un symbolset aprobado. Esto es necesario porque el
 * parametro `symbolset` del endpoint de busqueda de la API se ignora en
 * silencio (verificado: sigue devolviendo ARASAAC igual).
 *
 * @param {Array<{picto?: {symbolset_id?: number}}>} rawResults
 */
export function filterAllowedGlobalSymbolsResults(rawResults) {
  return (Array.isArray(rawResults) ? rawResults : []).filter((item) => {
    const symbolsetId = item?.picto?.symbolset_id;
    return GLOBAL_SYMBOLS_ALLOWED_SETS.has(symbolsetId);
  });
}
