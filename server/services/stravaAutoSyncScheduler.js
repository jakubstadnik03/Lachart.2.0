const { syncStravaForAllUsers } = require('./stravaAutoSyncService');

/**
 * Start the Strava auto-sync scheduler
 * This will periodically sync Strava activities for all users with auto-sync enabled
 */
function startStravaAutoSyncScheduler() {
  const enabled = process.env.ENABLE_STRAVA_AUTO_SYNC_SCHEDULER === 'true' || process.env.NODE_ENV === 'production';
  if (!enabled) {
    console.log('[StravaAutoSyncScheduler] Disabled (set ENABLE_STRAVA_AUTO_SYNC_SCHEDULER=true to enable).');
    return;
  }
  // Once the Strava webhook subscription is in place and proven reliable, set
  // STRAVA_DISABLE_POLL=true on the server to stop the periodic sync entirely.
  // Webhook will deliver new activities in real-time and skipping polling
  // keeps the rate-limit budget free for ad-hoc detail fetches.
  if (process.env.STRAVA_DISABLE_POLL === 'true') {
    console.log('[StravaAutoSyncScheduler] STRAVA_DISABLE_POLL=true — polling skipped, webhook only.');
    return;
  }

  // Interval — webhook delivers activities in real-time; this is a fallback
  // safety net only. Default 60 minutes keeps daily API usage well under
  // Strava's 6 000/day limit even with many connected users.
  // Align with the 60-min cutoff used in syncStravaForAllUsers so every tick
  // actually finds work to do instead of wasting quota re-checking users that
  // were just synced.
  const intervalMs = Number(process.env.STRAVA_AUTO_SYNC_INTERVAL_MS || 60 * 60 * 1000);

  // 6 users per tick is enough: at 60-min cadence the whole base of ~60 users
  // rotates every ~10 ticks = 10 hours, well inside Strava's daily window.
  const batchSize = Number(process.env.STRAVA_AUTO_SYNC_BATCH_SIZE || 6);

  // 15 s between users — plenty of breathing room at the reduced rate.
  const delayBetweenUsers = Number(process.env.STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS || 15000);

  const tick = async () => {
    try {
      console.log('[StravaAutoSyncScheduler] Starting scheduled sync...');
      const result = await syncStravaForAllUsers({ batchSize, delayBetweenUsers });
      console.log('[StravaAutoSyncScheduler] Scheduled sync completed:', {
        total: result.total,
        synced: result.synced,
        skipped: result.skipped,
        errors: result.errors
      });
    } catch (error) {
      console.error('[StravaAutoSyncScheduler] Scheduled sync error:', error);
    }
  };

  // Initial delayed tick + interval ticks
  setTimeout(() => tick().catch(e => console.error('[StravaAutoSyncScheduler] Initial tick error', e)), 30 * 1000); // Start after 30 seconds
  setInterval(() => tick().catch(e => console.error('[StravaAutoSyncScheduler] Interval tick error', e)), intervalMs);

  console.log('[StravaAutoSyncScheduler] Started.', {
    intervalMs,
    batchSize,
    delayBetweenUsers,
    intervalMinutes: Math.round(intervalMs / 60000)
  });
}

module.exports = { startStravaAutoSyncScheduler };
