import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

import AuthController from './controllers/AuthController.js';
import InviteVinculoController from './controllers/InviteVinculoController.js';
import UsuarioController from './controllers/UsuarioController.js';
import PertenecienteController from './controllers/PertenecienteController.js';
import TutorController from './controllers/TutorController.js';
import ProfesionalController from './controllers/ProfesionalController.js';
import ActividadController from './controllers/ActividadController.js';
import ActividadPersonalizadaController from './controllers/ActividadPersonalizadaController.js';
import ActividadAsignadaController from './controllers/ActividadAsignadaController.js';
import ActivityPerformanceCatalogController from './controllers/ActivityPerformanceCatalogController.js';
import FavoritoActividadController from './controllers/FavoritoActividadController.js';
import CalificacionActividadController from './controllers/CalificacionActividadController.js';
import PictogramaController from './controllers/PictogramaController.js';
import AvatarController from './controllers/AvatarController.js';
import SaldoPuntoController from './controllers/SaldoPuntoController.js';
import MovimientoPuntoController from './controllers/MovimientoPuntoController.js';
import EvaluacionAutonomiaController from './controllers/EvaluacionAutonomiaController.js';
import ZonaSeguraController from './controllers/ZonaSeguraController.js';
import InventarioAvatarController from './controllers/InventarioAvatarController.js';
import ItemAvatarController from './controllers/ItemAvatarController.js';
import EventoZonaSeguraController from './controllers/EventoZonaSeguraController.js';
import CompraPuntoController from './controllers/CompraPuntoController.js';
import SesionProfesionalController from './controllers/SesionProfesionalController.js';
import ReporteProfesionalController from './controllers/ReporteProfesionalController.js';
import NoteTemplateFavoriteController from './controllers/NoteTemplateFavoriteController.js';
import DispositivoController from './controllers/DispositivoController.js';
import UbicacionActualController from './controllers/UbicacionActualController.js';
import UbicacionHistorialController from './controllers/UbicacionHistorialController.js';
import NotificacionController from './controllers/NotificacionController.js';
import RoutineReminderController from './controllers/RoutineReminderController.js';
import UsageEventController from './controllers/UsageEventController.js';
import CalendarEventController from './controllers/CalendarEventController.js';
import RoutineController from './controllers/RoutineController.js';
import ContactoController from './controllers/ContactoController.js';
import ChatController from './controllers/ChatController.js';
import ParticipanteChatController from './controllers/ParticipanteChatController.js';
import MensajeController from './controllers/MensajeController.js';
import BloqueoUsuarioController from './controllers/BloqueoUsuarioController.js';
import ConfiguracionUsuarioController from './controllers/ConfiguracionUsuarioController.js';
import ConfiguracionAccesibilidadController from './controllers/ConfiguracionAccesibilidadController.js';
import ReporteUsuarioController from './controllers/ReporteUsuarioController.js';
import AlcanceArchivoController from './controllers/AlcanceArchivoController.js';
import ArchivoController from './controllers/ArchivoController.js';
import AuditoriaEventoController from './controllers/AuditoriaEventoController.js';
import AutonomiaOperativaController from './controllers/AutonomiaOperativaController.js';
import BeneficiarioSuscripcionController from './controllers/BeneficiarioSuscripcionController.js';
import CatalogoPermisoPertenecienteController from './controllers/CatalogoPermisoPertenecienteController.js';
import CatalogoPermisoProfesionalController from './controllers/CatalogoPermisoProfesionalController.js';
import DificultadActividadController from './controllers/DificultadActividadController.js';
import EntidadAfectadaAuditoriaController from './controllers/EntidadAfectadaAuditoriaController.js';
import EstadoActividadController from './controllers/EstadoActividadController.js';
import EstadoContactoController from './controllers/EstadoContactoController.js';
import EstadoPagoController from './controllers/EstadoPagoController.js';
import EstadoReporteController from './controllers/EstadoReporteController.js';
import EstadoSuscripcionController from './controllers/EstadoSuscripcionController.js';
import EstadoValidacionProfesionalController from './controllers/EstadoValidacionProfesionalController.js';
import EstadoVinculoController from './controllers/EstadoVinculoController.js';
import HistorialPermisoOtorgadoPertenecienteController from './controllers/HistorialPermisoOtorgadoPertenecienteController.js';
import HistorialPermisoOtorgadoProfesionalController from './controllers/HistorialPermisoOtorgadoProfesionalController.js';
import MensajeArchivoController from './controllers/MensajeArchivoController.js';
import NivelApoyoController from './controllers/NivelApoyoController.js';
import PagoSuscripcionController from './controllers/PagoSuscripcionController.js';
import PaquetePuntoController from './controllers/PaquetePuntoController.js';
import PerfilProfesionalController from './controllers/PerfilProfesionalController.js';
import PermisoArchivoController from './controllers/PermisoArchivoController.js';
import PermisoController from './controllers/PermisoController.js';
import PermisoOtorgadoPertenecienteController from './controllers/PermisoOtorgadoPertenecienteController.js';
import PermisoOtorgadoProfesionalController from './controllers/PermisoOtorgadoProfesionalController.js';
import PlanSuscripcionController from './controllers/PlanSuscripcionController.js';
import PuntoOtorgadoController from './controllers/PuntoOtorgadoController.js';
import ResenaProfesionalController from './controllers/ResenaProfesionalController.js';
import RolAdministradorController from './controllers/RolAdministradorController.js';
import TipoActividadController from './controllers/TipoActividadController.js';
import TipoArchivoController from './controllers/TipoArchivoController.js';
import TipoChatController from './controllers/TipoChatController.js';
import TipoEventoAuditoriaController from './controllers/TipoEventoAuditoriaController.js';
import TipoEventoZonaSeguraController from './controllers/TipoEventoZonaSeguraController.js';
import TipoItemAvatarController from './controllers/TipoItemAvatarController.js';
import TipoMensajeController from './controllers/TipoMensajeController.js';
import TipoMovimientoPuntoController from './controllers/TipoMovimientoPuntoController.js';
import TipoNotificacionController from './controllers/TipoNotificacionController.js';
import TipoPermisoArchivoController from './controllers/TipoPermisoArchivoController.js';
import TipoUsuarioController from './controllers/TipoUsuarioController.js';
import ValidacionProfesionalController from './controllers/ValidacionProfesionalController.js';
import VinculoProfesionalPertenecienteController from './controllers/VinculoProfesionalPertenecienteController.js';
import VinculoTutorPertenecienteController from './controllers/VinculoTutorPertenecienteController.js';
import { authMiddleware, verifiedAccountMiddleware } from './middlewares/auth.middleware.js';
import { csrfMiddleware } from './middlewares/csrf.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { authRateLimiter, inviteRateLimiter, refreshRateLimiter, resendVerificationRateLimiter, setupRedisRateLimit } from './middlewares/rate-limit.middleware.js';
import { envConfig, validateEnvConfig } from './configs/env.config.js';
import { corsOptions } from './configs/cors.config.js';
import BD from './db/BD.js';
import { setupRealtime } from './realtime/socket.js';
import { startNotificationWorker } from './workers/notificationWorker.js';
import { startPictogramaSyncJob } from './jobs/pictogramaSyncJob.js';
import { startRoutineReminderWorker } from './workers/routineReminderWorker.js';
import { startScheduledReportWorker } from './workers/scheduledReportWorker.js';
import { startInactivePatientWorker } from './workers/inactivePatientWorker.js';

// Configuración para usar __dirname con ES Modules (import)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

validateEnvConfig();

app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Documentación Interactiva con Swagger (Solo disponible en Desarrollo)
if (process.env.NODE_ENV !== 'production') {
    try {
        // Usamos imports dinámicos para mantener la compatibilidad con ES Modules
        const swaggerUi = await import('swagger-ui-express');
        const YAML = await import('yamljs');
        const fs = await import('fs');

        const swaggerDocument = YAML.default.load(path.join(__dirname, 'configs', 'swagger.yaml'));
        const customCss = fs.readFileSync(path.join(__dirname, 'configs', 'swagger-custom.css'), 'utf8');

        const options = {
            customCss,
            customSiteTitle: 'Tándem 2026 - API Docs',
            swaggerOptions: {
                docExpansion: 'none'
            }
        };

        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));
        console.log('➤ [Swagger]: Documentación disponible en http://localhost:3000/api-docs');        
    } catch (error) {
        console.error('➤ [Swagger Error]: No se pudo cargar la configuración de Swagger:', error.message);
    }
}

app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'API Backend TANDEM funcionando',
  });
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use('/api/auth/google', authRateLimiter);
app.use('/api/auth/refresh', refreshRateLimiter);
app.use('/api/auth/resend-verification', resendVerificationRateLimiter);
app.use('/api/auth/forgot-password', resendVerificationRateLimiter);
app.use('/api/auth/reset-password', authRateLimiter);
app.use('/api/auth', AuthController);
app.use('/api/pictograms', PictogramaController);
app.use('/api/pictogramas', PictogramaController);
app.use('/pictograms', PictogramaController);
app.use('/api', authMiddleware);
app.use('/api', verifiedAccountMiddleware);
app.use('/api', csrfMiddleware);
app.use('/api/usuarios', UsuarioController);
app.use('/api/pertenecientes', PertenecienteController);
app.use('/api/tutores', TutorController);
app.use('/api/profesionales', ProfesionalController);
app.use('/api/actividades', ActividadController);
app.use('/api/actividades-personalizadas', ActividadPersonalizadaController);
app.use('/api/actividades-asignadas', ActividadAsignadaController);
app.use('/api', ActivityPerformanceCatalogController);
app.use('/api/favoritos-actividades', FavoritoActividadController);
app.use('/api/calificaciones-actividades', CalificacionActividadController);
app.use('/api/avatares', AvatarController);
app.use('/api/saldos-puntos', SaldoPuntoController);
app.use('/api/movimientos-puntos', MovimientoPuntoController);
app.use('/api/evaluaciones-autonomias', EvaluacionAutonomiaController);
app.use('/api/zonas-seguras', ZonaSeguraController);
app.use('/api/inventarios-avatares', InventarioAvatarController);
app.use('/api/items-avatares', ItemAvatarController);
app.use('/api/eventos-zonas-seguras', EventoZonaSeguraController);
app.use('/api/compras-puntos', CompraPuntoController);
app.use('/api/sesiones-profesionales', SesionProfesionalController);
app.use('/api/reportes-profesionales', ReporteProfesionalController);
app.use('/api/note-template-favorites', NoteTemplateFavoriteController);
app.use('/api/dispositivos', DispositivoController);
app.use('/api/ubicaciones-actuales', UbicacionActualController);
app.use('/api/ubicaciones-historiales', UbicacionHistorialController);
app.use('/api/notificaciones', NotificacionController);
app.use('/api/routine-reminders', RoutineReminderController);
app.use('/api/eventos-uso', UsageEventController);
app.use('/api/eventos-calendario', CalendarEventController);
app.use('/api/rutinas', RoutineController);
app.use('/api/contactos', ContactoController);
app.use('/api/chats', ChatController);
app.use('/api/participantes-chats', ParticipanteChatController);
app.use('/api/mensajes', MensajeController);
app.use('/api/bloqueos-usuarios', BloqueoUsuarioController);
app.use('/api/configuraciones-usuarios', ConfiguracionUsuarioController);
app.use('/api/configuraciones-accesibilidad', ConfiguracionAccesibilidadController);
app.use('/api/reportes-usuarios', ReporteUsuarioController);
app.use('/api/alcances-archivos', AlcanceArchivoController);
app.use('/api/archivos', ArchivoController);
app.use('/api/auditorias-eventos', AuditoriaEventoController);
app.use('/api/autonomias-operativas', AutonomiaOperativaController);
app.use('/api/beneficiarios-suscripciones', BeneficiarioSuscripcionController);
app.use('/api/catalogos-permisos-pertenecientes', CatalogoPermisoPertenecienteController);
app.use('/api/catalogos-permisos-profesionales', CatalogoPermisoProfesionalController);
app.use('/api/dificultades-actividades', DificultadActividadController);
app.use('/api/entidades-afectadas-auditorias', EntidadAfectadaAuditoriaController);
app.use('/api/estados-actividades', EstadoActividadController);
app.use('/api/estados-contactos', EstadoContactoController);
app.use('/api/estados-pagos', EstadoPagoController);
app.use('/api/estados-reportes', EstadoReporteController);
app.use('/api/estados-suscripciones', EstadoSuscripcionController);
app.use('/api/estados-validaciones-profesionales', EstadoValidacionProfesionalController);
app.use('/api/estados-vinculos', EstadoVinculoController);
app.use('/api/historiales-permisos-otorgados-pertenecientes', HistorialPermisoOtorgadoPertenecienteController);
app.use('/api/historiales-permisos-otorgados-profesionales', HistorialPermisoOtorgadoProfesionalController);
app.use('/api/mensajes-archivos', MensajeArchivoController);
app.use('/api/niveles-apoyos', NivelApoyoController);
app.use('/api/pagos-suscripciones', PagoSuscripcionController);
app.use('/api/paquetes-puntos', PaquetePuntoController);
app.use('/api/perfiles-profesionales', PerfilProfesionalController);
app.use('/api/permisos', PermisoController);
app.use('/api/permisos-archivos', PermisoArchivoController);
app.use('/api/permisos-otorgados-pertenecientes', PermisoOtorgadoPertenecienteController);
app.use('/api/permisos-otorgados-profesionales', PermisoOtorgadoProfesionalController);
app.use('/api/planes-suscripciones', PlanSuscripcionController);
app.use('/api/puntos-otorgados', PuntoOtorgadoController);
app.use('/api/resenas-profesionales', ResenaProfesionalController);
app.use('/api/roles-administradores', RolAdministradorController);
app.use('/api/tipos-actividades', TipoActividadController);
app.use('/api/tipos-archivos', TipoArchivoController);
app.use('/api/tipos-chats', TipoChatController);
app.use('/api/tipos-eventos-auditorias', TipoEventoAuditoriaController);
app.use('/api/tipos-eventos-zonas-seguras', TipoEventoZonaSeguraController);
app.use('/api/tipos-items-avatares', TipoItemAvatarController);
app.use('/api/tipos-mensajes', TipoMensajeController);
app.use('/api/tipos-movimientos-puntos', TipoMovimientoPuntoController);
app.use('/api/tipos-notificaciones', TipoNotificacionController);
app.use('/api/tipos-permisos-archivos', TipoPermisoArchivoController);
app.use('/api/tipos-usuarios', TipoUsuarioController);
app.use('/api/validaciones-profesionales', ValidacionProfesionalController);
app.use('/api/vinculos-profesionales-pertenecientes', VinculoProfesionalPertenecienteController);
app.use('/api/vinculos-tutor-pertenecientes', VinculoTutorPertenecienteController);
app.use('/api/vinculos/invite', inviteRateLimiter, InviteVinculoController);

app.use(errorMiddleware);

export default app;

async function startServer() {
  try {
    await BD.testConnection();
    console.log('Conexion a base de datos OK');

    await setupRedisRateLimit();

    await setupRealtime(httpServer);

    if (envConfig.startNotificationWorker) {
      startNotificationWorker();
    }

    startPictogramaSyncJob();
    startRoutineReminderWorker();
    startScheduledReportWorker();
    startInactivePatientWorker();

    httpServer.listen(envConfig.port, () => {
      console.log(`Servidor escuchando en puerto ${envConfig.port}`);
      console.log('Socket.io listo para chat y eventos realtime');
    });
  } catch (error) {
    console.log('Error al iniciar servidor:', error.message);
    process.exit(1);
  }
}

startServer();
