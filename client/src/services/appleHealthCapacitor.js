/**
 * Apple Health (HealthKit) via @capgo/capacitor-health — iOS native shell only.
 */
import { Capacitor } from '@capacitor/core';

export const APPLE_HEALTH_READ_TYPES = [
  'restingHeartRate',
  'sleep',
  'heartRateVariability',
  'respiratoryRate',
  'workouts',
];

export function isAppleHealthSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

async function getHealth() {
  const { Health } = await import('@capgo/capacitor-health');
  return Health;
}

/** @returns {Promise<boolean>} */
export async function checkAppleHealthAvailable() {
  if (!isAppleHealthSupported()) return false;
  try {
    const Health = await getHealth();
    const { available } = await Health.isAvailable();
    return Boolean(available);
  } catch {
    return false;
  }
}

/**
 * Request HealthKit read permissions.
 * @returns {Promise<{ granted: boolean, status?: object }>}
 */
export async function requestAppleHealthAccess() {
  if (!isAppleHealthSupported()) {
    return { granted: false, reason: 'not_ios' };
  }
  const Health = await getHealth();
  const { available, reason } = await Health.isAvailable();
  if (!available) return { granted: false, reason: reason || 'unavailable' };

  const status = await Health.requestAuthorization({
    read: APPLE_HEALTH_READ_TYPES,
    write: [],
  });
  const denied = status?.readDenied || [];
  const authorized = status?.readAuthorized || [];
  const granted = authorized.length > 0 && denied.length < APPLE_HEALTH_READ_TYPES.length;
  return { granted, status };
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

/**
 * Merge daily aggregated buckets into wellness rows for the API.
 * @param {number} days
 * @returns {Promise<Array<{ date: string, restingHeartRate?: number, sleepMinutes?: number, hrvMs?: number }>>}
 */
export async function collectAppleHealthWellness(days = 14) {
  if (!isAppleHealthSupported()) return [];

  const Health = await getHealth();
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [rhrRes, sleepRes, hrvRes] = await Promise.all([
    Health.queryAggregated({
      dataType: 'restingHeartRate',
      startDate: startIso,
      endDate: endIso,
      bucket: 'day',
      aggregation: 'average',
    }).catch(() => ({ samples: [] })),
    Health.queryAggregated({
      dataType: 'sleep',
      startDate: startIso,
      endDate: endIso,
      bucket: 'day',
      aggregation: 'sum',
    }).catch(() => ({ samples: [] })),
    Health.queryAggregated({
      dataType: 'heartRateVariability',
      startDate: startIso,
      endDate: endIso,
      bucket: 'day',
      aggregation: 'average',
    }).catch(() => ({ samples: [] })),
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
      // HealthKit sleep sum may be minutes or seconds depending on unit
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

/**
 * @param {string} sinceIso
 * @returns {Promise<Array<object>>}
 */
export async function collectAppleHealthWorkouts(sinceIso) {
  if (!isAppleHealthSupported()) return [];

  const Health = await getHealth();
  const { workouts = [] } = await Health.queryWorkouts({
    startDate: sinceIso,
    endDate: new Date().toISOString(),
    limit: 300,
    ascending: false,
  });

  return workouts.map((w) => {
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
}

/** Open iOS Settings → Health → LaChart */
export async function openAppleHealthSettings() {
  if (!isAppleHealthSupported()) return;
  try {
    const { App } = await import('@capacitor/app');
    await App.openUrl({ url: 'x-apple-health://' });
  } catch {
    // fallback: general settings
    try {
      const { App } = await import('@capacitor/app');
      await App.openUrl({ url: 'app-settings:' });
    } catch { /* ignore */ }
  }
}
