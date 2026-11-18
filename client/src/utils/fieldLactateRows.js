import { LIKELY_TEST_SCORE, LIKELY_INTERVALS_SCORE } from './intervalSessionScore';

/** Strava says "Ride" / "VirtualRide", Garmin "cycling": one word per sport here. */
export function sportLabel(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('virtual') && (s.includes('ride') || s.includes('cycl'))) return 'Indoor ride';
  if (s.includes('ride') || s.includes('cycl') || s.includes('bike')) return 'Ride';
  if (s.includes('virtual') && s.includes('run')) return 'Indoor run';
  if (s.includes('run')) return 'Run';
  if (s.includes('swim')) return 'Swim';
  return sport ? String(sport).charAt(0).toUpperCase() + String(sport).slice(1) : '';
}

/** Which badge a row earns: 2 likely test, 1 intervals, 0 none. */
export function pendingTier(score) {
  if (score >= LIKELY_TEST_SCORE) return 2;
  if (score >= LIKELY_INTERVALS_SCORE) return 1;
  return 0;
}

/**
 * Likely tests first, then interval sessions, then the rest — and newest
 * first inside each group. Sorting on the raw score put a ride from three
 * weeks ago above yesterday's for a point of lap variance, so the list read
 * as if it had no order at all.
 */
export function sortPendingRows(rows) {
  const at = (r) => {
    const t = r?.startDate ? new Date(r.startDate).getTime() : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (
    pendingTier(b.score) - pendingTier(a.score) || at(b) - at(a)
  ));
}
