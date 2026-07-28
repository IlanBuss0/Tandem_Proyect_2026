import axios from 'axios';
import { envConfig } from '../configs/env.config.js';

const RESEND_URL = 'https://api.resend.com/emails';

export default class EmailService {
  constructor() {
    console.log('Estoy en: EmailService.constructor()');
    this.apiKey = envConfig.resendApiKey || null;
  }

  /**
   * Sin RESEND_API_KEY configurada, el link se loguea en consola en vez de
   * fallar — asi se puede desarrollar y probar el flujo de verificacion sin
   * la key. El link nunca se loguea si hay una key real configurada.
   */
  sendVerificationEmailAsync = async ({ to, nombre, verifyUrl }) => {
    if (!this.apiKey) {
      console.log(`[EmailService] RESEND_API_KEY no configurada. Link de verificacion para ${to}: ${verifyUrl}`);
      return { simulated: true };
    }

    try {
      const response = await axios.post(
        RESEND_URL,
        {
          from: envConfig.resendFromEmail,
          to: [to],
          subject: 'Confirmá tu email en Tándem',
          html: this._buildVerificationHtml(nombre, verifyUrl),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
      return response.data;
    } catch (error) {
      // El registro no debe fallar porque Resend este caido — se loguea y
      // el usuario puede reenviar el mail despues con el boton de reenvio.
      console.error('[EmailService] Error enviando mail de verificacion:', error?.response?.data || error.message);
      return { simulated: false, error: true };
    }
  };

  _buildVerificationHtml = (nombre, verifyUrl) => `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#6F518E;">¡Hola${nombre ? `, ${nombre}` : ''}!</h2>
      <p>Confirmá tu email para terminar de activar tu cuenta en Tándem.</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background:#6F518E;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Confirmar mi email
        </a>
      </p>
      <p style="color:#888;font-size:13px;">Si no creaste esta cuenta, podés ignorar este mensaje.</p>
    </div>
  `;
}
