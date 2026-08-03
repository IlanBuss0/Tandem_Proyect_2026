import MemoryProfileRepository from '../repositories/MemoryProfileRepository.js';
import UsageEventService from './UsageEventService.js';
import ConfiguracionUsuarioService from './ConfiguracionUsuarioService.js';
import CalendarEventService from './CalendarEventService.js';
import PersonalVocabularyStore from '../modules/pictograms/personal-vocabulary.js';
import StylePreferenceStore from '../modules/pictograms/style-preference.js';
import { cacheService } from './CacheService.js';
import { USAGE_EVENT_TYPES } from '../modules/usage/event-types.js';
import { parseEmotionsFromConfigs } from '../modules/usage/config-parsing.js';
import { detectEventTypePatterns, evaluateAnticipationSupport } from '../modules/usage/pattern-detection.js';
import { buildEvolutionReport } from '../modules/usage/evolution.js';
import { buildVocabularyReport } from '../modules/usage/vocabulary-report.js';
import { computeAutonomyCardUsage } from '../modules/usage/memory-profile.js';

const CACHE_TTL_SECONDS = 3600;

// Unica responsabilidad: orquestar el perfil de memoria (Sesion 25) —
// juntar datos de varias fuentes que ya existen (eventos_uso,
// eventos_calendario, vocabulario personal, preferencia de estilo),
// correrlos por los modulos puros de calculo (Sesion 19-21 + memory-profile.js
// nuevo) y cachear el resultado. No hay invalidacion activa al escribir:
// es algo que se consulta de forma pasiva, el TTL de 1h alcanza (mismo
// criterio que ya usa el cache del catalogo de pictogramas).
export default class MemoryProfileService {
  constructor() {
    this.MemoryProfileRepository = new MemoryProfileRepository();
    this.UsageEventService = new UsageEventService();
    this.ConfiguracionUsuarioService = new ConfiguracionUsuarioService();
    this.CalendarEventService = new CalendarEventService();
    this.PersonalVocabularyStore = new PersonalVocabularyStore();
    this.StylePreferenceStore = new StylePreferenceStore();
  }

  // Pieza chica y cacheada por separado, a proposito: la usa el motor de
  // pictogramizacion (concept-matching.js) en el camino caliente de CADA
  // resolucion de frase — rutinas, calendario, comunicador, "Explicame
  // esto". Pedir el perfil completo (patrones, evolucion, vocabulario) ahi
  // seria carga innecesaria en algo que corre todo el tiempo. Union entre
  // lo que supero el piso de uso automatico (MemoryProfileRepository) y
  // las correcciones manuales (vocabulario personal, Sesion 2) — estas
  // ultimas cuentan sin importar cuantas veces se repitan, alguien las
  // eligio a mano a proposito.
  getFrequentPictogramIdsAsync = async (idUsuario) => {
    return await cacheService.getOrSet(
      `memory-profile.usuario.${idUsuario}.pictogramas-frecuentes`,
      async () => {
        const [fromUsage, personalVocabulary] = await Promise.all([
          this.MemoryProfileRepository.getFrequentPictogramIdsAsync(idUsuario),
          this.PersonalVocabularyStore.getAsync(idUsuario),
        ]);
        const manuallyChosenIds = Object.values(personalVocabulary || {});
        return Array.from(new Set([...fromUsage, ...manuallyChosenIds]));
      },
      CACHE_TTL_SECONDS,
    );
  };

  getProfileAsync = async (idUsuario) => {
    return await cacheService.getOrSet(
      `memory-profile.usuario.${idUsuario}`,
      () => this.computeProfileAsync(idUsuario),
      CACHE_TTL_SECONDS,
    );
  };

  computeProfileAsync = async (idUsuario) => {
    const [
      calendarRows,
      configs,
      enunciadoEvents,
      choiceEvents,
      tarjetaEvents,
      recentEvents,
      frequentPictogramIds,
      preferredStyle,
    ] = await Promise.all([
      this.CalendarEventService.getForUsuarioAsync(idUsuario),
      this.ConfiguracionUsuarioService.getByUsuarioIdAsync(idUsuario),
      this.UsageEventService.getForUsuarioAsync(idUsuario, { tipoEvento: USAGE_EVENT_TYPES.ENUNCIADO_HABLADO, limit: 500 }),
      this.UsageEventService.getForUsuarioAsync(idUsuario, { tipoEvento: USAGE_EVENT_TYPES.PICTOGRAMA_ELEGIDO, limit: 1000 }),
      this.UsageEventService.getForUsuarioAsync(idUsuario, { tipoEvento: USAGE_EVENT_TYPES.TARJETA_AUTONOMIA_USADA, limit: 200 }),
      this.UsageEventService.getForUsuarioAsync(idUsuario, { limit: 200 }),
      this.getFrequentPictogramIdsAsync(idUsuario),
      this.StylePreferenceStore.getPreferredStyleAsync(idUsuario),
    ]);

    const events = calendarRows.map((row) => ({ id: row.id, date: row.fecha, type: row.tipo }));
    const emotions = parseEmotionsFromConfigs(configs);
    const socialStoryViewedEventIds = new Set(
      (choiceEvents || [])
        .filter((e) => e.entidad_tipo === 'historia_social' && e.entidad_id)
        .map((e) => String(e.entidad_id)),
    );

    return {
      frequentPictogramIds,
      preferredStyle,
      autonomyCardUsage: computeAutonomyCardUsage(tarjetaEvents),
      eventTypePatterns: detectEventTypePatterns(events, emotions),
      anticipationSupport: evaluateAnticipationSupport(events, emotions, socialStoryViewedEventIds),
      vocabularyReport: buildVocabularyReport(enunciadoEvents),
      evolutionWeeks: buildEvolutionReport(recentEvents),
    };
  };
}
