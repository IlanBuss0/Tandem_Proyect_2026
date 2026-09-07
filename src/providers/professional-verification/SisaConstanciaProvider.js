import axios from 'axios';

const BASE = 'https://sisa.msal.gov.ar/sisa/sisa/';
// Public GWT serialization policies observed on SISA. A deployment change must fail closed.
const PERMUTATION = '8B03142DA3FAC42DCB6FAED193676698';
const LIST_POLICY = '5CFBDB55F3DE4A47FE42E765E5AA02D3';
const FILE_POLICY = '00B5D05471754697AC496DFE46C3FD7A';
const CONSTANCIA_POLICY = '4F92D8B8FCC7057C86233CBF0B7ADDB3';
const failure = () => Object.assign(new Error('No pudimos obtener la constancia oficial. Intentá nuevamente.'), { code: 'CONSTANCIA_UNAVAILABLE' });

export function parseGwtResponse(value) {
  if (typeof value !== 'string' || !value.startsWith('//OK[')) throw failure();
  let data;
  try { data = JSON.parse(value.slice(4)); } catch { throw failure(); }
  const strings = data.at(-3);
  if (data.at(-1) !== 7 || !Array.isArray(strings) || !strings.every(item => typeof item === 'string')) throw failure();
  return { values: data.slice(0, -3).reverse(), strings };
}

function encodeLong(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_';
  let number = BigInt(value); let encoded = '';
  do { encoded = alphabet[Number(number & 63n)] + encoded; number >>= 6n; } while (number);
  return encoded;
}

export default class SisaConstanciaProvider {
  constructor({ http = axios, timeout = 15000 } = {}) {
    this.http = http;
    this.timeout = timeout;
  }

  async downloadAsync(dni) {
    if (!/^\d{7,8}$/.test(dni)) throw failure();
    // An isolated cookie jar per operation prevents mixing two professionals' sessions.
    const cookies = new Map();
    const request = async (url, data, responseType = 'text') => {
      const response = await this.http.request({
        url, method: data === undefined ? 'GET' : 'POST', data, responseType,
        timeout: this.timeout, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024,
        headers: {
          'Content-Type': 'text/x-gwt-rpc; charset=UTF-8',
          'X-GWT-Module-Base': BASE, 'X-GWT-Permutation': PERMUTATION,
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        },
      });
      for (const cookie of response.headers?.['set-cookie'] || []) {
        const pair = cookie.split(';')[0]; const equals = pair.indexOf('=');
        if (equals > 0) cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
      }
      return response.data;
    };
    try {
      await request('https://sisa.msal.gov.ar/sisa/');
      parseGwtResponse(await request(`${BASE}dispatch`, `7|0|6|${BASE}|B6CF741E53EA2F2E98CA7D2B1E96E53D|net.customware.gwt.dispatch.client.standard.StandardDispatchService|execute|net.customware.gwt.dispatch.shared.Action|ar.gob.msal.sisa.shared.rpc.action.LoadEnvironmentAction/1047162293|1|2|3|4|1|5|6|`));
      const page = parseGwtResponse(await request(`${BASE}service/list`, `7|0|13|${BASE}|${LIST_POLICY}|ar.gob.msal.sisa.client.commons.components.lista.service.ListService|getPage|java.lang.Integer/3438268394|java.util.List|Z|ar.gob.msal.sisa.shared.model.list.ComplexFilter/30068811|java.util.ArrayList/4159755760|ar.gob.msal.sisa.client.commons.components.lista.simple.SearchFilter/1978531670|21003|ar.gob.msal.sisa.client.entitys.list.Filter$OPERATION/3408968308|${dni}|1|2|3|4|10|5|5|5|6|6|5|7|5|6|8|5|80|5|1|-2|9|1|10|11|12|0|0|0|13|0|9|0|0|1|5|25|0|0|`));
      // Public PageList v1275528364: one Row, columns ID, code, document type, DNI.
      if (page.strings[0] !== 'ar.gob.msal.sisa.client.entitys.list.PageList/1275528364'
        || page.strings[3] !== 'ar.gob.msal.sisa.client.entitys.list.Row/2482602909'
        || page.values[10] !== 1 || page.strings[9] !== 'DNI' || page.strings[10] !== dni
        || !/^\d{1,12}$/.test(page.strings[7])) throw failure();
      const id = page.strings[7];
      parseGwtResponse(await request(`${BASE}service/profesionalFile`, `7|0|6|${BASE}|${FILE_POLICY}|ar.gob.msal.sisa.client.profesion.ficha.service.ProfesionalFileService|loadFile|java.lang.String/2004016611|${id}|1|2|3|4|1|5|6|`));
      const generated = parseGwtResponse(await request(`${BASE}service/constanciasService`, `7|0|6|${BASE}|${CONSTANCIA_POLICY}|ar.gob.msal.sisa.client.gestiondeconstancias.service.ConstanciasService|createConstancia|java.lang.Long/4227064769|java.lang.String/2004016611|1|2|3|4|3|5|5|6|5|${encodeLong(id)}|5|B|0|`));
      const location = generated.strings[0];
      if (generated.strings.length !== 1 || !/^\/reg_constancia\/\d+\/\d+\/SISA_REFEPS001_[A-Z0-9]+\.pdf$/.test(location)) throw failure();
      const pdf = Buffer.from(await request(`${BASE}service/FileDownloadServlet?${new URLSearchParams({ location })}`, undefined, 'arraybuffer'));
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw failure();
      return pdf;
    } catch { throw failure(); }
    finally { cookies.clear(); }
  }
}
