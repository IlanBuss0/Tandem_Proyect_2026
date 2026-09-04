export function normalizeProfessionalStatus(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isVerifiedProfessionalStatus(value) {
  return ['verified', 'validado', 'validada', 'aprobado', 'aprobada', 'verificado', 'verificada']
    .includes(normalizeProfessionalStatus(value));
}
