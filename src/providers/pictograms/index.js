import ArasaacProvider from './ArasaacProvider.js';
import GlobalSymbolsProvider from './GlobalSymbolsProvider.js';
import TablerProvider from './TablerProvider.js';

// Registry central de proveedores de pictogramas. Un solo lugar para saber
// que proveedores existen y agregar uno nuevo sin tocar PictogramaService.
export const PICTOGRAM_PROVIDERS = {
  ARASAAC: new ArasaacProvider(),
  GLOBAL_SYMBOLS: new GlobalSymbolsProvider(),
  TABLER: new TablerProvider(),
};

export function getProviderByKey(key) {
  return PICTOGRAM_PROVIDERS[key] || null;
}

export { ArasaacProvider, GlobalSymbolsProvider, TablerProvider };
