/**
 * Opportunistic per-user Strava sync (status check, settings open).
 * Deduped so we don't hammer Strava when many tabs poll /strava/status.
 */

const User = require('../models/UserModel');
const { syncStravaForUser } = require('./stravaAutoSyncService');
const { STRAVA_AUTO_SYNC_STALE_QUEUE_MS } = require('../config/stravaAutoSyncConfig');

const pending = new Set();
const lastQueuedAt = new Map();

function maybeQueueStravaAutoSync(userId, { force = false } = {}) {
  if (!userId) return;
  const id = String(userId);
  const now = Date.now();
  const minGap = force ? 60 * 1000 : STRAVA_AUTO_SYNC_STALE_QUEUE_MS;
  if (pending.has(id)) return;
  if (now - (lastQueuedAt.get(id) || 0) < minGap) return;

  pending.add(id);
  lastQueuedAt.set(id, now);

  setImmediate(async () => {
    try {
      const user = await User.findById(id);
      if (!user?.strava?.accessToken || !user.strava?.autoSync) return;
      await syncStravaForUser(user, { source: 'auto-sync', force });
    } catch (e) {
      console.warn(`[StravaAutoSyncQueue] background sync failed for ${id}:`, e?.message || e);
    } finally {
      pending.delete(id);
    }
  });
}

module.exports = { maybeQueueStravaAutoSync };
