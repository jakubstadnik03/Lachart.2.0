/** Allow typing lactate with comma or period (EU/CZ keyboards on iOS). */
export function sanitizeLactateInput(raw) {
  if (raw == null) return '';
  let s = String(raw).replace(/[^\d.,]/g, '');
  const sepIdx = s.search(/[.,]/);
  if (sepIdx >= 0) {
    s = s.slice(0, sepIdx + 1) + s.slice(sepIdx + 1).replace(/[.,]/g, '');
  }
  return s;
}

export function parseLactateValue(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().replace(',', '.');
  if (s === '' || s === '.') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Same rules as lactate — one decimal separator, comma or period. */
export const sanitizeDecimalInput = sanitizeLactateInput;
