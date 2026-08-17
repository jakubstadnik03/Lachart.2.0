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

/** Resolve a power target spec → absolute watts range, or null. */
function resolvePowerRange(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  const { ftp = 0, lt1Power = null, lt2Power = null } = ctx;
  if (target.type === 'watts') {
    if (target.useRange) {
      const lo = Number(target.rangeMin) || 0;
      const hi = Number(target.rangeMax) || 0;
      // Tolerate an inverted range rather than dropping the alert entirely.
      if (lo > 0 && hi > 0) return { low: Math.min(lo, hi), high: Math.max(lo, hi) };
      const single = Math.max(lo, hi);
      if (single > 0) return { low: Math.round(single * 0.95), high: Math.round(single * 1.05) };
    }
    const v = Number(target.value) || 0;
    return v > 0 ? { low: Math.round(v * 0.95), high: Math.round(v * 1.05) } : null;
  }
  if (!ftp) return null;
  const { cyclingZones = null } = ctx;
  // Honour `useRange` for percent targets too. Reading `value` alone made a
  // {percent_ftp, useRange, 88→94} target resolve to 0 W and drop the alert.
  // Average only the endpoints that are actually set — a half-filled range
  // (rangeMin: 88, rangeMax undefined) would otherwise average to 44 and halve
  // the target.
  const ends = target.useRange
    ? [target.rangeMin, target.rangeMax].map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const pct = ends.length
    ? ends.reduce((a, b) => a + b, 0) / ends.length
    : (Number(target.value) || 0);
  let centre = null;
  if (target.type === 'percent_ftp') centre = ftp * pct / 100;
  else if (target.type === 'percent_lt1') centre = (lt1Power || ftp * 0.75) * pct / 100;
  else if (target.type === 'percent_lt2') centre = (lt2Power || ftp) * pct / 100;
  else if (target.type === 'lt1') centre = target.override ?? (lt1Power || ftp * 0.75);
  else if (target.type === 'lt2') centre = target.override ?? (lt2Power || ftp);
  else if (target.type === 'zone') {
    // Profile zone midpoint first, matching the live workout screen and the
    // server exporter — otherwise the watch shows a different target than the app.
    const z = Number(target.value) || 2;
    const pz = cyclingZones?.[`zone${z}`];
    if (target.override != null) centre = Number(target.override);
    else if (pz && Number(pz.min) > 0) {
      const min = Number(pz.min);
      const max = (pz.max != null && pz.max !== Infinity && pz.max > 0) ? Number(pz.max) : min * 1.08;
      centre = (min + max) / 2;
    } else {
      const lt2 = lt2Power || ftp;
      const lt1 = lt1Power || ftp * 0.75;
      centre = [lt1 * 0.8, lt1, lt2 * 0.95, lt2, lt2 * 1.1][Math.min(Math.max(z, 1) - 1, 4)];
    }
  }
  if (!centre || centre <= 0) return null;
  // An explicit range keeps its own width rather than being collapsed to ±5 %.
  // Only meaningful for percent targets, where the endpoints are percentages
  // that scale the same way `pct` did. For lt1/lt2/zone the endpoints are not
  // percentages at all, so scaling by centre/pct would be nonsense.
  const PERCENT_TYPES = ['percent_ftp', 'percent_lt1', 'percent_lt2'];
  if (target.useRange && PERCENT_TYPES.includes(target.type) && ends.length === 2 && pct > 0) {
    const scale = centre / pct;
    const lo = Math.round(Math.min(...ends) * scale);
    const hi = Math.round(Math.max(...ends) * scale);
    if (lo > 0 && hi >= lo) return { low: lo, high: hi };
  }
  return { low: Math.round(centre * 0.95), high: Math.round(centre * 1.05) };
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

  const toStep = (s) => {
    const durationSeconds = Math.max(1, Math.round(Number(s.durationSeconds) || 0));
    // Prefer power alert for bike; HR otherwise — falling back the other way.
    const power = resolvePowerRange(s.powerTarget, ctx);
    const hr = resolveHrRange(s.hrTarget, ctx);
    // A derived watts alert is only meaningful on the bike: on a run/swim/row
    // the same numbers come from the athlete's CYCLING zones, so sending them
    // as watts puts a nonsense target on the watch. Absolute watts the athlete
    // typed themselves stay valid on any sport (e.g. a rowing erg).
    const powerIsAbsolute = s.powerTarget?.type === 'watts';
    const powerUsable = power && (isBikeLike || powerIsAbsolute);
    let alert = null;
    if (isBikeLike && powerUsable) alert = { metric: 'power', low: power.low, high: power.high };
    else if (hr) alert = { metric: 'heartRate', low: hr.low, high: hr.high };
    else if (powerUsable) alert = { metric: 'power', low: power.low, high: power.high };
    return {
      kind: s.stepType || 'work',
      purpose: (s.stepType === 'recovery' || s.stepType === 'rest') ? 'recovery' : 'work',
      label: s.label || '',
      durationSeconds,
      alert,
    };
  };

  // Group the raw steps into WorkoutKit IntervalBlocks. A LaChart repeat group
  // becomes ONE block with `iterations` set, so the Watch tracks "3 of 10"
  // natively instead of us flattening the set into 20 identical steps (which
  // also blows past the ~50-step device ceiling on long sessions).
  const raw = Array.isArray(pw?.steps) ? pw.steps : [];
  const blocks = [];
  const seenGroups = new Set();
  for (const s of raw) {
    if (s.groupId) {
      if (seenGroups.has(s.groupId)) continue;
      seenGroups.add(s.groupId);
      const members = raw.filter((x) => x.groupId === s.groupId);
      const iterations = Math.max(1, Number(members.find((x) => x.isGroupHeader)?.groupRepeat) || 1);
      const steps = members.map(toStep).filter((x) => x.durationSeconds > 0);
      // `_closed` stops a following ungrouped step from being absorbed into
      // this block (which would silently repeat it `iterations` times).
      if (steps.length) blocks.push({ iterations, steps, _closed: true });
      continue;
    }
    const step = toStep(s);
    if (step.durationSeconds <= 0) continue;
    // Consecutive ungrouped steps collapse into a single iterations:1 block.
    const last = blocks[blocks.length - 1];
    if (last && last.iterations === 1 && !last._closed) last.steps.push(step);
    else blocks.push({ iterations: 1, steps: [step] });
  }
  blocks.forEach((b) => { delete b._closed; });

  // Lift a leading warmup / trailing cooldown out of the blocks — WorkoutKit
  // models them as dedicated slots on CustomWorkout, and the Watch labels them.
  let warmup = null;
  let cooldown = null;
  const first = blocks[0];
  if (first && first.iterations === 1 && first.steps[0]?.kind === 'warmup') {
    warmup = first.steps.shift();
    if (!first.steps.length) blocks.shift();
  }
  const last = blocks[blocks.length - 1];
  if (last && last.iterations === 1 && last.steps[last.steps.length - 1]?.kind === 'cooldown') {
    cooldown = last.steps.pop();
    if (!last.steps.length) blocks.pop();
  }

  // Everything was warmup/cooldown — keep them as the body so we never send
  // a CustomWorkout with zero blocks (WorkoutKit rejects it).
  if (!blocks.length) {
    const body = [warmup, cooldown].filter(Boolean);
    if (body.length) { blocks.push({ iterations: 1, steps: body }); warmup = null; cooldown = null; }
  }

  return {
    activity,
    displayName: pw?.title || 'LaChart workout',
    location: activity === 'cycling' || activity === 'running' || activity === 'walking' ? 'outdoor' : 'indoor',
    warmup,
    cooldown,
    blocks,
    // Flat list retained for older builds of the native plugin, which read `steps`.
    steps: [warmup, ...blocks.flatMap((b) => Array.from({ length: b.iterations }, () => b.steps).flat()), cooldown]
      .filter(Boolean),
  };
}

/**
 * Deterministic WorkoutPlan UUID for a PlannedWorkout, so a re-sync updates
 * the same scheduled workout instead of adding a duplicate. A Mongo ObjectId
 * is 24 hex chars; pad it to the 32 a UUID needs and format it.
 */
export function planIdForWorkout(pw) {
  const hex = String(pw?._id || pw?.id || '').replace(/[^a-f0-9]/gi, '').toLowerCase().padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  if (!payload.blocks?.length) return { reason: 'no_steps' };

  // Ensure authorization (prompts on first use only).
  try {
    const auth = await LaChartWorkoutPlan.requestAuthorization();
    if (auth && auth.granted === false) return { reason: 'not_authorized' };
  } catch {
    /* older plugin without auth method — continue */
  }

  const dateIso = scheduleDateIso(pw);
  if (!dateIso) return { reason: 'past_date' };

  return LaChartWorkoutPlan.scheduleWorkout({
    ...payload,
    dateIso,
    planId: planIdForWorkout(pw),
  });
}

/**
 * The moment to schedule a planned workout at.
 *
 * Keeps the time the athlete actually planned (a PlannedWorkout `date` carries
 * one) and only falls back to 07:00 when the stored time is exactly midnight,
 * which is what the calendar writes for a date-only entry. Returns null for a
 * slot already in the past — WorkoutKit only surfaces ±7 days and scheduling
 * behind "now" just burns one of the limited slots.
 */
export function scheduleDateIso(pw, now = new Date()) {
  if (!pw?.date) return null;
  const raw = new Date(pw.date);
  if (Number.isNaN(raw.getTime())) return null;

  // The calendar stores dates as "YYYY-MM-DD", which Mongo casts to UTC
  // midnight. Reading that back with LOCAL getters is wrong in both
  // directions: east of UTC it reads 02:00 (so the 07:00 default never
  // fires), and west of UTC it lands on the PREVIOUS day — already in the
  // past, so the workout was never scheduled at all. Detect a date-only
  // value in UTC and rebuild it as local 07:00 on the intended day.
  const isDateOnly = raw.getUTCHours() === 0
    && raw.getUTCMinutes() === 0
    && raw.getUTCSeconds() === 0;

  const d = isDateOnly
    ? new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate(), 7, 0, 0, 0)
    : raw;

  if (d.getTime() <= now.getTime()) return null;
  return d.toISOString();
}

/**
 * The intended local calendar day for a planned workout, as a `YYYY-MM-DD`
 * key. Used by the sync to decide whether a slot's day is over, without
 * re-deriving the UTC-vs-local rules above.
 */
export function plannedLocalDayKey(pw) {
  if (!pw?.date) return null;
  const raw = new Date(pw.date);
  if (Number.isNaN(raw.getTime())) return null;
  const isDateOnly = raw.getUTCHours() === 0
    && raw.getUTCMinutes() === 0
    && raw.getUTCSeconds() === 0;
  const y = isDateOnly ? raw.getUTCFullYear() : raw.getFullYear();
  const m = (isDateOnly ? raw.getUTCMonth() : raw.getMonth()) + 1;
  const day = isDateOnly ? raw.getUTCDate() : raw.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Current scheduling authorization, WITHOUT prompting. Use this anywhere the
 * user did not just tap something — `requestAuthorization` shows a system
 * alert and must only be called from an explicit user action.
 */
export async function getAppleWorkoutAuthState() {
  if (!isAppleWorkoutPlanSupported()) return { granted: false, status: 'unsupported' };
  try {
    const res = await LaChartWorkoutPlan.getAuthorizationState();
    return { granted: res?.granted === true, status: res?.status || 'unknown' };
  } catch {
    // Older native build without the method — treat as not yet granted rather
    // than prompting behind the user's back.
    return { granted: false, status: 'unavailable' };
  }
}

/** Workouts currently scheduled by LaChart: [{ planId, dateIso, complete }]. */
export async function getScheduledAppleWorkouts() {
  if (!isAppleWorkoutPlanSupported()) return [];
  try {
    const { workouts } = await LaChartWorkoutPlan.getScheduledWorkouts();
    return Array.isArray(workouts) ? workouts : [];
  } catch {
    return [];
  }
}

/** Remove one scheduled workout by plan id + the exact date it was scheduled at. */
export async function removeScheduledAppleWorkout(planId, dateIso) {
  if (!isAppleWorkoutPlanSupported()) return false;
  try {
    await LaChartWorkoutPlan.removeWorkout({ planId, dateIso });
    return true;
  } catch {
    return false;
  }
}

/** System cap on concurrently scheduled workouts (0 when unknown/unsupported). */
export async function maxScheduledAppleWorkouts() {
  if (!isAppleWorkoutPlanSupported()) return 0;
  try {
    const { max } = await LaChartWorkoutPlan.getLimits();
    return Number(max) || 0;
  } catch {
    return 0;
  }
}

export { LaChartWorkoutPlan };
