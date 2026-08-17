/**
 * What a completed session amounts to — how long, how far, how hard.
 *
 * These live here, on their own, rather than in plannerWeekUtils where they
 * started: a week total is computed on the dashboard, in the calendar and on
 * the week strip, and none of those should have to pull the workout builder
 * and its modals in to ask how long a ride took. Every surface that adds up
 * activities imports these, so no two of them can answer differently.
 */
import { resolveActivityTss } from './computeTss';

/**
 * How long a session took.
 *
 * This is WeekStrip's chain, character for character, because WeekStrip is the
 * reading confirmed as correct — swim 7:00 where the calendar's week summary
 * said 5:40, over an hour a week on the same activities.
 *
 * Reasoning out a "better" order got it wrong twice: which field means what
 * varies by source, and arguing about it does not settle the question.
 *
 * totalTime comes first, and it means the whole session. Anything that builds
 * an activity row has to put the elapsed clock there — a mapper that fills it
 * from the moving time changes every total in the app without touching one of
 * them, which is exactly how the dashboard's week came to read 19 minutes
 * short of the calendar's.
 *
 * The three at the end only fire when every field above is absent, so they
 * extend the chain without changing any answer it already gives.
 */
export function completedSecs(t) {
  const v = t?.totalTime || t?.duration || t?.movingTime || t?.moving_time
    || t?.elapsedTime || t?.elapsed_time
    || t?.totalTimerTime || t?.totalElapsedTime || t?.durationSeconds;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function completedDistM(t) {
  const d = t?.distance ?? t?.totalDistance ?? t?.total_distance;
  if (d == null) return 0;
  if (typeof d === 'string') {
    const s = d.trim().toLowerCase();
    const km = s.match(/^([\d.]+)\s*km$/);
    if (km) return parseFloat(km[1]) * 1000;
    const m = s.match(/^([\d.]+)\s*m$/);
    if (m) return parseFloat(m[1]);
  }
  const n = Number(d);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 500 ? n : n * 1000;
}

export function completedTss(t, userProfile, user) {
  return resolveActivityTss(t, userProfile, { user }) || Number(t?.tss || t?.TSS || t?.totalTSS) || 0;
}
