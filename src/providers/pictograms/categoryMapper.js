// Mapeo de categorias externas (ARASAAC, Global Symbols u otro proveedor) a
// las categorias locales de Tandem. Generalizado a partir del mapa que antes
// vivia solo en PictogramaService.js (categoryByArasaacCategory), para que
// cualquier proveedor nuevo lo reuse en vez de reinventar su propio mapeo.
export const categoryByExternalCategory = {
  adjective: 'conceptos',
  adjetive: 'conceptos',
  adverb: 'conceptos',
  alphabet: 'comunicacion',
  animal: 'naturaleza',
  animals: 'naturaleza',
  art: 'ocio',
  bathroom: 'higiene',
  behavior: 'conductas',
  body: 'salud y cuerpo',
  bodypart: 'salud y cuerpo',
  bodyparts: 'salud y cuerpo',
  building: 'lugares',
  calendar: 'tiempo',
  city: 'lugares',
  clothes: 'vida diaria',
  clothing: 'vida diaria',
  color: 'conceptos',
  colours: 'conceptos',
  computer: 'tecnologia',
  computers: 'tecnologia',
  concept: 'conceptos',
  concepts: 'conceptos',
  daily: 'vida diaria',
  daily_living: 'vida diaria',
  day: 'tiempo',
  description: 'conceptos',
  device: 'tecnologia',
  devices: 'tecnologia',
  drink: 'comida',
  drinks: 'comida',
  emotion: 'emociones',
  emotions: 'emociones',
  event: 'acciones y rutinas',
  events: 'acciones y rutinas',
  family: 'personas',
  feeling: 'emociones',
  feelings: 'emociones',
  food: 'comida',
  foods: 'comida',
  furniture: 'casa',
  game: 'ocio',
  games: 'ocio',
  geography: 'lugares',
  group: 'personas',
  groups: 'personas',
  health: 'salud y cuerpo',
  hygiene: 'higiene',
  job: 'personas',
  jobs: 'personas',
  kitchen: 'comida',
  leisure: 'ocio',
  location: 'lugares',
  locations: 'lugares',
  meal: 'comida',
  meals: 'comida',
  medical: 'salud y cuerpo',
  medicine: 'salud y cuerpo',
  money: 'compras y dinero',
  music: 'ocio',
  nature: 'naturaleza',
  noun: 'objetos',
  nouns: 'objetos',
  number: 'conceptos',
  numbers: 'conceptos',
  object: 'objetos',
  objects: 'objetos',
  occupation: 'personas',
  occupations: 'personas',
  people: 'personas',
  person: 'personas',
  personal: 'vida diaria',
  place: 'lugares',
  places: 'lugares',
  plant: 'naturaleza',
  plants: 'naturaleza',
  pronoun: 'comunicacion',
  pronouns: 'comunicacion',
  quantity: 'conceptos',
  school: 'escuela y aprendizaje',
  education: 'escuela y aprendizaje',
  science: 'escuela y aprendizaje',
  shape: 'conceptos',
  shapes: 'conceptos',
  sign: 'comunicacion',
  signs: 'comunicacion',
  social: 'personas',
  sport: 'ocio',
  sports: 'ocio',
  technology: 'tecnologia',
  time: 'tiempo',
  toy: 'ocio',
  toys: 'ocio',
  transport: 'transporte',
  transportation: 'transporte',
  vehicle: 'transporte',
  vehicles: 'transporte',
  verb: 'acciones y rutinas',
  verbs: 'acciones y rutinas',
  weather: 'naturaleza',
  house: 'casa',
  home: 'casa',
  communication: 'comunicacion',
  action: 'actividades',
  actions: 'actividades',
};

export const categoryRules = [
  // Emociones va PRIMERO a proposito: las categorias de Mulberry son
  // compuestas ("People Feelings", "People Emotions") y si 'people' matchea
  // antes, un pictograma de emociones termina clasificado en 'personas'.
  { includes: ['feeling', 'emotion', 'mood'], category: 'emociones' },
  // Higiene antes que salud: "Healthcare Grooming items" (cepillo de dientes,
  // peine, jabon) es higiene cotidiana, no un tema medico.
  { includes: ['grooming', 'hygiene', 'bathroom', 'toilet'], category: 'higiene' },
  { includes: ['education', 'educational', 'school', 'academic'], category: 'escuela y aprendizaje' },
  { includes: ['health', 'sanitary', 'medical', 'medicine', 'covid', 'physiotherapy', 'locomotor'], category: 'salud y cuerpo' },
  { includes: ['residential', 'domestic', 'house', 'home'], category: 'casa' },
  { includes: ['commercial', 'shopping', 'shop', 'store', 'money'], category: 'compras y dinero' },
  { includes: ['building', 'place', 'location', 'centre', 'center'], category: 'lugares' },
  { includes: ['transport', 'movement', 'vehicle'], category: 'transporte' },
  { includes: ['hardware', 'computer', 'electrical appliance', 'technology', 'device'], category: 'tecnologia' },
  { includes: ['toy', 'game', 'sport', 'basketball', 'athlete', 'beach', 'leisure', 'art', 'music', 'drawing'], category: 'ocio' },
  { includes: ['animal', 'plant', 'nature', 'weather'], category: 'naturaleza' },
  { includes: ['person', 'people', 'family', 'personnel', 'professional'], category: 'personas' },
  { includes: ['food', 'meal', 'drink', 'kitchen'], category: 'comida' },
  { includes: ['communication', 'expression', 'signaling', 'document', 'vocabulary'], category: 'comunicacion' },
  { includes: ['verb', 'event', 'routine', 'action'], category: 'acciones y rutinas' },
  { includes: ['object', 'material', 'equipment', 'appliance'], category: 'objetos' },
  { includes: ['color', 'number', 'shape', 'quantity', 'concept'], category: 'conceptos' },
  // Categorias compuestas de Mulberry que no caen en ninguna regla de arriba.
  { includes: ['grooming', 'hygiene', 'bathroom', 'toilet'], category: 'higiene' },
  { includes: ['clothing', 'clothes', 'footwear'], category: 'vida diaria' },
  { includes: ['alphabet', 'letter', 'punctuation', 'pronoun', 'preposition'], category: 'comunicacion' },
  { includes: ['religion', 'festival', 'celebration'], category: 'ocio' },
  { includes: ['descriptive', 'position', 'direction', 'state'], category: 'conceptos' },
  { includes: ['electrical', 'tv', 'phone'], category: 'tecnologia' },
  { includes: ['country', 'flag', 'map', 'city', 'town'], category: 'lugares' },
];

function matchByRules(text) {
  const normalized = String(text || '').toLowerCase().replace(/[_-]/g, ' ');
  if (!normalized) return null;
  return categoryRules.find((rule) => rule.includes.some((token) => normalized.includes(token)))?.category ?? null;
}

/**
 * Resuelve la categoria de Tandem cuando el proveedor da una categoria
 * COMPUESTA mas un tipo gramatical por separado (el caso de Mulberry:
 * category="Food Fruit", grammar="Noun").
 *
 * El orden importa y es la razon de que esta funcion exista: si se resolviera
 * todo junto, `grammar` gana siempre porque "noun" esta en el mapa exacto y
 * "Food Fruit" no —  el 82% del catalogo de Mulberry terminaba en 'objetos'.
 * La categoria compuesta es mucho mas informativa, asi que va primero y el
 * tipo gramatical queda solo como red de contencion.
 *
 * @param {{ composite?: string, partOfSpeech?: string }} input
 */
export function resolveCompositeCategory({ composite, partOfSpeech } = {}) {
  const compositeKey = String(composite || '').toLowerCase().trim();
  if (compositeKey && categoryByExternalCategory[compositeKey]) return categoryByExternalCategory[compositeKey];

  const byCompositeRule = matchByRules(composite);
  if (byCompositeRule) return byCompositeRule;

  const posKey = String(partOfSpeech || '').toLowerCase().trim();
  if (posKey && categoryByExternalCategory[posKey]) return categoryByExternalCategory[posKey];

  return matchByRules(partOfSpeech) ?? 'otros';
}

// part_of_speech que devuelve Global Symbols para cada label (noun, verb,
// adjective, etc.) reusa el mismo mapa: son las mismas claves en ingles.
export function normalizeExternalCategory(rawCategories = []) {
  const categories = (Array.isArray(rawCategories) ? rawCategories : [rawCategories]).filter(Boolean);
  const translated = categories
    .map((category) => categoryByExternalCategory[String(category).toLowerCase()])
    .find(Boolean);

  if (translated) return translated;

  const normalizedCategories = categories.map((category) => String(category).toLowerCase().replace(/[_-]/g, ' '));
  const matchedRule = categoryRules.find((rule) =>
    normalizedCategories.some((category) => rule.includes.some((text) => category.includes(text))),
  );

  return matchedRule?.category || 'otros';
}
