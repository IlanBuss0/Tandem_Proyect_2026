class ActividadAsignada {
  constructor({
    id = null,
    id_actividad = null,
    id_actividad_personalizada = null,
    id_perteneciente,
    id_usuario_asignador,
    id_estado_actividad,
    fecha_asignacion,
    fecha_completada = null,
    puntaje_ultimo = null,
    puntaje_mejor = null,
    fecha_ultimo_intento = null,
  }) {
    this.id = id;
    this.id_actividad = id_actividad;
    this.id_actividad_personalizada = id_actividad_personalizada;
    this.id_perteneciente = id_perteneciente;
    this.id_usuario_asignador = id_usuario_asignador;
    this.id_estado_actividad = id_estado_actividad;
    this.fecha_asignacion = fecha_asignacion;
    this.fecha_completada = fecha_completada;
    this.puntaje_ultimo = puntaje_ultimo;
    this.puntaje_mejor = puntaje_mejor;
    this.fecha_ultimo_intento = fecha_ultimo_intento;
  }
}

export default ActividadAsignada;
