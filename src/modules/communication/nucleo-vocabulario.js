// Unica responsabilidad: el catalogo del vocabulario nucleo (Sesion 11,
// item 37) — las palabras que en CAA cubren la mayor parte de lo que se
// dice en el dia a dia (a diferencia del vocabulario "de frontera", que es
// especifico de una situacion: nombres de comidas, de personas, etc.).
// Curaduria de contenido, no logica — cada entrada es solo la palabra a
// buscar en el catalogo de pictogramas, el motor de busqueda ya existente
// (PictogramaService.searchAsync) resuelve la imagen.
//
// Organizado por categoria para que el comunicador pueda agrupar visualmente
// (mismo criterio que cualquier tablero CAA de nucleo: pronombres y verbos
// primero, son los que mas se repiten).
export const NUCLEO_VOCABULARIO = Object.freeze({
  pronombres: ['yo', 'vos', 'el', 'ella', 'nosotros', 'ellos', 'mio', 'tuyo'],
  verbos_nucleo: [
    'querer', 'ir', 'venir', 'parar', 'ayudar', 'mirar', 'escuchar', 'jugar',
    'comer', 'tomar', 'hacer', 'poner', 'sacar', 'dar', 'tener', 'ver',
    'decir', 'gustar', 'necesitar', 'poder', 'saber', 'buscar', 'esperar', 'terminar',
  ],
  cantidad_estado: ['mas', 'todo', 'nada', 'terminado', 'otra vez', 'de nuevo', 'poco', 'mucho'],
  si_no_preguntas: ['si', 'no', 'no se', 'tal vez', 'que', 'quien', 'donde', 'cuando', 'por que', 'como', 'cual'],
  descriptores: ['grande', 'chico', 'rapido', 'lento', 'bueno', 'malo', 'lindo', 'feo', 'caliente', 'frio', 'nuevo', 'viejo'],
  lugar: ['arriba', 'abajo', 'adentro', 'afuera', 'aca', 'alla', 'cerca', 'lejos'],
  conectores: ['y', 'con', 'sin', 'para', 'porque', 'pero', 'despues', 'antes'],
  social: ['hola', 'chau', 'gracias', 'por favor', 'perdon', 'ayuda', 'basta', 'espera'],
  personas_lugares: ['mama', 'papa', 'familia', 'amigo', 'casa', 'escuela', 'bano', 'agua'],
  emociones_basicas: ['feliz', 'triste', 'enojado', 'cansado', 'nervioso', 'tranquilo'],
});

export function getAllNucleoWords() {
  return Object.values(NUCLEO_VOCABULARIO).flat();
}

export function getNucleoCategories() {
  return Object.keys(NUCLEO_VOCABULARIO);
}

// Tableros por situacion (item 38): a diferencia del nucleo (siempre
// disponible, son las palabras que mas se repiten en general), estos son
// vocabularios de "frontera" — especificos de un contexto puntual. Se
// muestran en vez del nucleo cuando se elige una situacion, no ademas.
export const TABLEROS_SITUACIONALES = Object.freeze({
  casa: ['comer', 'dormir', 'bañarse', 'television', 'jugar', 'living', 'cocina', 'cuarto', 'mascota', 'ordenar'],
  escuela: ['maestra', 'compañero', 'recreo', 'tarea', 'cuaderno', 'lapiz', 'guardapolvo', 'formar', 'examen', 'clase'],
  salir: ['colectivo', 'auto', 'caminar', 'plaza', 'shopping', 'cine', 'plata', 'boleto', 'esperar', 'llegar'],
  medico: ['doctor', 'dolor', 'pastilla', 'inyeccion', 'consultorio', 'enfermera', 'turno', 'sala de espera', 'curita', 'termometro'],
});

export function getSituationalBoardNames() {
  return Object.keys(TABLEROS_SITUACIONALES);
}
