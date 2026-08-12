import crypto from 'crypto';
import { envConfig } from '../../configs/env.config.js';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const encoded = envConfig.dataEncryptionKey;
  if (!encoded) throw new Error('DATA_ENCRYPTION_KEY no configurada');

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY debe contener exactamente 32 bytes en base64');
  return key;
}

export function isEncryptedValue(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptField(value) {
  if (value == null || value === '' || isEncryptedValue(value)) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptField(value) {
  if (!isEncryptedValue(value)) return value;

  const parts = value.split(':');
  if (parts.length !== 5) throw new Error('Formato de dato cifrado invalido');

  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const ciphertext = Buffer.from(parts[4], 'base64url');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function decryptFieldInRow(row, field) {
  if (row?.[field] != null) row[field] = decryptField(row[field]);
  return row;
}

export function decryptFieldInRows(rows, field) {
  return rows?.map((row) => decryptFieldInRow(row, field)) ?? rows;
}
