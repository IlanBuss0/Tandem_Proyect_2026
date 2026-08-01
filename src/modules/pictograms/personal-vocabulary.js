import ConfiguracionUsuarioService from '../../services/ConfiguracionUsuarioService.js';
import { normalizeSearchText } from '../../services/PictogramaService.js';

// Unica responsabilidad: leer y escribir el "vocabulario personal" de un
// usuario — que pictograma eligio a mano para un texto de paso exacto.
// No sabe nada de Groq, scoring ni orquestacion (eso es
// PictogramizationService). Reusa configuraciones_usuarios (mismo patron
// que 'routines.mi-dia'), clave por usuario, valor un JSON { textoNormalizado: pictogramId }.
//
// Se graba SOLO en la eleccion manual (senial fuerte e inequivoca). No se
// graba en cada match automatico de "alta" confianza: reforzar automaticamente
// un match que el motor ya elegio no aporta nada nuevo y arriesga fijar un
// error si el motor se equivoco.
const VOCABULARY_KEY = 'pictogramas.vocabulario';

function parseVocabulario(valor) {
  if (!valor) return {};
  try {
    const parsed = JSON.parse(valor);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export default class PersonalVocabularyStore {
  constructor() {
    this.ConfiguracionUsuarioService = new ConfiguracionUsuarioService();
  }

  async getAsync(userId) {
    if (!userId) return {};
    const config = await this.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync(userId, VOCABULARY_KEY);
    return parseVocabulario(config?.valor);
  }

  async rememberAsync(userId, text, pictogramId) {
    if (!userId || !text || !pictogramId) return;
    const normalizedText = normalizeSearchText(text);
    if (!normalizedText) return;

    const existing = await this.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync(userId, VOCABULARY_KEY);
    const vocabulario = parseVocabulario(existing?.valor);
    vocabulario[normalizedText] = String(pictogramId);

    const valor = JSON.stringify(vocabulario);
    const fecha_modificacion = new Date().toISOString();

    if (existing) {
      await this.ConfiguracionUsuarioService.updateAsync({
        id: existing.id, id_usuario: userId, clave: VOCABULARY_KEY, valor, fecha_modificacion,
      });
    } else {
      await this.ConfiguracionUsuarioService.createAsync({
        id_usuario: userId, clave: VOCABULARY_KEY, valor, fecha_modificacion,
      });
    }
  }
}

export { VOCABULARY_KEY };
