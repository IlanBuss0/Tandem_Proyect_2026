import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { envConfig } from '../src/configs/env.config.js';
import {
  decryptField,
  decryptFieldInRow,
  encryptField,
  isEncryptedValue,
} from '../src/modules/security/field-encryption.helper.js';

envConfig.dataEncryptionKey = crypto.randomBytes(32).toString('base64');

test('AES-256-GCM cifra y recupera un campo sensible', () => {
  const plaintext = 'Contenido privado con acentos: sesión y ubicación';
  const encrypted = encryptField(plaintext);
  assert.equal(isEncryptedValue(encrypted), true);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptField(encrypted), plaintext);
});

test('usa IV aleatorio y no cifra dos veces', () => {
  const first = encryptField('mismo contenido');
  const second = encryptField('mismo contenido');
  assert.notEqual(first, second);
  assert.equal(encryptField(first), first);
});

test('lee valores legacy en texto plano durante la migracion', () => {
  assert.equal(decryptField('dato anterior'), 'dato anterior');
  assert.deepEqual(decryptFieldInRow({ contenido: 'anterior' }, 'contenido'), { contenido: 'anterior' });
});

test('detecta modificaciones del ciphertext mediante GCM', () => {
  const encrypted = encryptField('no debe modificarse');
  const parts = encrypted.split(':');
  const ciphertext = Buffer.from(parts[4], 'base64url');
  ciphertext[0] ^= 1;
  parts[4] = ciphertext.toString('base64url');
  const tampered = parts.join(':');
  assert.throws(() => decryptField(tampered));
});
