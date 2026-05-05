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

  // Interval — webhook should deliver in real-time; this is a safety net for
  // events Strava drops or for users connected before the webhook subscription.
  // Default 10 minutes; bump batch size so the whole user base cycles fast.
  const intervalMs = Number(process.env.STRAVA_AUTO_SYNC_INTERVAL_MS || 10 * 60 * 1000);

  // Process up to 12 users per tick (was 6). Keeps each tick under ~2 minutes
  // even with 10 s between users, so the 10-min interval is achievable.
  const batchSize = Number(process.env.STRAVA_AUTO_SYNC_BATCH_SIZE || 12);

  // 10 s between users → spreads API calls; combined with 2 s between pages keeps
  // us well under Strava's 100 req/15-min limit even with full-history syncs.
  const delayBetweenUsers = Number(process.env.STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS || 10000);

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
