import tesseract from 'tesseract.js';
import { normalizeDocument } from '../modules/professional-verification/name-normalization.js';

const MIN_CONFIDENCE = 55;
const DEFAULT_TIMEOUT_MS = 20000;
const MIN_DNI_STRUCTURE_SCORE = 4;

export default class DniExtractionService {
  constructor(ocr = tesseract.recognize, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.ocr = ocr;
    this.timeoutMs = timeoutMs;
  }

  extractAsync = async (imageBuffer, { expiryOnly = false } = {}) => {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      return { success: false, reason: 'INVALID_IMAGE', confidence: 0 };
    }

    try {
      const { data = {} } = await this.withTimeout(
        this.ocr(imageBuffer, 'spa', { logger: () => {} }),
        this.timeoutMs,
      );
      if (!expiryOnly) return this.parseText(data.text, data.confidence);
      const fechaVencimiento = this.dateField(data.text, ['FECHA DE VENCIMIENTO', 'DATE OF EXPIRY', 'VENCIMIENTO']);
      const confidence = Number(data.confidence) || 0;
      return {
        success: Boolean(fechaVencimiento && confidence >= MIN_CONFIDENCE),
        fechaVencimiento, confidence,
        reason: confidence < MIN_CONFIDENCE ? 'LOW_CONFIDENCE' : fechaVencimiento ? null : 'UNVERIFIABLE_EXPIRY',
      };
    } catch (error) {
      const reason = error.message === 'OCR_TIMEOUT' ? 'OCR_TIMEOUT' : 'OCR_ERROR';
      console.error('[ProfessionalVerification] DNI OCR failed:', reason);
      return { success: false, reason, confidence: 0 };
    }
  };

  parsePdf417(raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return { success: false, reason: 'INVALID_PDF417_FORMAT' };
    // Keep empty positions: the ninth field may be empty. See docs/professional-verification.md.
    const fields = raw.trim().split('@').map(value => value.trim());
    const modern = fields.length === 8 || fields.length === 9;
    if (!modern && fields.length !== 15) return { success: false, reason: 'INVALID_PDF417_FORMAT' };
    const [apellido, nombre, sexo, document, birth] = modern
      ? [fields[1], fields[2], fields[3], fields[4], fields[6]]
      : [fields[4], fields[5], fields[8], fields[1], fields[7]];
    const validDocument = /^(?:\d{7,8}|\d{1,2}\.\d{3}\.\d{3})$/.test(document);
    const dni = normalizeDocument(document);
    const fechaNacimiento = this.parseDate(birth);
    if (!validDocument || !/^\d{7,8}$/.test(dni) || !this.validName(nombre) || !this.validName(apellido)
      || !/^[FMX]$/.test(sexo) || !fechaNacimiento || fechaNacimiento > new Date().toISOString().slice(0, 10)) {
      return { success: false, reason: 'INVALID_DNI_DATA' };
    }
    return {
      success: true, reason: null, source: 'PDF417', nombre, apellido, dni, sexo,
      nombreCompleto: `${nombre} ${apellido}`, fechaNacimiento,
      // Neither documented layout identifies an expiry field.
      fechaVencimiento: null, ejemplar: modern ? fields[5] || null : null,
      confidence: 100, detectedFields: ['nombre', 'apellido', 'dni', 'sexo', 'fechaNacimiento'],
    };
  }

  validName(value) {
    return typeof value === 'string' && value.length <= 150
      && /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(value.trim().replace(/\s+/g, ' '));
  }

  parseText(text, confidence = 0) {
    const normalizedText = String(text ?? '').replace(/\r/g, '');
    const apellido = this.fieldValue(normalizedText, ['APELLIDO', 'APELLIDOS', 'SURNAME']);
    const nombre = this.fieldValue(normalizedText, ['NOMBRE', 'NOMBRES', 'GIVEN NAME', 'GIVEN NAMES']);
    const dniMatch = normalizedText.match(/(?:DNI|DOCUMENTO|N(?:U|\u00DA)MERO|NRO\.?)\s*[:\-]?\s*(\d[\d.\s]{5,10}\d)/i)
      ?? normalizedText.match(/\b(\d{7,8})\b/);
    const dni = normalizeDocument(dniMatch?.[1]);
    const numericConfidence = Number(confidence) || 0;
    const structure = this.detectDniStructure(normalizedText);
    const fechaVencimiento = this.dateField(normalizedText, ['FECHA DE VENCIMIENTO', 'DATE OF EXPIRY', 'VENCIMIENTO']);
    const fechaNacimiento = this.dateField(normalizedText, ['FECHA DE NACIMIENTO', 'DATE OF BIRTH', 'NACIMIENTO']);
    const fechaEmision = this.dateField(normalizedText, ['FECHA DE EMISIÓN', 'FECHA DE EMISION', 'DATE OF ISSUE', 'EMISIÓN', 'EMISION']);
    const hasIdentityFields = Boolean(this.validName(nombre) && this.validName(apellido) && /^\d{7,8}$/.test(dni) && fechaVencimiento);
    const success = Boolean(hasIdentityFields && structure.compatible && numericConfidence >= MIN_CONFIDENCE);

    return {
      success,
      nombre: nombre || null,
      apellido: apellido || null,
      dni: dni || null,
      nombreCompleto: [nombre, apellido].filter(Boolean).join(' ') || null,
      fechaVencimiento,
      fechaNacimiento,
      fechaEmision,
      confidence: numericConfidence,
      structureScore: structure.score,
      detectedFields: structure.fields,
      reason: success
        ? null
        : numericConfidence < MIN_CONFIDENCE
          ? 'LOW_CONFIDENCE'
          : !structure.compatible
            ? 'NOT_ARGENTINE_DNI'
            : !fechaVencimiento ? 'UNVERIFIABLE_EXPIRY' : 'MISSING_FIELDS',
    };
  }

  dateField(text, labels) {
    const labelPattern = labels.map(value => value.replace(/\s+/g, '\\s+')).join('|');
    const datePattern = '(\\d{1,2}(?:[\\/.\\-]\\d{1,2}[\\/.\\-]|\\s+[A-Z]{3,10}(?:\\s*/\\s*[A-Z]{3,10})?\\s+)\\d{4})';
    const pattern = new RegExp(`(?:${labelPattern})(?:\\s*/\\s*(?:DATE OF EXPIRY|DATE OF BIRTH|DATE OF ISSUE))?\\s*[:\\-]?\\s*${datePattern}`, 'gi');
    const dates = [...String(text ?? '').matchAll(pattern)].map(match => this.parseDate(match[1]));
    return dates.length && dates.every(date => date && date === dates[0]) ? dates[0] : null;
  }

  parseDate(value) {
    const text = String(value ?? '').trim().toUpperCase();
    const numeric = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    const words = text.match(/^(\d{1,2})\s+([A-Z]{3,10})(?:\s*\/\s*([A-Z]{3,10}))?\s+(\d{4})$/);
    const months = ['ENE JAN', 'FEB', 'MAR', 'ABR APR', 'MAY', 'JUN', 'JUL', 'AGO AUG', 'SEP SET', 'OCT', 'NOV', 'DIC DEC'];
    const monthNumber = name => months.findIndex(group => group.split(' ').includes(name.slice(0, 3))) + 1;
    if (!numeric && !words) return null;
    const [day, month, year] = numeric ? numeric.slice(1).map(Number)
      : [Number(words[1]), monthNumber(words[2]), Number(words[4])];
    if (words?.[3] && monthNumber(words[3]) !== month) return null;
    if (year < 1900 || year > 2199 || month < 1 || month > 12) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  detectDniStructure(text) {
    const checks = {
      argentina: /REPUBLICA\s+ARGENTINA|REP[UÚ]BLICA\s+ARGENTINA/i.test(text),
      dniLabel: /\bDNI\b|DOCUMENTO\s+NACIONAL\s+DE\s+IDENTIDAD/i.test(text),
      surnameLabel: /APELLIDOS?|SURNAME/i.test(text),
      nameLabel: /NOMBRES?|GIVEN\s+NAMES?/i.test(text),
      birthDate: /FECHA\s+DE\s+NACIMIENTO|DATE\s+OF\s+BIRTH|NACIMIENTO/i.test(text),
      nationality: /NACIONALIDAD|NATIONALITY/i.test(text),
      sex: /\bSEXO\b|\bSEX\b/i.test(text),
      issueOrExpiry: /FECHA\s+DE\s+(EMISI[OÓ]N|VENCIMIENTO)|DATE\s+OF\s+(ISSUE|EXPIRY)/i.test(text),
      copyOrProcedure: /EJEMPLAR|TR[AÁ]MITE|NRO\.\s*TR[AÁ]MITE/i.test(text),
    };
    const fields = Object.entries(checks)
      .filter(([, detected]) => detected)
      .map(([field]) => field);
    const score = fields.length;
    return {
      score,
      fields,
      compatible: checks.dniLabel && checks.surnameLabel && checks.nameLabel && score >= MIN_DNI_STRUCTURE_SCORE,
    };
  }

  fieldValue(text, labels) {
    const lines = String(text ?? '').split('\n').map(line => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const label = labels.find(value => new RegExp(`\\b${value}\\b`, 'i').test(line));
      if (!label) continue;

      const afterLabel = line
        .replace(new RegExp(`^.*?\\b${label}\\b\\s*`, 'i'), '')
        .replace(/^\/\s*(SURNAME|GIVEN NAMES?)\s*/i, '')
        .replace(/^[:\-]\s*/, '')
        .trim();
      if (afterLabel && !this.looksLikeLabel(afterLabel)) return afterLabel;

      const next = lines[index + 1]?.trim();
      if (next && !this.looksLikeLabel(next)) return next;
    }
    return null;
  }

  looksLikeLabel(value) {
    return /^(APELLIDOS?|SURNAME|NOMBRES?|GIVEN NAMES?|DNI|DOCUMENTO|N(?:U|\u00DA)MERO|NRO\.?)\b/i.test(value);
  }

  withTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('OCR_TIMEOUT')), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
}
