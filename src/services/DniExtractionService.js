import { recognize } from 'tesseract.js';
import { normalizeDocument } from '../modules/professional-verification/name-normalization.js';

const MIN_CONFIDENCE = 55;

export default class DniExtractionService {
  constructor(ocr = recognize) {
    this.ocr = ocr;
  }

  extractAsync = async (imageBuffer) => {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      return { success: false, reason: 'INVALID_IMAGE', confidence: 0 };
    }

    try {
      const { data = {} } = await this.ocr(imageBuffer, 'spa', { logger: () => {} });
      return this.parseText(data.text, data.confidence);
    } catch (error) {
      console.error('[ProfessionalVerification] DNI OCR failed:', error.message);
      return { success: false, reason: 'OCR_ERROR', confidence: 0 };
    }
  };

  parseText(text, confidence = 0) {
    const normalizedText = String(text ?? '').replace(/\r/g, '');
    const field = label => normalizedText.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:\\-]?\\s*([^\\n]+)`, 'im'))?.[1]?.trim();
    const apellido = field('APELLIDO(?:S)?|SURNAME');
    const nombre = field('NOMBRE(?:S)?|GIVEN NAMES?');
    const dniMatch = normalizedText.match(/(?:DNI|DOCUMENTO|N[ÚU]MERO)\s*[:\-]?\s*(\d[\d.\s]{6,10}\d)/i)
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
}
