import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Los accesos válidos no son intentos de fuerza bruta. Contarlos hacía que
  // una misma IP quedara bloqueada después de alternar entre varias cuentas.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá nuevamente en unos minutos.' },
});

export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de renovacion. Proba nuevamente en unos minutos.' },
});

export const inviteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Probá nuevamente en unos minutos.' },
});

// Solo para creación de sesiones profesionales: cada request puede crear
// hasta 52 sesiones de una serie recurrente, así que el límite de requests
// ya pone un techo razonable al volumen total sin frenar la carga normal
// de agenda/calendario (esos endpoints son GET y no pasan por acá).
export const sesionProfesionalCreateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas sesiones creadas en poco tiempo. Probá nuevamente en unos minutos.' },
});

// Cada request dispara al menos una llamada a la API de Gemini (tiene costo)
// asi que el limite es mas estricto que el de creacion de sesiones.
export const reporteProfesionalCreateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados reportes generados en poco tiempo. Probá nuevamente en unos minutos.' },
});

// Cada request dispara un envio real por Resend (cuota gratis limitada), asi
// que va bien restringido: alcanza de sobra para un usuario legitimo que no
// vio el mail, pero no para quemar la cuota.
export const resendVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ya pediste el reenvío varias veces. Esperá unos minutos y volvé a intentar.' },
});

export async function setupRedisRateLimit() {
  const { isRedisEnabled } = await import('../redis/redisClient.js');
  if (!isRedisEnabled()) return;

  try {
    const { default: RedisStore } = await import('rate-limit-redis');
    const { createRedisConnection, connectRedisClient } = await import('../redis/redisClient.js');
    const client = createRedisConnection('rate-limit');
    if (!client) return;
    client.on('error', () => {});
    const connected = await connectRedisClient(client, 'rate-limit');
    if (!connected) return;
    const store = new RedisStore({ sendCommand: (...args) => client.call(...args) });
    authRateLimiter.store = store;
    refreshRateLimiter.store = store;
    inviteRateLimiter.store = store;
    console.log('[RateLimit] Redis store activado.');
  } catch (error) {
    console.error('[RateLimit] No se pudo activar Redis store, usando memoria:', error.message);
  }
}
