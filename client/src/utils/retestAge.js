/**
 * How old a lactate test may get before it is worth repeating.
 *
 * The History tab answered "retest?" twice from different evidence: the
 * threshold chart looked only at current Strava power ("Threshold Still Valid
 * — no retest needed"), the recommendation badge only at the test's age
 * ("Last test 95d ago — retest recommended"), and both were on screen at once.
 * Both now share these limits, and the chart takes the stricter of the two.
 */
export const RETEST_SOON_DAYS = 60;
export const RETEST_DAYS = 90;

/** @returns {'ok'|'soon'|'retest'|null} */
export function retestLevelForAge(days) {
  if (days == null || !Number.isFinite(Number(days))) return null;
  if (days >= RETEST_DAYS) return 'retest';
  if (days >= RETEST_SOON_DAYS) return 'soon';
  return 'ok';
}

const RANK = { ok: 0, soon: 1, retest: 2 };

/** The more urgent of two levels (either may be null). */
export function stricterRetestLevel(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return RANK[b] > RANK[a] ? b : a;
}
