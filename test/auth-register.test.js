import test from 'node:test';
import assert from 'node:assert/strict';
import AuthService from '../src/services/AuthService.js';

// Estos casos fallan antes de tocar la base (validacion pura), asi que no
// hace falta mockear repositorios. El resto del flujo (creacion transaccional
// del perfil por rol, rollback si falla, duplicados) se verifico a mano
// contra la base real durante el desarrollo.

test('register rechaza id_tipo_usuario mandado directo sin rol (no se puede llegar a admin)', async () => {
  await assert.rejects(
    () => AuthService.register({
      id_tipo_usuario: 4,
      nombre_usuario: 'x', nombre: 'X', apellido: 'Y',
      correo: 'x@test.com', contrasena: 'abc12345',
    }),
    error => error.statusCode === 400 && /rol es obligatorio/.test(error.message),
  );
});

test('register rechaza un rol que no sea perteneciente/tutor/profesional', async () => {
  await assert.rejects(
    () => AuthService.register({
      rol: 'administrador',
      nombre_usuario: 'x', nombre: 'X', apellido: 'Y',
      correo: 'x@test.com', contrasena: 'abc12345',
    }),
    error => error.statusCode === 400,
  );
});

test('register rechaza contrasena sin numero', async () => {
  await assert.rejects(
    () => AuthService.register({
      rol: 'tutor', nombre_usuario: 'x', nombre: 'X', apellido: 'Y',
      correo: 'x@test.com', contrasena: 'sololetras',
    }),
    error => error.statusCode === 400 && /contrasena/.test(error.message),
  );
});

test('register rechaza contrasena de menos de 8 caracteres', async () => {
  await assert.rejects(
    () => AuthService.register({
      rol: 'tutor', nombre_usuario: 'x', nombre: 'X', apellido: 'Y',
      correo: 'x@test.com', contrasena: 'ab12',
    }),
    error => error.statusCode === 400,
  );
});

test('register rechaza un correo con formato invalido', async () => {
  await assert.rejects(
    () => AuthService.register({
      rol: 'tutor', nombre_usuario: 'x', nombre: 'X', apellido: 'Y',
      correo: 'no-es-un-mail', contrasena: 'abc12345',
    }),
    error => error.statusCode === 400 && /correo/.test(error.message),
  );
});

test('register rechaza si falta nombre_usuario, nombre o apellido', async () => {
  await assert.rejects(
    () => AuthService.register({
      rol: 'tutor', correo: 'x@test.com', contrasena: 'abc12345',
    }),
    error => error.statusCode === 400,
  );
});

test('recuperacion rechaza un correo con formato invalido', async () => {
  await assert.rejects(
    () => AuthService.requestPasswordReset({ correo: 'no-es-un-mail' }),
    error => error.statusCode === 400 && /correo/.test(error.message),
  );
});

test('restablecimiento valida la nueva contrasena antes de consultar la base', async () => {
  await assert.rejects(
    () => AuthService.resetPassword({ token: 'token', contrasena_nueva: 'corta' }),
    error => error.statusCode === 400 && /contrasena/.test(error.message),
  );
});

test('cambio de correo valida el formato antes de consultar la base', async () => {
  await assert.rejects(
    () => AuthService.changeEmail(1, { correo_nuevo: 'invalido', contrasena_actual: 'abc12345' }),
    error => error.statusCode === 400 && /correo/.test(error.message),
  );
});
