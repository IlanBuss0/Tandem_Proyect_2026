import BD from '../db/BD.js';

export default class ActivityRevisionRepository {
  createAsync = async ({ source, definition, idUsuarioAutor, publicada = false }) => {
    const sql = `
      INSERT INTO actividad_revisiones (
        id_actividad,
        id_actividad_personalizada,
        numero_revision,
        schema_version,
        id_categoria,
        titulo,
        descripcion_perteneciente,
        instrucciones,
        objetivo_equipo_apoyo,
        proposito,
        dificultad_general,
        duracion_esperada_minutos,
        configuracion_dificultad,
        configuracion_apoyos,
        criterios_exito,
        contexto_esperado,
        game_type,
        game_data,
        pasos,
        mensaje_finalizacion,
        idioma,
        id_usuario_autor,
        publicada,
        activa,
        definicion
      )
      VALUES (
        $1,
        $2,
        COALESCE((
          SELECT MAX(numero_revision) + 1
          FROM actividad_revisiones
          WHERE (id_actividad = $1 OR ($1 IS NULL AND id_actividad IS NULL))
            AND (id_actividad_personalizada = $2 OR ($2 IS NULL AND id_actividad_personalizada IS NULL))
        ), 1),
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12::jsonb,
        $13::jsonb,
        $14::jsonb,
        $15::jsonb,
        $16,
        $17::jsonb,
        $18::jsonb,
        $19,
        $20,
        $21,
        $22,
        TRUE,
        $23::jsonb
      )
      RETURNING id, numero_revision
    `;

    const values = [
      source.idActividad ?? null,
      source.idActividadPersonalizada ?? null,
      definition.schemaVersion,
      definition.idCategoria ?? null,
      definition.titulo,
      definition.descripcionPerteneciente ?? null,
      definition.instrucciones ?? null,
      definition.objetivoEquipoApoyo ?? null,
      definition.proposito,
      definition.dificultadGeneral,
      definition.duracionEsperadaMinutos ?? null,
      JSON.stringify(definition.configuracionDificultad ?? {}),
      JSON.stringify(definition.configuracionApoyos ?? {}),
      JSON.stringify(definition.criteriosExito ?? {}),
      JSON.stringify(definition.contextoEsperado ?? {}),
      definition.gameType ?? null,
      JSON.stringify(definition.gameData ?? {}),
      JSON.stringify(definition.pasos ?? []),
      definition.mensajeFinalizacion ?? null,
      definition.idioma ?? 'es',
      idUsuarioAutor ?? null,
      publicada,
      JSON.stringify(definition),
    ];

    const result = await BD.queryOne(sql, values);
    return result;
  };

  getByIdAsync = async (id) => {
    const sql = `
      SELECT *
      FROM actividad_revisiones
      WHERE id = $1
    `;
    return await BD.queryOne(sql, [id]);
  };
}
