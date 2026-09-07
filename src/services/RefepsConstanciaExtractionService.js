import { PDFParse } from 'pdf-parse';
import { normalizeDocument, normalizeIdentityText } from '../modules/professional-verification/name-normalization.js';

const invalid = () => Object.assign(new Error('La constancia no contiene datos profesionales verificables.'), { code: 'INVALID_CONSTANCIA' });
const clean = value => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return !text || /\*sin\s*dato\*/i.test(text.replace(/\s/g, '')) ? null : text;
};

export function dniFromCuil(value) {
  const input = String(value ?? '').trim();
  if (!/^(?:\d{11}|\d{2}-\d{8}-\d)$/.test(input)) return null;
  const digits = input.replace(/-/g, '');
  if (!/^(20|23|24|27)/.test(digits)) return null;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const remainder = 11 - weights.reduce((sum, weight, index) => sum + weight * Number(digits[index]), 0) % 11;
  const check = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  const dni = normalizeDocument(digits.slice(2, 10));
  return check === Number(digits[10]) && /^\d{7,8}$/.test(dni) ? dni : null;
}

export default class RefepsConstanciaExtractionService {
  async extractAsync(buffer, selection) {
    const parser = new PDFParse({ data: buffer });
    try {
      const { text } = await parser.getText();
      const { pages } = await parser.getTable();
      return this.parse(text, pages.flatMap(page => page.tables), selection);
    } catch (error) {
      if (error.code === 'INVALID_CONSTANCIA') throw error;
      throw invalid();
    } finally { await parser.destroy(); }
  }

  parse(text, tables, selection) {
    const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim());
    const field = label => clean(lines.find(line => line.startsWith(`${label} `))?.slice(label.length));
    if (!text.includes('Red Federal de Registros de Profesionales de la Salud') || !text.includes('Ficha de Profesional')) throw invalid();
    const identity = field('Apellido y Nombre')?.match(/^([^,]+),\s*(.+)$/);
    const document = field('Documento')?.match(/^DNI\s+(\d[\d.]*)$/)?.[1];
    const cuil = field('CUIL/CUIT');
    const fromCuil = cuil ? dniFromCuil(cuil) : null;
    const dni = normalizeDocument(document) || fromCuil;
    if (!identity || !/^\d{7,8}$/.test(dni || '') || (cuil && (!fromCuil || dni !== fromCuil))) throw invalid();

    const compact = value => normalizeIdentityText(value).replace(/\s/g, '');
    const licenseTable = tables.find(table => table[0]?.some(cell => compact(cell) === 'matricula')
      && table[0]?.some(cell => compact(cell) === 'situacion'));
    if (!licenseTable) throw invalid();
    const headers = licenseTable[0].map(compact);
    const column = name => headers.indexOf(name);
    const rows = licenseTable.slice(1).filter(row => clean(row[column('matricula')]) === String(selection.matricula)
      && compact(row[column('provincia')]) === compact(selection.jurisdiccion));
    if (rows.length !== 1) throw invalid();
    const row = rows[0];
    const summary = [...text.matchAll(/([^\n]+)\nMatricula:\s*(\d+)\n([^\n]+)/g)]
      .find(match => match[2] === String(selection.matricula) && compact(match[3]).endsWith(compact(selection.jurisdiccion)));
    if (!summary) throw invalid();
    const formacion = tables.filter(table => table[0]?.includes('Título'))
      .flatMap(table => table.slice(1).map(cells => Object.fromEntries(table[0].map((header, index) => [clean(header), clean(cells[index])]))));
    const specialityTables = tables.filter(table => table[0]?.some(cell => /especialidad/i.test(cell)));
    const especialidades = specialityTables.flatMap(table => {
      const index = table[0].findIndex(cell => /especialidad/i.test(cell));
      return table.slice(1).map(cells => clean(cells[index])).filter(Boolean);
    });
    const habilitado = compact(row[column('situacion')]) === 'habilitado' && field('Activo') === 'SI';
    return {
      nombre: clean(identity[2]), apellido: clean(identity[1]), dni, cuil,
      matricula: String(selection.matricula), jurisdiccion: clean(selection.jurisdiccion),
      profesion: clean(summary[1]), estado: habilitado ? 'Habilitado' : 'No habilitado', habilitado,
      especialidades, formacion, fechaNacimiento: field('Fecha de Nacimiento'),
      sexo: field('Sexo'), nacionalidad: field('Nacionalidad'), paisNacimiento: field('País de Nacimiento'),
      codigo: clean(lines[lines.indexOf('Código del profesional') + 1]),
      certificacion: field('Número de certificación'), fechaCertificacion: field('Fecha de certificación'),
      fechaEmision: field('Fecha de emisión'), source: 'SISA_CONSTANCIA',
    };
  }
}
