// healthKitSync — Apple HealthKit → server bridge for the iOS native shell.
//
// Conservative design ("nejšetrnější varianta"):
//   • No background tasks, no observer queries, no local notifications.
//   • Auto-runs ONCE per 24h on app open (throttled via localStorage).
//   • Settings page exposes a manual "Sync now" button as the override.
//   • Fetches the last 30 days of workouts only — keeps the HealthKit query fast
//     and avoids importing the user's entire history on first launch.
//   • Server dedupes against Strava/Garmin so mirrored workouts don't double up.

import { isCapacitorNative } from '../utils/isNativeApp';
import api from './api';

const STORAGE_KEY  = 'healthkit_last_sync';   // ISO timestamp string
const PERMS_KEY    = 'healthkit_perms_asked'; // '1' once we've asked
const THROTTLE_MS  = 24 * 60 * 60 * 1000;     // 24h
const LOOKBACK_DAYS = 30;
const MAX_WORKOUTS  = 200;                    // safety cap per sync
const PLUGIN_TIMEOUT_MS = 30 * 1000;          // bail if HealthKit hangs

/** Promise.race wrapper that rejects when the underlying plugin call hangs. */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Wipe local sync metadata so the next sync acts like a fresh connection. */
export function resetHealthKitSyncState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERMS_KEY);
  } catch { /* ignore */ }
}

// Lazy-loaded to keep the web bundle clean.
let _plugin = null;
async function getPlugin() {
  if (_plugin) return _plugin;
  if (!isCapacitorNative()) return null;
  try {
    const mod = await import('@perfood/capacitor-healthkit');
    _plugin = mod.CapacitorHealthkit || mod.default || null;
    return _plugin;
  } catch (e) {
    console.warn('[healthkit] plugin not available:', e?.message || e);
    return null;
  }
}

/** True when running on iOS in the native shell. */
export function isHealthKitSupported() {
  return isCapacitorNative();
}

/** Has HealthKit data sync run successfully at least once? */
export function lastSyncedAt() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? new Date(v) : null;
  } catch { return null; }
}

/** Returns true if more than THROTTLE_MS has elapsed since last sync. */
function isStale() {
  const last = lastSyncedAt();
  if (!last) return true;
  return Date.now() - last.getTime() > THROTTLE_MS;
}

/** Map HealthKit workoutActivityName → backend sport string. */
function normaliseSport(activityName) {
  const s = String(activityName || '').toLowerCase();
  if (s.includes('run'))                                            return 'Running';
  if (s.includes('cycl') || s.includes('bike') || s.includes('ride')) return 'Cycling';
  if (s.includes('swim'))                                           return 'Swimming';
  if (s.includes('walk'))                                           return 'Walking';
  if (s.includes('hike'))                                           return 'Hiking';
  if (s.includes('row'))                                            return 'Rowing';
  return activityName || 'Other';
}

/** Map a HealthKit ActivityData entry into the shape the server endpoint expects. */
function workoutToPayload(w) {
  return {
    id: w.uuid,
    type: normaliseSport(w.workoutActivityName),
    startDate: w.startDate,
    endDate: w.endDate,
    durationSeconds: Math.round(Number(w.duration) || 0),
    // @perfood/capacitor-healthkit reports distance in METERS already.
    // Earlier code multiplied by 1000 thinking it was km — that inflated
    // distances 1000× and made imported workouts unrecognisable.
    distanceMeters: Math.round(Number(w.totalDistance) || 0),
    calories: Number(w.totalEnergyBurned) || null,
    sourceName: w.source || w.sourceBundleId || 'Apple Health',
  };
}

/**
 * Ensure HealthKit read permission. iOS does not let us know whether the user
 * granted access — we just ask once and proceed; queries will return empty if
 * the user denied. Caches "asked" in localStorage so re-prompts are rare.
 */
async function ensurePermission(plugin) {
  try {
    await plugin.requestAuthorization({
      read: ['workoutType', 'distanceWalkingRunning', 'distanceCycling', 'heartRate', 'activeEnergyBurned'],
      write: [],
      all: [],
    });
    try { localStorage.setItem(PERMS_KEY, '1'); } catch {}
    return true;
  } catch (e) {
    console.warn('[healthkit] requestAuthorization failed:', e?.message || e);
    return false;
  }
}

/**
 * Run the sync. Returns { imported, total } when posted, or { skipped: 'reason' }
 * when nothing was attempted.
 *
 * @param {{ force?: boolean }} opts force=true bypasses the 24h throttle (used by the
 *   manual Settings button).
 */
export async function syncHealthKit({ force = false } = {}) {
  if (!isCapacitorNative()) return { skipped: 'web' };

  const plugin = await getPlugin();
  if (!plugin) {
    console.warn('[healthkit] plugin missing');
    return { skipped: 'plugin-missing' };
  }
  console.log('[healthkit] starting sync (force=' + force + ')');

  // Bail early if data isn't available (iPad without Health, simulator, etc.)
  try {
    await withTimeout(plugin.isAvailable(), PLUGIN_TIMEOUT_MS, 'isAvailable');
    console.log('[healthkit] isAvailable: ok');
  } catch (e) {
    console.warn('[healthkit] isAvailable failed:', e?.message);
    return { skipped: 'unavailable', error: e?.message };
  }

  if (!force && !isStale()) return { skipped: 'throttled', lastSync: lastSyncedAt() };

  try {
    if (!(await withTimeout(ensurePermission(plugin), PLUGIN_TIMEOUT_MS, 'requestAuthorization'))) {
      return { skipped: 'denied' };
    }
    console.log('[healthkit] permission requested (note: iOS does not report what the user granted)');
  } catch (e) {
    console.warn('[healthkit] requestAuthorization failed:', e?.message);
    return { skipped: 'denied', error: e?.message };
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  let workouts = [];
  try {
    const res = await withTimeout(plugin.queryHKitSampleType({
      sampleName: 'workoutType',
      startDate: startDate.toISOString(),
      endDate:   endDate.toISOString(),
      limit:     MAX_WORKOUTS,
    }), PLUGIN_TIMEOUT_MS, 'queryHKitSampleType');
    workouts = Array.isArray(res?.resultData) ? res.resultData : [];
    console.log('[healthkit] queried ' + workouts.length + ' workouts in last ' + LOOKBACK_DAYS + ' days');
  } catch (e) {
    console.warn('[healthkit] query failed:', e?.message || e);
    return { skipped: 'query-failed', error: e?.message || String(e) };
  }

  if (workouts.length === 0) {
    // Mark as synced so we don't keep querying — try again after the throttle.
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch {}
    // Empty result almost always means iOS silently denied permission. Surface
    // a distinct skip reason so the UI can prompt the user to check Settings.
    return { imported: 0, total: 0, skipped: 'empty-or-denied' };
  }

  const payload = { workouts: workouts.map(workoutToPayload).filter(w => w.id && w.startDate) };
  console.log('[healthkit] uploading ' + payload.workouts.length + ' workouts to server');

  try {
    const { data } = await api.post('/api/integrations/apple-health/sync', payload);
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch {}
    console.log('[healthkit] server imported ' + (data?.imported ?? 0) + ' of ' + (data?.total ?? payload.workouts.length));
    return { imported: data?.imported ?? 0, total: data?.total ?? payload.workouts.length };
  } catch (e) {
    console.warn('[healthkit] upload failed:', e?.response?.data || e?.message || e);
    return { skipped: 'upload-failed', error: e?.response?.data?.error || e?.message };
  }
}

/**
 * Idempotent fire-and-forget call for app boot. Wrapped in a try so we never
 * crash the app on startup; logs to console for diagnostics.
 */
export async function maybeSyncOnAppOpen() {
  try {
    const result = await syncHealthKit();
    if (result?.imported > 0) {
      console.log(`[healthkit] auto-sync imported ${result.imported}/${result.total} workouts`);
    } else if (result?.skipped) {
      console.log(`[healthkit] auto-sync skipped: ${result.skipped}`);
    }
    return result;
  } catch (e) {
    console.warn('[healthkit] auto-sync error:', e?.message || e);
    return { skipped: 'error', error: e?.message };
  }
}
