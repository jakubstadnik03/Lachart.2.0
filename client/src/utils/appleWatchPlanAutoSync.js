/**
 * Automatic Apple Watch workout scheduling.
 *
 * Keeps the athlete's planned workouts mirrored onto their Apple Watch without
 * anyone pressing a button: whatever is on the LaChart calendar for the next
 * few days shows up in the stock Workout app, ready to start with one tap.
 *
 * Runs on app launch + foreground (see initCapacitorShell) and again whenever a
 * planned workout is created, edited or deleted (see workoutPlannerApi, which
 * emits `lachart:planned-workouts-changed`).
 *
 * Design notes that matter:
 *
 *   • WorkoutKit only surfaces a ±7-day window and enforces
 *     `maxAllowedScheduledWorkoutCount`, so this pushes a rolling window rather
 *     than a whole training block.
 *   • Sync is a RECONCILE, not an append. Each plan carries a deterministic
 *     UUID derived from the PlannedWorkout id, so re-syncing an edited workout
 *     replaces it instead of stacking a duplicate, and a workout deleted in
 *     LaChart gets pulled off the watch.
 *   • A content fingerprint is cached per plan so an unchanged workout is not
 *     re-scheduled on every foreground.
 *   • This is a Pro feature — it is gated here AND on the server route that
 *     serves the workouts.
 */
import {
  isAppleWorkoutPlanSupported,
  canScheduleAppleWorkout,
  buildWorkoutPlanPayload,
  planIdForWorkout,
  scheduleDateIso,
  plannedLocalDayKey,
  getScheduledAppleWorkouts,
  removeScheduledAppleWorkout,
  maxScheduledAppleWorkouts,
  getAppleWorkoutAuthState,
  LaChartWorkoutPlan,
} from '../services/appleWorkoutPlan';

export const WATCH_SYNC_PREF_KEY = 'appleWatch_autoSchedule';
export const PLANNED_CHANGED_EVENT = 'lachart:planned-workouts-changed';

const FINGERPRINT_KEY = 'appleWatch_scheduled_fingerprints';
const THROTTLE_KEY = 'appleWatch_autoSchedule_ts';
const MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const WINDOW_DAYS = 7;                  // WorkoutKit only shows ±7 days

let inFlight = false;
let debounceTimer = null;

/** Auto-scheduling is opt-out: on unless the athlete turned it off. */
export function isWatchAutoSyncEnabled() {
  try {
    return localStorage.getItem(WATCH_SYNC_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setWatchAutoSyncEnabled(on) {
  try { localStorage.setItem(WATCH_SYNC_PREF_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

function readFingerprints() {
  try { return JSON.parse(localStorage.getItem(FINGERPRINT_KEY) || '{}') || {}; } catch { return {}; }
}

function writeFingerprints(map) {
  try { localStorage.setItem(FINGERPRINT_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

function recentlySynced() {
  try {
    const ts = Number(localStorage.getItem(THROTTLE_KEY) || 0);
    return ts > 0 && Date.now() - ts < MIN_INTERVAL_MS;
  } catch {
    return false;
  }
}

function markSynced() {
  try { localStorage.setItem(THROTTLE_KEY, String(Date.now())); } catch { /* ignore */ }
}

/** `YYYY-MM-DD` for a Date in the athlete's own timezone. */
function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Cheap stable hash of the payload + slot, to detect a real change. */
function fingerprint(payload, dateIso) {
  const s = JSON.stringify({ dateIso, ...payload });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Premium check without React — mirrors usePremium's strict `=== true`. */
function isPremiumUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return false;
    return JSON.parse(raw)?.isPremium === true;
  } catch {
    return false;
  }
}

/**
 * Resolve the athlete's power/HR context so watch targets match the live
 * screen. Mirrors the resolution order in WorkoutExecutionPage: profile zones
 * are primary, the latest test is the fallback.
 */
async function resolveContext(api) {
  // `resolved` distinguishes "we actually know this athlete's thresholds" from
  // "we fell back to 250 W". Syncing on the fallback would silently rewrite
  // every workout on the watch with wrong targets.
  const ctx = { ftp: 250, lt1Power: null, lt2Power: null, cyclingZones: null, hrZones: null, maxHr: 0, resolved: false };
  try {
    const [profileRes, testRes] = await Promise.all([
      api.get('/user/profile').catch(() => ({ data: null })),
      api.get('/test').catch(() => ({ data: [] })),
    ]);
    const pz = profileRes.data?.powerZones || {};
    const hz = profileRes.data?.heartRateZones || {};
    const cyclingZones = pz.cycling || null;
    const cyclingHrZones = hz.cycling || null;

    const tests = Array.isArray(testRes.data) ? testRes.data : [];
    const latest = [...tests]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .find((t) => t.lt2Power || t.ltPower || t.lt2?.power || t.thresholdOverrides?.LTP2 || t.ftp);

    const lt2Power = cyclingZones?.lt2 || cyclingZones?.zone4?.min
      || latest?.lt2Power || latest?.lt2?.power || latest?.thresholdOverrides?.LTP2 || null;
    const lt1Power = cyclingZones?.lt1 || cyclingZones?.zone3?.min
      || latest?.ltPower || latest?.lt1Power || latest?.lt1?.power
      || latest?.thresholdOverrides?.LTP1 || null;

    ctx.lt2Power = lt2Power;
    ctx.lt1Power = lt1Power;
    ctx.ftp = lt2Power || latest?.ftp || latest?.ltPower || 250;
    ctx.cyclingZones = cyclingZones;
    ctx.hrZones = cyclingHrZones;
    ctx.maxHr = cyclingHrZones?.maxHeartRate || profileRes.data?.maxHeartRate || 0;
    // Real thresholds, real zones, or a usable HR ceiling all count as knowing
    // enough to render targets faithfully.
    ctx.resolved = Boolean(lt2Power || lt1Power || cyclingZones || ctx.maxHr);
  } catch {
    ctx.resolved = false;
  }
  return ctx;
}

/**
 * Reconcile the next {@link WINDOW_DAYS} days of planned workouts onto the watch.
 * @returns {Promise<{skipped?:string, scheduled?:number, removed?:number, unchanged?:number}>}
 */
export async function autoSyncWatchWorkouts({ force = false } = {}) {
  if (!isAppleWorkoutPlanSupported()) return { skipped: 'unsupported' };
  if (!isWatchAutoSyncEnabled()) return { skipped: 'disabled' };
  if (!isPremiumUser()) return { skipped: 'not_premium' };
  if (inFlight) return { skipped: 'in_flight' };
  if (!force && recentlySynced()) return { skipped: 'throttled' };

  // Claim the lock BEFORE the first await. Setting it after the async
  // capability checks let a foreground event and a calendar edit both get past
  // the guard and reconcile concurrently against the same watch schedule.
  inFlight = true;
  try {
    // Never prompt from a background sync — read the state instead of
    // requesting it. Only the Settings card may call requestAuthorization.
    if (!(await canScheduleAppleWorkout())) return { skipped: 'unsupported' };
    const { granted } = await getAppleWorkoutAuthState();
    if (!granted) return { skipped: 'not_authorized' };

    const { default: api } = await import('../services/api');
    const { getPlannedWorkouts } = await import('../services/workoutPlannerApi');

    const now = new Date();
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setDate(to.getDate() + WINDOW_DAYS);
    const iso = (d) => d.toISOString().slice(0, 10);

    // A reconcile must never run against an unknown desired state: if the
    // fetch fails we cannot tell "calendar is empty" from "server is down",
    // and the removal pass below would strip every workout off the watch.
    // So let a failure abort rather than swallowing it into [].
    let planned;
    let ctx;
    try {
      [planned, ctx] = await Promise.all([
        getPlannedWorkouts({ from: iso(from), to: iso(to) }),
        resolveContext(api),
      ]);
    } catch {
      return { skipped: 'fetch_failed' };
    }

    const list = Array.isArray(planned) ? planned : (Array.isArray(planned?.items) ? planned.items : null);
    if (list == null) return { skipped: 'fetch_failed' };
    // Targets resolved off a fallback FTP would silently rewrite every workout
    // on the watch at 250 W. Better to leave the existing schedule alone.
    if (!ctx?.resolved) return { skipped: 'no_context' };

    // Build the desired state: future, structured, still-open workouts.
    // `known` also tracks workouts whose start time has already passed — the
    // athlete may still train them later today, so they must not be removed.
    const desired = new Map();
    const known = new Map();
    for (const pw of list) {
      if (!Array.isArray(pw?.steps) || pw.steps.length === 0) continue;
      if (pw.status && pw.status !== 'planned') continue;
      const id = planIdForWorkout(pw);
      known.set(id, plannedLocalDayKey(pw));
      const dateIso = scheduleDateIso(pw, now);
      if (!dateIso) continue;
      const payload = buildWorkoutPlanPayload(pw, ctx);
      if (!payload.blocks?.length) continue;
      desired.set(id, { payload, dateIso });
    }

    const scheduled = await getScheduledAppleWorkouts();
    const scheduledById = new Map(scheduled.map((s) => [String(s.planId || '').toLowerCase(), s]));
    const prints = readFingerprints();

    // 1. Remove anything we previously scheduled that is no longer wanted —
    //    a deleted or rescheduled workout must not linger on the watch.
    const todayKey = localDayKey(now);
    let removed = 0;
    for (const s of scheduled) {
      const id = String(s.planId || '').toLowerCase();
      if (desired.has(id)) continue;

      // A start time that has passed does NOT mean the athlete dropped the
      // session — a workout planned for 07:00 and ridden at 17:00 must stay on
      // the watch all day. Keep anything still on the calendar until its day
      // is over; only then let it go.
      const dayKey = known.get(id);
      if (dayKey && dayKey >= todayKey) continue;

      // Completed workouts are cleared too — otherwise they pile up against
      // maxAllowedScheduledWorkoutCount until nothing new can be scheduled.
      if (await removeScheduledAppleWorkout(id, s.dateIso)) removed += 1;
      delete prints[id];
    }

    // 2. Schedule new or changed workouts, honouring the system cap.
    const cap = (await maxScheduledAppleWorkouts()) || desired.size;
    let scheduledCount = 0;
    let unchanged = 0;
    let slots = Math.max(0, cap - Math.max(0, scheduled.length - removed));

    // Soonest first, so the cap truncates the far end of the window.
    const ordered = [...desired.entries()].sort((a, b) => a[1].dateIso.localeCompare(b[1].dateIso));

    for (const [planId, { payload, dateIso }] of ordered) {
      const print = fingerprint(payload, dateIso);
      const existing = scheduledById.get(planId);
      // Already ticked off on the watch — re-scheduling would resurrect it as
      // pending and nag the athlete to repeat a session they just finished.
      if (existing?.complete) { unchanged += 1; continue; }
      if (existing && prints[planId] === print) { unchanged += 1; continue; }
      if (!existing && slots <= 0) continue;
      try {
        const res = await LaChartWorkoutPlan.scheduleWorkout({ ...payload, dateIso, planId });
        if (res?.scheduled) {
          prints[planId] = print;
          scheduledCount += 1;
          if (!existing) slots -= 1;
        }
      } catch {
        /* one bad workout must not abort the whole sync */
      }
    }

    writeFingerprints(prints);
    markSynced();
    return { scheduled: scheduledCount, removed, unchanged };
  } finally {
    inFlight = false;
  }
}

/** Coalesce bursts of calendar edits into a single sync. */
export function scheduleWatchSyncSoon(delayMs = 2500) {
  if (!isAppleWorkoutPlanSupported()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    autoSyncWatchWorkouts({ force: true }).catch(() => {});
  }, delayMs);
}

/** Listen for calendar edits. Call once, from the Capacitor shell init. */
export function initWatchPlanAutoSync() {
  if (!isAppleWorkoutPlanSupported()) return;
  window.addEventListener(PLANNED_CHANGED_EVENT, () => scheduleWatchSyncSoon());
  autoSyncWatchWorkouts().catch(() => {});
}
