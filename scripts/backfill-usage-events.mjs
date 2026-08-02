// Backfill de eventos de uso (Sesion 9): las emociones ya registradas antes
// de esta sesion viven como filas sueltas en configuraciones_usuarios
// (clave 'emotion:<ISO>'). Sin backfill, el registro de uso arranca vacio
// y el item 19 ("ya fuiste 4 veces, siempre salio bien") diria "0 veces"
// durante meses aunque la persona ya lo haya usado un monton.
//
// Corre una vez, es idempotente: no duplica si se corre dos veces (chequea
// por usuario+timestamp exacto antes de insertar).
//
// Uso: node scripts/backfill-usage-events.mjs
import BD from '../src/db/BD.js';
import UsageEventService from '../src/services/UsageEventService.js';
import UsageEventRepository from '../src/repositories/UsageEventRepository.js';
import { USAGE_EVENT_TYPES } from '../src/modules/usage/event-types.js';

async function main() {
  const usageEventService = new UsageEventService();
  const usageEventRepository = new UsageEventRepository();
  await usageEventService.ensureSchemaAsync();

  const rows = await BD.query(
    `SELECT id_usuario, clave, valor FROM configuraciones_usuarios WHERE clave LIKE 'emotion:%'`,
  );

  console.log(`[backfill] ${rows.length} registros emocionales encontrados en configuraciones_usuarios.`);

  let inserted = 0;
  let skippedDuplicate = 0;
  let skippedInvalid = 0;

  for (const row of rows) {
    let record;
    try {
      record = JSON.parse(row.valor);
    } catch {
      skippedInvalid += 1;
      continue;
    }

    if (!record || typeof record !== 'object') {
      skippedInvalid += 1;
      continue;
    }

    // El registro guarda date ('YYYY-MM-DD') y timestamp ('HH:MM') locales
    // por separado; la clave 'emotion:<ISO>' tiene el momento exacto en que
    // se creo, que es la mejor fecha real disponible para el log.
    const isoFromKey = row.clave.replace('emotion:', '');
    const ocurrioEn = new Date(isoFromKey);
    if (Number.isNaN(ocurrioEn.getTime())) {
      skippedInvalid += 1;
      continue;
    }

    const exists = await usageEventRepository.existsForUsuarioAndTimestampAsync(
      row.id_usuario,
      USAGE_EVENT_TYPES.EMOCION_REGISTRADA,
      ocurrioEn,
    );
    if (exists) {
      skippedDuplicate += 1;
      continue;
    }

    await usageEventRepository.createAsync({
      idUsuario: row.id_usuario,
      tipoEvento: USAGE_EVENT_TYPES.EMOCION_REGISTRADA,
      entidadTipo: 'emocion',
      valor: { emotion: record.emotion, intensity: record.intensity, context: record.context, whatHelped: record.whatHelped },
      origen: 'backfill',
      ocurrioEn: ocurrioEn.toISOString(),
    });
    inserted += 1;
  }

  console.log(`[backfill] insertados: ${inserted}, duplicados omitidos: ${skippedDuplicate}, invalidos omitidos: ${skippedInvalid}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('[backfill] fallo:', error);
  process.exit(1);
});
