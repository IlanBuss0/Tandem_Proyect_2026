import ConfiguracionUsuarioService from '../../services/ConfiguracionUsuarioService.js';

// Unica responsabilidad: llevar la cuenta de que estilo visual
// (ilustracion, realista, emoji, alto-contraste, etc. — ver visual-styles.js)
// elige un usuario cuando resuelve un pictograma a mano, y devolver el que
// mas eligio hasta ahora. No sabe nada de matching ni de catalogo.
//
// Por que cuenta acumulada y no "el ultimo elegido": una eleccion aislada
// puede ser porque el catalogo no tenia otra opcion ese dia, no porque el
// usuario prefiera ese estilo. La tendencia a lo largo de varias elecciones
// es una senial mas confiable.
const STYLE_PREFERENCE_KEY = 'pictogramas.estilo-preferido';

function parseCounts(valor) {
  if (!valor) return {};
  try {
    const parsed = JSON.parse(valor);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export default class StylePreferenceStore {
  constructor() {
    this.ConfiguracionUsuarioService = new ConfiguracionUsuarioService();
  }

  /** Estilo mas elegido hasta ahora, o null si el usuario todavia no eligio ninguno a mano. */
  async getPreferredStyleAsync(userId) {
    if (!userId) return null;
    const config = await this.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync(userId, STYLE_PREFERENCE_KEY);
    const counts = parseCounts(config?.valor);
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  async registerChoiceAsync(userId, style) {
    if (!userId || !style) return;

    const existing = await this.ConfiguracionUsuarioService.getByUsuarioAndClaveAsync(userId, STYLE_PREFERENCE_KEY);
    const counts = parseCounts(existing?.valor);
    counts[style] = (counts[style] || 0) + 1;

    const valor = JSON.stringify(counts);
    const fecha_modificacion = new Date().toISOString();

    if (existing) {
      await this.ConfiguracionUsuarioService.updateAsync({
        id: existing.id, id_usuario: userId, clave: STYLE_PREFERENCE_KEY, valor, fecha_modificacion,
      });
    } else {
      await this.ConfiguracionUsuarioService.createAsync({
        id_usuario: userId, clave: STYLE_PREFERENCE_KEY, valor, fecha_modificacion,
      });
    }
  }
}

export { STYLE_PREFERENCE_KEY };
