import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeDocument, normalizeIdentityText, namesMatch } from '../src/modules/professional-verification/name-normalization.js';
import DniExtractionService from '../src/services/DniExtractionService.js';
import ProfessionalIdentityMatcher from '../src/services/ProfessionalIdentityMatcher.js';
import RefepsPublicProvider, { RefepsProviderError } from '../src/providers/professional-verification/RefepsPublicProvider.js';
import AuthService from '../src/services/AuthService.js';
import AuthorizationService from '../src/services/AuthorizationService.js';

const fixture = name => readFileSync(join('test', 'fixtures', 'refeps', name), 'utf8');

test('normalizacion limpia tildes, mayusculas y espacios', () => {
  assert.equal(normalizeIdentityText('  ÁNA   María  '), 'ana maria');
});

test('normalizacion conserva segundo nombre y apellido doble', () => {
  assert.equal(normalizeIdentityText('Juan Carlos Pérez Gómez'), 'juan carlos perez gomez');
});

test('normalizacion de DNI acepta puntos y sin puntos', () => {
  assert.equal(normalizeDocument('12.345.678'), '12345678');
  assert.equal(normalizeDocument('12345678'), '12345678');
});

test('matching acepta coincidencia exacta y nombres con/sin tilde', () => {
  assert.equal(namesMatch('José', 'Jose'), true);
  const matcher = new ProfessionalIdentityMatcher();
  const result = matcher.match({
    dniData: { nombre: 'Jose', apellido: 'Perez', dni: '12345678' },
    numeroMatricula: '123',
    refepsResults: [{ nombre: 'José', apellido: 'Pérez', dni: '12.345.678', matricula: '123', habilitado: true }],
  });
  assert.equal(result.matched, true);
  assert.equal(result.active, true);
});

test('matching acepta segundo nombre presente solo en una fuente', () => {
  assert.equal(namesMatch('Juan', 'Juan Carlos'), true);
});

test('matching detecta apellido claramente distinto', () => {
  const matcher = new ProfessionalIdentityMatcher();
  const result = matcher.match({
    dniData: { nombre: 'Ana', apellido: 'Garcia', dni: '12345678' },
    numeroMatricula: '123',
    refepsResults: [{ nombre: 'Ana', apellido: 'Lopez', dni: '12345678', matricula: '123', habilitado: true }],
  });
  assert.equal(result.matched, false);
});

test('matching detecta matricula distinta', () => {
  const matcher = new ProfessionalIdentityMatcher();
  const result = matcher.match({
    dniData: { nombre: 'Ana', apellido: 'Garcia', dni: '12345678' },
    numeroMatricula: '123',
    refepsResults: [{ nombre: 'Ana', apellido: 'Garcia', dni: '12345678', matricula: '999', habilitado: true }],
  });
  assert.equal(result.matched, false);
});

test('matching detecta DNI distinto y acepta REFEPS sin DNI', () => {
  const matcher = new ProfessionalIdentityMatcher();
  assert.equal(matcher.match({
    dniData: { nombre: 'Ana', apellido: 'Garcia', dni: '12345678' },
    numeroMatricula: '123',
    refepsResults: [{ nombre: 'Ana', apellido: 'Garcia', dni: '87654321', matricula: '123', habilitado: true }],
  }).matched, false);
  assert.equal(matcher.match({
    dniData: { nombre: 'Ana', apellido: 'Garcia', dni: '12345678' },
    numeroMatricula: '123',
    refepsResults: [{ nombre: 'Ana', apellido: 'Garcia', dni: null, matricula: '123', habilitado: true }],
  }).matched, true);
});

test('matching marca multiples resultados e inactiva', () => {
  const matcher = new ProfessionalIdentityMatcher();
  assert.equal(matcher.match({
    dniData: { nombre: 'Ana', apellido: 'Garcia', dni: '12345678' },
    numeroMatricula: '123',
    refepsResults: [
      { nombre: 'Ana', apellido: 'Garcia', dni: null, matricula: '123', habilitado: true },
      { nombre: 'Ana', apellido: 'Garcia', dni: null, matricula: '123', habilitado: true },
    ],
  }).ambiguous, true);
  assert.equal(matcher.match({
    dniData: { nombre: 'Ana', apellido: 'Garcia', dni: '12345678' },
    numeroMatricula: '123',
    refepsResults: [{ nombre: 'Ana', apellido: 'Garcia', dni: null, matricula: '123', habilitado: false }],
  }).active, false);
});

test('DNI OCR parseText extrae formato argentino bilingue', () => {
  const service = new DniExtractionService();
  const result = service.parseText(`
    REPUBLICA ARGENTINA
    APELLIDO / SURNAME
    PEREZ GOMEZ
    NOMBRE / GIVEN NAME
    JUAN CARLOS
    DNI 12.345.678
  `, 87);
  assert.equal(result.success, true);
  assert.equal(result.apellido, 'PEREZ GOMEZ');
  assert.equal(result.nombre, 'JUAN CARLOS');
  assert.equal(result.dni, '12345678');
});

test('DNI OCR parseText maneja ruido y etiquetas en una linea', () => {
  const service = new DniExtractionService();
  const result = service.parseText('*** APELLIDO / SURNAME LOPEZ\nNOMBRE / GIVEN NAME MARIA\nNUMERO 22333444', 80);
  assert.equal(result.success, true);
  assert.equal(result.apellido, 'LOPEZ');
  assert.equal(result.nombre, 'MARIA');
});

test('DNI OCR parseText falla por baja confidence o campos faltantes', () => {
  const service = new DniExtractionService();
  assert.equal(service.parseText('APELLIDO PEREZ\nNOMBRE JUAN\nDNI 12345678', 40).reason, 'LOW_CONFIDENCE');
  assert.equal(service.parseText('NOMBRE JUAN\nDNI 12345678', 80).reason, 'MISSING_FIELDS');
  assert.equal(service.parseText('APELLIDO PEREZ\nDNI 12345678', 80).reason, 'MISSING_FIELDS');
  assert.equal(service.parseText('APELLIDO PEREZ\nNOMBRE JUAN', 80).reason, 'MISSING_FIELDS');
});

test('DNI OCR extractAsync corta por timeout', async () => {
  const service = new DniExtractionService(() => new Promise(() => {}), { timeoutMs: 5 });
  const result = await service.extractAsync(Buffer.from('image'));
  assert.equal(result.success, false);
  assert.equal(result.reason, 'OCR_TIMEOUT');
});

test('REFEPS parser normaliza profesional activo', () => {
  const provider = new RefepsPublicProvider();
  const result = provider.parseHtml(fixture('professional-active.html'), '12345');
  assert.equal(result.found, true);
  assert.equal(result.results[0].habilitado, true);
  assert.equal(result.results[0].dni, '12.345.678');
});

test('REFEPS parser normaliza matricula inactiva, multiples y sin resultados', () => {
  const provider = new RefepsPublicProvider();
  assert.equal(provider.parseHtml(fixture('professional-inactive.html'), '9988').results[0].habilitado, false);
  assert.equal(provider.parseHtml(fixture('multiple-results.html'), '777').ambiguous, true);
  assert.deepEqual(provider.parseHtml(fixture('not-found.html'), '1'), { found: false, ambiguous: false, results: [] });
});

test('REFEPS parser reporta STRUCTURE_MISMATCH si cambia la estructura', () => {
  const provider = new RefepsPublicProvider();
  assert.throws(
    () => provider.parseHtml(fixture('malformed-response.html'), '123'),
    error => error instanceof RefepsProviderError && error.code === 'STRUCTURE_MISMATCH',
  );
});

test('Google profesional nuevo exige frente del DNI', async () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'client';
  try {
    await assert.rejects(
      () => AuthService.loginWithGoogle('token', 'profesional', { profesion: 'Psicologia', matricula: '123' }),
      error => error.statusCode === 400 && /DNI/.test(error.message),
    );
  } finally {
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;
  }
});

test('permisos profesionales aceptan VERIFIED y rechazan estados no verificados', () => {
  assert.equal(AuthorizationService.isProfessionalLinkApproved({
    estado_vinculo: 'activo',
    estado_validacion_profesional: 'VERIFIED',
    usuario_profesional_activo: true,
    usuario_perteneciente_activo: true,
    requiere_aprobacion_tutor: false,
  }), true);
  assert.equal(AuthorizationService.isProfessionalLinkApproved({
    estado_vinculo: 'activo',
    estado_validacion_profesional: 'MANUAL_REVIEW',
    usuario_profesional_activo: true,
    usuario_perteneciente_activo: true,
    requiere_aprobacion_tutor: false,
  }), false);
});
