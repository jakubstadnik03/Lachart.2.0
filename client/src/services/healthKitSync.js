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

/**
 * Full disconnect — wipes the server-side AppleHealthActivity records AND
 * clears the local sync metadata. iOS itself does not let apps revoke
 * their HealthKit authorization (privacy); callers should additionally
 * deep-link the user into iOS Settings via openHealthKitSettings() below
 * so they can flip off the per-category switches.
 */
export async function disconnectHealthKit() {
  let serverDeleted = 0;
  try {
    const { data } = await api.delete('/api/integrations/apple-health');
    serverDeleted = data?.deleted ?? 0;
  } catch (e) {
    console.warn('[healthkit] server disconnect failed:', e?.response?.data || e?.message);
  }
  resetHealthKitSyncState();
  _plugin = null; // force a fresh plugin import on next sync attempt
  return { serverDeleted };
}

/**
 * Open a native URL scheme from inside the Capacitor WKWebView.
 *
 * The @capacitor/app `openUrl` API is NOT implemented on iOS in v6 (only
 * Android + web) — calling it logs "App.openUrl() is not implemented on
 * ios" and resolves with completed=false, so the URL never actually opens.
 *
 * The reliable workaround on WKWebView is `window.open(url, '_blank')` —
 * Capacitor's iOS shell intercepts that and asks UIApplication to open
 * the scheme through the OS. Bare `window.location.href = url` doesn't
 * work because WKWebView blocks navigation to non-http schemes with a
 * sandbox error.
 */
function openNativeUrl(url) {
  if (!isCapacitorNative()) return false;
  try {
    const w = window.open(url, '_blank');
    return !!w || true; // open() returns null in WKWebView even on success
  } catch (e) {
    console.warn('[healthkit] openNativeUrl failed:', url, e?.message || e);
    return false;
  }
}

/** Best-effort deep-link into the iOS Health app so the user can verify the
 *  per-source permissions. */
export async function openHealthApp() {
  return openNativeUrl('x-apple-health://');
}

/** Deep-link into iOS Settings. We try the per-app page first
 *  (`app-settings:`) which lands on LaChart's privacy switches — including
 *  the Health row that opens "Health → Data Access & Devices → LaChart". */
export async function openAppSettings() {
  return openNativeUrl('app-settings:');
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
 * Ensure HealthKit read permission.
 *
 * IMPORTANT: @perfood/capacitor-healthkit's requestAuthorization() does NOT
 * accept the enum strings ('workoutType', 'distanceWalkingRunning' etc.) for
 * its read array. Its native iOS getTypes() only recognises a small set of
 * friendly aliases — strings outside that set are silently dropped, so the
 * permission sheet doesn't include those data types at all. That was the
 * "we asked for workouts but iOS shows zero workouts" bug.
 *
 * Aliases supported by requestAuthorization (verified against the plugin's
 * Swift source):
 *   'activity'   → HKWorkoutType.workoutType()  ← needed for workout reads
 *   'calories'   → active + basal energy burned
 *   'distance'   → walking/running + cycling
 *   'heartRate'  → heart rate
 *   'steps' | 'stairs' | 'duration' | 'weight' | … (see plugin README)
 *
 * Queries (queryHKitSampleType) take the SampleNames enum strings instead
 * ('workoutType', 'heartRate', etc.) — that's a separate code path.
 *
 * iOS does not report what the user granted, so we just ask and proceed;
 * a denied permission produces an empty query result, which the caller
 * surfaces as skipped:'empty-or-denied'.
 */
// Public so the Settings card can show the user exactly which categories
// are being requested (the "Data types: …" footer).
export const HEALTHKIT_READ_PERMISSIONS = [
  'activity',          // HKWorkoutType — workouts (essential)
  'duration',          // appleExerciseTime — exercise minutes
  'steps',             // step count
  'stairs',            // flights climbed
  'distance',          // walking/running + cycling distance
  'calories',          // active + basal energy burned
  'heartRate',         // beat-to-beat HR samples
  'restingHeartRate',  // daily resting HR
  'respiratoryRate',   // breaths per minute
  'oxygenSaturation',  // SpO₂
  'bodyFat',           // body-fat percentage
  'weight',            // body mass
];

async function ensurePermission(plugin) {
  try {
    // Friendly-name vocabulary expected by `getTypes()` inside the plugin.
    // Anything not in that list is silently dropped from the permission
    // sheet (and you'll get queries that mysteriously return empty arrays).
    // We request every read-type the plugin knows about so the iOS Health
    // sheet exposes the full set of categories at once, matching the UX of
    // mature integrations (TrainingPeaks, MyTrainPal, Athlytic).
    await plugin.requestAuthorization({
      read: HEALTHKIT_READ_PERMISSIONS,
      // The plugin requires `write` and `all` keys to be PRESENT arrays —
      // omitting them rejects with "Must provide write" / "Must provide all".
      // Both stay empty: we never write to Health.
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
 * Force the iOS HealthKit permission sheet to appear, NOTHING else.
 *
 * Used by the "Force permission request" button in Settings — strips
 * out the isAvailable() gate, the throttle, the query, the upload, and
 * the success bookkeeping. The single goal is to make iOS register
 * LaChart as a HealthKit-aware app so it shows up under iPhone Settings
 * → Health → Data Access & Devices. If the auth call itself throws,
 * the raw NSError message bubbles back to the UI so the user can see
 * "Missing com.apple.developer.healthkit entitlement" (= rebuild
 * required) instead of a generic "denied".
 *
 * Returns { ok: bool, error?: string, code?: string }.
 */
export async function requestHealthKitPermissionOnly() {
  if (!isCapacitorNative()) return { ok: false, error: 'Not on native iOS — open the LaChart app on your iPhone.', code: 'web' };
  const plugin = await getPlugin();
  if (!plugin) return { ok: false, error: 'HealthKit plugin not in this build. Rebuild the iOS app and reinstall via Xcode / TestFlight.', code: 'plugin-missing' };

  // Pre-flight: isAvailable() is the cheapest signal that HealthKit is
  // actually usable on this binary. When the .ipa lacks the entitlement
  // (the #1 cause of "nothing happens"), isAvailable usually still
  // resolves OK — but it's a quick sanity check we can do first.
  try {
    await withTimeout(plugin.isAvailable(), 5000, 'isAvailable');
  } catch (e) {
    return {
      ok: false,
      code: 'unavailable',
      error: `HealthKit reports unavailable on this device: ${e?.message || e}. If this is an iPhone (not iPad/simulator) the most likely cause is that the installed app build is missing the HealthKit entitlement — open ios/App/App.xcworkspace in Xcode, App target → Signing & Capabilities → ensure HealthKit capability is present, then Archive a new build and reinstall.`,
    };
  }

  // 10s timeout: when the entitlement and provisioning profile are wired
  // up correctly, the iOS HealthKit permission sheet appears within ~1 s.
  // If we hit 10 s, iOS is silently swallowing the call — almost always
  // because the App ID in the Apple Developer Portal doesn't have the
  // HealthKit capability enabled, OR the installed build was signed
  // with an old provisioning profile that pre-dates that change.
  const AUTH_TIMEOUT_MS = 10 * 1000;
  let authResolvedAt = 0;
  try {
    const t0 = Date.now();
    await withTimeout(plugin.requestAuthorization({
      read: HEALTHKIT_READ_PERMISSIONS,
      write: [],
      all: [],
    }), AUTH_TIMEOUT_MS, 'requestAuthorization');
    authResolvedAt = Date.now() - t0;
    try { localStorage.setItem(PERMS_KEY, '1'); } catch {}
  } catch (e) {
    const raw = String(e?.message || e || 'unknown');
    if (/timed out/i.test(raw)) {
      return {
        ok: false,
        code: 'timeout',
        error: `iOS did not display the HealthKit permission sheet within ${AUTH_TIMEOUT_MS / 1000} s. This means HealthKit is enabled in code (.entitlements + Info.plist) but NOT on this binary's App ID in the Apple Developer Portal. Fix: in Xcode, App target → Signing & Capabilities → click "+" → HealthKit → save → Product → Clean Build Folder → Archive again. Then delete the LaChart app from the iPhone and reinstall the fresh archive.`,
      };
    }
    if (/entitlement/i.test(raw)) {
      return {
        ok: false,
        code: 'entitlement',
        error: `${raw} — REBUILD REQUIRED. Open ios/App/App.xcworkspace in Xcode, App target → Signing & Capabilities → ensure HealthKit capability is enabled, then Product → Clean Build Folder → Archive. Reinstall the fresh build via TestFlight or USB.`,
      };
    }
    return { ok: false, code: 'auth-failed', error: raw };
  }

  // Apple's API resolves success=true even when the entitlement is missing
  // (no sheet shown, no permissions granted — silent denial). Detect that
  // by checking how fast the call resolved: < 200 ms with no prior PERMS_KEY
  // is a strong signal that the OS skipped the sheet entirely. We can't
  // tell granted-vs-denied for sure (Apple hides that for privacy), but
  // a near-instant resolution before the user has ever been asked is
  // almost always the silent-skip path.
  if (authResolvedAt < 200) {
    return {
      ok: true,
      warning: `requestAuthorization resolved in ${authResolvedAt} ms without showing a sheet — iOS may have skipped the prompt because HealthKit isn't enabled on this build's App ID in the Apple Developer Portal. Open the Health app on your iPhone and check Browse → Sharing → Apps → LaChart. If LaChart isn't listed, rebuild in Xcode with the HealthKit capability added to Signing & Capabilities.`,
    };
  }
  return { ok: true };
}

/**
 * One-shot probe run on app boot: silently triggers the HealthKit
 * permission flow the FIRST time the native app launches, so the iOS
 * Health permission sheet appears without the user having to find the
 * Settings button. Subsequent launches no-op (PERMS_KEY tracks that
 * we've asked once). Safe on web — returns immediately.
 */
export async function maybePromptHealthKitOnBoot() {
  if (!isCapacitorNative()) return;
  try {
    if (localStorage.getItem(PERMS_KEY) === '1') return;
  } catch {}
  // Wait a beat so the app's UI settles before the OS sheet pops up —
  // sheets that fire during the launch transition can be auto-dismissed.
  setTimeout(async () => {
    try {
      const plugin = await getPlugin();
      if (!plugin) return;
      try { await withTimeout(plugin.isAvailable(), PLUGIN_TIMEOUT_MS, 'isAvailable'); } catch { return; }
      await plugin.requestAuthorization({ read: HEALTHKIT_READ_PERMISSIONS, write: [], all: [] });
      try { localStorage.setItem(PERMS_KEY, '1'); } catch {}
    } catch (e) {
      console.warn('[healthkit] boot prompt failed:', e?.message || e);
    }
  }, 3000);
}

/**
 * Run the sync. Returns { imported, total } when posted, or { skipped: 'reason' }
 * when nothing was attempted.
 *
 * @param {{ force?: boolean }} opts force=true bypasses the 24h throttle (used by the
 *   manual Settings button).
 */
export async function syncHealthKit({ force = false, onProgress } = {}) {
  // Surface every step both to console AND to the optional progress callback
  // so the Settings card can render "step 3/5: queryHKitSampleType…" live.
  // Without this, when the call hangs we have no idea which line is stuck.
  const step = (label) => {
    console.log('[healthkit] step:', label);
    try { if (typeof onProgress === 'function') onProgress(label); } catch {}
  };

  if (!isCapacitorNative()) return { skipped: 'web' };
  step('loading plugin');

  const plugin = await getPlugin();
  if (!plugin) {
    console.warn('[healthkit] plugin missing');
    return { skipped: 'plugin-missing' };
  }
  step('checking HealthKit availability');

  // Bail early if data isn't available (iPad without Health, simulator, etc.)
  try {
    await withTimeout(plugin.isAvailable(), PLUGIN_TIMEOUT_MS, 'isAvailable');
    step('HealthKit available — requesting permission');
  } catch (e) {
    console.warn('[healthkit] isAvailable failed:', e?.message);
    return { skipped: 'unavailable', error: e?.message };
  }

  if (!force && !isStale()) return { skipped: 'throttled', lastSync: lastSyncedAt() };

  try {
    if (!(await withTimeout(ensurePermission(plugin), PLUGIN_TIMEOUT_MS, 'requestAuthorization'))) {
      return { skipped: 'denied' };
    }
    step('permission flow done — reading workouts');
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
    step(`got ${workouts.length} workouts back`);
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
  step(`uploading ${payload.workouts.length} workouts to server`);

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
 * Read-only diagnostic — figures out exactly WHERE the HealthKit pipeline
 * is broken without doing a full sync or touching the server. Used by the
 * Settings card "Diagnose" button so users can paste the resulting object
 * into a support email instead of generic "still doesn't work".
 *
 * Checks, in order:
 *   1. Is `isCapacitorNative()` true? (web build can't talk to HealthKit)
 *   2. Does the npm plugin module load? (means pod is in the .ipa)
 *   3. Does the plugin expose its core methods? (`isAvailable`,
 *      `requestAuthorization`, `queryHKitSampleType`)
 *   4. Does `isAvailable()` resolve? (HealthKit capability + entitlement)
 *   5. Try a TINY query without asking for permission (1 sample, 7 days).
 *      The plugin will silently return empty when iOS hasn't granted
 *      access — which is the #1 cause of "nothing happens".
 *
 * Returns: { native, pluginLoaded, methods, isAvailable, querySupported,
 *            sampleCount, lastSyncedAt, permsAskedBefore, error }
 */
export async function diagnoseHealthKit() {
  const out = {
    native: isCapacitorNative(),
    pluginLoaded: false,
    methods: { isAvailable: false, requestAuthorization: false, queryHKitSampleType: false, openAppleHealthApp: false },
    isAvailable: null,
    querySupported: false,
    sampleCount: null,
    lastSyncedAt: lastSyncedAt(),
    permsAskedBefore: null,
    plannedReadPerms: HEALTHKIT_READ_PERMISSIONS,
    error: null,
  };
  try { out.permsAskedBefore = localStorage.getItem(PERMS_KEY) === '1'; } catch {}
  if (!out.native) { out.error = 'Not running inside Capacitor — HealthKit only works in the iOS app build.'; return out; }
  let plugin;
  try {
    plugin = await getPlugin();
    out.pluginLoaded = !!plugin;
    if (!plugin) { out.error = 'Plugin module loaded as null. Check the .ipa was built with `pod install` after adding @perfood/capacitor-healthkit.'; return out; }
  } catch (e) {
    out.error = `Plugin import threw: ${e?.message || e}`;
    return out;
  }
  out.methods.isAvailable          = typeof plugin.isAvailable === 'function';
  out.methods.requestAuthorization = typeof plugin.requestAuthorization === 'function';
  out.methods.queryHKitSampleType  = typeof plugin.queryHKitSampleType === 'function';
  out.methods.openAppleHealthApp   = typeof plugin.openAppleHealthApp === 'function';
  try {
    await withTimeout(plugin.isAvailable(), PLUGIN_TIMEOUT_MS, 'isAvailable');
    out.isAvailable = true;
  } catch (e) {
    out.isAvailable = false;
    out.error = `isAvailable rejected: ${e?.message || e}. Likely missing NSHealthShareUsageDescription or the HealthKit capability isn't enabled on the App target in Xcode.`;
    return out;
  }
  if (!out.methods.queryHKitSampleType) {
    out.error = 'queryHKitSampleType missing — plugin version mismatch?';
    return out;
  }
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const res = await withTimeout(plugin.queryHKitSampleType({
      sampleName: 'workoutType',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 1,
    }), PLUGIN_TIMEOUT_MS, 'queryHKitSampleType (probe)');
    out.querySupported = true;
    out.sampleCount = Array.isArray(res?.resultData) ? res.resultData.length : 0;
    if (out.sampleCount === 0) {
      out.error = 'Query returned 0 workouts. If you have workouts in Apple Health in the last 7 days, iOS has silently denied read access — open iPhone Settings → Health → Data Access & Devices → LaChart → turn ON Workouts + Heart Rate + Distance + Active Energy.';
    }
  } catch (e) {
    out.error = `Probe query threw: ${e?.message || e}`;
  }
  return out;
}

/**
 * Idempotent fire-and-forget call for app boot. Wrapped in a try so we never
 * crash the app on startup; logs to console for diagnostics.
 *
 * App Store Review Guideline 2.5.1 requires that HealthKit data access be
 * clearly identified in the app's UI. The auto-sync used to be invisible —
 * it just pulled workouts in the background and they appeared in the
 * activity feed without any "synced from Apple Health" indicator. To
 * comply, we now dispatch a `healthkit:synced` CustomEvent on every sync
 * outcome (success, empty, error). A listener in App.jsx turns those into
 * toast notifications so the user always sees "Imported N workouts from
 * Apple Health" when data flows in. Pre-emptively dispatching even on
 * "skipped: throttled" would be noisy, so we only signal when the sync
 * actually attempted or completed something the user should know about.
 */
function dispatchHealthKitEvent(detail) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('healthkit:synced', { detail }));
    }
  } catch { /* ignore */ }
}

export async function maybeSyncOnAppOpen() {
  try {
    const result = await syncHealthKit();
    if (result?.imported > 0) {
      console.log(`[healthkit] auto-sync imported ${result.imported}/${result.total} workouts`);
      dispatchHealthKitEvent({ kind: 'imported', imported: result.imported, total: result.total });
    } else if (result?.skipped === 'empty-or-denied') {
      console.log('[healthkit] auto-sync: empty or denied');
      // Silent — user already saw the iOS permission sheet at onboarding.
    } else if (result?.skipped === 'throttled') {
      // Within the 24h throttle window — explicitly do NOT toast; users
      // shouldn't see a popup every time they open the app.
    } else if (result?.skipped) {
      console.log(`[healthkit] auto-sync skipped: ${result.skipped}`);
    }
    return result;
  } catch (e) {
    console.warn('[healthkit] auto-sync error:', e?.message || e);
    dispatchHealthKitEvent({ kind: 'error', error: e?.message });
    return { skipped: 'error', error: e?.message };
  }
}
