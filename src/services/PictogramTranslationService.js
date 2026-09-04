import BD from '../db/BD.js';
import { envConfig } from '../configs/env.config.js';
import { cacheService } from './CacheService.js';
import { groqProvider } from '../providers/ai/aiProviders.js';

// Traduce al espanol las etiquetas del catalogo importado (Mulberry, OpenMoji).
//
// Mulberry y OpenMoji vienen 100% en ingles (`apple`, `drink`, `pizza`). La app
// es en espanol y busca por `titulo`/`etiquetas`, asi que sin este paso el
// usuario no encuentra nada escribiendo "manzana".
//
// Que hace por cada pictograma:
//   - `titulo`   -> la traduccion en espanol rioplatense (lo que se ve y se busca)
//   - `etiquetas`-> se le agrega el nombre original en ingles, asi buscar
//                   "apple" tambien funciona
//   - `metadata.nameEs` -> marca de "ya traducido". Por eso todo esto es
//                   resumible: si Groq se queda sin cupo a mitad de camino,
//                   la proxima corrida (manual o automatica) retoma solo lo
//                   que quedo con nameEs IS NULL, nunca reprocesa lo ya hecho.
//
// Este modulo es el corazon compartido entre:
//   - scripts/translate-catalog-labels.mjs (uso manual)
//   - src/jobs/pictogramaSyncJob.js (automatico: al final de cada sync
//     mensual, y en el chequeo de cada 6hs por si un dia anterior se corto
//     por falta de cupo de Groq)

// Modelo principal y de respaldo. Cuando se agota el cupo diario del
// principal, reintentar no sirve hasta el reset, asi que se cambia a otro
// modelo con cuota independiente.
const PRIMARY_MODEL = 'openai/gpt-oss-20b';
const FALLBACK_MODEL = 'openai/gpt-oss-120b';
// El principal maneja bien lotes de 50. El fallback usa lotes chicos para
// priorizar precision sobre velocidad: una etiqueta mal traducida es peor que
// una en ingles porque el pictograma se usa para comunicar.
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cuenta cuantos pictogramas del catalogo importado todavia no tienen
 * traduccion. Barato (un COUNT), pensado para llamarse seguido desde el
 * chequeo periodico del sync sin preocuparse por el costo.
 */
export async function countPendingTranslationsAsync() {
  const row = await BD.queryOne(
    `SELECT COUNT(*)::int AS total
       FROM pictogramas
      WHERE origen IN ('MULBERRY', 'OPENMOJI', 'GLOBAL_SYMBOLS')
        AND idioma = 'es'
        AND metadata->>'nameEs' IS NULL`,
  );
  return row?.total ?? 0;
}

async function translateBatch(names, { attempt = 1, model = null, primaryModelExhaustedRef } = {}) {
  const activeModel = model ?? (primaryModelExhaustedRef.value ? FALLBACK_MODEL : PRIMARY_MODEL);
  try {
    const response = await groqProvider.chatCompletion({
      model: activeModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(names) },
      ],
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
      timeoutMs: 60000,
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
        primaryModelExhaustedRef.value = true;
        return translateBatch(names, { attempt: 1, model: FALLBACK_MODEL, primaryModelExhaustedRef });
      }

      if (!isDailyLimit && attempt <= 3) {
        const wait = attempt * 15000;
        await sleep(wait);
        return translateBatch(names, { attempt: attempt + 1, model: activeModel, primaryModelExhaustedRef });
      }
    }

    if (error.isCountMismatch) throw error; // lo maneja translateWithSplit
    throw new Error(`[${activeModel}] ${message}`);
  }
}

/**
 * Traduce una lista partiendo el lote al medio si el modelo devuelve una
 * cantidad de traducciones distinta a la pedida. El modelo chico (al que se
 * cae cuando se agota el cupo diario del grande) a veces pierde la cuenta con
 * listas largas; con lotes mas chicos acierta. Se parte recursivamente hasta
 * lotes de 1, donde ya no puede fallar por conteo.
 */
async function translateWithSplit(names, primaryModelExhaustedRef) {
  try {
    return await translateBatch(names, { primaryModelExhaustedRef });
  } catch (error) {
    if (!error.isCountMismatch || names.length <= 1) throw error;

    const middle = Math.floor(names.length / 2);
    const [left, right] = await Promise.all([
      translateWithSplit(names.slice(0, middle), primaryModelExhaustedRef),
      translateWithSplit(names.slice(middle), primaryModelExhaustedRef),
    ]);
    return [...left, ...right];
  }
}

/**
 * Traduce las etiquetas pendientes del catalogo (o todas, con `retranslate`).
 *
 * @param {object} [options]
 * @param {number|null} [options.limit] tope de filas a procesar en esta corrida
 * @param {boolean} [options.retranslate] ignora metadata.nameEs y rehace todo
 * @param {(msg: string) => void} [options.log]
 * @returns {Promise<{ translated: number, failedBatches: number, pending: number }>}
 */
export async function translatePendingLabelsAsync({ limit = null, retranslate = false, log = console.log } = {}) {
  if (!envConfig.groqApiKey) {
    return { translated: 0, failedBatches: 0, pending: 0, error: 'GROQ_API_KEY no configurada' };
  }

  const pending = await BD.query(
    `SELECT id, origen_id, titulo, etiquetas, metadata
       FROM pictogramas
      WHERE origen IN ('MULBERRY', 'OPENMOJI', 'GLOBAL_SYMBOLS')
        AND idioma = 'es'
        ${retranslate ? '' : "AND metadata->>'nameEs' IS NULL"}
      ORDER BY id
      ${limit ? `LIMIT ${Number(limit)}` : ''}`,
  );

  if (pending.length === 0) {
    return { translated: 0, failedBatches: 0, pending: 0 };
  }

  log(`A traducir: ${pending.length} etiquetas.`);

  let translated = 0;
  let failedBatches = 0;
  let offset = 0;
  let batchNumber = 0;
  // Objeto envoltorio (no un booleano suelto) para que translateBatch pueda
  // mutar el valor y que la corrida entera se entere sin pasar el flag de
  // vuelta por cada return.
  const primaryModelExhaustedRef = { value: false };

  while (offset < pending.length) {
    // El tamano se decide en cada iteracion porque el modelo puede cambiar a
    // mitad de la corrida (cuando se agota el cupo diario del grande).
    const batchSize = primaryModelExhaustedRef.value ? BATCH_SIZE_FALLBACK : BATCH_SIZE_PRIMARY;
    const batch = pending.slice(offset, offset + batchSize);
    batchNumber += 1;
    // Se traduce el nombre original en ingles si esta guardado; si no, el
    // titulo actual (que en la primera pasada es el ingles).
    const names = batch.map((row) => row.metadata?.originalName || row.titulo);

    try {
      const spanish = await translateWithSplit(names, primaryModelExhaustedRef);

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
      log(`  lote ${batchNumber} ok (${translated}/${pending.length}). ${sample}`);
    } catch (error) {
      failedBatches += 1;
      log(`  lote ${batchNumber} FALLO: ${error.message}`);
    }

    offset += batch.length;
    if (offset < pending.length) await sleep(DELAY_BETWEEN_BATCHES_MS);
  }

  // Las busquedas quedan cacheadas; hay que tirar el cache para que los
  // titulos nuevos aparezcan.
  await cacheService.delByPattern('pictogram.*');

  return { translated, failedBatches, pending: pending.length };
}
