import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isExpiresIn(value) {
  return /^\d+[smhd]$/i.test(String(value || '').trim());
}

export const envConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  databasePoolMax: Number.parseInt(process.env.DATABASE_POOL_MAX || '5', 10),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  corsOrigins: parseCsv(process.env.CORS_ORIGINS),
  redisUrl: process.env.REDIS_URL || null,
  arasaacApiBaseUrl: process.env.ARASAAC_API_BASE_URL || 'https://api.arasaac.org/api',
  arasaacStaticUrl: process.env.ARASAAC_STATIC_URL || 'https://static.arasaac.org/pictograms',
  supabaseUrl: process.env.SUPABASE_URL || null,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  supabaseAvatarBucket: process.env.SUPABASE_AVATAR_BUCKET || 'avatars',
  supabaseFilesBucket: process.env.SUPABASE_FILES_BUCKET || 'files',
  dicebearAvatarPngBaseUrl: process.env.DICEBEAR_AVATAR_PNG_BASE_URL || 'https://api.dicebear.com/9.x/avataaars/png',
  notificationWorkerConcurrency: Number.parseInt(process.env.NOTIFICATION_WORKER_CONCURRENCY || '5', 10),
  startNotificationWorker: process.env.START_NOTIFICATION_WORKER !== 'false',
  falKey: process.env.FAL_KEY || null,
  falRequestTimeoutMs: Number.parseInt(process.env.FAL_REQUEST_TIMEOUT_MS || '120000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  groqApiKey: process.env.GROQ_API_KEY || null,
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  resendApiKey: process.env.RESEND_API_KEY || null,
  resendFromEmail: process.env.RESEND_FROM_EMAIL || 'Tandem <onboarding@resend.dev>',
  appPublicUrl: process.env.APP_PUBLIC_URL || 'http://localhost:8080',
};

export function validateEnvConfig() {
  const missing = [];
  const invalid = [];

  if (!envConfig.jwtSecret) missing.push('JWT_SECRET');
  if (!envConfig.databaseUrl) missing.push('DATABASE_URL');
  if (envConfig.nodeEnv === 'production' && !envConfig.corsOrigins.length) missing.push('CORS_ORIGINS');
  if (!isExpiresIn(envConfig.jwtExpiresIn)) invalid.push('JWT_EXPIRES_IN');
  if (!isExpiresIn(envConfig.refreshTokenExpiresIn)) invalid.push('REFRESH_TOKEN_EXPIRES_IN');
  if (envConfig.nodeEnv === 'production' && envConfig.corsOrigins.includes('*')) invalid.push('CORS_ORIGINS');

  if (missing.length) {
    throw new Error(`Variables de entorno obligatorias faltantes: ${missing.join(', ')}`);
  }

  if (invalid.length) {
    throw new Error(`Variables de entorno invalidas: ${invalid.join(', ')}`);
  }
}
