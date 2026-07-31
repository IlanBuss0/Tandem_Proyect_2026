import axios from 'axios';
import BD from '../src/db/BD.js';
import { envConfig } from '../src/configs/env.config.js';
import { cacheService } from '../src/services/CacheService.js';

// Traduce al espanol las etiquetas del catalogo importado.
//
// Mulberry y OpenMoji vienen 100% en ingles (`apple`, `drink`, `pizza`). La app
// es en espanol y busca por `titulo`/`etiquetas`, asi que sin este paso el
// usuario no encuentra nada escribiendo "manzana".
//
// Que hace por cada pictograma:
//   - `titulo`   -> la traduccion en espanol rioplatense (lo que se ve y se busca)
//   - `etiquetas`-> se le agrega el nombre original en ingles, asi buscar
//                   "apple" tambien funciona
//   - `metadata.nameEs` -> marca de "ya traducido", para que el script sea
//                   resumible: si se corta por rate limit, se vuelve a correr
//                   y sigue donde quedo.
//
// Uso:
//   npm run pictograms:translate-catalog
//   node scripts/translate-catalog-labels.mjs --limit=200
//   node scripts/translate-catalog-labels.mjs --retranslate   (rehace todo)

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Modelo principal y de respaldo. El plan gratis de Groq limita el modelo
// grande a 100.000 tokens POR DIA, que no alcanza para las ~5.900 etiquetas
// del catalogo completo. Cuando se agota el cupo diario, reintentar no sirve
// (hay que esperar al reset), asi que se cambia al modelo chico, que tiene un
// limite diario mucho mas alto y rinde igual para traducir etiquetas de una o
// dos palabras.
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';
// Se recuerda si ya se agoto el cupo del modelo grande, para no reintentarlo
// en cada lote una vez que se sabe que esta agotado por hoy.
let primaryModelExhausted = false;
// El modelo grande maneja bien lotes de 50. El chico (fallback) pierde
// precision con listas largas: con lotes de 50 tradujo "banana bunch" como
// "manzana en racimo". Con lotes chicos acierta mucho mas, y en una app de CAA
// una etiqueta mal traducida es peor que una en ingles: el pictograma se usa
// para comunicar.
const BATCH_SIZE_PRIMARY = 50;
const BATCH_SIZE_FALLBACK = 15;
// Groq free tier limita por requests y por tokens por minuto. Una pausa corta
// entre lotes evita comerse un 429 a mitad del catalogo.
const DELAY_BETWEEN_BATCHES_MS = 2500;

const SYSTEM_PROMPT = `Traducis nombres de pictogramas de comunicacion aumentativa del ingles al espanol rioplatense (Argentina).

Reglas:
1. Todo en minusculas, sin comillas, sin explicaciones, sin punto final.
2. Usa la palabra mas comun en Argentina: "t-shirt" -> "remera", "bus" -> "colectivo", "swimming pool" -> "pileta", "sneakers" -> "zapatillas", "car" -> "auto", "cell phone" -> "celular", "computer" -> "computadora".
3. Manten el sentido exacto. Si es un verbo en ingles, dejalo en infinitivo ("eating" -> "comer").
4. Las letras solas del alfabeto se dejan igual ("a" -> "a").
5. Si el termino ya esta en espanol o es un nombre propio (paises, ciudades, marcas), devolvelo sin cambios.
6. Nunca devuelvas una cadena vacia: si no sabes, devolve el original.

Respondes UNICAMENTE con un objeto JSON con una sola clave "traducciones", cuyo valor es un array de strings del mismo largo y en el mismo orden que la entrada. Sin markdown, sin texto adicional.

Ejemplo de entrada: ["apple","t-shirt","eating"]
Ejemplo de salida: {"traducciones":["manzana","remera","comer"]}`;

function parseArgs() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  return {
    limit: limitArg ? Number.parseInt(limitArg.replace('--limit=', ''), 10) : null,
    retranslate: args.includes('--retranslate'),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function translateBatch(apiKey, names, { attempt = 1, model = null } = {}) {
  const activeModel = model ?? (primaryModelExhausted ? FALLBACK_MODEL : PRIMARY_MODEL);
  try {
    const response = await axios.post(GROQ_CHAT_URL, {
      model: activeModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(names) },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    const text = response?.data?.choices?.[0]?.message?.content?.trim() || '';
    // El modo json_object de Groq exige un objeto en la raiz (un array pelado
    // hace fallar la generacion), por eso se pide {"traducciones": [...]}.
    // Se acepta igual cualquier clave que contenga el array, por si el modelo
    // la nombra distinto.
    let parsed;
    try {
      const asJson = JSON.parse(text);
      parsed = Array.isArray(asJson) ? asJson : Object.values(asJson).find(Array.isArray);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!Array.isArray(parsed) || parsed.length !== names.length) {
      const error = new Error(`se esperaban ${names.length} traducciones y llegaron ${Array.isArray(parsed) ? parsed.length : 'nada'}`);
      error.isCountMismatch = true;
      throw error;
    }
    return parsed.map((value, index) => {
      const clean = String(value ?? '').trim().replace(/^["']|["']$/g, '');
      return clean || names[index]; // nunca vacio
    });
  } catch (error) {
    const status = error?.response?.status;
    const message = error?.response?.data?.error?.message || error.message;

    if (status === 429) {
      // Hay que distinguir dos 429 distintos:
      //   - por minuto (TPM/RPM): esperar y reintentar SI sirve.
      //   - por dia (TPD): esperar no sirve, hay que cambiar de modelo.
      const isDailyLimit = /per day|TPD/i.test(message);

      if (isDailyLimit && activeModel === PRIMARY_MODEL) {
        primaryModelExhausted = true;
        console.log(`    cupo diario de ${PRIMARY_MODEL} agotado, se pasa a ${FALLBACK_MODEL}.`);
        return translateBatch(apiKey, names, { attempt: 1, model: FALLBACK_MODEL });
      }

      if (!isDailyLimit && attempt <= 3) {
        const wait = attempt * 15000;
        console.log(`    rate limit por minuto, esperando ${wait / 1000}s (intento ${attempt}/3)...`);
        await sleep(wait);
        return translateBatch(apiKey, names, { attempt: attempt + 1, model: activeModel });
      }
    }

    if (error.isCountMismatch) throw error; // lo maneja translateWithSplit
    throw new Error(`[${activeModel}] ${message}`);
  }
}

/**
 * Traduce una lista partiendo el lote al medio si el modelo devuelve una
 * cantidad de traducciones distinta a la pedida. El modelo chico
 * (llama-3.1-8b-instant, al que se cae cuando se agota el cupo diario del
 * grande) a veces pierde la cuenta con listas largas; con lotes mas chicos
 * acierta. Se parte recursivamente hasta lotes de 1, donde ya no puede fallar
 * por conteo.
 */
async function translateWithSplit(apiKey, names) {
  try {
    return await translateBatch(apiKey, names);
  } catch (error) {
    if (!error.isCountMismatch || names.length <= 1) throw error;

    const middle = Math.floor(names.length / 2);
    console.log(`    el modelo devolvio una cantidad distinta, se parte el lote en ${middle} + ${names.length - middle}...`);
    const [left, right] = await Promise.all([
      translateWithSplit(apiKey, names.slice(0, middle)),
      translateWithSplit(apiKey, names.slice(middle)),
    ]);
    return [...left, ...right];
  }
}

async function main() {
  if (!envConfig.groqApiKey) {
    console.error('GROQ_API_KEY no configurada: no se puede traducir.');
    process.exit(1);
  }

  const { limit, retranslate } = parseArgs();

  const pending = await BD.query(
    `SELECT id, origen_id, titulo, etiquetas, metadata
       FROM pictogramas
      WHERE origen IN ('MULBERRY', 'OPENMOJI')
        AND idioma = 'es'
        ${retranslate ? '' : "AND metadata->>'nameEs' IS NULL"}
      ORDER BY id
      ${limit ? `LIMIT ${Number(limit)}` : ''}`,
  );

  if (pending.length === 0) {
    console.log('No hay etiquetas pendientes de traducir.');
    process.exit(0);
  }

  console.log(`A traducir: ${pending.length} etiquetas.`);

  let translated = 0;
  let failedBatches = 0;
  let offset = 0;
  let batchNumber = 0;

  while (offset < pending.length) {
    // El tamano se decide en cada iteracion porque el modelo puede cambiar a
    // mitad de la corrida (cuando se agota el cupo diario del grande).
    const batchSize = primaryModelExhausted ? BATCH_SIZE_FALLBACK : BATCH_SIZE_PRIMARY;
    const batch = pending.slice(offset, offset + batchSize);
    batchNumber += 1;
    // Se traduce el nombre original en ingles si esta guardado; si no, el
    // titulo actual (que en la primera pasada es el ingles).
    const names = batch.map((row) => row.metadata?.originalName || row.titulo);

    try {
      const spanish = await translateWithSplit(envConfig.groqApiKey, names);

      await BD.transaction(async (client) => {
        for (let i = 0; i < batch.length; i += 1) {
          const row = batch[i];
          const englishName = names[i];
          const spanishName = spanish[i];

          // El nombre en ingles va a etiquetas para que buscar en ingles
          // tambien encuentre el pictograma.
          const tags = Array.isArray(row.etiquetas) ? [...row.etiquetas] : [];
          const englishLower = englishName.toLowerCase();
          if (englishLower && !tags.some((t) => String(t).toLowerCase() === englishLower)) {
            tags.push(englishLower);
          }

          await client.query(
            // Los casts explicitos no son opcionales: con etiquetas = [] (caso
            // comun en OpenMoji) Postgres no puede inferir el tipo del array y
            // tira "could not determine polymorphic type".
            `UPDATE pictogramas
                SET titulo = $2::text,
                    etiquetas = $3::text[],
                    texto_busqueda = LOWER($2::text || ' ' || $4::text || ' ' || COALESCE(array_to_string($3::text[], ' '), '')),
                    metadata = COALESCE(metadata, '{}'::jsonb)
                               || jsonb_build_object('nameEs', $2::text, 'originalName', $5::text),
                    fecha_actualizacion = NOW()
              WHERE id = $1`,
            [row.id, spanishName, tags, row.metadata?.originalCategory || '', englishName],
          );
        }
      });

      translated += batch.length;
      const sample = names.slice(0, 3).map((en, i) => `${en} -> ${spanish[i]}`).join(' | ');
      console.log(`  lote ${batchNumber}ok (${translated}/${pending.length}). ${sample}`);
    } catch (error) {
      failedBatches += 1;
      console.warn(`  lote ${batchNumber}FALLO: ${error.message}`);
    }

    offset += batch.length;
    if (offset < pending.length) await sleep(DELAY_BETWEEN_BATCHES_MS);
  }

  // Las busquedas quedan cacheadas; hay que tirar el cache para que los
  // titulos nuevos aparezcan.
  await cacheService.delByPattern('pictogram.*');

  console.log('--- Resumen ---');
  console.log(`Traducidas:      ${translated}`);
  console.log(`Lotes fallidos:  ${failedBatches}`);
  if (failedBatches > 0) {
    console.log('Volve a correr el script para reintentar solo lo que quedo pendiente.');
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('Error traduciendo el catalogo:', error);
  process.exit(1);
});
