const axios = require('axios');
const User = require('../models/UserModel');
const StravaActivity = require('../models/StravaActivity');
const stravaBudget = require('../utils/stravaBudget');
const { recordStravaSyncLogSafe } = require('./stravaSyncLogService');
// Shared token helper — uses the same refresh + invalid-grant logic as the
// route module. The old local copy aggressively wiped user.strava on every
// 4xx, which caused users to be silently disconnected by transient errors.
const { getValidStravaToken } = require('../utils/stravaToken');
const {
  STRAVA_AUTO_SYNC_MIN_USER_AGE_MS,
  STRAVA_AUTO_SYNC_PAGE_DELAY_MS,
  STRAVA_AUTO_SYNC_SCHEDULER_MAX_PAGES,
  STRAVA_AUTO_SYNC_BACKGROUND_MAX_PAGES,
} = require('../config/stravaAutoSyncConfig');

// Helper function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sync Strava activities for a single user
 * @param {Object} user - User document with strava credentials
 * @returns {Promise<{imported: number, updated: number, error?: string}>}
 */
async function syncStravaForUser(user, opts = {}) {
  const { force = false, source = 'auto-sync' } = opts;
  const startedAt = new Date();
  let imported = 0;
  // Track stravaId of newly-imported activities so the push notification can
  // deep-link to the most recent one (great for the "tap → add lactate" flow).
  const importedActivityIds = [];
  let latestImportedDoc = null;
  let updated = 0;
  let rateLimited = false;

  try {
    if (!user || !user.strava?.accessToken) {
      recordStravaSyncLogSafe({
        userId: user?._id || null,
        source,
        status: 'error',
        startedAt,
        imported,
        updated,
        error: 'Strava not connected',
      });
      return { imported: 0, updated: 0, error: 'Strava not connected' };
    }

    // Background syncs (scheduler / app-open) respect the per-user autoSync
    // toggle. User-initiated "Sync now" sets force=true and pulls regardless —
    // otherwise users who turned auto-sync off would silently get nothing back
    // when they tapped the manual refresh button.
    if (!force && !user.strava?.autoSync) {
      recordStravaSyncLogSafe({
        userId: user._id,
        source,
        status: 'skipped',
        startedAt,
        message: 'Auto-sync is disabled',
      });
      return { imported: 0, updated: 0, message: 'Auto-sync is disabled' };
    }
    
    let token = await getValidStravaToken(user);
    if (!token) {
      recordStravaSyncLogSafe({
        userId: user._id,
        source,
        status: 'error',
        startedAt,
        error: 'Invalid Strava token',
      });
      return { imported: 0, updated: 0, error: 'Invalid Strava token' };
    }
    
    // Use lastSyncDate if available, otherwise sync last 7 days.
    // IMPORTANT: subtract a 48h overlap window so we re-check the recent
    // past on every sync. Without overlap, any activity that arrives at
    // Strava after our last sync timestamp (delayed upload from a bike
    // computer, failed webhook + retry, clock skew) falls into a dead zone
    // and is never imported. The dedup unique index on (userId, stravaId)
    // makes the overlap free of side effects.
    let since = null;
    if (user.strava?.lastSyncDate) {
      const overlapMs = 48 * 60 * 60 * 1000; // 48 hours
      since = new Date(new Date(user.strava.lastSyncDate).getTime() - overlapMs);
    } else {
      // First time sync — recent window only; full history is handled by the
      // progressive backfill kicked off in the OAuth callback.
      const lookbackDays = source === 'connect' ? 30 : 7;
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - lookbackDays);
      since = sinceDate;
    }
    
    const per_page = 100;
    let page = 1;
    // For incremental syncs (user already has a lastSyncDate) we only need a few
    // pages at most — real-world athletes rarely upload 200+ activities in one go.
    // For first-time syncs we allow more pages to back-fill history.
    const isFirstSync = !user.strava?.lastSyncDate;
    // Manual "Sync now" pulls more aggressively — the user is waiting, and the
    // 48h overlap window can still contain >300 activities for active athletes
    // (multi-sport, indoor + outdoor). Background ticks stay conservative.
    const maxPages = isFirstSync
      ? (source === 'connect' ? 15 : 10)
      : (force
        ? 10
        : (source === 'scheduler'
          ? STRAVA_AUTO_SYNC_SCHEDULER_MAX_PAGES
          : STRAVA_AUTO_SYNC_BACKGROUND_MAX_PAGES));

    const params = { per_page };
    if (since) {
      params.after = new Date(since).getTime() / 1000;
    }

    const delayBetweenRequests = STRAVA_AUTO_SYNC_PAGE_DELAY_MS;

    // Track whether we drained the window cleanly. We only advance
    // lastSyncDate on a clean run — a 429/network error must NOT advance
    // it, otherwise the missed page's activities are permanently lost.
    let cleanRun = true;
    let newestStartDate = null;
    let pagesFetched = 0;

    console.log(`[StravaAutoSync] Starting sync for user ${user._id}, since: ${since}`);

    while (page <= maxPages) {
      try {
        await stravaBudget.take();
        const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
          headers: { Authorization: `Bearer ${token}` },
          params: { ...params, page },
          timeout: 30000
        });
        // Sync local counter with Strava's authoritative usage. Keeps the
        // budget honest across concurrent processes.
        try { stravaBudget.reconcileFromHeaders(resp.headers); } catch (_) { /* swallow */ }

        const arr = resp.data || [];
        pagesFetched += 1;

        if (arr.length === 0) {
          break;
        }
        
        for (const a of arr) {
          try {
            const existing = await StravaActivity.findOne(
              { userId: user._id, stravaId: a.id },
              { movingTime: 1, elapsedTime: 1, distance: 1, manualTss: 1, metricsManualized: 1 },
            ).lean();
            const doc = {
              userId: user._id.toString(),
              stravaId: a.id,
              name: a.name || 'Untitled Activity',
              sport: a.sport_type || a.type || 'Ride',
              startDate: new Date(a.start_date_local || a.start_date),
              elapsedTime: a.elapsed_time || 0,
              movingTime: a.moving_time || 0,
              distance: a.distance || 0,
              averageSpeed: a.average_speed || null,
              averageHeartRate: a.average_heartrate || null,
              averagePower: a.average_watts || null,
              weightedAveragePower:
                a.weighted_average_watts != null && Number.isFinite(Number(a.weighted_average_watts))
                  ? Number(a.weighted_average_watts)
                  : null,
              raw: a
            };
            if (existing?.metricsManualized) {
              if (existing.movingTime != null) doc.movingTime = existing.movingTime;
              if (existing.elapsedTime != null) doc.elapsedTime = existing.elapsedTime;
              if (existing.distance != null) doc.distance = existing.distance;
              if (existing.manualTss != null) doc.manualTss = existing.manualTss;
              if (existing.tssDisplayMode != null) doc.tssDisplayMode = existing.tssDisplayMode;
            }
            
            const resUp = await StravaActivity.updateOne(
              { userId: user._id, stravaId: a.id },
              { $set: doc },
              { upsert: true }
            );
            
            if (resUp.upsertedCount > 0) {
              imported += 1;
              importedActivityIds.push(a.id);
              if (!latestImportedDoc || doc.startDate > latestImportedDoc.startDate) {
                latestImportedDoc = doc;
              }
            } else if (resUp.modifiedCount > 0) updated += 1;

            // Track the newest start_date we saw so lastSyncDate can be
            // advanced to it (not to wall-clock now()).
            const startMs = doc.startDate?.getTime?.();
            if (startMs && (!newestStartDate || startMs > newestStartDate)) {
              newestStartDate = startMs;
            }
          } catch (dbErr) {
            console.error(`[StravaAutoSync] Error saving activity ${a.id}:`, dbErr.message);
            cleanRun = false;
          }
        }
        
        if (arr.length < per_page) {
          break;
        }
        
        page += 1;
        if (page <= maxPages) {
          await delay(delayBetweenRequests);
        }
      } catch (pageErr) {
        if (pageErr.code === 'STRAVA_BUDGET_EXHAUSTED' || pageErr.response?.status === 429) {
          console.log('[StravaAutoSync] Rate/budget limit during sync, stopping at page', page);
          cleanRun = false;
          rateLimited = true;
          break;
        }
        if (pageErr.response?.status === 401) {
          console.log('[StravaAutoSync] Got 401 (Unauthorized) - token may be invalid, attempting refresh...');
          // Try to refresh token
          const refreshedUser = await User.findById(user._id);
          const newToken = await getValidStravaToken(refreshedUser);
          if (newToken) {
            // Update token and retry this page
            token = newToken;
            continue; // Retry this page with new token
          } else {
            // Token refresh helper already handled the truly-dead case
            // (it wipes user.strava only on confirmed invalid_grant).
            // Here we just stop this sync; the user may simply need to
            // wait for the next Strava recovery or manually reconnect.
            console.log('[StravaAutoSync] Token refresh returned null for user', user._id);
            recordStravaSyncLogSafe({
              userId: user._id,
              source,
              status: 'error',
              startedAt,
              imported,
              updated,
              totalFetched: imported + updated,
              stravaActivityIds: importedActivityIds,
              error: 'Strava token refresh failed; will retry next cycle',
            });
            return { imported, updated, error: 'Strava token refresh failed; will retry next cycle' };
          }
        }
        // For other errors, log and continue (don't crash)
        console.error(`[StravaAutoSync] Error fetching page ${page} for user ${user._id}:`, pageErr.message);
        cleanRun = false;
        break; // Stop sync on other errors
      }
    }

    // Only advance lastSyncDate when:
    //   (a) the loop finished without a rate-limit / network error, AND
    //   (b) we have a real anchor (newest activity's start_date OR, if
    //       there was nothing new, the previous lastSyncDate stays put
    //       except we lift the floor to "now - 48h overlap" to avoid
    //       re-scanning the same week forever).
    // This stops the historical bug where a transient error bumped
    // lastSyncDate=now() and silently swallowed the activities in the
    // failed page.
    // Advance when the run finished cleanly, or when we hit budget/429 after
    // at least one successful list page (otherwise users retry the same window
    // every tick and amplify partial failures).
    // Always advance after at least one successful list page so a budget blip
    // on page 2 does not leave lastSyncDate stuck for days (736 partial failures).
    const shouldAdvanceSyncDate = cleanRun || pagesFetched > 0;
    if (shouldAdvanceSyncDate) {
      let newAnchor;
      if (newestStartDate) {
        newAnchor = new Date(newestStartDate);
      } else {
        newAnchor = new Date();
      }
      await User.findByIdAndUpdate(user._id, {
        'strava.lastSyncDate': newAnchor,
      });
    } else {
      console.log(`[StravaAutoSync] Skipping lastSyncDate bump for user ${user._id} (partial run)`);
    }
    
    console.log(`[StravaAutoSync] Completed for user ${user._id}: ${imported} imported, ${updated} updated`);

    if (imported > 0) {
      const latestImportedId = importedActivityIds.length === 1
        ? importedActivityIds[0]
        : (latestImportedDoc?.stravaId ?? null);

      const { notifyStravaImportedPush } = require('../utils/stravaImportNotifications');
      notifyStravaImportedPush(
        user._id,
        imported,
        latestImportedId,
        latestImportedDoc?.sport,
        latestImportedDoc,
      );
    }

    const latestImportedId = importedActivityIds.length === 1
      ? importedActivityIds[0]
      : (importedActivityIds.length > 1 ? importedActivityIds[importedActivityIds.length - 1] : null);
    recordStravaSyncLogSafe({
      userId: user._id,
      source,
      status: rateLimited ? 'rate_limited' : (cleanRun ? 'success' : 'partial'),
      startedAt,
      imported,
      updated,
      totalFetched: imported + updated,
      rateLimited,
      stravaActivityIds: importedActivityIds,
      message: cleanRun ? null : 'Sync stopped before all pages completed',
    });
    return { imported, updated, latestActivityId: latestImportedId };
  } catch (error) {
    // Ensure we never crash the server - catch all errors
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
    const statusCode = error.response?.status;
    
    console.error(`[StravaAutoSync] Error for user ${user._id}:`, errorMessage, statusCode ? `(Status: ${statusCode})` : '');

    recordStravaSyncLogSafe({
      userId: user?._id || null,
      source,
      status: statusCode === 429 ? 'rate_limited' : 'error',
      startedAt,
      imported,
      updated,
      rateLimited: statusCode === 429,
      error: errorMessage,
    });

    return { imported: 0, updated: 0, error: errorMessage };
  }
}

/**
 * Sync Strava activities for all users with auto-sync enabled
 * @param {Object} options - Options for batch sync
 * @param {number} options.batchSize - Maximum number of users to sync in one batch (scheduler default: 4)
 * @param {number} options.delayBetweenUsers - Delay in ms between users (scheduler default: 8000)
 * @returns {Promise<{total: number, synced: number, skipped: number, errors: number, results: Array}>}
 */
async function syncStravaForAllUsers({ batchSize = 10, delayBetweenUsers = 5000 } = {}) {
  try {
    // Only sync users whose lastSyncDate is older than (intervalMs - 2 min buffer).
    // This prevents hammering Strava when the scheduler fires more often than expected
    // (e.g. multiple server instances, restarts).
    const cutoff = new Date(Date.now() - STRAVA_AUTO_SYNC_MIN_USER_AGE_MS);

    // Skip users whose webhook is healthy — if Strava pushed an event within
    // the last 24 hours, real-time sync is doing its job and polling them
    // burns quota with no upside. Users whose webhook went silent fall back
    // to the scheduler automatically.
    const webhookHealthyCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find users with Strava connected and auto-sync enabled,
    // sorted by lastSyncDate ascending so the least-recently-synced users go first.
    // .limit(batchSize) now rotates fairly because users are ordered by sync age.
    const users = await User.find({
      'strava.accessToken': { $exists: true, $ne: null },
      'strava.autoSync': true,
      isActive: { $ne: false },
      $or: [
        { 'strava.lastSyncDate': { $exists: false } },
        { 'strava.lastSyncDate': null },
        { 'strava.lastSyncDate': { $lt: cutoff } },
      ],
      // Webhook-healthy users (push event in last 24h) don't need polling.
      $and: [{
        $or: [
          { 'strava.webhookLastEventAt': { $exists: false } },
          { 'strava.webhookLastEventAt': null },
          { 'strava.webhookLastEventAt': { $lt: webhookHealthyCutoff } },
        ],
      }],
    })
      .select('_id strava email name')
      .sort({ 'strava.webhookLastEventAt': 1, 'strava.lastSyncDate': 1 })
      .limit(batchSize)
      .lean();
    
    if (users.length === 0) {
      console.log('[StravaAutoSync] No users with auto-sync enabled found');
      return { total: 0, synced: 0, skipped: 0, errors: 0, results: [] };
    }
    
    console.log(`[StravaAutoSync] Found ${users.length} users with auto-sync enabled`);
    
    const results = [];
    let synced = 0;
    let skipped = 0;
    let errors = 0;
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      try {
        // Reload user to get fresh data
        const freshUser = await User.findById(user._id);
        if (!freshUser || !freshUser.strava?.autoSync) {
          skipped++;
          continue;
        }
        
        const result = await syncStravaForUser(freshUser, { source: 'scheduler' });
        results.push({ userId: user._id, ...result });
        
        if (result.error) {
          errors++;
        } else if (result.imported > 0 || result.updated > 0) {
          synced++;
        } else {
          skipped++;
        }
        
        // Add delay between users to respect rate limits (except for last user)
        if (i < users.length - 1) {
          await delay(delayBetweenUsers);
        }
      } catch (userError) {
        console.error(`[StravaAutoSync] Failed to sync user ${user._id}:`, userError.message);
        errors++;
        results.push({ userId: user._id, imported: 0, updated: 0, error: userError.message });
      }
    }
    
    console.log(`[StravaAutoSync] Batch completed: ${synced} synced, ${skipped} skipped, ${errors} errors`);
    return { total: users.length, synced, skipped, errors, results };
  } catch (error) {
    console.error('[StravaAutoSync] Batch sync error:', error);
    return { total: 0, synced: 0, skipped: 0, errors: 1, results: [] };
  }
}

module.exports = {
  syncStravaForUser,
  syncStravaForAllUsers
};
