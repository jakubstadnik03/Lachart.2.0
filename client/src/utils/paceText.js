/**
 * Pace as people write it.
 *
 * The model keeps pace in seconds per kilometre (or per 100 m); nobody types
 * it that way. These two translate at the edge of a text field: "4:20" in,
 * 260 stored, "4:20" back out.
 */

/** "4:20" → 260; "260" → 260; anything else → null. */
export function parsePaceSeconds(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && sec > 0 ? sec : null;
}

/** 260 → "4:20"; anything unusable → "". */
export function formatPaceClock(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
