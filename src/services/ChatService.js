import ChatRepository from '../repositories/ChatRepository.js';
import BD from '../db/BD.js';
import PertenecienteRepository from '../repositories/PertenecienteRepository.js';
import ProfesionalRepository from '../repositories/ProfesionalRepository.js';
import TipoChatRepository from '../repositories/TipoChatRepository.js';
import UsuarioRepository from '../repositories/UsuarioRepository.js';
import VinculoProfesionalPertenecienteRepository from '../repositories/VinculoProfesionalPertenecienteRepository.js';
import AuthorizationService from './AuthorizationService.js';
import { AUTH_ACTIONS } from '../modules/security/permissions.constants.js';
import FileStorageService from './FileStorageService.js';
import { compressImageAsync } from './ImageProcessingService.js';

export default class ChatService {
  constructor() {
    console.log('Estoy en: ChatService.constructor()');
    this.ChatRepository = new ChatRepository();
    this.PertenecienteRepository = new PertenecienteRepository();
    this.ProfesionalRepository = new ProfesionalRepository();
    this.TipoChatRepository = new TipoChatRepository();
    this.UsuarioRepository = new UsuarioRepository();
    this.VinculoProfesionalPertenecienteRepository = new VinculoProfesionalPertenecienteRepository();
    this.FileStorageService = new FileStorageService();
  }

  getAllAsync = async () => { console.log('ChatService.getAllAsync()'); const r = await this.ChatRepository.getAllAsync(); if (r == null) return null; return r; };
  getByIdAsync = async (id) => { console.log(`ChatService.getByIdAsync(${id})`); if (!id || Number.isNaN(id)) { throw new Error('El id del chat es invalido.'); } return await this.ChatRepository.getByIdAsync(id); };
  getByUsuarioIdAsync = async (idUsuario) => { console.log(`ChatService.getByUsuarioIdAsync(${idUsuario})`); if (!idUsuario || Number.isNaN(idUsuario)) { throw new Error('El id del usuario es invalido.'); } return await this.ChatRepository.getByUsuarioIdAsync(idUsuario); };
  syncByUsuarioIdAsync = async (idUsuario, since = null) => {
    console.log(`ChatService.syncByUsuarioIdAsync(${idUsuario}, ${since})`);
    if (!idUsuario || Number.isNaN(idUsuario)) { throw new Error('El id del usuario es invalido.'); }
    if (since && Number.isNaN(new Date(since).getTime())) { throw new Error('El parametro since no es una fecha valida.'); }
    const serverTime = new Date();
    const chats = await this.ChatRepository.getByUsuarioIdSinceAsync(idUsuario, since);
    return { serverTime: serverTime.toISOString(), chats };
  };
  createAsync = async (entity) => { console.log(`ChatService.createAsync(${JSON.stringify(entity)})`); this.validarChatParaCrear(entity); return await this.ChatRepository.createAsync(entity); };

  createDirectChatAsync = async (idUsuarioA, idUsuarioB, idTipoChat = 1, nombre = null, options = {}) => {
    console.log(`ChatService.createDirectChatAsync(${idUsuarioA}, ${idUsuarioB})`);

    const usuarioA = parseInt(idUsuarioA);
    const usuarioB = parseInt(idUsuarioB);
    const tipoChat = parseInt(idTipoChat);

    await this.validarChatDirectoAsync(usuarioA, usuarioB, tipoChat, options);
    
    // 1. Verificar si ya existe un chat activo entre ambos
    const existente = await this.ChatRepository.getActiveBetweenUsersAsync(usuarioA, usuarioB, tipoChat);
    if (existente) {
        return { chat: existente, participantes: await this.ChatRepository.getActiveParticipantsAsync(existente.id), created: false };
    }

    // 2. Crear chat con ambos participantes en una sola transaccion
    const chat = await this.ChatRepository.createWithParticipantsAsync({
        id_tipo_chat: tipoChat,
        nombre: nombre,
        fecha_creacion: new Date(),
        participantes: [usuarioA, usuarioB],
        administradores: [],
    });

    return { chat, participantes: await this.ChatRepository.getActiveParticipantsAsync(chat.id), created: true };
  };

  createGroupChatAsync = async ({ id_usuario_creador, participantes, nombre, descripcion = null, id_tipo_chat = null }) => {
    console.log(`ChatService.createGroupChatAsync(${JSON.stringify({ id_usuario_creador, participantes, nombre, descripcion, id_tipo_chat })})`);

    if (!id_usuario_creador || Number.isNaN(id_usuario_creador)) throw new Error('El usuario creador es invalido.');
    if (!nombre || !String(nombre).trim()) throw new Error('El titulo del grupo es obligatorio.');
    if (!Array.isArray(participantes)) throw new Error('participantes debe ser un array de ids de usuario.');

    const participantIds = Array.from(new Set([
      id_usuario_creador,
      ...participantes.map((id) => parseInt(id)).filter((id) => Number.isInteger(id) && id > 0),
    ]));

    if (participantIds.length < 3) {
      throw new Error('Un grupo necesita al menos 3 participantes incluyendo al creador.');
    }

    for (const idUsuario of participantIds) {
      const usuario = await this.UsuarioRepository.getByIdAsync(idUsuario);
      if (!usuario?.activo) throw new Error(`El usuario ${idUsuario} no existe o no esta activo.`);
    }

    const idTipoChat = id_tipo_chat ? parseInt(id_tipo_chat) : await this.resolveTipoChatGrupoAsync();
    const chat = await this.ChatRepository.createWithParticipantsAsync({
      id_tipo_chat: idTipoChat,
      nombre: String(nombre).trim(),
      descripcion: descripcion ? String(descripcion).trim() : null,
      fecha_creacion: new Date(),
      participantes: participantIds,
      administradores: [id_usuario_creador],
    });

    return { chat, participantes: await this.ChatRepository.getActiveParticipantsAsync(chat.id), created: true };
  };

  createProfesionalPertenecienteAsync = async ({ id_usuario_profesional, id_perteneciente, id_tipo_chat = null, nombre = null }) => {
    console.log(`ChatService.createProfesionalPertenecienteAsync(${JSON.stringify({ id_usuario_profesional, id_perteneciente, id_tipo_chat, nombre })})`);

    if (!id_usuario_profesional || Number.isNaN(id_usuario_profesional)) throw new Error('El usuario profesional autenticado es invalido.');
    if (!id_perteneciente || Number.isNaN(id_perteneciente)) throw new Error('id_perteneciente es obligatorio.');

    const profesional = await this.ProfesionalRepository.getByUsuarioIdAsync(id_usuario_profesional);
    if (!profesional) throw new Error('Solo un profesional puede crear este tipo de chat.');

    await this.validarProfesionalValidadoAsync(profesional.id);

    const perteneciente = await this.PertenecienteRepository.getByIdAsync(id_perteneciente);
    if (!perteneciente) throw new Error('No se encontro el perteneciente.');

    const usuarioPerteneciente = await this.UsuarioRepository.getByIdAsync(perteneciente.id_usuario);
    if (!usuarioPerteneciente?.activo) throw new Error('El usuario perteneciente no esta activo.');

    const vinculo = await this.VinculoProfesionalPertenecienteRepository.getByProfesionalYPertenecienteAsync(profesional.id, perteneciente.id);

    this.validarVinculoProfesionalPerteneciente(vinculo);
    await AuthorizationService.assertCan(id_usuario_profesional, AUTH_ACTIONS.PROFESIONAL_CHAT_ENVIAR, {
      id_perteneciente: perteneciente.id,
    });

    const idTipoChat = await this.resolveTipoChatProfesionalPertenecienteAsync(id_tipo_chat);
    return await this.createDirectChatAsync(id_usuario_profesional, perteneciente.id_usuario, idTipoChat, nombre, {
      skipTipoChatValidation: true,
      skipRelationshipValidation: true,
    });
  };
  
  updateAsync = async (entity) => { console.log(`ChatService.updateAsync(${JSON.stringify(entity)})`); if (!entity?.id || Number.isNaN(entity.id)) { throw new Error('El id del chat es obligatorio para actualizar.'); } const prev = await this.ChatRepository.getByIdAsync(entity.id); if (prev == null) return 0; return await this.ChatRepository.updateAsync(entity); };
  deleteByIdAsync = async (id) => { console.log(`ChatService.deleteByIdAsync(${id})`); if (!id || Number.isNaN(id)) { throw new Error('El id del chat es invalido.'); } return await this.ChatRepository.deleteByIdAsync(id); };

  manageForUserAsync = async (idChat, idUsuario, payload) => {
    console.log(`ChatService.manageForUserAsync(${idChat}, ${idUsuario})`);
    if (!idChat || Number.isNaN(idChat)) throw new Error('El id del chat es invalido.');
    if (!idUsuario || Number.isNaN(idUsuario)) throw new Error('El usuario es invalido.');

    const participanteActual = await this.ChatRepository.getActiveParticipantsAsync(idChat);
    if (participanteActual.length <= 2) throw new Error('Los chats directos no se pueden administrar.');
    const solicitante = participanteActual.find((participante) => participante.id_usuario === idUsuario);
    if (!solicitante?.es_admin) throw new Error('Solo un administrador puede administrar este grupo.');

    const chat = await this.ChatRepository.getByIdAsync(idChat);
    if (!chat?.activo) throw new Error('No se encontro el chat activo.');

    await this.ChatRepository.updateAsync({
      ...chat,
      nombre: payload?.nombre === undefined ? chat.nombre : String(payload.nombre || '').trim() || null,
      descripcion: payload?.descripcion === undefined ? chat.descripcion : String(payload.descripcion || '').trim() || null,
    });

    const participantIds = Array.isArray(payload?.participantes)
      ? Array.from(new Set(
        payload.participantes
          .map((id) => parseInt(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ))
      : participanteActual.map((participante) => participante.id_usuario);

    if (!participantIds.includes(idUsuario)) participantIds.push(idUsuario);
    if (participantIds.length < 3) throw new Error('Un grupo necesita al menos 3 participantes.');

    const adminIds = Array.isArray(payload?.administradores)
      ? Array.from(new Set(
        payload.administradores
          .map((id) => parseInt(id))
          .filter((id) => Number.isInteger(id) && id > 0 && participantIds.includes(id)),
      ))
      : participanteActual
        .filter((participante) => participante.es_admin && participantIds.includes(participante.id_usuario))
        .map((participante) => participante.id_usuario);

    if (adminIds.length < 1) throw new Error('El grupo necesita al menos un administrador.');

    if (Array.isArray(payload?.participantes) || Array.isArray(payload?.administradores)) {
      for (const idParticipante of participantIds) {
        const usuario = await this.UsuarioRepository.getByIdAsync(idParticipante);
        if (!usuario?.activo) throw new Error(`El usuario ${idParticipante} no existe o no esta activo.`);
      }

      await this.ChatRepository.replaceParticipantsAsync(idChat, participantIds, adminIds);
    }

    const updatedChat = await this.ChatRepository.getByIdAsync(idChat);
    const participantes = await this.ChatRepository.getActiveParticipantsAsync(idChat);
    return { chat: updatedChat, participantes };
  };

  setAvatarForUserAsync = async (idChat, idUsuario, file) => {
    console.log(`ChatService.setAvatarForUserAsync(${idChat}, ${idUsuario})`);
    if (!idChat || Number.isNaN(idChat)) throw new Error('El id del chat es invalido.');
    if (!idUsuario || Number.isNaN(idUsuario)) throw new Error('El usuario es invalido.');
    if (!file?.buffer) throw new Error('La imagen del chat es obligatoria.');

    const participantes = await this.ChatRepository.getActiveParticipantsAsync(idChat);
    if (participantes.length <= 2) throw new Error('Solo los grupos pueden tener foto de chat.');

    const solicitante = participantes.find((participante) => participante.id_usuario === idUsuario);
    if (!solicitante?.es_admin) throw new Error('Solo un administrador puede cambiar la foto del grupo.');

    const chat = await this.ChatRepository.getByIdAsync(idChat);
    if (!chat?.activo) throw new Error('No se encontro el chat activo.');

    let avatarBuffer = file.buffer;
    let avatarContentType = file.mimetype;
    let avatarExtension = file.originalname?.split('.').pop()?.toLowerCase() || 'jpg';

    try {
      const compressed = await compressImageAsync(file.buffer, {
        maxDimension: 512,
        quality: 80,
        format: 'webp',
      });
      avatarBuffer = compressed.buffer;
      avatarContentType = compressed.contentType;
      avatarExtension = compressed.extension;
    } catch (error) {
      console.warn(`No se pudo comprimir el avatar del chat ${idChat}; se sube original: ${error.message}`);
    }

    const result = await this.FileStorageService.uploadAsync({
      buffer: avatarBuffer,
      contentType: avatarContentType,
      fileName: `chat-${idChat}-avatar.${avatarExtension}`,
      userId: idUsuario,
      path: `chats/${idChat}/avatar.${avatarExtension}`,
      upsert: true,
    });

    await this.ChatRepository.updateAvatarAsync(idChat, {
      avatar_url: result.url,
      avatar_path: result.path,
      avatar_content_type: avatarContentType,
    });

    return {
      chat: await this.ChatRepository.getByIdAsync(idChat),
      participantes: await this.ChatRepository.getActiveParticipantsAsync(idChat),
    };
  };

  validarChatParaCrear = (entity) => {
    if (!entity) throw new Error('El chat es obligatorio.');
    if (!entity.id_tipo_chat) throw new Error('id_tipo_chat es obligatorio.');
    if (!entity.fecha_creacion) throw new Error('fecha_creacion es obligatorio.');
  };

  validarChatDirectoAsync = async (idUsuarioA, idUsuarioB, idTipoChat, options = {}) => {
    if (!idUsuarioA || Number.isNaN(idUsuarioA)) throw new Error('El usuario origen es invalido.');
    if (!idUsuarioB || Number.isNaN(idUsuarioB)) throw new Error('El usuario destino es invalido.');
    if (!idTipoChat || Number.isNaN(idTipoChat)) throw new Error('El tipo de chat es invalido.');
    if (idUsuarioA === idUsuarioB) throw new Error('No se puede crear un chat directo con el mismo usuario.');

    const [usuarioA, usuarioB] = await Promise.all([
      this.UsuarioRepository.getByIdAsync(idUsuarioA),
      this.UsuarioRepository.getByIdAsync(idUsuarioB),
    ]);

    if (!usuarioA?.activo) throw new Error('El usuario origen no existe o no esta activo.');
    if (!usuarioB?.activo) throw new Error('El usuario destino no existe o no esta activo.');

    if (!options.skipTipoChatValidation) {
      await this.validarTipoChatDirectoAsync(idTipoChat);
    }

    if (!options.skipRelationshipValidation) {
      await this.validarRelacionDirectaPermitidaAsync(idUsuarioA, idUsuarioB);
    }
  };

  validarTipoChatDirectoAsync = async (idTipoChat) => {
    const tipo = await this.TipoChatRepository.getByIdAsync(idTipoChat);
    if (!tipo) throw new Error('El tipo de chat no existe.');

    const nombre = String(tipo.nombre ?? '').trim().toLowerCase();
    if (!['directo', 'direct', 'individual'].includes(nombre)) {
      throw new Error('Usa el endpoint especifico para chats que no sean directos.');
    }
  };

  validarRelacionDirectaPermitidaAsync = async (idUsuarioA, idUsuarioB) => {
    const menor = Math.min(idUsuarioA, idUsuarioB);
    const mayor = Math.max(idUsuarioA, idUsuarioB);

    const relacion = await BD.queryOne(
      `
        SELECT 1
        FROM contactos c
        INNER JOIN estados_contactos ec ON ec.id = c.id_estado_contacto
        WHERE c.id_usuario_menor = $1
          AND c.id_usuario_mayor = $2
          AND LOWER(ec.nombre) IN ('aceptado', 'aceptada', 'activo', 'activa')
        LIMIT 1
      `,
      [menor, mayor],
    );

    if (relacion) return;

    const vinculoTutor = await BD.queryOne(
      `
        SELECT 1
        FROM vinculos_tutor_pertenecientes vtp
        INNER JOIN estados_vinculos ev ON ev.id = vtp.id_estado_vinculo
        INNER JOIN tutores t ON t.id = vtp.id_tutor
        INNER JOIN pertenecientes p ON p.id = vtp.id_perteneciente
        WHERE vtp.fecha_fin IS NULL
          AND LOWER(ev.nombre) IN ('activo', 'activa', 'aprobado', 'aprobada', 'aceptado', 'aceptada')
          AND (
            (t.id_usuario = $1 AND p.id_usuario = $2)
            OR (t.id_usuario = $2 AND p.id_usuario = $1)
          )
        LIMIT 1
      `,
      [idUsuarioA, idUsuarioB],
    );

    if (vinculoTutor) return;

    const vinculoProfesional = await BD.queryOne(
      `
        SELECT 1
        FROM vinculos_profesional_pertenecientes vpp
        INNER JOIN estados_vinculos ev ON ev.id = vpp.id_estado_vinculo
        INNER JOIN profesionales prof ON prof.id = vpp.id_profesional
        INNER JOIN pertenecientes p ON p.id = vpp.id_perteneciente
        WHERE LOWER(ev.nombre) IN ('activo', 'activa', 'aprobado', 'aprobada', 'aceptado', 'aceptada')
          AND (
            (prof.id_usuario = $1 AND p.id_usuario = $2)
            OR (prof.id_usuario = $2 AND p.id_usuario = $1)
          )
        LIMIT 1
      `,
      [idUsuarioA, idUsuarioB],
    );

    if (vinculoProfesional) return;

    throw new Error('No existe una relacion activa que permita crear este chat directo.');
  };

  validarProfesionalValidadoAsync = async (idProfesional) => {
    const sql = `
      SELECT p.id
      FROM profesionales p
      INNER JOIN estados_validaciones_profesionales evp ON evp.id = p.id_estado_validacion
      WHERE p.id = $1
        AND LOWER(evp.nombre) IN ('verified', 'validado', 'validada', 'aprobado', 'aprobada', 'verificado', 'verificada')
      LIMIT 1
    `;
    const validado = await BD.queryOne(sql, [idProfesional]);
    if (!validado) throw new Error('El profesional debe estar validado para crear chats con pertenecientes.');  
  };

  validarVinculoProfesionalPerteneciente = (vinculo) => {
    if (!vinculo) {
      throw new Error('Debe existir un vinculo entre el profesional y el perteneciente.');
    }

    const estado = String(vinculo.estado_vinculo ?? '').toLowerCase();
    const vinculoActivo = ['activo', 'activa', 'aprobado', 'aprobada', 'aceptado', 'aceptada'].includes(estado);

    if (!vinculoActivo) {
      throw new Error('El vinculo profesional-perteneciente debe estar activo o aprobado.');
    }

    if (vinculo.requiere_aprobacion_tutor && (!vinculo.fue_aprobado_por_tutor || !vinculo.id_tutor_aprobador)) {
      throw new Error('El tutor debe aprobar el vinculo antes de crear el chat con este perteneciente.');
    }
  };

  resolveTipoChatProfesionalPertenecienteAsync = async (idTipoChat) => {
    if (idTipoChat) return idTipoChat;

    const nombres = ['profesional_perteneciente', 'profesional-perteneciente', 'profesional perteneciente'];    

    for (const nombre of nombres) {
      const tipo = await this.TipoChatRepository.getByNombreAsync(nombre);
      if (tipo) return tipo.id;
    }

    throw new Error('No se encontro el tipo de chat profesional-perteneciente. Envia id_tipo_chat o crea el catalogo correspondiente.');
  };

  resolveTipoChatGrupoAsync = async () => {
    const nombres = ['grupo', 'grupal', 'group'];

    for (const nombre of nombres) {
      const tipo = await this.TipoChatRepository.getByNombreAsync(nombre);
      if (tipo) return tipo.id;
    }

    return await this.TipoChatRepository.createAsync({ nombre: 'grupo', orden: 20 });
  };

  esMayorDeEdad = (fechaNacimiento) => {
    if (!fechaNacimiento) return false;

    const nacimiento = new Date(fechaNacimiento);
    if (Number.isNaN(nacimiento.getTime())) return false;

    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();

    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad -= 1;
    }

    return edad >= 18;
  };
}
