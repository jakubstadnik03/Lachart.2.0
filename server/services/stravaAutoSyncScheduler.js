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

  // Interval in milliseconds (default: 30 minutes)
  const intervalMs = Number(process.env.STRAVA_AUTO_SYNC_INTERVAL_MS || 30 * 60 * 1000);
  
  // Batch size - how many users to sync per tick (default: 10)
  const batchSize = Number(process.env.STRAVA_AUTO_SYNC_BATCH_SIZE || 10);
  
  // Delay between users in ms (default: 5 seconds)
  const delayBetweenUsers = Number(process.env.STRAVA_AUTO_SYNC_DELAY_BETWEEN_USERS_MS || 5000);

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
