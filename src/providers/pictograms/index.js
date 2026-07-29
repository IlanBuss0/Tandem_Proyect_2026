import ArasaacProvider from './ArasaacProvider.js';
import GlobalSymbolsProvider from './GlobalSymbolsProvider.js';
import TablerProvider from './TablerProvider.js';
import MulberryProvider from './MulberryProvider.js';
import OpenMojiProvider from './OpenMojiProvider.js';

// Registry central de proveedores de pictogramas. Un solo lugar para saber
// que proveedores existen y agregar uno nuevo sin tocar PictogramaService.
export const PICTOGRAM_PROVIDERS = {
  MULBERRY: new MulberryProvider(),
  OPENMOJI: new OpenMojiProvider(),
  GLOBAL_SYMBOLS: new GlobalSymbolsProvider(),
  ARASAAC: new ArasaacProvider(),
  TABLER: new TablerProvider(),
};

// Proveedores que bajan su catalogo completo con los archivos en memoria y se
// importan con PictogramCatalogImporter. Son los que corre el sync mensual.
// El orden define la prioridad conceptual del catalogo: Mulberry es el nucleo
// de CAA (disenado para adultos) y OpenMoji la ampliacion de vocabulario.
export const BULK_CATALOG_PROVIDERS = [
  { key: 'MULBERRY', storagePrefix: 'pictogramas/mulberry' },
  { key: 'OPENMOJI', storagePrefix: 'pictogramas/openmoji' },
];

export function getProviderByKey(key) {
  return PICTOGRAM_PROVIDERS[key] || null;
}

export { ArasaacProvider, GlobalSymbolsProvider, TablerProvider, MulberryProvider, OpenMojiProvider };
