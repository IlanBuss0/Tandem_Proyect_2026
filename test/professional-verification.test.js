import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import express from 'express';
import { normalizeDocument, normalizeIdentityText, namesMatch } from '../src/modules/professional-verification/name-normalization.js';
import DniExtractionService from '../src/services/DniExtractionService.js';
import ProfessionalIdentityMatcher from '../src/services/ProfessionalIdentityMatcher.js';
import RefepsPublicProvider, { RefepsProviderError } from '../src/providers/professional-verification/RefepsPublicProvider.js';
import ValidacionProfesionalServiceClass from '../src/services/ValidacionProfesionalService.js';
import AuthService from '../src/services/AuthService.js';
import AuthorizationService from '../src/services/AuthorizationService.js';
import RefepsSearchController from '../src/controllers/RefepsSearchController.js';
import AuthController from '../src/controllers/AuthController.js';
import { authMiddleware } from '../src/middlewares/auth.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';

const fixture = name => readFileSync(join('test', 'fixtures', 'refeps', name), 'utf8');

async function request(app, path, options = {}) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, options);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function registrationRoutesApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', AuthController);
  app.use('/api/refeps', RefepsSearchController);
  app.use('/api', authMiddleware);
  app.get('/api/private-route-for-test', (_req, res) => res.status(200).json({ ok: true }));
  app.use(errorMiddleware);
  return app;
}

test('ruta publica REFEPS invalida matricula sin exigir token', async () => {
  const response = await request(registrationRoutesApp(), '/api/refeps/search-refeps', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ matricula: '123' }),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.code, 'INVALID_LICENSE');
  assert.notEqual(body.error, 'Token requerido');
});

test('ruta privada sigue exigiendo autenticacion sin token', async () => {
  const response = await request(registrationRoutesApp(), '/api/private-route-for-test');
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, 'Token requerido');
});

test('endpoint publico de DNI responde error controlado sin token cuando falta archivo', async () => {
  const response = await request(registrationRoutesApp(), '/api/auth/verify-professional-dni', {
    method: 'POST',
    body: new FormData(),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.error, /DNI/);
  assert.notEqual(body.error, 'Token requerido');
});

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
    FECHA DE VENCIMIENTO 31/12/2035
  `, 87);
  assert.equal(result.success, true);
  assert.equal(result.apellido, 'PEREZ GOMEZ');
  assert.equal(result.nombre, 'JUAN CARLOS');
  assert.equal(result.dni, '12345678');
});

test('DNI OCR parseText maneja ruido y etiquetas en una linea', () => {
  const service = new DniExtractionService();
  const result = service.parseText('REPUBLICA ARGENTINA\nDOCUMENTO NACIONAL DE IDENTIDAD\n*** APELLIDO / SURNAME LOPEZ\nNOMBRE / GIVEN NAME MARIA\nNUMERO 22333444\nFECHA DE VENCIMIENTO 31/12/2035', 80);
  assert.equal(result.success, true);
  assert.equal(result.apellido, 'LOPEZ');
  assert.equal(result.nombre, 'MARIA');
});

test('DNI OCR parseText rechaza texto generico aunque tenga nombre y DNI', () => {
  const service = new DniExtractionService();
  const result = service.parseText('RECIBO DE CONSULTA\nAPELLIDO PEREZ\nNOMBRE JUAN\nDNI 12345678', 90);
  assert.equal(result.success, false);
  assert.equal(result.reason, 'NOT_ARGENTINE_DNI');
});

test('DNI OCR parseText rechaza imagen sin estructura de DNI', () => {
  const service = new DniExtractionService();
  const result = service.parseText('Flor roja con hojas verdes en un jardin', 92);
  assert.equal(result.success, false);
  assert.equal(result.dni, null);
});

test('DNI OCR parseText falla por baja confidence o campos faltantes', () => {
  const service = new DniExtractionService();
  assert.equal(service.parseText('APELLIDO PEREZ\nNOMBRE JUAN\nDNI 12345678', 40).reason, 'LOW_CONFIDENCE');
  assert.equal(service.parseText('NOMBRE JUAN\nDNI 12345678', 80).reason, 'NOT_ARGENTINE_DNI');
  assert.equal(service.parseText('APELLIDO PEREZ\nDNI 12345678', 80).reason, 'NOT_ARGENTINE_DNI');
  assert.equal(service.parseText('APELLIDO PEREZ\nNOMBRE JUAN', 80).reason, 'NOT_ARGENTINE_DNI');
});

test('verificacion profesional rechaza DNI vencido antes de consultar REFEPS', async () => {
  const service = new ValidacionProfesionalServiceClass();
  let refepsCalled = false;
  service.DniExtractionService = { extractAsync: async () => ({ success: true, nombre: 'Juan', apellido: 'Perez', dni: '12345678', fechaVencimiento: '2020-01-01' }) };
  service.RefepsProvider = { buscarPorMatricula: async () => { refepsCalled = true; } };
  const result = await service.verifyIdentityDataAsync({ imageBuffer: Buffer.from('dni'), matricula: '1234', declaredIdentity: { nombre: 'Juan', apellido: 'Perez' } });
  assert.equal(result.status, 'EXPIRED_DOCUMENT');
  assert.equal(refepsCalled, false);
});

test('verificacion profesional valida vencimiento de PDF417 antes de consultar REFEPS', async () => {
  const service = new ValidacionProfesionalServiceClass();
  let refepsCalled = false;
  service.DniExtractionService = {
    parseText: () => ({ success: true, nombre: 'Juan', apellido: 'Perez', dni: '12345678', fechaVencimiento: '2020-01-01' }),
    extractAsync: async () => { throw new Error('No debe ejecutar OCR cuando el PDF417 es valido'); },
  };
  service.RefepsProvider = { buscarPorMatricula: async () => { refepsCalled = true; } };
  const result = await service.verifyIdentityDataAsync({
    imageBuffer: Buffer.from('dni'),
    matricula: '1234',
    declaredIdentity: { nombre: 'Juan', apellido: 'Perez' },
    pdf417Raw: 'contenido-pdf417',
  });
  assert.equal(result.status, 'EXPIRED_DOCUMENT');
  assert.equal(refepsCalled, false);
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

test('REFEPS parser permite buscar por DNI sin perder la matrícula del resultado', () => {
  const provider = new RefepsPublicProvider();
  const result = provider.parseHtml(fixture('professional-active.html'), { searchBy: 'dni', value: '12345678' });
  assert.equal(result.found, true);
  assert.equal(result.results[0].dni, '12.345.678');
  assert.equal(result.results[0].matricula, '12345');
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

test('verificacion profesional rechaza matricula menor a 4 digitos antes de REFEPS', async () => {
  const service = new ValidacionProfesionalServiceClass();
  let refepsCalled = false;
  service.DniExtractionService = { extractAsync: async () => ({ success: true }) };
  service.RefepsProvider = { buscarPorMatricula: async () => { refepsCalled = true; } };

  await assert.rejects(
    () => service.verifyIdentityDataAsync({
      imageBuffer: Buffer.from('dni'),
      matricula: '123',
      declaredIdentity: { nombre: 'Juan', apellido: 'Perez' },
    }),
    error => error.statusCode === 400 && error.code === 'INVALID_LICENSE',
  );
  assert.equal(refepsCalled, false);
});

test('verificacion profesional no consulta REFEPS si la imagen no parece DNI', async () => {
  const service = new ValidacionProfesionalServiceClass();
  let refepsCalled = false;
  service.DniExtractionService = {
    extractAsync: async () => ({ success: false, reason: 'NOT_ARGENTINE_DNI', confidence: 90 }),
  };
  service.RefepsProvider = { buscarPorMatricula: async () => { refepsCalled = true; } };

  const result = await service.verifyIdentityDataAsync({
    imageBuffer: Buffer.from('flower'),
    matricula: '1234',
    declaredIdentity: { nombre: 'Juan', apellido: 'Perez' },
  });
  assert.equal(result.status, 'MANUAL_REVIEW');
  assert.equal(result.reason, 'NOT_ARGENTINE_DNI');
  assert.equal(refepsCalled, false);
});

test('verificacion profesional devuelve DATA_MISMATCH si el DNI es de otra persona', async () => {
  const service = new ValidacionProfesionalServiceClass();
  service.DniExtractionService = {
    extractAsync: async () => ({ success: true, nombre: 'Maria', apellido: 'Gonzalez', dni: '12345678', fechaVencimiento: '2035-12-31', confidence: 90 }),
  };

  const result = await service.verifyIdentityDataAsync({
    imageBuffer: Buffer.from('dni'),
    matricula: '1234',
    declaredIdentity: { nombre: 'Juan', apellido: 'Perez' },
  });
  assert.equal(result.status, 'DATA_MISMATCH');
});

test('verificacion profesional devuelve VERIFIED si DNI, identidad y REFEPS coinciden', async () => {
  const service = new ValidacionProfesionalServiceClass();
  service.DniExtractionService = {
    extractAsync: async () => ({ success: true, nombre: 'Juan', apellido: 'Perez', dni: '12345678', fechaVencimiento: '2035-12-31', confidence: 90 }),
  };
  service.RefepsProvider = {
    buscarPorMatricula: async () => ({
      found: true,
      ambiguous: false,
      results: [{ nombre: 'Juan', apellido: 'Perez', dni: '12345678', matricula: '1234', habilitado: true }],
    }),
  };

  const result = await service.verifyIdentityDataAsync({
    imageBuffer: Buffer.from('dni'),
    matricula: '1234',
    declaredIdentity: { nombre: 'Juan', apellido: 'Perez' },
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.verified, true);
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
