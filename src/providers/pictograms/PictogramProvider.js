/**
 * Contrato base de un proveedor de pictogramas. El servicio general
 * (PictogramaService) no debe conocer el formato interno de cada proveedor:
 * todo proveedor normaliza sus resultados a la misma forma antes de
 * devolverlos.
 *
 * Forma normalizada esperada (misma que usa PictogramaRepository):
 * {
 *   id, arasaacId, name, emoji, imageUrl, downloadUrl, category, tags,
 *   language, source, author, license,
 *   licenseCode, licenseVersion, licenseUrl, attributionText, sourceUrl,
 *   commercialUseAllowed, shareAlikeRequired,
 * }
 *
 * No se usa `extends` en los proveedores concretos por simplicidad (son
 * objetos con estos mismos metodos), pero esta clase documenta el contrato
 * y sirve de referencia rapida.
 */
export default class PictogramProvider {
  /** Clave corta del proveedor, coincide con la columna `origen` en la DB. */
  key = 'UNKNOWN';

  /** Si es false, ningun pictograma de este proveedor puede publicarse en modo comercial. */
  commercialUseAllowed = false;

  // eslint-disable-next-line no-unused-vars
  async search({ language, text, limit }) {
    throw new Error(`${this.key}: search() no implementado.`);
  }

  // eslint-disable-next-line no-unused-vars
  async getById({ language, id }) {
    throw new Error(`${this.key}: getById() no implementado.`);
  }

  // eslint-disable-next-line no-unused-vars
  async syncCatalog({ language }) {
    throw new Error(`${this.key}: syncCatalog() no implementado.`);
  }

  // eslint-disable-next-line no-unused-vars
  buildImageUrl(id, resolution) {
    throw new Error(`${this.key}: buildImageUrl() no implementado.`);
  }
}
