/**
 * Hours as a person types them.
 *
 * Athletes write "8:15", "7.5" and "7,5" for the same thing, and a log that
 * accepts only one of those is a log with holes in it. Kept apart from the
 * card so it can be tested without the API layer coming along.
 */

/** "8:15" | "7.5" | "7,5" | "8" -> minutes, or null when it is not a duration. */
export function parseHoursToMinutes(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const clock = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2]);
    if (m > 59) return null;
    return h * 60 + m;
  }
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 60);
}

/** Minutes back to the clock they were typed as. */
export function formatMinutesAsClock(mins) {
  if (mins == null || !Number.isFinite(Number(mins))) return '';
  const m = Math.max(0, Math.round(Number(mins)));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
