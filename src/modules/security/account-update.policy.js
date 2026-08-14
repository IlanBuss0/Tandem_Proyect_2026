const SELF_EDITABLE_FIELDS = Object.freeze([
  'nombre_usuario', 'nombre', 'apellido', 'telefono', 'fecha_nacimiento',
]);
const LINKED_EDITABLE_FIELDS = Object.freeze([
  'nombre', 'apellido', 'telefono', 'fecha_nacimiento',
]);

export function pickEditableUserFields(data, { self }) {
  const allowed = self ? SELF_EDITABLE_FIELDS : LINKED_EDITABLE_FIELDS;
  return Object.fromEntries(allowed.filter((field) => data?.[field] !== undefined).map((field) => [field, data[field]]));
}

export function toPublicUser(usuario) {
  if (!usuario) return usuario;
  const { id, id_tipo_usuario, nombre_usuario, nombre, apellido, activo } = usuario;
  return { id, id_tipo_usuario, nombre_usuario, nombre, apellido, activo };
}
