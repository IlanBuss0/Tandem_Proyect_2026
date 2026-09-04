import axios from 'axios';
import * as cheerio from 'cheerio';

const DEFAULT_URL = 'https://www.argentina.gob.ar/salud/buscador-nacional-de-profesionales-de-la-salud';

export class RefepsProviderError extends Error {
  constructor(message, code = 'REFEPS_ERROR') {
    super(message);
    this.name = 'RefepsProviderError';
    this.code = code;
  }
}

export default class RefepsPublicProvider {
  constructor({ http = axios, url = DEFAULT_URL, timeout = 8000, retries = 1 } = {}) {
    this.http = http;
    this.url = url;
    this.timeout = timeout;
    this.retries = retries;
  }

  buscarPorMatricula = async (numeroMatricula) => {
    return this.buscarPorCriterio({ searchBy: 'matricula', matricula: numeroMatricula });
  };

  buscarPorDni = async (dni) => {
    return this.buscarPorCriterio({ searchBy: 'dni', dni });
  };

  buscarPorCriterio = async ({ searchBy, matricula = '', dni = '' }) => {
    console.info('[ProfessionalVerification] REFEPS request started');
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        return await this.request({ searchBy, matricula, dni });
      } catch (error) {
        lastError = error;
        if (attempt < this.retries) continue;
      }
    }
    console.error('[ProfessionalVerification] REFEPS request failed:', lastError?.code || lastError?.message);
    throw lastError instanceof RefepsProviderError ? lastError : new RefepsProviderError('No se pudo consultar REFEPS');
  };

  async request({ searchBy, matricula, dni }) {
    const getResponse = await this.http.get(this.url, { timeout: this.timeout, validateStatus: status => status === 200 });
    const $ = cheerio.load(getResponse.data);
    const formBuildId = $('#consulta-profesionales-form input[name="form_build_id"]').val()
      || $('input[name="form_build_id"]').val();
    if (!formBuildId) throw new RefepsProviderError('Estructura inicial inesperada', 'STRUCTURE_MISMATCH');

    const cookie = (getResponse.headers?.['set-cookie'] || []).map(value => value.split(';')[0]).join('; ');
    const body = new URLSearchParams({
      searchBy, dni: String(dni), matricula: String(matricula), apellidonombre: '',
      op: 'Consultar', form_build_id: String(formBuildId), form_id: 'argobar_consulta_refeps_profesionales', tarro_de_miel: '',
    });
    const response = await this.http.post(this.url, body.toString(), {
      timeout: this.timeout,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
      validateStatus: status => status === 200,
    });
    return this.parseHtml(response.data, { searchBy, value: searchBy === 'dni' ? dni : matricula });
  }

  parseHtml(html, criterio) {
    criterio = typeof criterio === 'string' ? { searchBy: 'matricula', value: criterio } : criterio;
    const $ = cheerio.load(String(html ?? ''));
    const scripts = $('script').map((_index, element) => $(element).html() || '').get();
    const script = scripts.find(value => value.includes('Drupal.settings.refepsProfesionales.allItems'));

    if (!script) {
      if (/no se (?:encontraron|encontró)|sin resultados/i.test($.text())) return { found: false, results: [] };
      console.error('[ProfessionalVerification] REFEPS parser structure mismatch');
      throw new RefepsProviderError('Estructura de resultados inesperada', 'STRUCTURE_MISMATCH');
    }

    const json = this.extractAllItemsJson(script);
    if (!json) throw new RefepsProviderError('JSON de resultados ausente', 'STRUCTURE_MISMATCH');

    let items;
    try { items = JSON.parse(json); } catch { throw new RefepsProviderError('JSON de resultados invalido', 'STRUCTURE_MISMATCH'); }
    const target = String(criterio?.value ?? '').trim();
    const matches = value => criterio?.searchBy === 'dni'
      ? String(value || '').replace(/\D/g, '') === target.replace(/\D/g, '')
      : String(value || '').trim() === target;
    if (!Array.isArray(items)) throw new RefepsProviderError('JSON de resultados invalido', 'STRUCTURE_MISMATCH');

    const results = items.flatMap(item => (item.profesiones || []).flatMap(profesion =>
      (profesion.matriculas || []).filter(record => criterio?.searchBy === 'dni' ? matches(item.nroDoc) : matches(record.matricula)).map(record => ({
        nombre: item.nombre || null,
        apellido: item.apellido || null,
        dni: item.nroDoc || null,
        matricula: record.matricula,
        profesion: profesion.profesionReferencia || null,
        jurisdiccion: record.provinciaMatricula || null,
        habilitado: String(record.situacionMatricula).toLowerCase() === 'habilitado',
        estado: record.situacionMatricula || null,
        especialidades: profesion.refepsEspecialidad ? [profesion.refepsEspecialidad] : [],
      }))));
    return { found: results.length > 0, ambiguous: results.length > 1, results };
  }

  extractAllItemsJson(script) {
    const marker = 'Drupal.settings.refepsProfesionales.allItems';
    const markerIndex = script.indexOf(marker);
    if (markerIndex < 0) return null;

    const equalsIndex = script.indexOf('=', markerIndex);
    const arrayStart = script.indexOf('[', equalsIndex);
    if (equalsIndex < 0 || arrayStart < 0) return null;

    let depth = 0;
    let inString = false;
    let quote = null;
    let escaped = false;
    for (let index = arrayStart; index < script.length; index += 1) {
      const char = script[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === quote) {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        inString = true;
        quote = char;
        continue;
      }
      if (char === '[') depth += 1;
      if (char === ']') {
        depth -= 1;
        if (depth === 0) return script.slice(arrayStart, index + 1);
      }
    }
    return null;
  }
}
