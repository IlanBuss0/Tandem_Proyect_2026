import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import argon2 from 'argon2';
import {
  PASSWORD_HASH_OPTIONS,
  compareValue,
  hashValue,
  shouldRehashValue,
} from '../src/modules/security/hash.helper.js';

test('genera Argon2id con los parametros de seguridad definidos', async () => {
  const hash = await hashValue('UnaClaveSegura123');
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await compareValue('UnaClaveSegura123', hash), true);
  assert.equal(await compareValue('incorrecta', hash), false);
  assert.equal(shouldRehashValue(hash), false);
});

test('mantiene compatibilidad SHA-256 y solicita rehash', async () => {
  const raw = 'ClaveAnterior123';
  const legacy = `sha256$${crypto.createHash('sha256').update(raw).digest('hex')}`;
  assert.equal(await compareValue(raw, legacy), true);
  assert.equal(await compareValue('incorrecta', legacy), false);
  assert.equal(shouldRehashValue(legacy), true);
});

test('rechaza texto plano y hashes legacy malformados', async () => {
  assert.equal(await compareValue('secreto', 'secreto'), false);
  assert.equal(await compareValue('secreto', 'sha256$corto'), false);
  assert.equal(shouldRehashValue('secreto'), false);
});

test('si la contrasena parece un hash igualmente la trata como entrada sin procesar', async () => {
  const raw = '$argon2id$texto-elegido-por-el-usuario';
  const hash = await hashValue(raw);
  assert.notEqual(hash, raw);
  assert.equal(await compareValue(raw, hash), true);
});

test('detecta hashes Argon2id con parametros antiguos', async () => {
  const weakHash = await argon2.hash('UnaClaveSegura123', {
    ...PASSWORD_HASH_OPTIONS,
    memoryCost: 8192,
    timeCost: 1,
  });
  assert.equal(shouldRehashValue(weakHash), true);
});
