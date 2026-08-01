import axios from 'axios';
import { envConfig } from '../src/configs/env.config.js';
import PictogramaService from '../src/services/PictogramaService.js';
import { normalizeSearchText } from '../src/services/PictogramaService.js';

// Prueba de concepto del motor de pictogramizacion (Sesion 1).
// Corre 20 frases reales de pasos de rutina contra Groq + el catalogo real,
// y reporta que tan bien matchean. Es el GATE antes de tocar la app: si el
// % de alta+media es bajo o hay falsos positivos en "alta", se replantea el
// diseno antes de escribir el servicio.
//
// Uso: node scripts/poc-pictogramize.mjs [--no-groq] [--text="frase suelta"]

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';

const TEXTOS = [
  'Despertarse y apagar la alarma',
  'Hacer la cama',
  'Ir al baño',
  'Lavarse los dientes',
  'Ducharse',
  'Vestirse con el uniforme',
  'Desayunar leche con cereal',
  'Tomar la pastilla de la mañana',
  'Preparar la mochila',
  'Tomar el colectivo a la escuela',
  'Saludar a la profesora',
  'Guardar el celular en la mochila',
  'Almorzar en el comedor',
  'Lavarse las manos antes de comer',
  'Hacer la tarea de matemática',
  'Pausa de respiración cuando me pongo nervioso',
  'Sacar a pasear al perro',
  'Ayudar a poner la mesa',
  'Ponerse el pijama',
  'Escuchar música con auriculares antes de dormir',
];

const SYSTEM_PROMPT = `Convertis pasos de rutinas diarias en conceptos buscables en un catalogo de pictogramas de comunicacion aumentativa (CAA), en espanol rioplatense (Argentina).

Por cada frase de entrada devolves de 1 a 3 conceptos, ORDENADOS del mas representativo al menos representativo.

Reglas:
1. Todo en minusculas, sin comillas, sin punto final.
2. Sacas articulos, preposiciones, posesivos, pronombres sueltos y adverbios de tiempo ("la", "el", "mi", "de", "en", "con", "para", "antes", "despues", "hoy", "cuando").
3. Los verbos van en INFINITIVO. Si el verbo es reflexivo o pronominal, dejalo asi: "me lavo los dientes" -> "lavarse los dientes". "Se viste" -> "vestirse".
4. Las expresiones de varias palabras que nombran UNA sola accion o UN solo objeto NO se parten: "lavarse las manos", "hacer la cama", "poner la mesa", "sacar la basura", "cepillo de dientes". El primer concepto casi siempre es la accion completa.
5. El concepto 1 es la accion u objeto principal del paso. Los conceptos 2 y 3 son alternativas mas cortas o mas generales, para el caso de que el catalogo no tenga el primero: "tomar el colectivo a la escuela" -> ["tomar el colectivo","colectivo","escuela"]. Nunca repitas el mismo concepto dos veces.
6. Usas la palabra mas comun en Argentina: "autobus" -> "colectivo", "telefono movil" -> "celular", "piscina" -> "pileta", "coche" -> "auto", "zumo" -> "jugo", "ordenador" -> "computadora". "lavarse los dientes" y "cepillarse los dientes" son ambos validos: devolve los dos.
7. Si la frase es abstracta y no nombra nada dibujable ("pausa de respiracion cuando me pongo nervioso"), devolve el concepto concreto mas cercano ("respirar") y nada mas. NO inventes objetos que la frase no menciona.
8. Nunca devuelvas un array vacio: si no podes extraer nada, devolve la frase entera en minusculas como unico concepto.
9. No agregues explicaciones, ni markdown, ni claves extra.

Respondes UNICAMENTE con un objeto JSON con una sola clave "conceptos", cuyo valor es un array de arrays de strings, del mismo largo y en el mismo orden que la entrada.

Ejemplo de entrada: ["Lavarse las manos antes de comer","Tomar el colectivo a la escuela","Hacer la cama"]
Ejemplo de salida: {"conceptos":[["lavarse las manos","manos","comer"],["tomar el colectivo","colectivo","escuela"],["hacer la cama","cama"]]}`;

async function callGroq(phrases) {
  const response = await axios.post(GROQ_CHAT_URL, {
    model: PRIMARY_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(phrases) },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }, {
    headers: { Authorization: `Bearer ${envConfig.groqApiKey}`, 'Content-Type': 'application/json' },
    timeout: 60000,
  });

  const text = response?.data?.choices?.[0]?.message?.content?.trim() || '';
  const asJson = JSON.parse(text);
  const conceptos = Array.isArray(asJson) ? asJson : Object.values(asJson).find(Array.isArray);
  if (!Array.isArray(conceptos) || conceptos.length !== phrases.length) {
    throw new Error(`Groq devolvio ${conceptos?.length} arrays para ${phrases.length} frases`);
  }
  return conceptos;
}

const STOPWORDS = new Set(['la', 'el', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'con', 'para', 'a', 'mi', 'su', 'antes', 'despues', 'hoy', 'cuando', 'y', 'al']);

function extractConceptsHeuristic(text) {
  const words = normalizeSearchText(text).split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
  if (words.length === 0) return [normalizeSearchText(text)];
  return [words.join(' '), words.slice(0, 2).join(' '), words[words.length - 1]].filter((c, i, arr) => c && arr.indexOf(c) === i);
}

// --- Scoring (misma logica que va a vivir en PictogramizationService.js) ---

function scoreConceptMatch(concept, pictogram) {
  const c = normalizeSearchText(concept);
  const title = normalizeSearchText(pictogram.name);
  if (!c || c.length < 2) return { level: 'baja', score: 0, matchedOn: 'concepto-vacio' };

  const negC = /\b(no|sin)\b/.test(c);
  const negT = /\b(no|sin)\b/.test(title);
  const negacionMismatch = negC !== negT;

  let level = 'baja';
  let score = 0;
  let matchedOn = 'sin-match';

  if (title === c) {
    level = 'alta'; score = 1.0; matchedOn = 'titulo-exacto';
  } else if (title.startsWith(c + ' ')) {
    level = 'media'; score = 0.7; matchedOn = 'titulo-prefijo';
  } else if (c.startsWith(title + ' ')) {
    level = 'media'; score = 0.6; matchedOn = 'concepto-empieza-con-titulo';
  } else if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title) && title.split(' ').length - c.split(' ').length <= 3) {
    level = 'media'; score = 0.55; matchedOn = 'palabra-completa-en-titulo';
  } else if ((pictogram.tags || []).some((t) => normalizeSearchText(t) === c)) {
    level = 'media'; score = 0.5; matchedOn = 'etiqueta-exacta';
  } else if (c.length > 3 && title.includes(c)) {
    level = 'baja'; score = 0.2; matchedOn = 'solo-substring';
  }

  if (negacionMismatch && level !== 'baja') {
    level = level === 'alta' ? 'media' : 'baja';
    score -= 0.3;
    matchedOn += '+negacion-degradada';
  }

  return { level, score, matchedOn };
}

function pickBestMatch(concepts, candidatesByConcept) {
  let bestAlta = null;
  let bestMedia = null;
  for (const concept of concepts) {
    const candidatos = candidatesByConcept.get(concept) || [];
    for (const pictogram of candidatos) {
      const { level, score, matchedOn } = scoreConceptMatch(concept, pictogram);
      const entry = { pictogram, confidence: level, concept, matchedOn, score };
      if (level === 'alta' && (!bestAlta || score > bestAlta.score)) bestAlta = entry;
      if (level === 'media' && (!bestMedia || score > bestMedia.score || (score === bestMedia.score && pictogram.name.length < bestMedia.pictogram.name.length))) bestMedia = entry;
    }
  }
  return bestAlta || bestMedia || null;
}

// --- Runner ---

async function main() {
  const noGroq = process.argv.includes('--no-groq');
  const textArg = process.argv.find((a) => a.startsWith('--text='));
  const textos = textArg ? [textArg.replace('--text=', '')] : TEXTOS;

  if (!noGroq && !envConfig.groqApiKey) {
    console.log('GROQ_API_KEY no configurada: corriendo solo con el heuristico (--no-groq implicito).');
  }
  const useGroq = !noGroq && !!envConfig.groqApiKey;

  console.log(`Motor: ${useGroq ? 'Groq (' + PRIMARY_MODEL + ')' : 'heuristico (sin Groq)'}`);
  console.log(`Frases: ${textos.length}\n`);

  let conceptosPorFrase;
  if (useGroq) {
    conceptosPorFrase = await callGroq(textos);
  } else {
    conceptosPorFrase = textos.map(extractConceptsHeuristic);
  }

  const service = new PictogramaService();
  let alta = 0, media = 0, ninguna = 0;

  for (let i = 0; i < textos.length; i += 1) {
    const texto = textos[i];
    const conceptos = conceptosPorFrase[i];
    console.log(`── "${texto}"`);
    console.log(`   conceptos: ${conceptos.join(' | ')}`);

    const candidatesByConcept = new Map();
    for (const concept of conceptos) {
      const { items } = await service.searchAsync({ search: concept, language: 'es', limit: 8 });
      candidatesByConcept.set(concept, items);
    }

    const best = pickBestMatch(conceptos, candidatesByConcept);

    // candidatos descartados, para distinguir "el motor eligio mal" de "al catalogo le falta"
    const descartados = [];
    for (const [concept, items] of candidatesByConcept) {
      for (const item of items) {
        if (best && item.id === best.pictogram.id) continue;
        const { level, matchedOn } = scoreConceptMatch(concept, item);
        if (level !== 'baja') descartados.push(`${item.name} (${matchedOn})`);
      }
    }

    if (best) {
      console.log(`   ✅ MATCH [${best.confidence}] "${best.pictogram.name}" (${best.matchedOn}) — ${best.pictogram.imageUrl}`);
      if (best.confidence === 'alta') alta += 1; else media += 1;
    } else {
      console.log('   ⚪ NINGUNA (sin certeza suficiente, cae al emoji)');
      ninguna += 1;
    }
    if (descartados.length) console.log(`   descartados: ${descartados.slice(0, 3).join(' · ')}`);
    console.log();
  }

  const total = textos.length;
  const cobertura = ((alta + media) / total * 100).toFixed(0);
  console.log('--- RESUMEN ---');
  console.log(`alta ${alta}/${total} (${(alta / total * 100).toFixed(0)}%) | media ${media}/${total} (${(media / total * 100).toFixed(0)}%) | ninguna ${ninguna}/${total} (${(ninguna / total * 100).toFixed(0)}%)`);
  console.log(`cobertura util (alta+media): ${cobertura}%`);
  console.log(`\nGATE: ${cobertura >= 60 ? 'PASA' : 'NO PASA'} (umbral 60%)`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Error en la prueba de concepto:', error);
  process.exit(1);
});
