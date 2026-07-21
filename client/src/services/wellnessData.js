/**
 * Cached wellness fetcher (Apple Health + Garmin merged).
 *
 * The dashboard wellness card, the Form & Fitness overlay, the weekly calendar
 * and the detail sheet all want the same recovery rows. This fetches both
 * sources, merges them per calendar day, and wraps the result in a short
 * in-memory TTL cache keyed by day-count so they don't each fire a request.
 *
 * A user typically has only one source (Apple from the iPhone OR a Garmin
 * watch), so per-day conflicts are rare; when both provide the same field we
 * keep whichever is present (Apple first, Garmin fills the gaps).
 */
import { getAppleHealthWellness, getGarminWellness } from './api';

const TTL_MS = 60 * 1000;
const cache = new Map(); // key -> { ts, promise }

const WELLNESS_FIELDS = [
  'restingHeartRate', 'sleepingHeartRate', 'sleepMinutes',
  'sleepStages', 'sleepSegments', 'hrvMs', 'respiratoryRate',
];

/** Merge two per-day wellness lists into one sorted list, filling missing fields. */
function mergeWellnessDays(a = [], b = []) {
  const byDate = new Map();
  const add = (rows) => {
    for (const row of rows) {
      if (!row?.date) continue;
      const existing = byDate.get(row.date);
      if (!existing) {
        byDate.set(row.date, { ...row });
        continue;
      }
      // Fill only fields the first source left null/empty.
      for (const f of WELLNESS_FIELDS) {
        const cur = existing[f];
        const isEmpty = cur == null || (Array.isArray(cur) && cur.length === 0);
        if (isEmpty && row[f] != null) existing[f] = row[f];
      }
    }
  };
  add(a);
  add(b);
  return Array.from(byDate.values()).sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * @param {number} days
 * @param {string} [athleteId] coach viewing a linked athlete
 * @returns {Promise<{ connected: boolean, days: Array }>}
 */
export async function fetchWellness(days = 7, athleteId = null) {
  const key = athleteId ? `${days}:${athleteId}` : String(days);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.promise;

  const opts = { days, athleteId: athleteId || undefined };
  const promise = Promise.all([
    getAppleHealthWellness(opts).catch(() => ({ connected: false, days: [] })),
    getGarminWellness(opts).catch(() => ({ connected: false, days: [] })),
  ])
    .then(([apple, garmin]) => ({
      connected: Boolean(apple?.connected) || Boolean(garmin?.connected),
      days: mergeWellnessDays(apple?.days || [], garmin?.days || []),
    }))
    .catch((err) => {
      cache.delete(key);
      throw err;
    });

  cache.set(key, { ts: Date.now(), promise });
  return promise;
}

/** Drop all cached wellness (e.g. after a fresh sync). */
export function invalidateWellnessCache() {
  cache.clear();
}

// A new Apple Health / Garmin sync makes cached rows stale.
if (typeof window !== 'undefined') {
  window.addEventListener('appleHealth:synced', invalidateWellnessCache);
  window.addEventListener('garmin:synced', invalidateWellnessCache);
}
