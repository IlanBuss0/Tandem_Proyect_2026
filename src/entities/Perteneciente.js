class Perteneciente {
  constructor({
    id = null,
    id_usuario,
    id_nivel_apoyo,
    id_autonomia_operativa,
    puede_autogestionarse = false,
    observacion_general = null,
    nivel_apoyo_sugerido = false,
  }) {
    this.id = id;
    this.id_usuario = id_usuario;
    this.id_nivel_apoyo = id_nivel_apoyo;
    this.id_autonomia_operativa = id_autonomia_operativa;
    this.puede_autogestionarse = puede_autogestionarse;
    this.observacion_general = observacion_general;
    // true cuando el valor lo puso el cuestionario de onboarding y todavia
    // ningun profesional/tutor lo confirmo. Nunca se usa para bloquear nada,
    // es solo informativo para quien mira el perfil.
    this.nivel_apoyo_sugerido = nivel_apoyo_sugerido;
  }
}

export default Perteneciente;
