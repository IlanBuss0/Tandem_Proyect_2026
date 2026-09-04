import axios from 'axios';
import https from 'node:https';
import RefepsPublicProvider from '../src/providers/professional-verification/RefepsPublicProvider.js';

const matricula = process.env.REFEPS_TEST_MATRICULA || process.argv[2];

if (!matricula) {
  console.error('Uso: REFEPS_TEST_MATRICULA=12345 npm run test:refeps-real');
  process.exit(1);
}

const allowInsecureTls = process.env.REFEPS_ALLOW_INSECURE_TLS === '1';
const http = allowInsecureTls
  ? axios.create({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) })
  : axios;

const provider = new RefepsPublicProvider({ http, timeout: 15000, retries: 0 });

try {
  const result = await provider.buscarPorMatricula(matricula);
  console.log(JSON.stringify({
    matricula,
    found: result.found,
    ambiguous: result.ambiguous,
    count: result.results.length,
    sample: result.results[0] ? {
      nombre: result.results[0].nombre,
      apellido: result.results[0].apellido,
      dni: result.results[0].dni ? 'present' : null,
      matricula: result.results[0].matricula,
      profesion: result.results[0].profesion,
      jurisdiccion: result.results[0].jurisdiccion,
      habilitado: result.results[0].habilitado,
      estado: result.results[0].estado,
      especialidades: result.results[0].especialidades,
    } : null,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    name: error.name,
    code: error.code,
    message: error.message,
  }, null, 2));
  process.exit(1);
}
