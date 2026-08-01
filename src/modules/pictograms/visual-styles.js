// Estilo visual de cada pictograma: el eje que de verdad le sirve al usuario
// para elegir entre las multiples versiones del mismo concepto.
//
// Por que existe: el catalogo tiene 39 pictogramas distintos que dicen
// "triste", 36 que dicen "agua". No es basura duplicada — son el mismo
// concepto dibujado en estilos distintos, y en CAA eso es una funcion, no un
// defecto: hay personas que leen mejor un dibujo realista, otras un trazo
// simple, y quien tiene baja vision necesita alto contraste. El problema era
// que salian todos mezclados sin poder elegir.
//
// El estilo NO viene de las APIs: se deduce de la coleccion de origen, que es
// la unica pista confiable (cada coleccion tiene un estilo grafico coherente
// de punta a punta). Se guarda en la columna `estilo_visual` al importar, para
// poder filtrar en SQL sin recalcular nada.

export const VISUAL_STYLES = Object.freeze({
  ILUSTRACION: 'ilustracion',
  REALISTA: 'realista',
  DIBUJO: 'dibujo',
  ALTO_CONTRASTE: 'alto-contraste',
  EMOJI: 'emoji',
  ICONO: 'icono',
  PROPIO: 'propio',
});

// Etiquetas para la UI. Se describen por lo que el usuario VE, no por la
// tecnologia con la que se hicieron ("realista" y no "generado con IA"):
// a quien elige un pictograma le importa como se ve, no de donde salio.
export const VISUAL_STYLE_LABELS = Object.freeze({
  [VISUAL_STYLES.ILUSTRACION]: 'Ilustración',
  [VISUAL_STYLES.REALISTA]: 'Realista',
  [VISUAL_STYLES.DIBUJO]: 'Dibujo animado',
  [VISUAL_STYLES.ALTO_CONTRASTE]: 'Alto contraste',
  [VISUAL_STYLES.EMOJI]: 'Emoji',
  [VISUAL_STYLES.ICONO]: 'Ícono simple',
  [VISUAL_STYLES.PROPIO]: 'Propios de Tándem',
});

// Estilo por proveedor, para los que tienen un estilo unico en todo su set.
const STYLE_BY_SOURCE = Object.freeze({
  MULBERRY: VISUAL_STYLES.ILUSTRACION,
  OPENMOJI: VISUAL_STYLES.EMOJI,
  TANDEM_AI: VISUAL_STYLES.PROPIO,
  ARASAAC: VISUAL_STYLES.ILUSTRACION,
  TABLER: VISUAL_STYLES.ICONO,
});

// Global Symbols mezcla 15 colecciones con estilos muy distintos, asi que ahi
// el estilo se decide por coleccion. Solo se mapean las que declaran su estilo
// sin ambiguedad en el nombre ("AI Realistic", "AI Cartoon", "High Contrast").
// El resto cae al default de abajo: mejor decir "ilustracion" que inventar una
// categoria que no se verifico mirando los dibujos.
const STYLE_BY_GLOBAL_SYMBOLS_SLUG = Object.freeze({
  'ai-realistic-symbols-a-picom-collection': VISUAL_STYLES.REALISTA,
  'legal-collection-ai-realistic-symbols': VISUAL_STYLES.REALISTA,
  'ai-cartoon-symbols-picom-core-fringe-set': VISUAL_STYLES.DIBUJO,
  'picom-ai-cute-symbols': VISUAL_STYLES.DIBUJO,
  'picom-high-contrast-symbols': VISUAL_STYLES.ALTO_CONTRASTE,
  'ocha-humanitarian-icons': VISUAL_STYLES.ICONO,
  openmoji: VISUAL_STYLES.EMOJI,
  mulberry: VISUAL_STYLES.ILUSTRACION,
  'additional-mulberry-symbols': VISUAL_STYLES.ILUSTRACION,
});

const DEFAULT_STYLE = VISUAL_STYLES.ILUSTRACION;

/**
 * Devuelve el estilo visual de un pictograma segun su proveedor y coleccion.
 * Nunca devuelve null: lo desconocido cae en 'ilustracion'.
 *
 * @param {{ source?: string, symbolsetSlug?: string }} pictogram
 */
export function resolveVisualStyle({ source, symbolsetSlug } = {}) {
  const slug = String(symbolsetSlug || '').trim().toLowerCase();
  if (slug && STYLE_BY_GLOBAL_SYMBOLS_SLUG[slug]) {
    return STYLE_BY_GLOBAL_SYMBOLS_SLUG[slug];
  }

  const key = String(source || '').trim().toUpperCase();
  return STYLE_BY_SOURCE[key] || DEFAULT_STYLE;
}

/** Nombre lindo de un estilo, para la UI. */
export function getVisualStyleLabel(style) {
  return VISUAL_STYLE_LABELS[style] || style;
}
