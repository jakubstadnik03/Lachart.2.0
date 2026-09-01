/**
 * The one-line summary under a session's title: time · distance · pace or
 * power · TSS.
 *
 * Both calendars print this line, and until now only one of them had it — the
 * dashboard's week strip showed a bare title, so the same ride read as three
 * facts on one screen and as a name on the other. It lives here so the two
 * cannot drift into disagreeing about which clock a session took.
 */
import {
  formatDistance,
  formatPaceFromDistanceAndDuration,
  formatPaceFromSpeedMps,
  resolveDistanceUnitSystem,
  getUserUnits,
} from './unitsConverter';
import { resolveActivityTss } from './computeTss';
import { completedSecs } from './completedSessionStats';

/** Resolve display unit system — prefers auth user / localStorage units over API profile. */
export function userUnitSystem(user) {
  return resolveDistanceUnitSystem({ units: getUserUnits(user) });
}

export function fmtPlanDuration(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  return `${m}m`;
}

/** Compact completed line: time · distance · avg power/pace · TSS. */
export function activityCompletedStats(activity, profile = null) {
  if (!activity) return null;
  // The whole session, the same clock the week summary sums. Showing the
  // moving time here instead meant a week's cards added up to less than the
  // week's own total — 15:03 of rides against the 15:20 printed beside them —
  // with nothing on screen to say the two were answering different questions.
  const dur = completedSecs(activity);
  const dist = Number(activity.distance || activity.totalDistance || 0);
  const power = Number(
    activity.normalizedPower || activity.avgPower || activity.average_watts || activity.averagePower || 0,
  );
  const s = String(activity.sport || activity.type || '').toLowerCase();
  const isSwim = s.includes('swim');
  const isRun = s.includes('run') || s.includes('hike') || s.includes('walk') || s.includes('trail');
  const isBike = s.includes('ride') || s.includes('cycl') || s.includes('bike') || s.includes('virtual');

  const unitSystem = userUnitSystem(profile);
  const durStr = dur > 0 ? fmtPlanDuration(dur) : null;
  const distStr = dist > 0 ? formatDistance(dist, unitSystem).formatted : null;

  let paceOrPower = null;
  if (isBike && power > 0) {
    paceOrPower = `${Math.round(power)} W`;
  } else if (isSwim || isRun) {
    const avgSpeed = Number(activity.avgSpeed || activity.average_speed || 0);
    const sport = activity.sport || activity.type || '';
    // Pace is a different question from how long the session took: it asks how
    // fast the athlete was while moving, so it keeps the moving clock and only
    // falls back to the whole session when there is no other number.
    const paceSecs = Number(
      activity.movingTime || activity.moving_time || activity.totalTimerTime || dur,
    );
    if (avgSpeed > 0) {
      paceOrPower = formatPaceFromSpeedMps(avgSpeed, unitSystem, sport);
    } else if (dist > 0 && paceSecs > 0) {
      paceOrPower = formatPaceFromDistanceAndDuration(dist, paceSecs, unitSystem, sport);
    }
  }

  const tssVal = profile
    ? resolveActivityTss(activity, profile, { user: profile })
    : Number(activity.tss || activity.trainingStressScore || activity.trainingLoad || activity.manualTss || 0);
  const tssStr = tssVal > 0 ? `${Math.round(tssVal)} TSS` : null;

  const parts = [durStr, distStr, paceOrPower, tssStr].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
