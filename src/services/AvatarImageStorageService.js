import axios from 'axios';
import { envConfig } from '../configs/env.config.js';

const DEFAULT_APPEARANCE = {
  genero: 'neutral',
  colorPiel: 'medio',
  formaCara: 'redonda',
  peinado: 'corto',
  colorPelo: 'castanio',
  expresion: 'feliz',
  velloFacial: 'ninguno',
  ropa: 'hoodie',
  disenoRopa: 'ninguno',
};

const DEFAULT_EQUIPPED = {
  ropa: 'shirt-blue',
  fondo: 'bg-default',
};

const SKIN_COLOR = {
  claro: 'ffdbb4',
  medio: 'd08b5b',
  oscuro: '614335',
};

const HAIR_STYLE = {
  corto: 'shortWaved',
  cortoLiso: 'shortFlat',
  mediaMelena: 'straight01',
  largo: 'straight02',
  rizado: 'curly',
  despeinado: 'shaggy',
  afro: 'fro',
  bun: 'bun',
  trenzas: 'frida',
  rapado: 'hat',
};

const GENDER_PRESET = {
  neutral: { eyebrows: 'default' },
  femenino: { eyebrows: 'raisedExcited' },
  masculino: { eyebrows: 'defaultNatural' },
  enojado: { eyebrows: 'angry' },
  triste: { eyebrows: 'sadConcerned' },
  arribaAbajo: { eyebrows: 'upDown' },
  ceno: { eyebrows: 'frownNatural' },
};

const FACE_PRESET = {
  redonda: { eyes: 'happy', nose: 'default' },
  ovalada: { eyes: 'default', nose: 'default' },
  cuadrada: { eyes: 'squint', nose: 'default' },
  cerrados: { eyes: 'closed', nose: 'default' },
  guino: { eyes: 'wink', nose: 'default' },
  corazones: { eyes: 'hearts', nose: 'default' },
  sorprendidos: { eyes: 'surprised', nose: 'default' },
  llanto: { eyes: 'cry', nose: 'default' },
};

const HAIR_COLOR = {
  castanio: '724133',
  negro: '2c1b18',
  rubio: 'd6b370',
  rojo: 'a55728',
};

const EXPRESSION = {
  feliz: 'smile',
  tranquilo: 'twinkle',
  concentrado: 'serious',
  preocupado: 'concerned',
  triste: 'sad',
  sorprendido: 'screamOpen',
  lengua: 'tongue',
  descreido: 'disbelief',
};

const FACIAL_HAIR = {
  ninguno: null,
  barbaSuave: 'beardLight',
  barbaPoblada: 'beardMajestic',
  barbaMedia: 'beardMedium',
  bigoteFino: 'moustacheFancy',
  bigoteLargo: 'moustacheMagnum',
};

const CLOTHING = {
  hoodie: 'hoodie',
  blazerCamisa: 'blazerAndShirt',
  blazerSueter: 'blazerAndSweater',
  cuelloSueter: 'collarAndSweater',
  remeraGrafica: 'graphicShirt',
  overall: 'overall',
  remeraCuelloRedondo: 'shirtCrewNeck',
  remeraEscote: 'shirtScoopNeck',
  remeraCuelloV: 'shirtVNeck',
};

const CLOTHING_GRAPHIC = {
  ninguno: null,
  murcielago: 'bat',
  oso: 'bear',
  pizza: 'pizza',
  calavera: 'skull',
  diamante: 'diamond',
  hola: 'hola',
  resist: 'resist',
};

const SHIRT_COLOR = {
  'shirt-blue': '65c9ff',
  'shirt-red': 'ff5c5c',
  'shirt-green': '3c4f5c',
  'shirt-purple': '9292ff',
  'shirt-rainbow': 'ffafb9',
};

const BACKGROUND_COLOR = {
  'bg-default': 'f6f7f9',
  'bg-stars': '262e57',
  'bg-beach': 'b6e3f4',
  'bg-forest': 'c0f2c7',
  'bg-space': '1b2440',
};

function parseAvatarJson(raw) {
  if (!raw) return { appearance: DEFAULT_APPEARANCE, equipped: DEFAULT_EQUIPPED };

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      appearance: {
        ...DEFAULT_APPEARANCE,
        ...(parsed?.appearance || parsed || {}),
      },
      equipped: {
        ...DEFAULT_EQUIPPED,
        ...(parsed?.equipped || {}),
      },
    };
  } catch {
    return { appearance: DEFAULT_APPEARANCE, equipped: DEFAULT_EQUIPPED };
  }
}

function buildDiceBearPngUrl(entity) {
  if (entity?.avatar_imagen_origen_url) return entity.avatar_imagen_origen_url;

  const { appearance, equipped } = parseAvatarJson(entity?.avatar_json);
  const options = {
    seed: `perteneciente-${entity?.id_perteneciente || entity?.id || 'avatar'}`,
    radius: '18',
    scale: '110',
    size: '512',
    backgroundType: 'solid',
    backgroundColor: BACKGROUND_COLOR[equipped.fondo || 'bg-default'] || BACKGROUND_COLOR['bg-default'],
    skinColor: SKIN_COLOR[appearance.colorPiel],
    top: HAIR_STYLE[appearance.peinado],
    hairColor: HAIR_COLOR[appearance.colorPelo],
    clothesColor: SHIRT_COLOR[equipped.ropa || 'shirt-blue'] || SHIRT_COLOR['shirt-blue'],
    clothing: CLOTHING[appearance.ropa],
    ...(CLOTHING_GRAPHIC[appearance.disenoRopa] && { clothingGraphic: CLOTHING_GRAPHIC[appearance.disenoRopa] }),
    accessoriesColor: '25557c',
    ...(FACIAL_HAIR[appearance.velloFacial] && { facialHair: FACIAL_HAIR[appearance.velloFacial] }),
    facialHairColor: HAIR_COLOR[appearance.colorPelo],
    ...(GENDER_PRESET[appearance.genero] || GENDER_PRESET.neutral),
    ...(FACE_PRESET[appearance.formaCara] || FACE_PRESET.redonda),
    mouth: EXPRESSION[appearance.expresion],
  };

  if (equipped.accesorio === 'acc-glasses') {
    options.accessories = 'prescription02';
  }

  return `${envConfig.dicebearAvatarPngBaseUrl}?${new URLSearchParams(options).toString()}`;
}

function isConfigured() {
  return Boolean(envConfig.supabaseUrl && envConfig.supabaseServiceRoleKey && envConfig.supabaseAvatarBucket);
}

function getPublicUrl(path) {
  return `${envConfig.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${envConfig.supabaseAvatarBucket}/${path}`;
}

export default class AvatarImageStorageService {
  cacheAvatarImageAsync = async (entity) => {
    if (!isConfigured()) return null;

    const sourceUrl = buildDiceBearPngUrl(entity);
    const imageResponse = await axios.get(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        Accept: 'image/png,image/jpeg,image/*',
      },
    });

    const contentType = imageResponse.headers?.['content-type'] || 'image/png';
    if (!String(contentType).startsWith('image/')) {
      throw new Error(`La URL del avatar no devolvio una imagen valida: ${contentType}`);
    }

    const extension = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const avatarId = entity?.id || 'nuevo';
    const pertenecienteId = entity?.id_perteneciente || 'sin-perteneciente';
    const path = `pertenecientes/${pertenecienteId}/avatar-${avatarId}.${extension}`;

    await axios.put(
      `${envConfig.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${envConfig.supabaseAvatarBucket}/${path}`,
      Buffer.from(imageResponse.data),
      {
        timeout: 30000,
        headers: {
          apikey: envConfig.supabaseServiceRoleKey,
          Authorization: `Bearer ${envConfig.supabaseServiceRoleKey}`,
          'Content-Type': contentType,
          // El path del avatar es fijo (pertenecientes/{id}/avatar-{avatarId}.png)
          // y se pisa con x-upsert cada vez que la persona cambia su avatar. La
          // URL publica que se devuelve lleva ?v={avatar_imagen_actualizada_en}
          // (ver AvatarService), asi que el navegador vuelve a pedir la imagen
          // cuando cambia aunque este marcada como immutable.
          'cache-control': 'public, max-age=31536000, immutable',
          'x-upsert': 'true',
        },
      },
    );

    return {
      url: getPublicUrl(path),
      path,
      contentType,
      sourceUrl,
    };
  };
}
