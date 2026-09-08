import { envConfig } from '../configs/env.config.js';
import AppError from '../modules/errors/AppError.js';
import { groqProvider } from '../providers/ai/aiProviders.js';

const MODEL_NAME = 'openai/gpt-oss-20b';

const SHARED_SUPPORT_QA_SYSTEM_PROMPT = `Sos TÁNDEM, un asistente de acompañamiento para tutores y profesionales que trabajan en red con una persona.
Basate únicamente en el contexto compartido provisto. No inventes datos, diagnósticos, emociones ni avances. Si algo no aparece, decilo explícitamente. No diagnostiques ni prescribas. No reveles información privada. Respondé en español rioplatense, con tono humano y profesional, entre 60 y 160 palabras, sin markdown complejo.`;

const PATIENT_SUMMARY_SYSTEM_PROMPT = `Sos un asistente que ayuda a profesionales (psicologos, terapeutas) a redactar resumenes de progreso para las familias/tutores de pacientes con TEA (Trastorno del Espectro Autista). Tu resumen va a ser leido directamente por un padre/madre/tutor, NO por otro profesional.

Reglas:
1. Usa lenguaje claro, calido y sin jerga clinica. Evita terminos como "conducta disruptiva", "estereotipias", diagnosticos o codificaciones; si el material de origen los usa, traducilos a lenguaje cotidiano.
2. Nunca uses un tono alarmista ni etiquetes a la persona ("el autista", "el paciente") — referite a ella por su progreso y esfuerzo.
3. Estructura sugerida: un parrafo de apertura general, 2 a 4 puntos concretos de avances o temas trabajados, y un cierre alentador.
4. No inventes informacion que no este en los datos provistos.
5. Extension: 150 a 300 palabras.
6. Respondiendo en espanol rioplatense, en texto plano (sin markdown, sin titulos con #).`;

const CASELOAD_OVERVIEW_SYSTEM_PROMPT = `Sos un asistente que redacta la introduccion de un reporte mensual de casos para un profesional que atiende pacientes con TEA. El texto es para uso del propio profesional (no para las familias), asi que podes ser mas directo y usar terminos de seguimiento de casos, pero segui siendo respetuoso y basate solo en las estadisticas provistas: no inventes diagnosticos ni juicios clinicos.

Escribi un parrafo de 3 a 5 oraciones resumiendo el mes: cantidad total de sesiones, asistencia general, y cualquier patron notable (ej. pacientes sin sesion, buena adherencia, etc.) que se desprenda de los numeros. Texto plano, sin markdown.`;

const SESSION_PREP_SYSTEM_PROMPT = `Sos un asistente que ayuda a un profesional (psicologo, terapeuta) a prepararse para una sesion con un paciente con TEA (Trastorno del Espectro Autista). Este texto es SOLO para el profesional — nunca se le muestra al tutor/familia — asi que podes usar terminologia clinica con precision y ser directo.

Basandote unicamente en las notas de las sesiones anteriores provistas, redacta una preparacion para la proxima sesion con esta estructura:
1. "Lo trabajado": 2-3 lineas resumiendo los temas/objetivos abordados en las sesiones previas.
2. "Pendiente": que quedo sin resolver, sin completar, o que requiere seguimiento.
3. "Sugerencias de continuidad para hoy": 2 a 3 puntos concretos y accionables para la sesion de hoy, referenciando su titulo/fecha.

Reglas:
- No inventes informacion que no este en las notas provistas.
- Si las notas son insuficientes para alguna seccion, decilo explicitamente en lugar de rellenar con generalidades.
- Extension total: 150 a 250 palabras.
- Respondiendo en espanol rioplatense, texto plano (sin markdown, sin titulos con #), pero podes usar los tres encabezados de seccion como texto simple seguido de dos puntos.`;

const PATIENT_QA_SYSTEM_PROMPT = `Sos un asistente que responde preguntas de un profesional (psicologo, terapeuta) sobre un paciente con TEA, basandote UNICAMENTE en las notas de sesiones anteriores que se te proveen. El profesional te hace una pregunta libre — respondela de forma directa y concreta.

Reglas:
1. Basate solo en las notas provistas. Si la respuesta no esta ahi, decilo explicitamente ("No encuentro esa informacion en las notas disponibles") en vez de inventar o especular.
2. Cuando cites algo, mencioná a que sesion/fecha corresponde.
3. Podes usar terminologia clinica con precision (este texto es para el profesional, no para la familia).
4. Respuesta concisa: 80 a 200 palabras, texto plano, espanol rioplatense.`;

function formatSesionesList(sesiones) {
  return sesiones
    .map((s) => `- ${s.titulo} (${new Date(s.fecha_sesion).toLocaleDateString('es-AR')}) — estado: ${s.estado}`)
    .join('\n');
}

function getTechnicalErrorDetails(error) {
  return {
    timestamp: new Date().toISOString(),
    status: error?.response?.status || error?.statusCode || error?.cause?.response?.status || 'sin estado',
    code: error?.code || error?.cause?.code || error?.name || 'Error',
  };
}

export default class AiReportService {
  constructor() {
    console.log('Estoy en: AiReportService.constructor()');
    this.apiKey = envConfig.groqApiKey || null;
  }

  assertConfigured = () => {
    if (!this.apiKey) {
      throw new AppError('GROQ_API_KEY no configurado.', 503);
    }
  };

  generateContentSafe = async (systemPrompt, userPrompt) => {
    this.assertConfigured();
    try {
      const response = await groqProvider.chatCompletion({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        timeoutMs: 30000,
      });
      const text = response?.data?.choices?.[0]?.message?.content;
      if (!text || !text.trim()) {
        throw new Error('Respuesta vacia del proveedor de IA.');
      }
      return text.trim();
    } catch (error) {
      // Nunca logueamos el prompt (puede contener texto de notas de sesion) —
      // solo detalles tecnicos no sensibles.
      console.error('[AiReportService] Error generando contenido:', getTechnicalErrorDetails(error));
      throw new AppError('No se pudo generar el resumen con IA. Intenta de nuevo en unos minutos.', 502);
    }
  };

  /**
   * notasTexto es null para reportes programados (sin frontend disponible
   * para leer Google Docs) — en ese caso el resumen se arma solo con
   * metadata de sesiones, nunca con contenido de notas.
   */
  generatePatientSummaryAsync = async ({ pacienteNombre, nivelApoyoNombre, sesiones, notasTexto = null }) => {
    console.log(`AiReportService.generatePatientSummaryAsync(sesiones=${sesiones?.length ?? 0}, notas=${notasTexto?.length ?? 0})`);

    const lines = [
      `Paciente: ${pacienteNombre}`,
      nivelApoyoNombre ? `Nivel de apoyo registrado: ${nivelApoyoNombre}` : null,
      `Cantidad de sesiones consideradas: ${sesiones.length}`,
      '',
      'Sesiones:',
      formatSesionesList(sesiones),
    ].filter((line) => line !== null);

    if (notasTexto && notasTexto.length > 0) {
      lines.push('', 'Notas de las sesiones seleccionadas por el profesional:');
      for (const nota of notasTexto) {
        lines.push(`\n[Sesion: ${nota.titulo} — ${new Date(nota.fecha_sesion).toLocaleDateString('es-AR')}]\n${nota.texto}`);
      }
    } else {
      lines.push('', 'No hay contenido de notas clinicas disponible para este resumen automatico; basate solo en la cantidad y frecuencia de sesiones.');
    }

    const contenido = await this.generateContentSafe(PATIENT_SUMMARY_SYSTEM_PROMPT, lines.join('\n'));
    const titulo = `Reporte de progreso — ${pacienteNombre} — ${new Date().toLocaleDateString('es-AR')}`;
    return { titulo, contenido };
  };

  generateCaseloadOverviewAsync = async ({ profesionalNombre, mes, anio, resumenPorPaciente }) => {
    console.log(`AiReportService.generateCaseloadOverviewAsync(pacientes=${resumenPorPaciente?.length ?? 0})`);

    const statsLines = resumenPorPaciente.map((p) =>
      `- ${p.pacienteNombre}: ${p.totalSesiones} sesiones (${p.completadas} completadas, ${p.canceladas} canceladas, ${p.ausentes} ausencias) — asistencia ${p.asistenciaPct}%`,
    );

    const prompt = [
      `Profesional: ${profesionalNombre}`,
      `Periodo: ${mes}/${anio}`,
      '',
      'Estadisticas por paciente:',
      ...statsLines,
    ].join('\n');

    return await this.generateContentSafe(CASELOAD_OVERVIEW_SYSTEM_PROMPT, prompt);
  };

  /** Nunca se persiste — se genera, se muestra, se descarta. */
  generateSessionPrepAsync = async ({ pacienteNombre, nivelApoyoNombre, sesionObjetivo, sesionesPasadas, notasTexto }) => {
    console.log(`AiReportService.generateSessionPrepAsync(sesionesPasadas=${sesionesPasadas?.length ?? 0}, notas=${notasTexto?.length ?? 0})`);

    const lines = [
      `Paciente: ${pacienteNombre}`,
      nivelApoyoNombre ? `Nivel de apoyo registrado: ${nivelApoyoNombre}` : null,
      `Sesion de hoy a preparar: "${sesionObjetivo.titulo}" — ${new Date(sesionObjetivo.fecha_sesion).toLocaleDateString('es-AR')}`,
      '',
      `Ultimas ${sesionesPasadas.length} sesiones pasadas con nota:`,
      formatSesionesList(sesionesPasadas),
      '',
      'Notas de esas sesiones pasadas:',
    ].filter((line) => line !== null);

    for (const nota of notasTexto) {
      lines.push(`\n[Sesion: ${nota.titulo} — ${new Date(nota.fecha_sesion).toLocaleDateString('es-AR')}]\n${nota.texto}`);
    }

    const contenido = await this.generateContentSafe(SESSION_PREP_SYSTEM_PROMPT, lines.join('\n'));
    const titulo = `Preparacion — ${sesionObjetivo.titulo} — ${new Date(sesionObjetivo.fecha_sesion).toLocaleDateString('es-AR')}`;
    return { titulo, contenido };
  };

  /** Nunca se persiste — pregunta y respuesta son puntuales, no quedan guardadas. */
  answerPatientQuestionAsync = async ({ pacienteNombre, nivelApoyoNombre, pregunta, sesionesPasadas, notasTexto }) => {
    console.log(`AiReportService.answerPatientQuestionAsync(sesionesPasadas=${sesionesPasadas?.length ?? 0}, notas=${notasTexto?.length ?? 0})`);

    const lines = [
      `Paciente: ${pacienteNombre}`,
      nivelApoyoNombre ? `Nivel de apoyo registrado: ${nivelApoyoNombre}` : null,
      `Pregunta del profesional: ${pregunta}`,
      '',
      `Sesiones consideradas (${sesionesPasadas.length}):`,
      formatSesionesList(sesionesPasadas),
      '',
      'Notas de esas sesiones:',
    ].filter((line) => line !== null);

    for (const nota of notasTexto) {
      lines.push(`\n[Sesion: ${nota.titulo} — ${new Date(nota.fecha_sesion).toLocaleDateString('es-AR')}]\n${nota.texto}`);
    }

    const respuesta = await this.generateContentSafe(PATIENT_QA_SYSTEM_PROMPT, lines.join('\n'));
    return { respuesta };
  };

  answerSharedSupportQuestionAsync = async ({ personaNombre, pregunta, notas, objetivos, acuerdos, sesiones }) => {
    const lines = [
      `Persona: ${personaNombre}`,
      `Pregunta: ${pregunta}`,
      '',
      'Notas compartidas:',
      ...(notas.length ? notas.map((n) => `- ${n.fecha_creacion}: ${n.contenido}`) : ['- No hay notas compartidas.']),
      '',
      'Objetivos compartidos:',
      ...(objetivos.length ? objetivos.map((o) => `- ${o.titulo} (${o.estado}, progreso ${o.progreso}%)${o.descripcion ? `: ${o.descripcion}` : ''}`) : ['- No hay objetivos compartidos.']),
      '',
      'Acuerdos:',
      ...(acuerdos.length ? acuerdos.map((a) => `- ${a.completado ? '[completado]' : '[pendiente]'} ${a.texto}`) : ['- No hay acuerdos registrados.']),
      '',
      'Sesiones compartibles (solo metadata, sin notas privadas):',
      ...(sesiones.length ? sesiones.map((s) => `- ${s.titulo} (${new Date(s.fecha_sesion).toLocaleDateString('es-AR')}) — ${s.estado}`) : ['- No hay sesiones compartibles.']),
    ];
    return { respuesta: await this.generateContentSafe(SHARED_SUPPORT_QA_SYSTEM_PROMPT, lines.join('\n')) };
  };
}
