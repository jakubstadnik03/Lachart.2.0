/**
 * Apple Watch structured workout bridge.
 *
 * Maps a LaChart PlannedWorkout into a WorkoutKit-friendly payload and hands it
 * to the native `LaChartWorkoutPlan` Capacitor plugin, which builds a
 * `WorkoutKit.CustomWorkout` and schedules it (it then appears in the Apple
 * Workout app on the paired Apple Watch — watchOS 10+ / iOS 17+).
 *
 * Target resolution mirrors server/utils/workoutExporters.js so the watch
 * targets match the ZWO/TCX/FIT exports and the in-app live screen.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const LaChartWorkoutPlan = registerPlugin('LaChartWorkoutPlan');

const ZONE_PCTS = [0.55, 0.68, 0.83, 0.97, 1.10]; // Z1–Z5 as fraction of FTP

const SPORT_TO_HK = {
  bike: 'cycling',
  mtbike: 'cycling',
  run: 'running',
  walk: 'walking',
  brick: 'running',
  swim: 'swimming',
  rowing: 'rowing',
  crosstrain: 'crossTraining',
  strength: 'traditionalStrengthTraining',
  other: 'other',
};

export function isAppleWorkoutPlanSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** Total planned seconds, respecting interval-group repeats. */
export function planStepTotalSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach((s) => {
    if (!s.groupId) { total += s.durationSeconds || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const reps = (group.find((x) => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach((gs) => { total += (gs.durationSeconds || 0) * reps; });
  });
  return total;
}

/** Flatten grouped repeat blocks into a linear step list (mirrors exporter). */
function expandSteps(steps = []) {
  const out = [];
  let group = null;
  const flush = () => {
    if (!group || !group.members.length) { group = null; return; }
    const repeat = Math.max(1, Number(group.repeat) || 1);
    for (let r = 0; r < repeat; r++) {
      for (const c of group.members) out.push({ ...c, isGroupHeader: false });
    }
    group = null;
  };
  for (const s of steps) {
    if (s.isGroupHeader) {
      flush();
      group = { id: s.groupId, repeat: s.groupRepeat || 1, members: [s] };
    } else if (s.groupId && group && s.groupId === group.id) {
      group.members.push(s);
    } else {
      flush();
      out.push(s);
    }
  }
  flush();
  return out;
}

/** Mid-point of a profile zone {min,max}; min-anchored when max is open-ended. */
function zoneMid(z) {
  if (!z) return null;
  const min = Number(z.min) || 0;
  if (min <= 0) return null;
  const max = (z.max != null && z.max !== Infinity && Number(z.max) > 0) ? Number(z.max) : min * 1.08;
  return (min + max) / 2;
}

/**
 * Resolve a power target spec → absolute watts range, or null.
 * Profile zone ranges (`ctx.cyclingZones`) win over %FTP formulas — same
 * priority as the builder, the Garmin push and the file exports, so the watch
 * shows the watts the athlete planned with.
 */
function resolvePowerRange(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  const { ftp = 0, lt1Power = null, lt2Power = null, cyclingZones = null } = ctx;
  const pinned = Number(target.override);
  if (Number.isFinite(pinned) && pinned > 0 && target.type !== 'watts') {
    return { low: Math.round(pinned * 0.95), high: Math.round(pinned * 1.05) };
  }
  if (target.type === 'watts') {
    if (target.useRange) {
      const lo = Number(target.rangeMin) || 0;
      const hi = Number(target.rangeMax) || 0;
      if (hi > 0 && hi >= lo) return { low: lo, high: hi };
    }
    const v = Number(target.value) || 0;
    return v > 0 ? { low: Math.round(v * 0.95), high: Math.round(v * 1.05) } : null;
  }
  const lt1 = lt1Power || cyclingZones?.lt1 || (ftp ? ftp * 0.75 : 0);
  const lt2 = lt2Power || cyclingZones?.lt2 || ftp;
  const pct = Number(target.value) || 0;
  let centre = null;
  if (target.type === 'percent_ftp') centre = ftp ? ftp * pct / 100 : null;
  else if (target.type === 'percent_lt1') centre = lt1 ? lt1 * pct / 100 : null;
  else if (target.type === 'percent_lt2') centre = lt2 ? lt2 * pct / 100 : null;
  else if (target.type === 'lt1') centre = lt1;
  else if (target.type === 'lt2') centre = lt2;
  else if (target.type === 'zone') {
    const z = Math.max(1, Math.min(5, Number(target.value) || 1));
    centre = zoneMid(cyclingZones?.[`zone${z}`]);
    if (!centre && lt2) centre = [lt1 * 0.8, lt1, lt2 * 0.95, lt2, lt2 * 1.1][z - 1];
    if (!centre && ftp) centre = ftp * ZONE_PCTS[z - 1];
  }
  if (!centre || centre <= 0) return null;
  return { low: Math.round(centre * 0.95), high: Math.round(centre * 1.05) };
}

/**
 * Resolve a target → running speed range in m/s (WorkoutKit `speed` alert),
 * from the profile pace zones (sec/km). Mirrors the server's
 * resolveTargetPaceSecPerKm so the watch pace matches the plan.
 */
function resolveSpeedRange(target, ctx = {}) {
  const { lt1Pace = null, lt2Pace = null, runningZones = null } = ctx;
  const lt2p = lt2Pace || runningZones?.lt2 || null;
  if (!lt2p || !target || target.type === 'open') return null;
  const mid = (t) => (t.useRange ? (Number(t.rangeMin) + Number(t.rangeMax)) / 2 : (Number(t.value) || 0));
  const lt1p = lt1Pace || runningZones?.lt1 || lt2p * 1.12;
  let pace = null;
  const pinned = Number(target.override);
  if (Number.isFinite(pinned) && pinned > 0) pace = pinned;
  else if (target.type === 'lt1') pace = lt1p;
  else if (target.type === 'lt2') pace = lt2p;
  else if (target.type === 'percent_lt1') pace = mid(target) > 0 ? lt1p / (mid(target) / 100) : null;
  else if (target.type === 'percent_lt2' || target.type === 'percent_ftp') pace = mid(target) > 0 ? lt2p / (mid(target) / 100) : null;
  else if (target.type === 'zone') {
    const z = Math.max(1, Math.min(5, Number(target.value) || 2));
    pace = zoneMid(runningZones?.[`zone${z}`])
      || [lt2p * 1.30, lt1p, lt2p * 1.04, lt2p, lt2p * 0.93][z - 1];
  }
  if (!(pace > 0)) return null;
  const centre = 1000 / pace; // m/s
  return { low: Math.round(centre * 0.95 * 1000) / 1000, high: Math.round(centre * 1.05 * 1000) / 1000 };
}

/** Resolve a HR target spec → bpm range, or null. */
function resolveHrRange(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  const { maxHr = 0, hrZones = null } = ctx;
  if (target.useRange && (Number(target.rangeMax) || 0) > 0) {
    return { low: Number(target.rangeMin) || 0, high: Number(target.rangeMax) || 0 };
  }
  if (target.type === 'zone') {
    const zi = Math.max(1, Math.min(5, Number(target.value) || 1));
    const z = hrZones && hrZones[`zone${zi}`];
    if (z && Number(z.min) > 0) {
      const hi = (z.max === Infinity || z.max == null) ? (maxHr || Number(z.min) + 10) : Number(z.max);
      return { low: Number(z.min), high: hi };
    }
    if (maxHr > 0) {
      const pcts = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0]][zi - 1];
      return { low: Math.round(maxHr * pcts[0]), high: Math.round(maxHr * pcts[1]) };
    }
    return null;
  }
  // bpm value stored under `watts` type (reused schema) or explicit
  const v = Number(target.value) || 0;
  if (v > 40 && v < 230) return { low: Math.round(v * 0.96), high: Math.round(v * 1.04) };
  return null;
}

/**
 * Build the native payload for a planned workout.
 * @param {object} pw PlannedWorkout
 * @param {object} ctx { ftp, lt1Power, lt2Power, maxHr, hrZones }
 */
export function buildWorkoutPlanPayload(pw, ctx = {}) {
  const sportKey = String(pw?.sport || 'other').toLowerCase();
  const activity = SPORT_TO_HK[sportKey] || 'other';
  const isBikeLike = activity === 'cycling';

  const isRunLike = activity === 'running' || activity === 'walking';

  const expanded = expandSteps(Array.isArray(pw?.steps) ? pw.steps : []);
  const steps = expanded
    .map((s) => {
      const durationSeconds = Math.max(1, Math.round(Number(s.durationSeconds) || 0));
      const meters = Math.round(Number(s.distanceMeters) || 0);
      const isDistance = s.durationType === 'distance' && meters > 0;
      // Alert priority per sport: power for bike, pace for run, HR fallback.
      const power = resolvePowerRange(s.powerTarget, ctx);
      const speed = isRunLike ? resolveSpeedRange(s.powerTarget, ctx) : null;
      const hr = resolveHrRange(s.hrTarget, ctx);
      let alert = null;
      if (isBikeLike && power) alert = { metric: 'power', low: power.low, high: power.high };
      else if (speed) alert = { metric: 'speed', low: speed.low, high: speed.high };
      else if (hr) alert = { metric: 'heartRate', low: hr.low, high: hr.high };
      else if (power) alert = { metric: 'power', low: power.low, high: power.high };
      return {
        kind: s.stepType || 'work',
        label: s.label || '',
        durationSeconds,
        // 1 km repeats lap by distance on the watch, not by the time estimate.
        ...(isDistance ? { distanceMeters: meters } : {}),
        alert,
      };
    })
    .filter((s) => s.durationSeconds > 0 || s.distanceMeters > 0);

  return {
    activity,
    displayName: pw?.title || 'LaChart workout',
    location: activity === 'cycling' || activity === 'running' || activity === 'walking' ? 'outdoor' : 'indoor',
    steps,
  };
}

/** Check whether the device can schedule workouts (auth + watchOS support). */
export async function canScheduleAppleWorkout() {
  if (!isAppleWorkoutPlanSupported()) return false;
  try {
    const { available } = await LaChartWorkoutPlan.isAvailable();
    return Boolean(available);
  } catch {
    return false;
  }
}

/**
 * Send a planned workout to the Apple Watch (via WorkoutKit).
 * @returns {Promise<{ scheduled?: boolean, previewed?: boolean, reason?: string }>}
 */
export async function sendPlannedWorkoutToWatch(pw, ctx = {}) {
  if (!isAppleWorkoutPlanSupported()) return { reason: 'not_ios' };
  const payload = buildWorkoutPlanPayload(pw, ctx);
  if (!payload.steps.length) return { reason: 'no_steps' };

  // Ensure authorization (prompts on first use only).
  try {
    const auth = await LaChartWorkoutPlan.requestAuthorization();
    if (auth && auth.granted === false) return { reason: 'not_authorized' };
  } catch {
    /* older plugin without auth method — continue */
  }

  // Schedule for the planned date (today if missing/past), at a sensible hour.
  let dateIso = null;
  try {
    const d = pw?.date ? new Date(pw.date) : new Date();
    if (!Number.isNaN(d.getTime())) { d.setHours(7, 0, 0, 0); dateIso = d.toISOString(); }
  } catch { /* ignore */ }

  return LaChartWorkoutPlan.scheduleWorkout({ ...payload, dateIso });
}

export { LaChartWorkoutPlan };
