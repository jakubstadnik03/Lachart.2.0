const axios = require('axios');
const User = require('../models/UserModel');
const StravaActivity = require('../models/StravaActivity');

// Helper function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get valid Strava token (refresh if needed)
async function getValidStravaToken(user) {
  if (!user?.strava?.accessToken) return null;
  const now = Math.floor(Date.now() / 1000);
  if (user.strava.expiresAt && user.strava.expiresAt - 60 > now) return user.strava.accessToken;
  
  // Refresh token
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    console.error('[StravaAutoSync] Strava credentials missing for token refresh');
    return null;
  }
  if (!user.strava.refreshToken) {
    console.error('[StravaAutoSync] No refresh token available for user', user._id);
    return null;
  }
  
  try {
    const resp = await axios.post('https://www.strava.com/oauth/token', {
      client_id,
      client_secret,
      grant_type: 'refresh_token',
      refresh_token: user.strava.refreshToken
    });
    
    user.strava.accessToken = resp.data.access_token;
    user.strava.refreshToken = resp.data.refresh_token || user.strava.refreshToken;
    user.strava.expiresAt = resp.data.expires_at;
    await user.save();
    return user.strava.accessToken;
  } catch (error) {
    console.error('[StravaAutoSync] Error refreshing Strava token:', error.response?.data || error.message);
    // If refresh token is invalid, clear Strava connection
    if (error.response?.status === 400) {
      user.strava = undefined;
      await user.save();
      console.log('[StravaAutoSync] Refresh token invalid, clearing Strava connection for user', user._id);
    }
    return null;
  }
}

/**
 * Sync Strava activities for a single user
 * @param {Object} user - User document with strava credentials
 * @returns {Promise<{imported: number, updated: number, error?: string}>}
 */
async function syncStravaForUser(user) {
  let imported = 0;
  let updated = 0;
  
  try {
    if (!user || !user.strava?.accessToken) {
      return { imported: 0, updated: 0, error: 'Strava not connected' };
    }

    // Check if auto-sync is enabled
    if (!user.strava?.autoSync) {
      return { imported: 0, updated: 0, message: 'Auto-sync is disabled' };
    }
    
    const token = await getValidStravaToken(user);
    if (!token) {
      return { imported: 0, updated: 0, error: 'Invalid Strava token' };
    }
    
    // Use lastSyncDate if available, otherwise sync last 7 days
    let since = null;
    if (user.strava?.lastSyncDate) {
      since = user.strava.lastSyncDate;
    } else {
      // First time sync - only get last 7 days to avoid long sync
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      since = sevenDaysAgo;
    }
    
    const per_page = 100;
    let page = 1;
    const maxPages = 10; // Limit to 10 pages for auto-sync (1000 activities max)
    
    const params = { per_page };
    if (since) {
      params.after = new Date(since).getTime() / 1000;
    }
    
    const delayBetweenRequests = 2000; // 2 seconds between requests
    
    console.log(`[StravaAutoSync] Starting sync for user ${user._id}, since: ${since}`);
    
    while (page <= maxPages) {
      try {
        const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
          headers: { Authorization: `Bearer ${token}` },
          params: { ...params, page },
          timeout: 30000
        });
        
        const arr = resp.data || [];
        
        if (arr.length === 0) {
          break;
        }
        
        for (const a of arr) {
          try {
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
              raw: a
            };
            
            const resUp = await StravaActivity.updateOne(
              { userId: user._id, stravaId: a.id },
              { $set: doc },
              { upsert: true }
            );
            
            if (resUp.upsertedCount > 0) imported += 1;
            else if (resUp.modifiedCount > 0) updated += 1;
          } catch (dbErr) {
            console.error(`[StravaAutoSync] Error saving activity ${a.id}:`, dbErr.message);
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
        if (pageErr.response?.status === 429) {
          console.log('[StravaAutoSync] Rate limit hit during sync, stopping');
          break;
        }
        throw pageErr;
      }
    }
    
    // Update last sync date
    if (imported > 0 || updated > 0) {
      await User.findByIdAndUpdate(user._id, {
        'strava.lastSyncDate': new Date()
      });
    }
    
    console.log(`[StravaAutoSync] Completed for user ${user._id}: ${imported} imported, ${updated} updated`);
    return { imported, updated };
  } catch (error) {
    console.error(`[StravaAutoSync] Error for user ${user._id}:`, error.message);
    return { imported: 0, updated: 0, error: error.message };
  }
}

/**
 * Sync Strava activities for all users with auto-sync enabled
 * @param {Object} options - Options for batch sync
 * @param {number} options.batchSize - Maximum number of users to sync in one batch (default: 10)
 * @param {number} options.delayBetweenUsers - Delay in ms between users (default: 5000)
 * @returns {Promise<{total: number, synced: number, skipped: number, errors: number, results: Array}>}
 */
async function syncStravaForAllUsers({ batchSize = 10, delayBetweenUsers = 5000 } = {}) {
  try {
    // Find all users with Strava connected and auto-sync enabled
    const users = await User.find({
      'strava.accessToken': { $exists: true, $ne: null },
      'strava.autoSync': true,
      isActive: { $ne: false }
    }).select('_id strava email name').limit(batchSize);
    
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
        
        const result = await syncStravaForUser(freshUser);
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
