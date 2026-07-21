/**
 * Automatic, silent Apple Health sync.
 *
 * Runs on app launch + foreground (see initCapacitorShell). Unlike the manual
 * "Sync now" button in Settings, this never prompts for permission — it only
 * proceeds when the user has already granted HealthKit access AND connected
 * Apple Health on the server. Throttled so we don't hammer the native APIs or
 * the backend on every resume.
 */
import {
  isAppleHealthSupported,
  collectAppleHealthWellness,
  collectAppleHealthWorkouts,
} from '../services/appleHealthCapacitor';

const THROTTLE_KEY = 'appleHealth_autoSync_ts';
const MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let inFlight = false;

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

/**
 * Sync recent Apple Health wellness + workouts in the background.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ skipped?: string, imported?: number, wellnessDays?: number }>}
 */
export async function autoSyncAppleHealth({ force = false } = {}) {
  if (!isAppleHealthSupported()) return { skipped: 'unsupported' };
  if (inFlight) return { skipped: 'in_flight' };
  if (!force && recentlySynced()) return { skipped: 'throttled' };

  inFlight = true;
  try {
    // Only proceed if the server already considers Apple Health connected —
    // avoids syncing for users who never opted in.
    const { getAppleHealthStatus, syncAppleHealth, syncAppleHealthWellness } = await import('../services/api');
    const status = await getAppleHealthStatus().catch(() => null);
    if (!status?.connected) return { skipped: 'not_connected' };

    // HealthKit read status is opaque — skip the permission gate and try reading;
    // empty arrays simply mean no data or types disabled in Health → LaChart.
    const wellness = await collectAppleHealthWellness(7).catch(() => []);

    if (wellness.length > 0) {
      await syncAppleHealthWellness({ wellness, markConnected: true }).catch(() => {});
    }

    // Workout import is opt-in (same preference as the Settings card) — most
    // users get workouts from Strava/Garmin, so Apple's copies just duplicate.
    let importWorkouts = false;
    try { importWorkouts = localStorage.getItem('appleHealth_importWorkouts') === '1'; } catch { /* ignore */ }
    let imported = 0;
    if (importWorkouts) {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const workouts = await collectAppleHealthWorkouts(since, { enrichHeartRate: false }).catch(() => []);
      if (workouts.length > 0) {
        const res = await syncAppleHealth({ workouts });
        imported = res?.imported ?? 0;
      }
    }

    markSynced();
    if (imported > 0 || wellness.length > 0) {
      // Let the dashboard/calendar refresh activities and wellness strips.
      window.dispatchEvent(new CustomEvent('appleHealth:synced', { detail: { imported, wellnessDays: wellness.length } }));
    }
    return { imported, wellnessDays: wellness.length };
  } catch (e) {
    console.warn('[appleHealth] auto-sync failed:', e?.message || e);
    return { skipped: 'error' };
  } finally {
    inFlight = false;
  }
}
