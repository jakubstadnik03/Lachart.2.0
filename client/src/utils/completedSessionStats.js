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
 * How long a session took — the time spent training, not the time elapsed.
 *
 * The moving clock comes first, deliberately. This chain used to ask totalTime
 * first, which every mapper fills with the elapsed clock, so a ride with the
 * Garmin paused at a café counted the café. The activity's own card had always
 * shown the moving time, so the week strip and the session disagreed about the
 * same ride. Training time is what an athlete means by "how long was it", so
 * that is what every total now adds up.
 *
 * Field names carry the distinction rather than the values: movingTime and
 * moving_time from the integrations, totalTimerTime from a FIT file (its
 * totalElapsedTime is the one that includes pauses). Only when a source offers
 * no moving clock at all does the chain fall through to totalTime and the
 * elapsed fields — better a slightly long number than a zero.
 *
 * `duration` sits in that fallback because it is what a hand-entered training
 * stores, and an athlete typing a session length is typing its training time.
 *
 * One chain, asked by every surface that sums activities — so reversing the
 * order moves the week strip, the calendar summary, the planner and the
 * dashboard together, and none of them can drift from the others.
 */
export function completedSecs(t) {
  const v = t?.movingTime || t?.moving_time || t?.totalTimerTime
    || t?.totalTime || t?.duration
    || t?.elapsedTime || t?.elapsed_time
    || t?.totalElapsedTime || t?.durationSeconds;
  return durationSecs(v);
}

/**
 * Seconds from whatever a record calls a duration.
 *
 * A manually entered training stores its duration the way a person writes one
 * — "4:10:12" — while every synced activity stores a number. Number("4:10:12")
 * is NaN, and a sum with one NaN in it is NaN, which the formatters then print
 * as "0m": one hand-entered session was enough to zero a whole week on the
 * dashboard while its distance and session count stayed right.
 *
 * @param {unknown} value seconds, or "H:MM:SS" / "MM:SS"
 * @returns {number} seconds, 0 when there is nothing usable
 */
export function durationSecs(value) {
  if (value == null) return 0;

  if (typeof value === 'string') {
    const s = value.trim();
    if (s.includes(':')) {
      const parts = s.split(':').map((p) => Number(p.trim()));
      if (parts.some((p) => !Number.isFinite(p) || p < 0)) return 0;
      // "H:MM:SS" or "MM:SS" — anything longer is not a duration we wrote.
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
    }
  }

  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
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
