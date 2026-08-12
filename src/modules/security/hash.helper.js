import crypto from 'crypto';
import argon2 from 'argon2';

export const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function hashValue(value) {
  if (typeof value !== 'string' || !value.length) return value;
  return argon2.hash(value, PASSWORD_HASH_OPTIONS);
}

export async function compareValue(raw, hashed) {
  if (!hashed || typeof hashed !== 'string') return false;
  if (hashed.startsWith('$argon2')) {
    try {
      return await argon2.verify(hashed, raw);
    } catch {
      return false;
    }
  }
  if (!hashed.startsWith('sha256$')) return false;
  const candidate = `sha256$${digest(raw)}`;
  const candidateBuffer = Buffer.from(candidate);
  const hashBuffer = Buffer.from(hashed);
  return candidateBuffer.length === hashBuffer.length && crypto.timingSafeEqual(candidateBuffer, hashBuffer);
}

export function shouldRehashValue(hashed) {
  if (typeof hashed !== 'string') return false;
  if (hashed.startsWith('sha256$')) return true;
  if (!hashed.startsWith('$argon2')) return false;
  try {
    return argon2.needsRehash(hashed, PASSWORD_HASH_OPTIONS);
  } catch {
    return false;
  }
}
