import assert from 'node:assert/strict';
import test from 'node:test';

import AuthorizationService from '../src/services/AuthorizationService.js';
import AuthorizationRepository from '../src/repositories/AuthorizationRepository.js';

// Sesion 6: las rutas GET de configuraciones_usuarios (rutinas, calendario,
// emociones) no tenian NINGUN chequeo de propiedad — cualquier usuario
// logueado podia leer la configuracion de cualquier otro. Estos tests
// cubren assertCanReadUsuarioConfig, el guard que lo arregla.
//
// Se mockea AuthorizationRepository directo (es un singleton importado, el
// mismo patron que el resto del repo usa para servicios/repos instanciados).
// cacheService.get siempre devuelve null en este entorno (sin Redis), asi
// que getPermissionContext no queda cacheado entre tests.

function activeUsuario(id) {
  return { id, activo: true };
}

test('assertCanReadUsuarioConfig: uno mismo, siempre permitido sin pegarle a la BD', async () => {
  AuthorizationRepository.getUsuarioById = async () => { throw new Error('no deberia llamarse'); };
  const result = await AuthorizationService.assertCanReadUsuarioConfig(7, 7);
  assert.ok(result.allowed !== false);
});

test('assertCanReadUsuarioConfig: el target no tiene perfil de perteneciente -> 403', async () => {
  AuthorizationRepository.getPertenecienteByUsuarioId = async () => null;

  await assert.rejects(
    () => AuthorizationService.assertCanReadUsuarioConfig(7, 99),
    (error) => {
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

test('assertCanReadUsuarioConfig: un tutor activo del perteneciente target puede leer', async () => {
  AuthorizationRepository.getPertenecienteByUsuarioId = async (idUsuario) => (
    idUsuario === 99 ? { id: 50, id_usuario: 99, puede_autogestionarse: false } : null
  );
  AuthorizationRepository.getUsuarioById = async () => activeUsuario(7);
  AuthorizationRepository.getTutorByUsuarioId = async () => ({ id: 3 });
  AuthorizationRepository.getProfesionalByUsuarioId = async () => null;
  AuthorizationRepository.isTutorActivoForPerteneciente = async (idTutor, idPerteneciente) => idTutor === 3 && idPerteneciente === 50;

  const result = await AuthorizationService.assertCanReadUsuarioConfig(7, 99);
  assert.ok(result.allowed !== false);
});

test('assertCanReadUsuarioConfig: un usuario sin vinculo con el perteneciente target -> 403', async () => {
  AuthorizationRepository.getPertenecienteByUsuarioId = async (idUsuario) => (
    idUsuario === 99 ? { id: 50, id_usuario: 99, puede_autogestionarse: false } : null
  );
  AuthorizationRepository.getUsuarioById = async () => activeUsuario(7);
  AuthorizationRepository.getTutorByUsuarioId = async () => null;
  AuthorizationRepository.getProfesionalByUsuarioId = async () => null;

  await assert.rejects(
    () => AuthorizationService.assertCanReadUsuarioConfig(7, 99),
    (error) => {
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});
