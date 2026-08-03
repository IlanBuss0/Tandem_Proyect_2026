import BD from '../db/BD.js';
import { MIN_USES } from '../modules/usage/memory-profile.js';

// Unica responsabilidad: la unica query SQL real del perfil de memoria —
// que pictogramas especificos aparecieron resueltos mas veces para esta
// persona, cruzando rutina_items y eventos_calendario (las dos tablas
// reales de la migracion anterior). Antes de esa migracion esto hubiera
// significado parsear JSON a mano fila por fila; ahora es un GROUP BY.
export default class MemoryProfileRepository {
  getFrequentPictogramIdsAsync = async (idUsuario) => {
    const rows = await BD.query(
      `
        SELECT id_pictograma, COUNT(*) as usos FROM (
          SELECT ri.id_pictograma FROM rutina_items ri
          JOIN rutinas r ON r.id = ri.id_rutina
          WHERE r.id_usuario = $1 AND ri.id_pictograma IS NOT NULL
          UNION ALL
          SELECT id_pictograma FROM eventos_calendario
          WHERE id_usuario = $1 AND id_pictograma IS NOT NULL
        ) t
        GROUP BY id_pictograma
        HAVING COUNT(*) >= $2
        ORDER BY usos DESC
      `,
      [idUsuario, MIN_USES],
    );
    return rows.map((row) => row.id_pictograma);
  };
}
