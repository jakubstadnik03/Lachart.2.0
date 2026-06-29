/**
 * Apple Health (HealthKit) — iOS native shell only.
 * Uses in-app LaChartHealthPlugin (Capacitor 6). Falls back to @capgo/capacitor-health if present.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export const LaChartHealth = registerPlugin('LaChartHealth');

export const APPLE_HEALTH_READ_TYPES = [
  'restingHeartRate',
  'sleep',
  'heartRateVariability',
  'respiratoryRate',
  'workouts',
  'heartRate',
];

export function isAppleHealthSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** Reject if a native HealthKit call hangs (common on Simulator when the auth sheet is missed). */
function withTimeout(promise, ms, label = 'HealthKit') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Check for a Health permission dialog, or try a physical iPhone.`)), ms);
    }),
  ]);
}

/** Capacitor bridge can register plugins slightly after the WebView loads. */
async function waitForBridge(maxMs = 3500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (Capacitor.isPluginAvailable('LaChartHealth') || Capacitor.isPluginAvailable('Health')) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

/** On iOS we ship LaChartHealthPlugin in-app — never route auth through Capgo (can hang). */
function iosHealthPlugin() {
  return LaChartHealth;
}

/**
 * Resolve the native Health plugin. Probes LaChartHealth with a real call — more
 * reliable than Capacitor.isPluginAvailable() right after mount.
 */
async function resolveHealthPlugin() {
  if (Capacitor.getPlatform() === 'ios') {
    try {
      const v = await Promise.race([
        LaChartHealth.getPluginVersion(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]);
      if (v?.version && v.version !== 'web') {
        return { plugin: LaChartHealth, name: 'LaChartHealth', version: v.version };
      }
    } catch {
      /* getPluginVersion slow — still use in-app plugin on device */
    }
    return { plugin: LaChartHealth, name: 'LaChartHealth', version: 'ios-native' };
  }

  try {
    const v = await Promise.race([
      LaChartHealth.getPluginVersion(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
    ]);
    if (v?.version && v.version !== 'web') {
      return { plugin: LaChartHealth, name: 'LaChartHealth', version: v.version };
    }
  } catch {
    /* LaChartHealth not responding yet */
  }

  if (Capacitor.isPluginAvailable('Health')) {
    try {
      const { Health } = await import('@capgo/capacitor-health');
      const v = await withTimeout(Health.getPluginVersion?.() ?? Promise.resolve({}), 3000, 'Health plugin');
      if (v?.version && v.version !== 'web') {
        return { plugin: Health, name: 'Health', version: v.version };
      }
    } catch {
      /* capgo fallback unavailable */
    }
  }

  return { plugin: null, name: 'none', version: null };
}

async function getHealth() {
  if (Capacitor.getPlatform() === 'ios') {
    return iosHealthPlugin();
  }
  const resolved = await resolveHealthPlugin();
  if (resolved.plugin) return resolved.plugin;
  if (Capacitor.isPluginAvailable('LaChartHealth')) return LaChartHealth;
  const { Health } = await import('@capgo/capacitor-health');
  return Health;
}

function unavailableUserHint({ platform, pluginVersion, reason, isSimulator, pluginName }) {
  if (isSimulator) {
    return 'Apple Health v simulátoru má omezení. Pro plný sync použij fyzický iPhone (Xcode → Run na zařízení).';
  }
  if (!pluginName || pluginName === 'none') {
    return 'Health plugin se nenačetl. V terminálu: cd client && npm run cap:sync:ios — pak Xcode Product → Clean Build Folder → Run na iPhonu.';
  }
  if (platform === 'web' || pluginVersion === 'web') {
    return 'Health plugin se nenačetl v tomto buildu. Rebuild z Xcode na fyzickém iPhonu (ne TestFlight starší build).';
  }
  if (reason) return reason;
  return 'Apple Health není na tomto zařízení dostupné.';
}

export async function detectAppleHealthSimulator() {
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    return Boolean(info?.isVirtual);
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{ available: boolean, reason?: string, platform?: string, pluginLoaded?: boolean, pluginVersion?: string, pluginName?: string, hint?: string, isSimulator?: boolean }>}
 */
export async function getAppleHealthDiagnostics() {
  if (!isAppleHealthSupported()) {
    return {
      available: false,
      reason: 'not_ios',
      platform: 'unsupported',
      pluginLoaded: false,
      pluginVersion: null,
      pluginName: 'none',
      isSimulator: false,
      hint: 'Open the LaChart iOS app on an iPhone.',
    };
  }

  const isSimulator = await detectAppleHealthSimulator();
  await waitForBridge();

  const resolved = await resolveHealthPlugin();
  const pluginName = resolved.name;
  const pluginVersion = resolved.version;

  if (!resolved.plugin) {
    return {
      available: false,
      reason: 'plugin_not_loaded',
      platform: 'ios',
      pluginLoaded: false,
      pluginVersion: null,
      pluginName: 'none',
      isSimulator,
      hint: unavailableUserHint({ platform: 'ios', pluginVersion: null, isSimulator, pluginName: 'none' }),
    };
  }

  try {
    const Health = resolved.plugin;
    const result = await Health.isAvailable();
    const platform = result?.platform || 'ios';
    const nativeAvailable = Boolean(result?.available);
    // Our in-app plugin is always valid on iOS when it responds to getPluginVersion.
    const pluginLoaded = pluginName === 'LaChartHealth'
      || (pluginName === 'Health' && platform === 'ios' && pluginVersion !== 'web');
    const available = nativeAvailable && pluginLoaded;

    return {
      available,
      reason: !nativeAvailable ? (result?.reason || 'unavailable') : (!pluginLoaded ? 'plugin_not_loaded' : null),
      platform,
      pluginLoaded,
      pluginVersion,
      pluginName,
      isSimulator,
      hint: available
        ? (isSimulator ? unavailableUserHint({ isSimulator: true }) : null)
        : unavailableUserHint({ platform, pluginVersion, reason: result?.reason, isSimulator, pluginName }),
    };
  } catch (e) {
    return {
      available: false,
      reason: e?.message || 'plugin_error',
      platform: 'error',
      pluginLoaded: false,
      pluginVersion,
      pluginName,
      isSimulator,
      hint: unavailableUserHint({ platform: 'error', reason: e?.message, isSimulator, pluginName }),
    };
  }
}

export async function checkAppleHealthAvailable() {
  const { available } = await getAppleHealthDiagnostics();
  return available;
}

/** Wellness-only — registers Sleep / Resting HR / HRV in Health → Apps → LaChart (iPhone). */
export async function requestWellnessAuthorizationOnly() {
  if (!isAppleHealthSupported()) {
    return { ok: false, reason: 'not_ios' };
  }
  const Health = iosHealthPlugin();
  if (typeof Health.requestWellnessAuthorization === 'function') {
    const result = await withTimeout(
      Health.requestWellnessAuthorization(),
      10000,
      'Wellness permission',
    );
    return { ok: true, ...result };
  }
  const result = await withTimeout(
    Health.requestAuthorization({ read: WELLNESS_PERMISSION_IDS, write: [] }),
    10000,
    'Wellness permission',
  );
  return { ok: true, ...result };
}

export async function requestAppleHealthAccess() {
  if (!isAppleHealthSupported()) {
    return { granted: false, reason: 'not_ios' };
  }
  const Health = await getHealth();
  let authWarning = null;

  try {
    await withTimeout(Health.isAvailable(), 5000, 'Health availability');
  } catch {
    // On device, continue even if availability probe is slow.
  }

  // Single authorization request — wellness + workouts together (Swift merges types).
  try {
    const result = await withTimeout(
      Health.requestAuthorization({
        read: APPLE_HEALTH_READ_TYPES,
        write: [],
      }),
      12000,
      'Health permission',
    );
    if (result?.timedOut) {
      authWarning = 'Permission dialog timed out. Open Health → Profile → Apps → LaChart and enable Resting Heart Rate, Sleep and HRV (below workout types).';
    }
  } catch (e) {
    authWarning = e?.message || 'Permission request incomplete — trying to read available data anyway.';
  }

  return { granted: true, warning: authWarning };
}

/** Which wellness types iOS has been asked about (not whether read succeeded). */
export async function getAppleHealthPermissionStatus() {
  if (!isAppleHealthSupported()) return { types: [] };
  try {
    const Health = await getHealth();
    if (!Health.getAuthorizationStatus) return { types: [] };
    const result = await Health.getAuthorizationStatus();
    return { types: result?.types || [] };
  } catch {
    return { types: [] };
  }
}

export const WELLNESS_PERMISSION_IDS = ['restingHeartRate', 'sleep', 'heartRateVariability'];

export function wellnessPermissionHint(types = []) {
  const byId = Object.fromEntries((types || []).map((t) => [t.id, t.status]));
  const missing = WELLNESS_PERMISSION_IDS.filter((id) => byId[id] === 'notDetermined' || byId[id] === 'denied');
  if (missing.length === 0) return null;
  const labels = {
    restingHeartRate: 'Resting Heart Rate',
    sleep: 'Sleep',
    heartRateVariability: 'Heart Rate Variability',
  };
  const names = missing.map((id) => labels[id] || id).join(', ');
  return `In Health → Profile → Apps → LaChart, turn ON: ${names}.`;
}

function dateKeyFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function collectAppleHealthWellness(days = 14) {
  if (!isAppleHealthSupported()) return [];

  const Health = await getHealth();
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const query = (dataType) => withTimeout(
    Health.queryAggregated({
      dataType,
      startDate: startIso,
      endDate: endIso,
      bucket: 'day',
      aggregation: dataType === 'sleep' ? 'sum' : 'average',
    }),
    30000,
    `Read ${dataType}`,
  ).catch(() => ({ samples: [] }));

  const [rhrRes, sleepRes, hrvRes] = await Promise.all([
    query('restingHeartRate'),
    query('sleep'),
    query('heartRateVariability'),
  ]);

  const byDate = new Map();

  const touch = (iso, patch) => {
    const key = dateKeyFromIso(iso);
    if (!key) return;
    const row = byDate.get(key) || { date: key };
    Object.assign(row, patch);
    byDate.set(key, row);
  };

  for (const s of rhrRes?.samples || []) {
    if (s.value > 0) touch(s.startDate, { restingHeartRate: Math.round(s.value) });
  }
  for (const s of sleepRes?.samples || []) {
    if (s.value > 0) {
      const mins = s.unit === 'second' || s.unit === 's'
        ? Math.round(s.value / 60)
        : Math.round(s.value);
      touch(s.startDate, { sleepMinutes: mins });
    }
  }
  for (const s of hrvRes?.samples || []) {
    if (s.value > 0) touch(s.startDate, { hrvMs: Math.round(s.value * 10) / 10 });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

const WORKOUT_TYPE_MAP = {
  running: 'Running',
  run: 'Running',
  cycling: 'Cycling',
  bike: 'Cycling',
  swimming: 'Swimming',
  swim: 'Swimming',
  walking: 'Walking',
  walk: 'Walking',
  hiking: 'Hiking',
  rowing: 'Rowing',
  elliptical: 'Elliptical',
  stairClimbing: 'StairClimbing',
  crossTraining: 'CrossTraining',
};

async function avgHeartRateForWindow(Health, startIso, endIso) {
  if (!startIso || !endIso) return null;
  try {
    const { samples = [] } = await Health.queryAggregated({
      dataType: 'heartRate',
      startDate: startIso,
      endDate: endIso,
      bucket: 'hour',
      aggregation: 'average',
    });
    const vals = samples.map((s) => Number(s.value)).filter((v) => v > 0);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  } catch {
    return null;
  }
}

export async function collectAppleHealthWorkouts(sinceIso, opts = {}) {
  if (!isAppleHealthSupported()) return [];
  const { enrichHeartRate = false, enrichLimit = 25 } = opts;

  const Health = await getHealth();
  const { workouts = [] } = await withTimeout(
    Health.queryWorkouts({
      startDate: sinceIso,
      endDate: new Date().toISOString(),
      limit: 300,
      ascending: false,
    }),
    60000,
    'Read workouts',
  );

  const mapped = workouts.map((w) => {
    const rawType = String(w.workoutType || 'other').toLowerCase();
    const type = WORKOUT_TYPE_MAP[rawType] || 'Other';
    const start = w.startDate;
    const end = w.endDate || start;
    const durationSeconds = Number(w.duration) || Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000));

    return {
      id: w.platformId || `${start}-${type}`,
      type,
      startDate: start,
      endDate: end,
      durationSeconds,
      distanceMeters: Math.round(Number(w.totalDistance) || 0),
      calories: Math.round(Number(w.totalEnergyBurned) || 0),
      avgHeartRate: null,
      sourceName: w.sourceName || 'Apple Health',
    };
  });

  if (enrichHeartRate && mapped.length > 0) {
    const toEnrich = mapped.slice(0, enrichLimit);
    // Sequential — parallel HR queries easily freeze the Simulator / block the UI thread.
    for (const m of toEnrich) {
      m.avgHeartRate = await avgHeartRateForWindow(Health, m.startDate, m.endDate);
    }
  }

  return mapped;
}

export async function openAppleHealthSettings() {
  if (!isAppleHealthSupported()) return;
  try {
    const { App } = await import('@capacitor/app');
    await App.openUrl({ url: 'x-apple-health://' });
  } catch {
    try {
      const { App } = await import('@capacitor/app');
      await App.openUrl({ url: 'app-settings:' });
    } catch { /* ignore */ }
  }
}
