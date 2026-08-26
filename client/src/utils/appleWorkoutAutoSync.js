/**
 * Automatic Apple Watch workout scheduling.
 *
 * The WorkoutKit bridge (services/appleWorkoutPlan.js + the native
 * LaChartWorkoutPlan plugin) existed but nothing ever called it — planned
 * workouts never reached the Apple Workout app. This sweep runs on iOS app
 * launch + foreground (next to the Apple Health auto-sync): it loads the next
 * week of planned workouts and schedules the structured ones on the paired
 * watch, so they appear in the Workout app ready to start, TrainingPeaks-style.
 *
 * Deduped per workout via localStorage (`_id` + `updatedAt`), so an edit
 * re-schedules but an unchanged plan is never sent twice. Throttled like the
 * health sync so a foreground flap doesn't hammer WorkoutKit.
 */
import { getPlannedWorkouts } from '../services/workoutPlannerApi';
import api from '../services/api';
import { canScheduleAppleWorkout, sendPlannedWorkoutToWatch } from '../services/appleWorkoutPlan';

const THROTTLE_KEY = 'appleWorkoutPlan_autoSync_ts';
const MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const SENT_PREFIX = 'appleWorkoutPlan_sent:';
const DAYS_AHEAD = 7;

let inFlight = false;

function recentlyRan() {
  try {
    const ts = Number(localStorage.getItem(THROTTLE_KEY) || 0);
    return ts > 0 && Date.now() - ts < MIN_INTERVAL_MS;
  } catch {
    return false;
  }
}

function markRan() {
  try { localStorage.setItem(THROTTLE_KEY, String(Date.now())); } catch { /* ignore */ }
}

function toDayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Builder-parity target context from the athlete's own profile zones. */
async function loadTargetContext() {
  try {
    const { data: profile } = await api.get('/user/profile');
    const pz = profile?.powerZones || {};
    const cycling = pz.cycling || null;
    const running = pz.running || null;
    const lt2Power = cycling?.lt2 || cycling?.zone4?.min || null;
    const lt1Power = cycling?.lt1 || cycling?.zone3?.min || null;
    return {
      ftp: lt2Power || 250,
      lt1Power,
      lt2Power,
      cyclingZones: cycling,
      runningZones: running,
      lt1Pace: running?.lt1 || running?.zone3?.min || null,
      lt2Pace: running?.lt2 || running?.zone4?.min || null,
      hrZonesBySport: profile?.heartRateZones || null,
    };
  } catch {
    return { ftp: 250 };
  }
}

/**
 * Schedule upcoming structured planned workouts on the Apple Watch.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ skipped?: string, scheduled?: number, failed?: number }>}
 */
export async function autoSyncAppleWorkoutPlans({ force = false } = {}) {
  if (inFlight) return { skipped: 'in_flight' };
  if (!force && recentlyRan()) return { skipped: 'throttled' };
  inFlight = true;
  try {
    if (!(await canScheduleAppleWorkout())) return { skipped: 'unsupported' };
    markRan();

    const today = new Date();
    const to = new Date(today);
    to.setDate(to.getDate() + DAYS_AHEAD);
    const planned = await getPlannedWorkouts({ from: toDayKey(today), to: toDayKey(to) });

    const upcoming = (Array.isArray(planned) ? planned : []).filter((pw) =>
      pw && pw.status === 'planned' && Array.isArray(pw.steps) && pw.steps.length > 0);
    if (!upcoming.length) return { scheduled: 0 };

    const baseCtx = await loadTargetContext();
    let scheduled = 0;
    let failed = 0;
    for (const pw of upcoming) {
      const key = `${SENT_PREFIX}${pw._id}`;
      const stamp = String(pw.updatedAt || pw.date || '');
      try { if (localStorage.getItem(key) === stamp) continue; } catch { /* schedule anyway */ }

      const hrZones = pw.sport === 'bike' || pw.sport === 'mtbike'
        ? baseCtx.hrZonesBySport?.cycling
        : baseCtx.hrZonesBySport?.running;
      const ctx = {
        ...baseCtx,
        hrZones: hrZones || null,
        maxHr: hrZones?.maxHeartRate || 0,
      };

      try {
        const r = await sendPlannedWorkoutToWatch(pw, ctx);
        if (r?.scheduled) {
          scheduled += 1;
          try { localStorage.setItem(key, stamp); } catch { /* re-send next sweep */ }
        } else if (r?.reason === 'not_authorized') {
          // No point iterating — the user declined the WorkoutKit prompt.
          return { skipped: 'not_authorized', scheduled };
        }
      } catch (e) {
        failed += 1;
        console.warn('[AppleWorkoutSync] schedule failed:', pw.title, e?.message || e);
      }
    }
    if (scheduled || failed) {
      console.log(`[AppleWorkoutSync] scheduled ${scheduled} workout(s) on Apple Watch${failed ? `, ${failed} failed` : ''}`);
    }
    return { scheduled, failed };
  } finally {
    inFlight = false;
  }
}
