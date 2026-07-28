// Tabler Icons — MIT, +6000 iconos SVG. No es una libreria clinica de CAA:
// se usa como fallback para conceptos funcionales/de interfaz (calendario,
// camara, ubicacion, configuracion) que no necesitan una escena ilustrada.
//
// Implementacion liviana: en vez de instalar el paquete npm completo (que
// solo trae los SVG, sin metadata de busqueda en espanol), se sirve un
// catalogo curado de iconos de interfaz mapeados a conceptos en espanol, y
// el asset se resuelve contra el CDN publico de jsDelivr (mismo contenido
// MIT que el paquete npm @tabler/icons, sin necesidad de descargarlo ni
// mantenerlo localmente para esta primera version).
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/outline';
const LICENSE_URL = 'https://github.com/tabler/tabler-icons/blob/main/LICENSE';

// slug de Tabler -> { nombre en espanol, categoria Tandem, sinonimos }
const CURATED_ICONS = {
  calendar: { name: 'calendario', category: 'tiempo', tags: ['agenda', 'fecha'] },
  camera: { name: 'camara', category: 'tecnologia', tags: ['foto'] },
  device_desktop: { name: 'computadora', category: 'tecnologia', tags: ['pc', 'ordenador'] },
  map_pin: { name: 'ubicacion', category: 'lugares', tags: ['mapa', 'direccion'] },
  settings: { name: 'configuracion', category: 'tecnologia', tags: ['ajustes'] },
  download: { name: 'descargar', category: 'tecnologia', tags: [] },
  share: { name: 'compartir', category: 'comunicacion', tags: [] },
  wifi: { name: 'wifi', category: 'tecnologia', tags: ['internet', 'conexion'] },
  message: { name: 'mensajes', category: 'comunicacion', tags: ['chat'] },
  lock: { name: 'bloquear', category: 'tecnologia', tags: ['candado', 'seguridad'] },
  cash: { name: 'dinero', category: 'compras y dinero', tags: ['plata', 'efectivo'] },
  bell: { name: 'notificaciones', category: 'comunicacion', tags: ['alerta', 'aviso'] },
  clock: { name: 'reloj', category: 'tiempo', tags: ['hora'] },
  bus: { name: 'colectivo', category: 'transporte', tags: ['autobus', 'bondi'] },
  home: { name: 'casa', category: 'casa', tags: ['hogar'] },
  user: { name: 'persona', category: 'personas', tags: ['usuario', 'perfil'] },
  phone: { name: 'telefono', category: 'comunicacion', tags: ['celular'] },
  search: { name: 'buscar', category: 'tecnologia', tags: ['lupa'] },
  heart: { name: 'favorito', category: 'conceptos', tags: ['me gusta', 'corazon'] },
  check: { name: 'listo', category: 'conceptos', tags: ['hecho', 'confirmar'] },
};

export default class TablerProvider {
  key = 'TABLER';
  commercialUseAllowed = true;
  licenseCode = 'MIT';

  buildImageUrl(slug) {
    return `${CDN_BASE}/${slug}.svg`;
  }

  normalizeIcon(slug, meta, language) {
    return {
      id: `tabler:${slug}`,
      arasaacId: null,
      name: meta.name,
      emoji: '',
      imageUrl: this.buildImageUrl(slug),
      downloadUrl: this.buildImageUrl(slug),
      category: meta.category,
      tags: meta.tags,
      language,
      source: this.key,
      author: 'Pawel Kuna y colaboradores (Tabler Icons)',
      license: this.licenseCode,
      licenseCode: this.licenseCode,
      licenseVersion: null,
      licenseUrl: LICENSE_URL,
      attributionText: 'Tabler Icons, copyright Pawel Kuna y colaboradores. Usados bajo licencia MIT.',
      sourceUrl: 'https://tabler.io/icons',
      commercialUseAllowed: this.commercialUseAllowed,
      shareAlikeRequired: false,
    };
  }

  async search({ language, text, limit = 24 }) {
    const query = String(text || '').trim().toLowerCase();
    if (!query) return [];

    return Object.entries(CURATED_ICONS)
      .filter(([slug, meta]) =>
        meta.name.includes(query) || slug.includes(query) || meta.tags.some((tag) => tag.includes(query)),
      )
      .slice(0, limit)
      .map(([slug, meta]) => this.normalizeIcon(slug, meta, language));
  }

  async getById({ language, id }) {
    const slug = String(id || '').replace(/^tabler:/, '');
    const meta = CURATED_ICONS[slug];
    return meta ? this.normalizeIcon(slug, meta, language) : null;
  }

  async syncCatalog({ language }) {
    return Object.entries(CURATED_ICONS).map(([slug, meta]) => this.normalizeIcon(slug, meta, language));
  }
}
