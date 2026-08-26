/**
 * Picking months for the radar's monthly comparison.
 *
 * Switching to "Monthly" used to tick every month that has ever had data —
 * nine years of them — which drew a hundred overlapping rings and presented
 * the athlete with a wall of a hundred checkboxes to untick. What people
 * actually want is a stretch of time: this winter, last season, the last six
 * months. So the picker is a range, and these are the two ends of it.
 */

/** Newest first, the way availableMonths comes out of the chart. */
export function sortMonthKeysDesc(keys) {
  return [...new Set((keys || []).filter(Boolean).map(String))].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * Every available month between two ends, inclusive, whichever way round the
 * ends are given — dragging "from" past "to" is a slip, not a request for
 * nothing.
 *
 * @param {Array<string|{key: string}>} available month keys ('YYYY-MM')
 * @returns {string[]} keys, newest first
 */
export function monthKeysBetween(available, a, b) {
  const keys = sortMonthKeysDesc((available || []).map((m) => (typeof m === 'string' ? m : m?.key)));
  if (!keys.length) return [];
  const lo = a && b ? (a < b ? a : b) : (a || b);
  const hi = a && b ? (a < b ? b : a) : (a || b);
  if (!lo || !hi) return keys;
  return keys.filter((k) => k >= lo && k <= hi);
}

/**
 * What to select the first time someone opens the monthly view.
 *
 * Six months is a training block or two: enough to see a direction, few enough
 * that the rings stay apart.
 */
export function defaultMonthRange(available, count = 6) {
  const keys = sortMonthKeysDesc((available || []).map((m) => (typeof m === 'string' ? m : m?.key)));
  return keys.slice(0, Math.max(1, count));
}

/** The two ends of a selection, for the From/To controls. */
export function rangeEnds(selected) {
  const keys = sortMonthKeysDesc(selected);
  if (!keys.length) return { from: null, to: null };
  return { from: keys[keys.length - 1], to: keys[0] };
}
