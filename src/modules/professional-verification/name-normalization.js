export function normalizeIdentityText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDocument(value) {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

export function namesMatch(left, right) {
  const a = normalizeIdentityText(left).split(' ').filter(Boolean);
  const b = normalizeIdentityText(right).split(' ').filter(Boolean);
  if (!a.length || !b.length) return false;
  return a.join(' ') === b.join(' ');
}
