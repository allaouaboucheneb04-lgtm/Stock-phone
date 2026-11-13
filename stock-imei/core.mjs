/** Domain rules for IMEI Stock. No network dependencies. */
export function normalizeImei(value) {
  return String(value ?? '').replace(/[\s.\-]/g, '');
}
export function isValidImei(value) {
  const digits = normalizeImei(value);
  if (!/^\d{15}$/.test(digits)) return false;
  // Luhn: double digits from the right starting at the second-to-last digit.
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[i]);
    if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
}
export function extractImeis(raw) {
  const input = String(raw ?? '');
  const matches = [];
  for (const hit of input.matchAll(/(?<!\d)\d{15}(?!\d)/g)) {
    if (isValidImei(hit[0]) && !matches.includes(hit[0])) matches.push(hit[0]);
  }
  return matches;
}
export function money(value) {
  const num = Number(value);
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(Number.isFinite(num) ? num : 0);
}
export function inventorySummary(phones) {
  const current = phones.filter(p => p.status === 'stock' || p.status === 'reserve');
  return {
    stock: phones.filter(p => p.status === 'stock').length,
    reserved: phones.filter(p => p.status === 'reserve').length,
    sold: phones.filter(p => p.status === 'sold').length,
    all: phones.length,
    costValue: current.reduce((sum, p) => sum + (Number(p.purchasePrice) || 0), 0),
    potentialValue: current.reduce((sum, p) => sum + (Number(p.listPrice) || 0), 0),
    realizedProfit: phones.filter(p => p.status === 'sold').reduce((sum, p) => sum + (Number(p.salePrice) || 0) - (Number(p.purchasePrice) || 0), 0),
  };
}
export function csvEncode(rows) {
  return rows.map(row => row.map(value => {
    const s = String(value ?? '');
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
}
export function validatePhoneDraft(draft, phones, editingId = null) {
  const imei = normalizeImei(draft.imei);
  const imei2 = normalizeImei(draft.imei2);
  if (!isValidImei(imei)) return 'L’IMEI principal doit comporter 15 chiffres avec une clé de contrôle valide.';
  if (imei2 && !isValidImei(imei2)) return 'Le deuxième IMEI est invalide (15 chiffres requis).';
  if (imei2 && imei2 === imei) return 'IMEI 1 et IMEI 2 doivent être différents.';
  if (!String(draft.brand || '').trim() || !String(draft.model || '').trim()) return 'Indique la marque et le modèle.';
  if (Number(draft.purchasePrice) < 0 || Number(draft.listPrice) < 0) return 'Les montants ne peuvent pas être négatifs.';
  const conflict = phones.find(p => p.id !== editingId && [p.imei, p.imei2].some(existing => existing && [imei, imei2].includes(existing)));
  if (conflict) return `Cet IMEI existe déjà : ${conflict.brand} ${conflict.model} (${conflict.imei}).`;
  return '';
}