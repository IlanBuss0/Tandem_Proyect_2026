import test from 'node:test';
import assert from 'node:assert/strict';
import AuthService from '../src/services/AuthService.js';
import AuthRepository from '../src/repositories/AuthRepository.js';
import { authMiddleware, verifiedAccountMiddleware } from '../src/middlewares/auth.middleware.js';
import { ACCESS_COOKIE_NAME } from '../src/configs/auth-cookies.config.js';
import { signJwt } from '../src/modules/security/jwt.helper.js';
import { pickEditableUserFields, toPublicUser } from '../src/modules/security/account-update.policy.js';

test('actualizacion propia ignora correo, hash, rol, estado y fecha de ingreso', () => {
  assert.deepEqual(
    pickEditableUserFields({
      nombre: 'Ana', nombre_usuario: 'ana', correo: 'ataque@test.com', contrasena_hash: 'hash',
      id_tipo_usuario: 4, activo: true, fecha_ingreso: new Date(), telefono: '123',
    }, { self: true }),
    { nombre_usuario: 'ana', nombre: 'Ana', telefono: '123' },
  );
});

test('edicion de un usuario vinculado tampoco permite cambiar su username', () => {
  assert.deepEqual(
    pickEditableUserFields({ nombre: 'Ana', nombre_usuario: 'tomada', telefono: '123' }, { self: false }),
    { nombre: 'Ana', telefono: '123' },
  );
});

test('proyeccion publica no expone correo, telefono, nacimiento ni hash', () => {
  assert.deepEqual(toPublicUser({
    id: 2, id_tipo_usuario: 1, nombre_usuario: 'ana', nombre: 'Ana', apellido: 'Paz', activo: true,
    correo: 'privado@test.com', telefono: '123', fecha_nacimiento: '2000-01-01', contrasena_hash: 'secreto',
  }), { id: 2, id_tipo_usuario: 1, nombre_usuario: 'ana', nombre: 'Ana', apellido: 'Paz', activo: true });
});

test('login rechaza una cuenta desactivada antes de comparar la contrasena', async () => {
  const original = AuthRepository.findByCorreoOrNombreUsuario;
  AuthRepository.findByCorreoOrNombreUsuario = async () => ({ id: 9, activo: false, contrasena_hash: 'irrelevante' });
  try {
    await assert.rejects(() => AuthService.login({ correo: 'x@test.com', contrasena: 'abc12345' }), error => error.statusCode === 401 && /Cuenta/.test(error.message));
  } finally { AuthRepository.findByCorreoOrNombreUsuario = original; }
});

test('auth middleware rechaza inmediatamente una cuenta desactivada', async () => {
  const original = AuthRepository.findSafeById;
  AuthRepository.findSafeById = async () => ({ id: 9, activo: false, email_verificado: true });
  try {
    const error = await new Promise(resolve => authMiddleware({ cookies: { [ACCESS_COOKIE_NAME]: signJwt({ id: 9 }) } }, {}, resolve));
    assert.equal(error.statusCode, 401);
  } finally { AuthRepository.findSafeById = original; }
});

test('cuenta sin email verificado no accede a las APIs privadas', () => {
  let received;
  verifiedAccountMiddleware({ account: { email_verificado: false } }, {}, error => { received = error; });
  assert.equal(received.statusCode, 403);
  assert.equal(received.code, 'EMAIL_NOT_VERIFIED');
});
