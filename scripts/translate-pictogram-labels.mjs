import axios from 'axios';
import { envConfig } from '../src/configs/env.config.js';
import PictogramaRepository from '../src/repositories/PictogramaRepository.js';
import GlobalSymbolsProvider from '../src/providers/pictograms/GlobalSymbolsProvider.js';
import { assertLicenseAllowed } from '../src/modules/pictograms/license-whitelist.js';

// Migracion de pictogramas a librerias con licencia comercial (Fase 6).
// Muchos pictogramas de las colecciones aprobadas existen con etiqueta en
// ingles pero no en espanol (asi lo confirmo detect-pictogram-gaps.mjs). Este
// script busca esos mismos conceptos en ingles, traduce la etiqueta con Groq
// (ya usado en AiReportService.js, mismo patron) y los suma al catalogo
// local en espanol -sin pisar ningun pictograma que ya tenga etiqueta
// espanola nativa, porque la clave unica es (origen, idioma, origen_id) y
// el origen_id del picto es el mismo sin importar en que idioma se busco-.
//
// Uso: npm run pictograms:translate -- --terms=hand washing,bus,t-shirt
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_NAME = 'openai/gpt-oss-20b';

// Terminos en ingles que corresponden a los huecos de vocabulario
// rioplatense/nucleo detectados con detect-pictogram-gaps.mjs. Se buscan en
// ingles porque las colecciones aprobadas tienen mucho mas vocabulario
// anglo que hispano.
const DEFAULT_ENGLISH_TERMS = [
  'hand washing', 'bus', 't-shirt', 'swimming pool', 'sneakers', 'jacket',
  'toilet', 'bathroom', 'tired', 'angry', 'scared', 'wait', 'go out',
  'doctor', 'supermarket', 'thank you', 'please', 'hello', 'goodbye',
  'want', 'need', 'feel', 'phone', 'computer', 'television', 'food',
  'fruit', 'vegetable', 'clothes', 'shoes', 'bed', 'chair', 'table',
  'kitchen', 'garden', 'street', 'shop', 'money', 'work',
];

function parseArgs() {
  const termsArg = process.argv.slice(2).find((arg) => arg.startsWith('--terms='));
  return termsArg
    ? termsArg.replace('--terms=', '').split(',').map((t) => t.trim()).filter(Boolean)
    : DEFAULT_ENGLISH_TERMS;
}

async function translateBatch(apiKey, terms) {
  const response = await axios.post(GROQ_CHAT_URL, {
    model: MODEL_NAME,
    messages: [
      {
        role: 'system',
        content: 'Traducis palabras o frases cortas del ingles al espanol rioplatense (Argentina), en minusculas, sin explicaciones ni comillas. Si es un objeto cotidiano, usa la palabra mas comun en Argentina (ej: "t-shirt" -> "remera", "bus" -> "colectivo"). Respondes UNICAMENTE con un array JSON de strings, en el mismo orden que la lista de entrada, del mismo largo.',
      },
      { role: 'user', content: JSON.stringify(terms) },
    ],
    temperature: 0.2,
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const text = response?.data?.choices?.[0]?.message?.content?.trim() || '[]';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  if (!Array.isArray(parsed) || parsed.length !== terms.length) {
    throw new Error('La traduccion no devolvio un array del mismo largo que la entrada.');
  }
  return parsed;
}

async function main() {
  if (!envConfig.groqApiKey) {
    console.error('GROQ_API_KEY no configurada. No se puede traducir.');
    process.exit(1);
  }

  const englishTerms = parseArgs();
  console.log(`Buscando ${englishTerms.length} conceptos en ingles y traduciendo con Groq...`);

  const repository = new PictogramaRepository();
  await repository.ensureSchemaAsync();
  const provider = new GlobalSymbolsProvider();

  const spanishNames = await translateBatch(envConfig.groqApiKey, englishTerms);
  console.log('Traducciones:', englishTerms.map((en, i) => `${en} -> ${spanishNames[i]}`).join(', '));

  const toImport = [];
  let rejected = 0;

  for (let i = 0; i < englishTerms.length; i += 1) {
    const englishTerm = englishTerms[i];
    const spanishName = spanishNames[i];

    // Se busca en ingles (la coleccion tiene mas vocabulario ahi) pero se
    // pide el resultado ya normalizado; despues se sobreescribe el nombre
    // con la traduccion y se marca el idioma como espanol para que aparezca
    // en las busquedas de la app (que buscan por idioma = 'es').
    const results = await provider.search({ language: 'en', text: englishTerm, limit: 5 }).catch(() => []);

    for (const pictogram of results) {
      try {
        assertLicenseAllowed(pictogram);
      } catch {
        rejected += 1;
        continue;
      }

      toImport.push({
        ...pictogram,
        name: spanishName,
        language: 'es',
        tags: [...pictogram.tags, englishTerm],
      });
    }
  }

  const affected = await repository.upsertManyAsync(toImport);

  console.log('--- Resumen ---');
  console.log(`Conceptos en ingles procesados: ${englishTerms.length}`);
  console.log(`Pictogramas encontrados y traducidos: ${toImport.length}`);
  console.log(`Rechazados por licencia: ${rejected}`);
  console.log(`Importados/actualizados en la base: ${affected}`);

  process.exit(0);
}

main().catch((error) => {
  console.error('Error traduciendo etiquetas de pictogramas:', error);
  process.exit(1);
});
