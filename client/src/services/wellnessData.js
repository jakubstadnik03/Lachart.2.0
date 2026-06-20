/**
 * Cached Apple Health wellness fetcher.
 *
 * The dashboard wellness card, the Form & Fitness overlay and the weekly
 * calendar all want the same recovery rows. This wraps `getAppleHealthWellness`
 * with a short in-memory TTL cache keyed by day-count so they don't each fire a
 * request (and so the value is shared after a sync).
 */
import { getAppleHealthWellness } from './api';

const TTL_MS = 60 * 1000;
const cache = new Map(); // days -> { ts, promise }

/**
 * @param {number} days
 * @param {string} [athleteId] coach viewing a linked athlete
 * @returns {Promise<{ connected: boolean, days: Array }>}
 */
export async function fetchWellness(days = 7, athleteId = null) {
  const key = athleteId ? `${days}:${athleteId}` : String(days);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.promise;

  const promise = getAppleHealthWellness({ days, athleteId: athleteId || undefined })
    .then((data) => ({ connected: Boolean(data?.connected), days: data?.days || [] }))
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

// A new Apple Health sync makes cached rows stale.
if (typeof window !== 'undefined') {
  window.addEventListener('appleHealth:synced', invalidateWellnessCache);
}
