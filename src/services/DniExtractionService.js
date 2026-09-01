import tesseract from 'tesseract.js';
import { normalizeDocument } from '../modules/professional-verification/name-normalization.js';

const MIN_CONFIDENCE = 55;
const DEFAULT_TIMEOUT_MS = 20000;

export default class DniExtractionService {
  constructor(ocr = tesseract.recognize, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.ocr = ocr;
    this.timeoutMs = timeoutMs;
  }

  extractAsync = async (imageBuffer) => {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      return { success: false, reason: 'INVALID_IMAGE', confidence: 0 };
    }

    try {
      const { data = {} } = await this.withTimeout(
        this.ocr(imageBuffer, 'spa', { logger: () => {} }),
        this.timeoutMs,
      );
      return this.parseText(data.text, data.confidence);
    } catch (error) {
      const reason = error.message === 'OCR_TIMEOUT' ? 'OCR_TIMEOUT' : 'OCR_ERROR';
      console.error('[ProfessionalVerification] DNI OCR failed:', reason);
      return { success: false, reason, confidence: 0 };
    }
  };

  parseText(text, confidence = 0) {
    const normalizedText = String(text ?? '').replace(/\r/g, '');
    const apellido = this.fieldValue(normalizedText, ['APELLIDO', 'APELLIDOS', 'SURNAME']);
    const nombre = this.fieldValue(normalizedText, ['NOMBRE', 'NOMBRES', 'GIVEN NAME', 'GIVEN NAMES']);
    const dniMatch = normalizedText.match(/(?:DNI|DOCUMENTO|N(?:U|\u00DA)MERO|NRO\.?)\s*[:\-]?\s*(\d[\d.\s]{5,10}\d)/i)
      ?? normalizedText.match(/\b(\d{7,8})\b/);
    const dni = normalizeDocument(dniMatch?.[1]);
    const numericConfidence = Number(confidence) || 0;
    const success = Boolean(nombre && apellido && /^\d{7,8}$/.test(dni) && numericConfidence >= MIN_CONFIDENCE);

    return {
      success,
      nombre: nombre || null,
      apellido: apellido || null,
      dni: dni || null,
      confidence: numericConfidence,
      reason: success ? null : numericConfidence < MIN_CONFIDENCE ? 'LOW_CONFIDENCE' : 'MISSING_FIELDS',
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
