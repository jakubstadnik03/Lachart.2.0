const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRET } = require('../config/jwt.config');
const verifyToken = require('../middleware/verifyToken');
const StravaActivity = require('../models/StravaActivity');
const GarminActivity = require('../models/GarminActivity');
const User = require('../models/UserModel');
const Training = require('../models/training');
const TrainingAbl = require('../abl/trainingAbl');
const { athleteHasCoachUser } = require('../utils/athleteCoachAccess');
const router = express.Router();

/** Resolve athlete user id for integration routes (pending lactate, lactate form). */
async function resolveIntegrationTargetUserId(req) {
  const userId = req.user.userId;
  const user = await User.findById(userId);
  if (!user) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  let targetUserId = userId;
  const requesterRole = String(user.role || '').toLowerCase();
  if (req.query.athleteId) {
    if (['coach', 'tester', 'testing'].includes(requesterRole)) {
      if (String(req.query.athleteId) === String(userId)) {
        targetUserId = userId;
      } else {
        const athlete = await User.findById(req.query.athleteId);
        if (!athlete) {
          return { ok: false, status: 404, error: 'Athlete not found' };
        }
        if (!athleteHasCoachUser(athlete, userId)) {
          return { ok: false, status: 403, error: 'This athlete does not belong to your team' };
        }
        targetUserId = req.query.athleteId;
      }
    } else if (requesterRole === 'athlete') {
      if (String(req.query.athleteId) !== String(userId)) {
        return { ok: false, status: 403, error: 'You are not authorized to view these activities' };
      }
      targetUserId = userId;
    }
  } else if (requesterRole === 'athlete') {
    targetUserId = userId;
  }

  return { ok: true, user, targetUserId };
}

/** UI/calendar uses `strava-<numericId>`; routes expect numeric Strava id or Mongo _id. */
function stripStravaActivityIdPrefix(id) {
  if (id == null) return id;
  return String(id).replace(/^strava-/i, '');
}

// Cache for activities endpoint (2 minutes cache)
const cache = require('node-cache');
const activitiesCache = new cache({ stdTTL: 120 }); // 2 minutes cache
const stravaBackfillLocks = new Set();
const stravaManualSyncLocks = new Set();

// Cache middleware for activities
const activitiesCacheMiddleware = (req, res, next) => {
  // User-scoped cache key (prevents cross-user status/activity leaks)
  const userId = req.user?.userId ? String(req.user.userId) : 'anonymous';
  const cacheKey = `${req.method}:${req.path}:${userId}:${JSON.stringify(req.query || {})}`;
  const cachedResponse = activitiesCache.get(cacheKey);
  
  if (cachedResponse) {
    res.set('X-Cache', 'HIT');
    res.set('Cache-Control', 'private, max-age=120');
    return res.json(cachedResponse);
  }
  
  // Store original json method
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    activitiesCache.set(cacheKey, body);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', 'private, max-age=120');
    return originalJson(body);
  };
  next();
};

// Produkční API URL pro Strava redirect (callback musí směřovat na backend)
const getStravaRedirectBase = () => {
  if (process.env.STRAVA_REDIRECT_URI) return process.env.STRAVA_REDIRECT_URI;
  const backend = process.env.BACKEND_URL || process.env.API_URL || process.env.RENDER_EXTERNAL_URL;
  if (backend) {
    const base = backend.replace(/\/$/, '');
    return `${base}/api/integrations/strava/callback`;
  }
  if (process.env.NODE_ENV === 'production') return 'https://lachart.onrender.com/api/integrations/strava/callback';
  return null;
};

/** Must match the redirect_uri sent to Strava /oauth/authorize (required on token exchange too). */
function resolveStravaOAuthRedirectUri(req) {
  let redirectUri = getStravaRedirectBase();
  if (!redirectUri && req) {
    const protocol = req.protocol || 'https';
    const host = req.get('host') || 'localhost:8000';
    const isTunnel = /\.rtfd|\.ngrok|\.loca\.lt|\.trycloudflare\.com/i.test(host);
    if (isTunnel) {
      redirectUri = 'https://lachart.onrender.com/api/integrations/strava/callback';
    } else {
      redirectUri = `${protocol}://${host}/api/integrations/strava/callback`;
    }
  }
  return redirectUri || null;
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createPkcePair() {
  const verifier = base64UrlEncode(crypto.randomBytes(48));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getGarminRedirectBase() {
  if (process.env.GARMIN_REDIRECT_URI) return process.env.GARMIN_REDIRECT_URI;
  const backend = process.env.BACKEND_URL || process.env.API_URL || process.env.RENDER_EXTERNAL_URL;
  if (backend) {
    const base = backend.replace(/\/$/, '');
    return `${base}/api/integrations/garmin/callback`;
  }
  if (process.env.NODE_ENV === 'production') return 'https://lachart.onrender.com/api/integrations/garmin/callback';
  return null;
}

function resolveGarminOAuthRedirectUri(req) {
  let redirectUri = getGarminRedirectBase();
  if (!redirectUri && req) {
    const protocol = req.protocol || 'https';
    const host = req.get('host') || 'localhost:8000';
    redirectUri = `${protocol}://${host}/api/integrations/garmin/callback`;
  }
  return redirectUri || null;
}

function signGarminOAuthState(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

function verifyGarminOAuthState(state) {
  return jwt.verify(state, JWT_SECRET);
}

function getGarminAuthorizeUrl() {
  return process.env.GARMIN_AUTHORIZE_URL || 'https://connect.garmin.com/oauth2Confirm';
}

function getGarminTokenUrl() {
  return process.env.GARMIN_TOKEN_URL || process.env.GARMIN_OAUTH_TOKEN_URL || null;
}

function getGarminApiBaseUrl() {
  return (process.env.GARMIN_API_BASE_URL || 'https://apis.garmin.com').replace(/\/$/, '');
}

function getGarminWellnessApiBaseUrl() {
  return `${getGarminApiBaseUrl()}/wellness-api`;
}

function getGarminActivityApiBaseUrl() {
  return `${getGarminApiBaseUrl()}/activity-api`;
}

const EXTERNAL_SOURCE_PRIORITY = ['strava', 'garmin', 'coros', 'polar', 'fit'];

function getExternalSourcePriority(source) {
  const idx = EXTERNAL_SOURCE_PRIORITY.indexOf(String(source || '').toLowerCase());
  return idx === -1 ? EXTERNAL_SOURCE_PRIORITY.length : idx;
}

async function requestGarminToken({
  tokenUrl,
  clientId,
  clientSecret,
  params
}) {
  const formBase = new URLSearchParams(params || {});
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    return await axios.post(tokenUrl, formBase.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      timeout: 30000
    });
  } catch (err) {
    const status = err?.response?.status;
    // Garmin tools often send client credentials in form body.
    // Retry with body credentials for compatibility if Basic auth is rejected.
    if (status === 400 || status === 401 || status === 403) {
      const formWithClient = new URLSearchParams(formBase.toString());
      formWithClient.set('client_id', clientId);
      formWithClient.set('client_secret', clientSecret);
      return axios.post(tokenUrl, formWithClient.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      });
    }
    throw err;
  }
}

// Import all Strava history progressively in background to avoid backend/API spikes.
function startStravaHistoricalBackfill(userId, initialBefore = Math.floor(Date.now() / 1000)) {
  const lockKey = String(userId);
  if (stravaBackfillLocks.has(lockKey)) return;
  stravaBackfillLocks.add(lockKey);

  const perPage = 100;
  const maxPagesPerBatch = 3;
  const delayBetweenPagesMs = 2200;
  const delayBetweenBatchesMs = 15000;

  const runBatch = async (beforeCursor) => {
    let nextCursor = beforeCursor;
    let shouldContinue = true;

    try {
      const user = await User.findById(userId);
      if (!user || !user.strava?.accessToken) {
        shouldContinue = false;
        return;
      }

      const token = await getValidStravaToken(user);
      if (!token) {
        shouldContinue = false;
        return;
      }

      for (let page = 1; page <= maxPagesPerBatch; page += 1) {
        const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: perPage, page: 1, before: nextCursor },
          timeout: 30000
        });

        const arr = Array.isArray(resp.data) ? resp.data : [];
        if (!arr.length) {
          shouldContinue = false;
          break;
        }

        for (const a of arr) {
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

          await StravaActivity.updateOne(
            { userId: user._id, stravaId: a.id },
            { $set: doc },
            { upsert: true }
          );
        }

        // Move cursor backwards in time by oldest activity from this page.
        const oldestUnix = Math.floor(new Date(arr[arr.length - 1].start_date).getTime() / 1000);
        nextCursor = oldestUnix - 1;

        if (arr.length < perPage) {
          shouldContinue = false;
          break;
        }

        if (page < maxPagesPerBatch) {
          await delay(delayBetweenPagesMs);
        }
      }

      await User.findByIdAndUpdate(user._id, {
        'strava.lastSyncDate': new Date()
      });
    } catch (error) {
      const status = error?.response?.status;
      console.error('[StravaBackfill] Batch failed:', status || '', error?.response?.data || error?.message);
      // On rate limit or transient upstream error, keep backfill alive and retry later.
      if (status === 429 || (status >= 500 && status < 600)) {
        shouldContinue = true;
      } else {
        shouldContinue = false;
      }
    }

    if (shouldContinue) {
      setTimeout(() => {
        runBatch(nextCursor).catch((e) => {
          console.error('[StravaBackfill] Unhandled async error:', e?.message || e);
          stravaBackfillLocks.delete(lockKey);
        });
      }, delayBetweenBatchesMs);
    } else {
      stravaBackfillLocks.delete(lockKey);
    }
  };

  setTimeout(() => {
    runBatch(initialBefore).catch((e) => {
      console.error('[StravaBackfill] Initial async error:', e?.message || e);
      stravaBackfillLocks.delete(lockKey);
    });
  }, 4000);
}

// GET /api/integrations/strava/auth-url
router.get('/strava/auth-url', (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID || 'STRAVA_CLIENT_ID';
  
  const redirectUri = resolveStravaOAuthRedirectUri(req);
  if (!redirectUri) {
    return res.status(500).json({ error: 'Strava redirect URI could not be determined; set STRAVA_REDIRECT_URI or BACKEND_URL.' });
  }
  
  const scope = 'activity:read_all,profile:read_all,read_all';
  // Try to forward current JWT in state so callback can identify user without Authorization header
  const authHeader = req.headers.authorization || '';
  const state = encodeURIComponent(authHeader.replace('Bearer ', ''));
  
  console.log('Strava auth URL generation:', {
    clientId,
    redirectUri,
    host: req.get('host'),
    protocol: req.protocol
  });
  
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&approval_prompt=auto&state=${state}`;
  res.json({ url });
});

// OAuth callback - exchange code for tokens and save to user
router.get('/strava/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    // Extract user from state (JWT passed from auth-url call)
    if (!state) return res.status(401).json({ error: 'Missing auth state' });
    let decoded;
    try {
      decoded = jwt.verify(decodeURIComponent(state), JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid auth state' });
    }
    const client_id = process.env.STRAVA_CLIENT_ID;
    const client_secret = process.env.STRAVA_CLIENT_SECRET;
    if (!client_id || !client_secret) {
      return res.status(500).json({ error: 'Strava credentials missing' });
    }
    const redirectUri = resolveStravaOAuthRedirectUri(req);
    if (!redirectUri) {
      return res.status(500).json({ error: 'Strava redirect URI not configured' });
    }
    const tokenResp = await axios.post('https://www.strava.com/oauth/token', {
      client_id,
      client_secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });
    const { access_token, refresh_token, expires_at, athlete } = tokenResp.data || {};
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.strava = {
      athleteId: athlete?.id?.toString() || user.strava?.athleteId || null,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_at,
      // Enable auto-sync immediately after successful connect.
      autoSync: true
    };

    // Refresh athlete profile from Strava API so avatar is always current on connect.
    let freshAthlete = athlete || null;
    try {
      const athleteResp = await axios.get('https://www.strava.com/api/v3/athlete', {
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 15000
      });
      freshAthlete = athleteResp.data || athlete || null;
    } catch (profileErr) {
      console.warn('Strava callback profile refresh failed, using token athlete payload');
    }

    // Save Strava profile picture if available.
    if (freshAthlete?.profile && freshAthlete.profile !== 'avatar/athlete/large.png') {
      const profilePath = freshAthlete.profile_large || freshAthlete.profile_medium || freshAthlete.profile;
      if (profilePath && !profilePath.startsWith('http')) {
        user.avatar = `https://www.strava.com/${profilePath}`;
      } else if (profilePath) {
        user.avatar = profilePath;
      }
    }
    await user.save();

    // Start full historical import in background (progressive batches, not one massive sync).
    startStravaHistoricalBackfill(user._id);

    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    // Redirect back to app with a flag
    return res.redirect(`${frontend}/training-calendar?strava=connected`);
  } catch (err) {
    const stravaBody = err.response?.data;
    const stravaStatus = err.response?.status;
    console.error('Strava callback error', stravaStatus || '', stravaBody || err.message);
    if (stravaStatus && stravaBody != null) {
      return res.status(502).json({
        error: 'Strava token exchange failed',
        stravaStatus,
        details: stravaBody
      });
    }
    res.status(500).json({ error: 'Strava callback failed', message: err.message });
  }
});

// POST /api/integrations/strava/disconnect - remove Strava tokens & disable auto-sync
router.post('/strava/disconnect', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Remove Strava connection data (tokens, athleteId, autoSync, lastSyncDate)
    user.strava = undefined;
    await user.save();

    res.json({ success: true, message: 'Strava disconnected' });
  } catch (error) {
    console.error('Error disconnecting Strava:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect Strava' });
  }
});

function stravaExpiresAtSeconds(expiresAt) {
  if (expiresAt == null) return null;
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) return expiresAt;
  if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
    return Math.floor(expiresAt.getTime() / 1000);
  }
  const n = Number(expiresAt);
  return Number.isFinite(n) ? n : null;
}

async function getValidStravaToken(user) {
  if (!user?.strava?.accessToken) return null;
  const now = Math.floor(Date.now() / 1000);
  const exp = stravaExpiresAtSeconds(user.strava.expiresAt);
  if (exp != null && exp - 60 > now) return user.strava.accessToken;
  // refresh
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    console.error('Strava credentials missing for token refresh');
    // Still try current access token (may work briefly after deploy / clock skew)
    return user.strava.accessToken;
  }
  if (!user.strava.refreshToken) {
    console.error('No refresh token available for user');
    return user.strava.accessToken;
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
    console.error('Error refreshing Strava token:', error.response?.data || error.message);
    const body = error.response?.data;
    const msg = typeof body?.message === 'string' ? body.message.toLowerCase() : '';
    const invalidGrant =
      msg.includes('invalid') && (msg.includes('grant') || msg.includes('refresh'));
    const errors = Array.isArray(body?.errors) ? body.errors : [];
    const refreshRevoked = errors.some(
      (e) =>
        String(e?.field || '') === 'refresh_token' &&
        String(e?.code || '').toLowerCase().includes('invalid')
    );
    if (error.response?.status === 401 || error.response?.status === 400) {
      if (invalidGrant || refreshRevoked) {
        console.log('Strava refresh token rejected; clearing Strava connection for user');
        user.strava = undefined;
        await user.save();
        return null;
      }
      console.warn('Strava token refresh failed (transient?); keeping tokens, returning current access token');
    }
    return user.strava.accessToken || null;
  }
}

/**
 * Streams often fail with 400 for some activity types or stream key combos; detail still loads.
 */
async function fetchStravaActivityStreams(token, stravaId) {
  const url = `https://www.strava.com/api/v3/activities/${stravaId}/streams`;
  const base = { headers: { Authorization: `Bearer ${token}` }, timeout: 45000 };
  const variants = [
    { keys: 'time,velocity_smooth,heartrate,watts,altitude', key_by_type: true },
    { keys: 'time,heartrate,watts,velocity_smooth', key_by_type: true },
    { keys: 'time,distance,heartrate,watts', key_by_type: true },
    { keys: 'time,heartrate', key_by_type: true },
    { keys: 'time', key_by_type: true }
  ];
  for (const params of variants) {
    try {
      const r = await axios.get(url, { ...base, params });
      if (r.data != null) return r.data;
    } catch (e) {
      const st = e.response?.status;
      if (st === 400 || st === 404) {
        console.warn(`[Strava] streams attempt failed (${st}) keys=${params.keys}`);
        continue;
      }
      throw e;
    }
  }
  return {};
}

// Helper function to delay requests to respect rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function notifyStravaImportedPush(userId, imported) {
  const n = Number(imported);
  if (!userId || !Number.isFinite(n) || n < 1) return;
  const { notifyUserStravaActivitiesImported } = require('../utils/expoPushNotifications');
  notifyUserStravaActivitiesImported(userId, n).catch((e) =>
    console.error('[Strava sync push]', e.message || e)
  );
}

// POST /api/integrations/strava/sync (basic history fetch)
router.post('/strava/sync', verifyToken, async (req, res) => {
  let imported = 0;
  let updated = 0;
  let total = 0;
  const lockKey = String(req.user?.userId || '');
  
  try {
    if (stravaManualSyncLocks.has(lockKey)) {
      return res.status(200).json({
        imported: 0,
        updated: 0,
        totalFetched: 0,
        status: 'in_progress',
        message: 'Strava sync already in progress'
      });
    }
    stravaManualSyncLocks.add(lockKey);

    const user = await User.findById(req.user.userId);
    if (!user || !user.strava?.accessToken) {
      return res.status(400).json({ error: 'Strava not connected' });
    }
    
    const token = await getValidStravaToken(user);
    if (!token) {
      // Not app JWT failure — avoid 401 so the client does not log the user out.
      return res.status(400).json({ error: 'Invalid or expired Strava token. Reconnect Strava in Settings.' });
    }
    
    const per_page = 100;
    let page = 1;
    const maxPages = 200; // Safety limit: max 20,000 activities (200 × 100)
    
    // Optional: support 'since' parameter to fetch activities after a specific date
    const { since } = req.body || {};
    const params = { per_page };
    if (since) {
      params.after = new Date(since).getTime() / 1000; // Strava expects Unix timestamp
    }
    
    // Strava rate limit: 600 requests per 15 minutes = ~1 request per 1.5 seconds
    // Add delay between requests to avoid hitting rate limit
    const delayBetweenRequests = 2000; // 2 seconds between requests (conservative)
    
    console.log(`Starting Strava sync for user ${user._id}, max pages: ${maxPages}`);
    
    while (page <= maxPages) {
      try {
        console.log(`Fetching page ${page}...`);
        
        const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
          headers: { Authorization: `Bearer ${token}` },
          params: { ...params, page },
          timeout: 30000 // 30 second timeout per request
        });
        
        const arr = resp.data || [];
        
        if (arr.length === 0) {
          console.log(`No more activities at page ${page}`);
          break; // No more activities
        }
        
        total += arr.length;
        console.log(`Processing ${arr.length} activities from page ${page} (total so far: ${total})`);
        
        // Process activities in batch to avoid overwhelming the database
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
              weightedAveragePower:
                a.weighted_average_watts != null && Number.isFinite(Number(a.weighted_average_watts))
                  ? Number(a.weighted_average_watts)
                  : null,
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
            console.error(`Error saving activity ${a.id}:`, dbErr.message);
            // Continue with next activity
          }
        }
        
        // If we got less than per_page, we've reached the end
        if (arr.length < per_page) {
          console.log(`Reached end of activities (got ${arr.length} < ${per_page})`);
          break;
        }
        
        page += 1;
        
        // Add delay between requests to respect rate limits (except for last page)
        if (page <= maxPages) {
          await delay(delayBetweenRequests);
        }
      } catch (requestErr) {
        console.error(`Error on page ${page}:`, requestErr.response?.data || requestErr.message);
        
        // Handle rate limit errors
        if (requestErr.response?.status === 429 || 
            (requestErr.response?.data?.message && requestErr.response.data.message.includes('Rate Limit'))) {
          const rateLimitData = requestErr.response?.data || {};
          const retryAfter = requestErr.response?.headers?.['retry-after'] || 900; // Default 15 minutes
          
          console.error('Strava rate limit exceeded', {
            retryAfter,
            errors: rateLimitData.errors,
            imported,
            updated,
            total
          });
          
          notifyStravaImportedPush(user._id, imported);
          return res.status(429).json({
            error: 'Strava rate limit exceeded',
            message: `Strava API rate limit has been exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
            retryAfter,
            imported,
            updated,
            totalFetched: total,
            partial: true
          });
        }
        
        // For other errors, log and continue if we have some data, otherwise fail
        if (total === 0) {
          throw requestErr;
        }
        
        // If we have some data, return partial results
        console.warn(`Request error on page ${page}, but returning partial results`);
        break;
      }
    }
    
    console.log(`Strava sync completed: imported ${imported}, updated ${updated}, total ${total}`);
    
    // Update last sync date in user profile
    if (imported > 0 || updated > 0) {
      await User.findByIdAndUpdate(user._id, {
        'strava.lastSyncDate': new Date()
      });
    }

    notifyStravaImportedPush(user._id, imported);
    
    res.json({ imported, updated, totalFetched: total, status: 'ok' });
  } catch (err) {
    console.error('Strava sync error:', err);
    console.error('Error stack:', err.stack);
    
    // Handle rate limit errors in catch block too
    if (err.response?.status === 429 || 
        (err.response?.data?.message && err.response.data.message.includes('Rate Limit'))) {
      const retryAfter = err.response?.headers?.['retry-after'] || 900;
      notifyStravaImportedPush(user?._id || req.user?.userId, imported);
      return res.status(429).json({
        error: 'Strava rate limit exceeded',
        message: `Strava API rate limit has been exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        retryAfter,
        imported,
        updated,
        totalFetched: total,
        partial: total > 0
      });
    }
    
    // Return partial results if we have any
    if (total > 0) {
      notifyStravaImportedPush(user._id, imported);
      return res.json({
        imported,
        updated,
        totalFetched: total,
        status: 'partial',
        error: 'Sync completed with errors',
        message: err.message
      });
    }
    
    res.status(500).json({ 
      error: 'Strava sync failed',
      message: err.response?.data?.message || err.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    if (lockKey) stravaManualSyncLocks.delete(lockKey);
  }
});

// POST /api/integrations/strava/auto-sync (automatic sync for new activities only)
router.post('/strava/auto-sync', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.strava?.accessToken) {
      return res.status(400).json({ error: 'Strava not connected' });
    }

    // Use the service function
    const { syncStravaForUser } = require('../services/stravaAutoSyncService');
    const result = await syncStravaForUser(user);
    
    // Never use HTTP 401 here — the app treats 401 as "JWT invalid" and logs the user out.
    // Strava token / refresh failures are upstream auth issues; return 200 + error body (same as catch below).
    if (result.error && result.error !== 'Auto-sync is disabled') {
      return res.status(200).json({
        imported: result.imported ?? 0,
        updated: result.updated ?? 0,
        error: result.error,
        stravaReconnectNeeded: true
      });
    }
    
    res.json({ imported: result.imported, updated: result.updated, message: result.message });
  } catch (error) {
    console.error('Strava auto-sync error:', error);
    res.json({ imported: 0, updated: 0, error: error.message });
  }
});

// PUT /api/integrations/strava/auto-sync (update auto-sync setting)
router.put('/strava/auto-sync', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { autoSync } = req.body;
    
    if (typeof autoSync !== 'boolean') {
      return res.status(400).json({ error: 'autoSync must be a boolean' });
    }

    console.log('Updating auto-sync for user:', req.user.userId, 'to:', autoSync);
    console.log('Current user.strava before update:', JSON.stringify(user.strava, null, 2));

    // Use findByIdAndUpdate to ensure the update is saved properly
    const updateData = {
      'strava.autoSync': autoSync
    };

    // If strava object doesn't exist, we need to create it
    if (!user.strava) {
      updateData.strava = {
        autoSync: autoSync
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found after update' });
    }

    // Verify the update was saved
    const verifyUser = await User.findById(req.user.userId);
    console.log('Auto-sync saved to database:', {
      userId: verifyUser._id,
      autoSync: verifyUser.strava?.autoSync,
      stravaObject: JSON.stringify(verifyUser.strava, null, 2)
    });

    res.json({ 
      success: true, 
      autoSync: verifyUser.strava?.autoSync || false,
      message: `Auto-sync ${autoSync ? 'enabled' : 'disabled'}` 
    });
  } catch (error) {
    console.error('Error updating auto-sync setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Garmin integration
// Note: Garmin has an official Activity API (https://developer.garmin.com/gc-developer-program/activity-api/)
// but it requires approval as a business developer and access to the evaluation environment
// For regular developers, we use the garmin-connect npm library which requires username/password
// This is the standard approach used by most third-party Garmin integrations
// The credentials are stored encrypted (base64) and only used for API calls
// 
// Future improvement: If approved for Garmin Connect Developer Program, migrate to official OAuth API

router.get('/garmin/auth-url', (req, res) => {
  try {
    const clientId = process.env.GARMIN_CLIENT_ID;
    const redirectUri = resolveGarminOAuthRedirectUri(req);

    if (!clientId) {
      return res.status(500).json({ error: 'Garmin client ID missing' });
    }
    if (!redirectUri) {
      return res.status(500).json({ error: 'Garmin redirect URI could not be determined' });
    }

    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.replace('Bearer ', '').trim();
    if (!bearer) {
      return res.status(401).json({ error: 'Missing auth token for Garmin connect flow' });
    }

    let decoded;
    try {
      decoded = jwt.verify(bearer, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid auth token for Garmin connect flow' });
    }

    const { verifier, challenge } = createPkcePair();
    const state = signGarminOAuthState({
      provider: 'garmin',
      userId: decoded.userId,
      verifier
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      state,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    const url = `${getGarminAuthorizeUrl()}?${params.toString()}`;
    res.json({ url });
  } catch (error) {
    console.error('Garmin auth-url error:', error);
    res.status(500).json({ error: error.message || 'Failed to start Garmin OAuth flow' });
  }
});

router.get('/garmin/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query || {};
    const frontend = getFrontendBaseUrl();

    if (error) {
      const params = new URLSearchParams({
        garmin: 'error',
        message: String(error_description || error)
      });
      return res.redirect(`${frontend}/settings?tab=integrations&${params.toString()}`);
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing Garmin OAuth code or state' });
    }

    const clientId = process.env.GARMIN_CLIENT_ID;
    const clientSecret = process.env.GARMIN_CLIENT_SECRET;
    const tokenUrl = getGarminTokenUrl();
    const redirectUri = resolveGarminOAuthRedirectUri(req);

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Garmin client credentials missing' });
    }
    if (!tokenUrl) {
      return res.status(500).json({ error: 'Garmin token URL missing. Set GARMIN_TOKEN_URL.' });
    }
    if (!redirectUri) {
      return res.status(500).json({ error: 'Garmin redirect URI not configured' });
    }

    let decodedState;
    try {
      decodedState = verifyGarminOAuthState(String(state));
    } catch {
      return res.status(401).json({ error: 'Invalid or expired Garmin OAuth state' });
    }

    if (decodedState?.provider !== 'garmin' || !decodedState?.userId || !decodedState?.verifier) {
      return res.status(401).json({ error: 'Malformed Garmin OAuth state' });
    }

    const tokenParams = {
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUri,
      code_verifier: String(decodedState.verifier)
    };

    const tokenResp = await requestGarminToken({
      tokenUrl,
      clientId,
      clientSecret,
      params: tokenParams
    });

    const tokenData = tokenResp.data || {};
    const accessToken = tokenData.access_token || tokenData.accessToken || null;
    const refreshToken = tokenData.refresh_token || tokenData.refreshToken || null;
    const expiresIn = Number(tokenData.expires_in || tokenData.expiresIn || 0) || null;
    const tokenType = tokenData.token_type || tokenData.tokenType || 'Bearer';

    if (!accessToken) {
      return res.status(502).json({ error: 'Garmin token exchange returned no access token', details: tokenData });
    }

    const user = await User.findById(decodedState.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let athleteId = user.garmin?.athleteId || null;
    try {
      const profileResp = await axios.get(`${getGarminWellnessApiBaseUrl()}/rest/user/id`, {
        headers: {
          Authorization: `${tokenType} ${accessToken}`
        },
        timeout: 15000
      });
      athleteId = String(profileResp.data?.userId || profileResp.data?.id || athleteId || '');
    } catch (profileError) {
      console.warn('Garmin profile lookup failed; storing OAuth tokens without athlete id');
    }

    user.garmin = {
      athleteId: athleteId || user.garmin?.athleteId || null,
      accessToken,
      refreshToken,
      expiresAt: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null,
      autoSync: true,
      lastSyncDate: user.garmin?.lastSyncDate || null
    };

    await user.save();

    const params = new URLSearchParams({ garmin: 'connected' });
    return res.redirect(`${frontend}/settings?tab=integrations&${params.toString()}`);
  } catch (err) {
    const garminBody = err.response?.data;
    const garminStatus = err.response?.status;
    console.error('Garmin callback error', garminStatus || '', garminBody || err.message);
    if (garminStatus && garminBody != null) {
      return res.status(502).json({
        error: 'Garmin token exchange failed',
        garminStatus,
        details: garminBody
      });
    }
    res.status(500).json({ error: 'Garmin callback failed', message: err.message });
  }
});

// Garmin login endpoint (username/password based)
router.post('/garmin/login', verifyToken, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Note: Garmin OAuth is only available to official partners
    // We use garmin-connect npm library which requires username/password
    // Credentials are stored base64 encoded (in production, consider additional encryption)
    // This is the standard approach - same as used by other third-party Garmin integrations
    
    // Test credentials by attempting login
    try {
      const GarminConnect = require('garmin-connect');
      const testClient = new GarminConnect({
        username: username,
        password: password
      });
      await testClient.login(); // Verify credentials work
    } catch (loginError) {
      console.error('Garmin login verification failed:', loginError);
      return res.status(400).json({ error: 'Invalid Garmin credentials. Please check your username and password.' });
    }
    
    // Store credentials (base64 encoded)
    user.garmin = {
      athleteId: username, // Use username as identifier
      accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
      autoSync: user.garmin?.autoSync !== undefined ? user.garmin.autoSync : false,
      lastSyncDate: user.garmin?.lastSyncDate || null
    };
    
    await user.save();
    
    res.json({ success: true, message: 'Garmin account connected' });
  } catch (error) {
    console.error('Garmin login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/integrations/garmin/disconnect - remove Garmin credentials & disable auto-sync
router.post('/garmin/disconnect', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.garmin = undefined;
    await user.save();

    res.json({ success: true, message: 'Garmin disconnected' });
  } catch (error) {
    console.error('Error disconnecting Garmin:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect Garmin' });
  }
});

// Helper function to get Garmin activities using garmin-connect library
async function getGarminActivities(user, since = null) {
  try {
    if (user?.garmin?.refreshToken) {
      const tokenType = await getValidGarminToken(user);
      const headers = {
        Authorization: `${tokenType.tokenType} ${tokenType.accessToken}`
      };
      const params = {};
      if (since) {
        const d = new Date(since);
        if (!Number.isNaN(d.getTime())) {
          params.uploadStartTimeInSeconds = Math.floor(d.getTime() / 1000);
        }
      }

      const resp = await axios.get(`${getGarminActivityApiBaseUrl()}/rest/activities`, {
        headers,
        params,
        timeout: 30000
      });

      const activities = Array.isArray(resp.data)
        ? resp.data
        : Array.isArray(resp.data?.activities)
          ? resp.data.activities
          : [];

      console.log(`Fetched ${activities.length} Garmin OAuth activities`);
      return activities;
    }

    const GarminConnect = require('garmin-connect');
    
    // Decode credentials from base64
    const credentials = Buffer.from(user.garmin.accessToken, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    
    if (!username || !password) {
      console.error('Invalid Garmin credentials format');
      return [];
    }
    
    // Create Garmin client
    const garminClient = new GarminConnect({
      username: username,
      password: password
    });
    
    // Login to Garmin
    await garminClient.login();
    
    // Get activities
    let activities = [];
    const startDate = since ? new Date(since) : null;
    
    // Fetch activities (Garmin API returns activities in batches)
    let start = 0;
    const limit = 100;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const batch = await garminClient.getActivities({ start, limit });
        
        if (!batch || batch.length === 0) {
          hasMore = false;
          break;
        }
        
        // Filter by date if since is provided
        if (startDate) {
          const filtered = batch.filter(activity => {
            const activityDate = new Date(activity.startTimeGMT || activity.startTimeLocal);
            return activityDate >= startDate;
          });
          activities = activities.concat(filtered);
          
          // If we got less than limit or all activities are before startDate, we're done
          if (batch.length < limit || filtered.length < batch.length) {
            hasMore = false;
          }
        } else {
          activities = activities.concat(batch);
        }
        
        // If we got less than limit, we've reached the end
        if (batch.length < limit) {
          hasMore = false;
        } else {
          start += limit;
        }
        
        // Safety limit: max 1000 activities per sync
        if (activities.length >= 1000) {
          hasMore = false;
        }
      } catch (batchError) {
        console.error('Error fetching Garmin activities batch:', batchError);
        hasMore = false;
      }
    }
    
    console.log(`Fetched ${activities.length} Garmin activities`);
    return activities;
  } catch (error) {
    console.error('Error fetching Garmin activities:', error);
    // If login fails, credentials might be invalid
    if (error.message && error.message.includes('login')) {
      // Clear invalid credentials
      user.garmin = null;
      await user.save();
    }
    return [];
  }
}

async function getValidGarminToken(user) {
  const tokenUrl = getGarminTokenUrl();
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  const accessToken = user?.garmin?.accessToken || null;
  const refreshToken = user?.garmin?.refreshToken || null;
  const expiresAt = Number(user?.garmin?.expiresAt || 0) || null;
  const now = Math.floor(Date.now() / 1000);

  if (!accessToken) {
    throw new Error('Garmin access token missing');
  }

  if (!refreshToken || !expiresAt || expiresAt > now + 60) {
    return { accessToken, tokenType: 'Bearer' };
  }

  if (!tokenUrl) {
    throw new Error('Garmin token URL missing. Set GARMIN_TOKEN_URL.');
  }
  if (!clientId || !clientSecret) {
    throw new Error('Garmin client credentials missing');
  }

  const tokenParams = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  };
  const tokenResp = await requestGarminToken({
    tokenUrl,
    clientId,
    clientSecret,
    params: tokenParams
  });

  const tokenData = tokenResp.data || {};
  const nextAccessToken = tokenData.access_token || tokenData.accessToken || null;
  const nextRefreshToken = tokenData.refresh_token || tokenData.refreshToken || refreshToken;
  const expiresIn = Number(tokenData.expires_in || tokenData.expiresIn || 0) || null;
  const tokenType = tokenData.token_type || tokenData.tokenType || 'Bearer';

  if (!nextAccessToken) {
    throw new Error('Garmin token refresh returned no access token');
  }

  user.garmin = {
    ...user.garmin,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    expiresAt: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : user.garmin?.expiresAt || null
  };
  await user.save();

  return { accessToken: nextAccessToken, tokenType };
}

function mapGarminSportType(rawSport) {
  const sportType = String(rawSport || 'running').toLowerCase();
  const sportMap = {
    running: 'running',
    cycling: 'cycling',
    biking: 'cycling',
    road_biking: 'cycling',
    mountain_biking: 'cycling',
    swimming: 'swimming',
    pool_swimming: 'swimming',
    open_water_swimming: 'swimming',
    triathlon: 'triathlon',
    walking: 'running',
    hiking: 'running',
    trail_running: 'running'
  };
  return sportMap[sportType] || 'running';
}

function mapGarminActivityToDoc(user, a) {
  const rawId = a.activityId || a.summaryId || a.activityUUID || a.activityUuid || String(a.startTimeInSeconds || a.startTimeGMT || a.startTimeLocal || Date.now());
  const garminId = String(rawId);
  const startDate = a.startTimeInSeconds
    ? new Date(Number(a.startTimeInSeconds) * 1000)
    : new Date(a.startTimeGMT || a.startTimeLocal || a.startDate || Date.now());
  const sport = mapGarminSportType(a.activityType?.typeKey || a.activityType || a.sportType?.typeKey || a.sport);

  return {
    userId: user._id.toString(),
    garminId,
    name: a.activityName || a.activityType || a.name || 'Untitled Activity',
    sport,
    startDate,
    elapsedTime: a.durationInSeconds || a.elapsedDuration || a.duration || 0,
    movingTime: a.movingDurationInSeconds || a.movingDuration || a.durationInSeconds || a.elapsedDuration || 0,
    distance: a.distanceInMeters || a.distance || 0,
    averageSpeed: a.averageSpeedInMetersPerSecond || a.averageSpeed || null,
    averageHeartRate: a.averageHeartRateInBeatsPerMinute || a.averageHR || a.averageHeartRate || null,
    averagePower: a.averagePowerInWatts || a.averagePower || a.averageWatts || null,
    raw: a
  };
}

async function upsertGarminActivities(user, activities = []) {
  let imported = 0;
  let updated = 0;
  let total = 0;

  for (const a of activities) {
    try {
      const doc = mapGarminActivityToDoc(user, a);
      const resUp = await GarminActivity.updateOne(
        { userId: user._id, garminId: doc.garminId },
        { $set: doc },
        { upsert: true }
      );

      if (resUp.upsertedCount > 0) imported += 1;
      else if (resUp.modifiedCount > 0) updated += 1;
      total += 1;
    } catch (dbErr) {
      console.error(`Error saving Garmin activity ${a?.activityId || a?.summaryId || a?.id || 'unknown'}:`, dbErr.message);
    }
  }

  if (imported > 0 || updated > 0) {
    await User.findByIdAndUpdate(user._id, {
      'garmin.lastSyncDate': new Date()
    });
  }

  return { imported, updated, total };
}

// POST /api/integrations/garmin/sync
router.post('/garmin/sync', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.garmin?.accessToken) {
      return res.status(400).json({ error: 'Garmin not connected' });
    }
    
    // Optional: support 'since' parameter
    const { since } = req.body || {};
    
    // Get activities from Garmin
    // TODO: Implement actual Garmin API integration
    const activities = await getGarminActivities(user, since);
    
    console.log(`Starting Garmin sync for user ${user._id}, found ${activities.length} activities`);
    const { imported, updated, total } = await upsertGarminActivities(user, activities);
    console.log(`Garmin sync completed: imported ${imported}, updated ${updated}, total ${total}`);
    res.json({ imported, updated, totalFetched: total, status: 'ok' });
  } catch (err) {
    console.error('Garmin sync error:', err);
    res.status(500).json({ 
      error: 'Garmin sync failed',
      message: err.message
    });
  }
});

// POST /api/integrations/garmin/auto-sync
router.post('/garmin/auto-sync', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.garmin?.accessToken) {
      return res.status(400).json({ error: 'Garmin not connected' });
    }

    if (!user.garmin?.autoSync) {
      return res.json({ imported: 0, updated: 0, message: 'Auto-sync is disabled' });
    }
    
    // Use lastSyncDate if available
    let since = null;
    if (user.garmin?.lastSyncDate) {
      since = user.garmin.lastSyncDate;
    } else {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      since = sevenDaysAgo;
    }
    
    const activities = await getGarminActivities(user, since);
    const { imported, updated } = await upsertGarminActivities(user, activities);
    console.log(`Garmin auto-sync completed: ${imported} imported, ${updated} updated`);
    res.json({ imported, updated });
  } catch (error) {
    console.error('Garmin auto-sync error:', error);
    res.json({ imported: 0, updated: 0, error: error.message });
  }
});

// PUT /api/integrations/garmin/auto-sync
router.put('/garmin/auto-sync', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { autoSync } = req.body;
    
    if (typeof autoSync !== 'boolean') {
      return res.status(400).json({ error: 'autoSync must be a boolean' });
    }

    const updateData = {
      'garmin.autoSync': autoSync
    };

    if (!user.garmin) {
      updateData.garmin = {
        autoSync: autoSync
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found after update' });
    }

    const verifyUser = await User.findById(req.user.userId);
    res.json({ 
      success: true, 
      autoSync: verifyUser.garmin?.autoSync || false,
      message: `Auto-sync ${autoSync ? 'enabled' : 'disabled'}` 
    });
  } catch (error) {
    console.error('Error updating Garmin auto-sync setting:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Strava activities from the last N days where field lactate is still missing on at least one lap,
 * or laps are not loaded yet (empty laps) — for "add lactate to training" UX.
 * GET /api/integrations/strava/pending-lactate?days=14&athleteId=...
 */
router.get('/strava/pending-lactate', verifyToken, async (req, res) => {
  try {
    const resolved = await resolveIntegrationTargetUserId(req);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { targetUserId } = resolved;
    const userId = req.user.userId;

    const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 14));
    const since = new Date(Date.now() - days * 86400000);

    const rows = await StravaActivity.find({
      userId: targetUserId.toString(),
      startDate: { $gte: since },
    })
      .sort({ startDate: -1 })
      .limit(150)
      .select('_id stravaId name sport startDate laps movingTime elapsedTime distance')
      .lean();

    const activities = [];
    for (const a of rows) {
      const laps = Array.isArray(a.laps) ? a.laps : [];
      let needsLactate = false;
      let missingLactateCount = 0;

      if (laps.length === 0) {
        needsLactate = true;
        missingLactateCount = 0;
      } else {
        for (const l of laps) {
          const v = l.lactate;
          if (v == null || v === '') {
            missingLactateCount += 1;
            needsLactate = true;
          }
        }
      }

      if (!needsLactate) continue;

      const coachViewingAthlete =
        req.query.athleteId && String(req.query.athleteId) !== String(userId);
      const openPath = coachViewingAthlete
        ? `/training-calendar/${req.query.athleteId}/strava-${a.stravaId}`
        : `/training-calendar/strava-${a.stravaId}`;

      activities.push({
        _id: a._id,
        stravaId: a.stravaId,
        name: a.name || 'Activity',
        sport: a.sport,
        startDate: a.startDate,
        lapCount: laps.length,
        missingLactateCount: laps.length === 0 ? null : missingLactateCount,
        openPath,
      });

      if (activities.length >= 30) break;
    }

    return res.json({ activities, days });
  } catch (error) {
    console.error('[integrations] pending-lactate:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

/**
 * Sync Strava activity → Training model and return training JSON for TrainingForm (field lactate).
 * POST /api/integrations/strava/training-for-lactate-form?athleteId=...
 * Body: { stravaActivityId: "<Mongo StravaActivity _id>" }
 */
router.post('/strava/training-for-lactate-form', verifyToken, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const activityId = req.body?.stravaActivityId;
    if (!activityId || !mongoose.Types.ObjectId.isValid(String(activityId))) {
      return res.status(400).json({ error: 'Invalid stravaActivityId' });
    }

    const resolved = await resolveIntegrationTargetUserId(req);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { targetUserId } = resolved;
    const targetStr = targetUserId.toString();

    const activity = await StravaActivity.findOne({
      _id: activityId,
      userId: targetStr,
    }).lean();

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    let lapsForSync = Array.isArray(activity.laps) ? activity.laps : [];
    // List/sync often stores activities without laps; TrainingForm needs intervals from laps.
    if (!lapsForSync.length && activity.stravaId) {
      const targetUser =
        String(targetUserId) === String(resolved.user._id)
          ? resolved.user
          : await User.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: 'Athlete not found' });
      }
      let token = await getValidStravaToken(targetUser);
      if (!token) {
        return res.status(400).json({
          error: 'Strava not connected or token invalid',
          message:
            String(targetUserId) === String(resolved.user._id)
              ? 'Your Strava account is not connected or token expired. Please reconnect in Settings.'
              : "The athlete's Strava account is not connected or token expired. Please ask them to reconnect.",
        });
      }
      const fetchLaps = async (authToken) => {
        const lapsResp = await axios.get(
          `https://www.strava.com/api/v3/activities/${activity.stravaId}/laps`,
          { headers: { Authorization: `Bearer ${authToken}` }, timeout: 30000 }
        );
        let apiLaps = lapsResp.data || [];
        if (!Array.isArray(apiLaps)) apiLaps = [];
        return apiLaps.map((lap) => ({
          ...lap,
          startTime: lap.startTime || lap.start_date,
        }));
      };
      try {
        lapsForSync = await fetchLaps(token);
      } catch (apiError) {
        if (apiError.response?.status === 401) {
          const refreshedTargetUser = await User.findById(targetUserId);
          token = refreshedTargetUser ? await getValidStravaToken(refreshedTargetUser) : null;
          if (token) {
            try {
              lapsForSync = await fetchLaps(token);
            } catch (retryError) {
              console.error(
                '[integrations] training-for-lactate-form laps after refresh:',
                retryError.response?.data || retryError.message
              );
            }
          }
        } else {
          console.error(
            '[integrations] training-for-lactate-form laps:',
            apiError.response?.data || apiError.message
          );
        }
      }
      if (lapsForSync.length > 0) {
        try {
          await StravaActivity.updateOne(
            { _id: activity._id, userId: targetStr },
            { $set: { laps: lapsForSync } }
          );
        } catch (persistErr) {
          console.warn('[integrations] training-for-lactate-form: could not persist laps', persistErr.message);
        }
      }
    }

    const activityDurationSec = Math.round(activity.elapsedTime || activity.movingTime || 0);
    if (!lapsForSync.length && !activityDurationSec) {
      return res.status(400).json({
        error: 'no_laps',
        message:
          'No laps and no activity duration for this workout. Open the activity in the calendar once or reconnect Strava.',
      });
    }

    const activityData = {
      ...activity,
      name: activity.name,
      titleManual: activity.titleManual,
      description: activity.description,
      sport: activity.sport,
      startDate: activity.startDate,
      elapsedTime: activity.elapsedTime,
      movingTime: activity.movingTime,
      laps: lapsForSync,
    };

    const synced = await TrainingAbl.syncTrainingFromSource('strava', activityData, targetStr, {
      useAllStravaLapsForLactate: true,
    });
    let training = null;
    if (synced && synced._id) {
      training = await Training.findById(synced._id).lean();
    }
    if (!training) {
      training = await Training.findOne({
        athleteId: targetStr,
        sourceStravaActivityId: String(activity._id),
      }).lean();
    }
    if (!training) {
      return res.status(500).json({ error: 'Could not prepare training for this activity' });
    }

    return res.json({ training });
  } catch (error) {
    console.error('[integrations] training-for-lactate-form:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// List normalized activities
router.get('/activities', verifyToken, activitiesCacheMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const requesterRole = String(user.role || '').toLowerCase();

    // Determine which userId to use
    let targetUserId = userId;
    if (req.query.athleteId) {
      // If query parameter is provided, validate access
      if (['coach', 'tester', 'testing'].includes(requesterRole)) {
        // Coach / tester: own or linked athletes' activities
        if (req.query.athleteId === userId.toString()) {
          targetUserId = userId;
        } else {
          const athlete = await User.findById(req.query.athleteId);
          if (!athlete) {
            return res.status(404).json({ error: 'Athlete not found' });
          }
          if (!athleteHasCoachUser(athlete, userId)) {
            return res.status(403).json({ error: 'This athlete does not belong to your team' });
          }
          targetUserId = req.query.athleteId;
        }
      } else if (requesterRole === 'athlete') {
        if (req.query.athleteId !== userId.toString()) {
          return res.status(403).json({ error: 'You are not authorized to view these activities' });
        }
        targetUserId = userId;
      }
    } else if (requesterRole === 'athlete') {
      targetUserId = userId;
    }

    // Increased limit to 5000 activities to support longer history in calendar view
    // This should cover several years of activities for most users
    // IMPORTANT: Keep this payload small (calendar view).
    // Returning `raw` or `laps` for thousands of activities is extremely slow and bloats responses.
    // Optimize: Only fetch last 2 years of activities (reduces query time significantly)
    // For HR test plan, we need more activities - check if request is for HR test plan
    const isHRTestPlan = req.query.hrTestPlan === 'true';
    const dateCutoff = isHRTestPlan 
      ? new Date(Date.now() - (180 * 24 * 60 * 60 * 1000)) // 180 days for HR test plan
      : (() => {
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
          return twoYearsAgo;
        })();
    const activityLimit = isHRTestPlan ? 5000 : 2000; // More activities for HR test plan
    
    const [stravaActs, garminActs] = await Promise.all([
      StravaActivity.find({ 
        userId: targetUserId.toString(),
        startDate: { $gte: dateCutoff }
      })
      .sort({ startDate: -1 })
        .limit(activityLimit)
      .select(
        'stravaId name titleManual category sport startDate elapsedTime movingTime distance averageSpeed averageHeartRate average_heartrate averagePower weightedAveragePower'
      )
        .lean(),
      GarminActivity.find({ 
        userId: targetUserId.toString(),
        startDate: { $gte: dateCutoff }
      })
        .sort({ startDate: -1 })
        .limit(activityLimit)
        .select('garminId name titleManual category sport startDate elapsedTime movingTime distance averageSpeed averageHeartRate averagePower')
        .lean()
    ]);

    // Deduplicate activities from Strava and Garmin
    // Activities are considered duplicates if they have:
    // - Same start date/time (within 5 minutes tolerance)
    // - Same sport type
    // - Similar duration (within 10% difference)
    // - Similar distance (within 5% difference)
    
    const deduplicatedActs = [];
    const seenKeys = new Set();
    
    // Helper function to create a deduplication key
    const createDedupKey = (activity, source) => {
      const startDate = new Date(activity.startDate);
      const dateKey = startDate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm (5 minute precision)
      const sport = (activity.sport || 'unknown').toLowerCase();
      const duration = Math.round((activity.elapsedTime || activity.movingTime || 0) / 60); // minutes
      const distance = Math.round((activity.distance || 0) / 100); // 100m precision
      return `${dateKey}_${sport}_${duration}_${distance}`;
    };
    
    // Helper function to check if activities are duplicates
    const areDuplicates = (act1, act2) => {
      const date1 = new Date(act1.startDate);
      const date2 = new Date(act2.startDate);
      const timeDiff = Math.abs(date1.getTime() - date2.getTime()) / 1000 / 60; // minutes
      
      if (timeDiff > 5) return false; // More than 5 minutes apart
      
      const sport1 = (act1.sport || 'unknown').toLowerCase();
      const sport2 = (act2.sport || 'unknown').toLowerCase();
      if (sport1 !== sport2) return false;
      
      const duration1 = act1.elapsedTime || act1.movingTime || 0;
      const duration2 = act2.elapsedTime || act2.movingTime || 0;
      const durationDiff = Math.abs(duration1 - duration2) / Math.max(duration1, duration2, 1);
      if (durationDiff > 0.1) return false; // More than 10% duration difference
      
      const distance1 = act1.distance || 0;
      const distance2 = act2.distance || 0;
      if (distance1 > 0 && distance2 > 0) {
        const distanceDiff = Math.abs(distance1 - distance2) / Math.max(distance1, distance2);
        if (distanceDiff > 0.05) return false; // More than 5% distance difference
      }
      
      return true;
    };
    
    // Keep preferred source by provider priority, but don't lose useful metrics from fallback providers.
    const mergePreferredActivity = (preferred, secondary) => {
      if (!preferred || !secondary) return preferred || secondary;
      const merged = { ...preferred };
      const pick = (primaryVal, secondaryVal) => (primaryVal == null ? secondaryVal : primaryVal);
      merged.averageHeartRate = pick(preferred.averageHeartRate, secondary.averageHeartRate);
      merged.averagePower = pick(preferred.averagePower, secondary.averagePower);
      merged.weightedAveragePower = pick(preferred.weightedAveragePower, secondary.weightedAveragePower);
      merged.averageSpeed = pick(preferred.averageSpeed, secondary.averageSpeed);
      merged.elapsedTime = pick(preferred.elapsedTime, secondary.elapsedTime);
      merged.movingTime = pick(preferred.movingTime, secondary.movingTime);
      merged.distance = pick(preferred.distance, secondary.distance);
      return merged;
    };

    const choosePreferredActivity = (existing, candidate) => {
      const existingPriority = getExternalSourcePriority(existing?.source);
      const candidatePriority = getExternalSourcePriority(candidate?.source);
      return candidatePriority < existingPriority
        ? mergePreferredActivity(candidate, existing)
        : mergePreferredActivity(existing, candidate);
    };

    // Combine and normalize activities
    const allActs = [
      ...stravaActs.map(a => ({
        ...a,
        averageHeartRate: a.averageHeartRate ?? a.average_heartrate ?? null,
        source: 'strava',
        sourceId: a.stravaId
      })),
      ...garminActs.map(a => ({
        ...a,
        averageHeartRate: a.averageHeartRate ?? a.averageHR ?? null,
        source: 'garmin',
        sourceId: a.garminId
      }))
    ].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    
    // Optimized deduplication: use Map for O(1) lookups instead of O(n²) nested loops
    const dedupMap = new Map(); // key -> activity
    
    // Deduplicate: prefer source based on EXTERNAL_SOURCE_PRIORITY.
    for (const act of allActs) {
      const key = createDedupKey(act, act.source);
      
      // Check if we've already seen this exact key
      if (dedupMap.has(key)) {
        const existing = dedupMap.get(key);
        const merged = choosePreferredActivity(existing, act);
        dedupMap.set(key, merged);
        const existingIndex = deduplicatedActs.findIndex(a => a === existing);
        if (existingIndex >= 0) {
          deduplicatedActs[existingIndex] = merged;
        }
        continue;
      }
      
      // Check for similar keys (same date and sport, similar duration/distance) - O(n) but only once per activity
      let isDuplicate = false;
      for (const [seenKey, seenAct] of dedupMap.entries()) {
        const [datePart, sport, duration, distance] = seenKey.split('_');
        const [actDatePart, actSport, actDuration, actDistance] = key.split('_');
        
        // Check if keys match (same date, sport, similar duration/distance)
        if (datePart === actDatePart && sport === actSport) {
          const durationDiff = Math.abs(parseInt(duration) - parseInt(actDuration)) / Math.max(parseInt(duration), parseInt(actDuration), 1);
          const distanceDiff = Math.abs(parseInt(distance) - parseInt(actDistance)) / Math.max(parseInt(distance), parseInt(actDistance), 1);
          
          if (durationDiff <= 0.1 && distanceDiff <= 0.05) {
            isDuplicate = true;
            const merged = choosePreferredActivity(seenAct, act);
            const preferredSourceChanged = merged.source !== seenAct.source;
            if (preferredSourceChanged) {
              dedupMap.delete(seenKey);
              dedupMap.set(key, merged);
            } else {
              dedupMap.set(seenKey, merged);
            }
            const existingIndex = deduplicatedActs.findIndex(a => a === seenAct);
            if (existingIndex >= 0) {
              deduplicatedActs[existingIndex] = merged;
            }
            break;
          }
        }
      }
      
      if (!isDuplicate) {
        dedupMap.set(key, act);
        deduplicatedActs.push(act);
      }
    }
    
    // Sort by date descending
    deduplicatedActs.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    
    // Limit to 5000 most recent
    const limitedActs = deduplicatedActs.slice(0, 5000);

    // Cache-friendly headers (private because this is user-scoped)
    res.set('Cache-Control', 'private, max-age=60');
    res.json(limitedActs);
  } catch (error) {
    console.error('Error fetching external activities:', error);
    res.status(500).json({ error: error.message });
  }
});

// Connection status (cached for 2 minutes)
router.get('/status', verifyToken, activitiesCacheMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaConnected = Boolean(user?.strava?.accessToken);
    const garminConnected = Boolean(user?.garmin?.accessToken);
    res.json({ stravaConnected, garminConnected });
  } catch (e) {
    res.status(500).json({ error: 'status_failed' });
  }
});

// Detailed activity with streams (time, speed, HR, power)
// Supports both MongoDB _id and stravaId
router.get('/strava/activities/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    let id = req.params.id;
    if (typeof id === 'string') {
      id = id.replace(/^strava-/i, '');
    }
    const detailRequesterRole = String(user.role || '').toLowerCase();
    
    // Determine which userId to use (for coach viewing athlete's activities)
    let targetUserId = user._id.toString();
    if (req.query.athleteId) {
      if (['coach', 'tester', 'testing'].includes(detailRequesterRole)) {
        if (req.query.athleteId === user._id.toString()) {
          targetUserId = user._id.toString();
        } else {
          const athlete = await User.findById(req.query.athleteId);
          if (!athlete) {
            return res.status(404).json({ error: 'Athlete not found' });
          }
          if (!athleteHasCoachUser(athlete, user._id)) {
            return res.status(403).json({ error: 'This athlete does not belong to your team' });
          }
          targetUserId = req.query.athleteId;
        }
      } else if (detailRequesterRole === 'athlete') {
        if (req.query.athleteId !== user._id.toString()) {
          return res.status(403).json({ error: 'You are not authorized to view these activities' });
        }
        targetUserId = user._id.toString();
      }
    } else if (detailRequesterRole === 'athlete') {
      targetUserId = user._id.toString();
    } else if (['coach', 'tester', 'testing'].includes(detailRequesterRole)) {
      // Coach without athleteId query param - try to determine from activity
      // First try to find the activity to see which userId it belongs to
      const mongoose = require('mongoose');
      let testActivity = null;
      if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
        testActivity = await StravaActivity.findOne({ _id: id });
      } else {
        const testStravaIdNum = parseInt(id, 10);
        if (Number.isFinite(testStravaIdNum) && testStravaIdNum > 0) {
          testActivity = await StravaActivity.findOne({ stravaId: testStravaIdNum });
        }
      }
      
      if (testActivity) {
        const activityUserId = testActivity.userId.toString();
        // Check if this activity belongs to one of coach's athletes
        const activityOwner = await User.findById(activityUserId);
        if (activityOwner) {
          if (athleteHasCoachUser(activityOwner, user._id)) {
            // Activity belongs to coach's athlete
            targetUserId = activityUserId;
          } else if (activityUserId === user._id.toString()) {
            // Coach's own activity
            targetUserId = user._id.toString();
          } else {
            // Activity doesn't belong to coach or their athletes
            return res.status(403).json({ error: 'You are not authorized to view this activity' });
          }
        }
      }
    }
    
    // Check if id is MongoDB ObjectId (24 hex characters)
    const mongoose = require('mongoose');
    let stravaId = null;
    let savedActivity = null;
    
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      // It's a MongoDB _id, find the activity by _id
      savedActivity = await StravaActivity.findOne({ _id: id });
      
      if (!savedActivity) {
        return res.status(404).json({ error: 'Strava activity not found' });
      }
      
      // Verify access for coach
      if (['coach', 'tester', 'testing'].includes(detailRequesterRole) && savedActivity.userId.toString() !== user._id.toString()) {
        const activityOwner = await User.findById(savedActivity.userId);
        if (!activityOwner || !athleteHasCoachUser(activityOwner, user._id)) {
          return res.status(403).json({ error: 'You are not authorized to view this activity' });
        }
        // Update targetUserId to activity owner
        targetUserId = savedActivity.userId.toString();
      }
      
      stravaId = savedActivity.stravaId;
    } else {
      // It's a stravaId (numeric)
      stravaId = parseInt(id, 10);
      if (!Number.isFinite(stravaId) || stravaId < 1) {
        return res.status(400).json({ error: 'Invalid Strava activity id', id: String(id) });
      }
      // First try to find with targetUserId (if we already determined it)
      savedActivity = await StravaActivity.findOne({ 
        userId: targetUserId, 
        stravaId: stravaId 
      });
      
      // If not found and we're a coach, try to find the activity and verify it belongs to coach or their athlete
      if (!savedActivity && ['coach', 'tester', 'testing'].includes(detailRequesterRole)) {
        const foundActivity = await StravaActivity.findOne({ stravaId: stravaId });
        if (foundActivity) {
          const activityOwner = await User.findById(foundActivity.userId);
          if (activityOwner) {
            if (athleteHasCoachUser(activityOwner, user._id)) {
              // Activity belongs to coach's athlete - update targetUserId
              targetUserId = foundActivity.userId.toString();
              savedActivity = foundActivity;
            } else if (foundActivity.userId.toString() === user._id.toString()) {
              // Coach's own activity
              targetUserId = user._id.toString();
              savedActivity = foundActivity;
            } else {
              return res.status(403).json({ error: 'You are not authorized to view this activity' });
            }
          }
        }
      }
      
      if (!savedActivity) {
        return res.status(404).json({ error: 'Strava activity not found' });
      }
    }
    
    // Get target user (athlete if coach selected one, otherwise requester)
    // Reload targetUser if targetUserId changed during activity lookup
    const targetUser = targetUserId === user._id.toString() ? user : await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }
    
    if (!stravaId) {
      return res.status(404).json({ error: 'Strava activity ID not found' });
    }
    
    // Use target user's Strava token (athlete's token if coach viewing athlete's activity)
    // This is critical: coach must use athlete's Strava token, not their own
    let token = await getValidStravaToken(targetUser);
    if (!token) {
      // 401 would trigger app-wide logout; this is Strava OAuth state, not LaChart JWT.
      return res.status(400).json({ 
        error: 'Strava not connected or token invalid',
        message: targetUserId === user._id.toString() 
          ? 'Your Strava account is not connected or token expired. Please reconnect in Settings.'
          : 'The athlete\'s Strava account is not connected or token expired. Please ask them to reconnect.'
      });
    }
    
    let detailResp;
    try {
      detailResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000
      });
    } catch (apiError) {
      if (apiError.response?.status === 401) {
        console.log('Got 401 from Strava activity detail, attempting token refresh...');
        const refreshedTargetUser = await User.findById(targetUserId);
        token = await getValidStravaToken(refreshedTargetUser);
        if (token) {
          try {
            detailResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 30000
            });
          } catch (retryError) {
            console.error('Strava activity detail after refresh:', retryError.response?.data || retryError.message);
            return res.status(retryError.response?.status || 500).json({
              error: 'Failed to fetch activity from Strava after token refresh',
              details: retryError.response?.data || retryError.message
            });
          }
        } else {
          console.error('Could not refresh Strava token after 401 on activity detail');
          return res.status(400).json({
            error: 'Strava token expired and could not be refreshed. Please reconnect your Strava account.',
            requiresReconnect: true
          });
        }
      } else {
        console.error('Strava activity detail error:', apiError.response?.data || apiError.message);
        return res.status(apiError.response?.status || 500).json({
          error: 'Failed to fetch activity from Strava',
          details: apiError.response?.data || apiError.message
        });
      }
    }

    let streamsData = {};
    try {
      streamsData = await fetchStravaActivityStreams(token, stravaId);
    } catch (streamErr) {
      console.warn('[Strava] streams failed (detail already loaded):', streamErr.response?.status || streamErr.message);
      streamsData = {};
    }
    // Laps (intervals)
    let laps = [];
    try {
      const lapsResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}/laps`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      laps = lapsResp.data || [];
    } catch (e) {}
    
    // Get saved title, description and laps with lactate from database (if not already loaded)
    if (!savedActivity) {
      savedActivity = await StravaActivity.findOne({ userId: user._id, stravaId: stravaId });
    }
    
    // Merge saved laps with lactate values into laps from API
    // Always use saved laps from database as base (they include manually created laps)
    // Then enrich with API lap data where available
    let mergedLaps = laps;
    if (savedActivity?.laps && savedActivity.laps.length > 0) {
      // Build helper function for lap key matching (same as deduplication)
      // Must be defined before deduplication to use consistent key format
      const buildLapKeyForMatching = (lap) => {
        const startTime = lap.startTime || lap.start_date;
        if (startTime) {
          const time = new Date(startTime).getTime();
          if (!Number.isNaN(time)) {
            return `time_${Math.floor(time / 1000)}`;
          }
        }
        if (lap.lapNumber !== undefined && lap.lapNumber !== null) {
          return `lap_${lap.lapNumber}`;
        }
        const elapsedTime = Math.round(lap.elapsed_time || 0);
        const distance = Math.round((lap.distance || 0) * 10) / 10;
        const power = Math.round((lap.average_watts || 0) * 10) / 10;
        return `fallback_t${elapsedTime}_d${distance}_p${power}`;
      };
      
      // Deduplicate saved laps first to prevent duplicates using the same key format
      const seenSavedLaps = new Map();
      const uniqueSavedLaps = [];
      savedActivity.laps.forEach((savedLap, idx) => {
        const key = buildLapKeyForMatching(savedLap);
        
        if (!seenSavedLaps.has(key)) {
          seenSavedLaps.set(key, true);
          uniqueSavedLaps.push(savedLap);
        }
      });
      
      if (uniqueSavedLaps.length !== savedActivity.laps.length) {
        console.log(`Backend: Removed ${savedActivity.laps.length - uniqueSavedLaps.length} duplicate saved laps. Original: ${savedActivity.laps.length}, Unique: ${uniqueSavedLaps.length}`);
      }
      
      // Track which API laps have been matched to avoid duplicates
      const matchedApiLapIndicesForMerge = new Set();
      
      // Start with deduplicated saved laps from database (they include manually created ones)
      mergedLaps = uniqueSavedLaps.map(savedLap => {
        const savedLapKey = buildLapKeyForMatching(savedLap);
        let matchedApiIdx = null;
        
        // Try to find matching API lap using key matching first (most reliable)
        const apiLapWithKey = laps.find((lap, idx) => {
          if (matchedApiLapIndicesForMerge.has(idx)) return false; // Already matched
          const apiLapKey = buildLapKeyForMatching(lap);
          if (apiLapKey === savedLapKey) {
            matchedApiIdx = idx;
            return true;
          }
          return false;
        });
        
        let apiLap = apiLapWithKey;
        
        // If no key match, try to find by elapsed_time, distance, and power
        if (!apiLap) {
          const apiLapWithProps = laps.find((lap, idx) => {
            if (matchedApiLapIndicesForMerge.has(idx)) return false; // Already matched
            
            // Match by elapsed_time, distance, and power (strict matching)
            const timeMatch = Math.abs((lap.elapsed_time || 0) - (savedLap.elapsed_time || 0)) < 1;
            const distMatch = Math.abs((lap.distance || 0) - (savedLap.distance || 0)) < 0.1;
            const powerMatch = Math.abs((lap.average_watts || 0) - (savedLap.average_watts || 0)) < 1;
            if (timeMatch && distMatch && powerMatch) {
              matchedApiIdx = idx;
              return true;
            }
            return false;
          });
          apiLap = apiLapWithProps;
        }
        
        // Mark API lap as matched if found
        if (matchedApiIdx !== null) {
          matchedApiLapIndicesForMerge.add(matchedApiIdx);
        }
        
        // If we found a matching API lap, merge the data (keep saved lap structure but add API data)
        if (apiLap) {
          return {
            ...savedLap,
            // Keep API lap fields that might be more up-to-date
            distance: apiLap.distance || savedLap.distance,
            average_speed: apiLap.average_speed || savedLap.average_speed,
            max_speed: apiLap.max_speed || savedLap.max_speed,
            average_heartrate: apiLap.average_heartrate || savedLap.average_heartrate,
            max_heartrate: apiLap.max_heartrate || savedLap.max_heartrate,
            average_watts: apiLap.average_watts || savedLap.average_watts,
            max_watts: apiLap.max_watts || savedLap.max_watts,
            average_cadence: apiLap.average_cadence || savedLap.average_cadence,
            max_cadence: apiLap.max_cadence || savedLap.max_cadence,
            // Preserve saved lap fields
            lactate: savedLap.lactate !== undefined ? savedLap.lactate : null,
            lapNumber: savedLap.lapNumber,
            startTime: savedLap.startTime,
            elapsed_time: savedLap.elapsed_time || apiLap.elapsed_time,
            moving_time: savedLap.moving_time || apiLap.moving_time
          };
        }
        // If no match, use saved lap as-is (manually created lap)
        return savedLap;
      });
      
      // Add any API laps that don't have matches in saved laps
      // Use the same key matching function
      const mergedLapKeys = new Set(mergedLaps.map(lap => buildLapKeyForMatching(lap)));
      
      laps.forEach((apiLap, apiIdx) => {
        // Skip if already matched during merge phase
        if (matchedApiLapIndicesForMerge.has(apiIdx)) return;
        
        // Check if this API lap matches any already merged lap using the same key logic
        const apiLapKey = buildLapKeyForMatching(apiLap);
        
        if (mergedLapKeys.has(apiLapKey)) {
          // This API lap is already represented in mergedLaps, skip it
          return;
        }
        
        // Also try to match by elapsed_time, distance, and power (in case keys differ slightly)
        const alreadyMerged = mergedLaps.some(mergedLap => {
          // If both have the same key, they're already matched
          if (buildLapKeyForMatching(mergedLap) === apiLapKey) {
            return true;
          }
          
          // Fallback: match by elapsed_time, distance, and power (strict matching)
          const timeMatch = Math.abs((apiLap.elapsed_time || 0) - (mergedLap.elapsed_time || 0)) < 1;
          const distMatch = Math.abs((apiLap.distance || 0) - (mergedLap.distance || 0)) < 0.1;
          const powerMatch = Math.abs((apiLap.average_watts || 0) - (mergedLap.average_watts || 0)) < 1;
          
          // Only match if all three match (strict matching to avoid false positives)
          return timeMatch && distMatch && powerMatch;
        });
        
        if (!alreadyMerged) {
          // Only add if it's truly a new lap
          mergedLaps.push(apiLap);
          mergedLapKeys.add(apiLapKey);
        }
      });
      
      // Sort laps by startTime to ensure chronological order
      mergedLaps.sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : (a.start_date ? new Date(a.start_date).getTime() : 0);
        const timeB = b.startTime ? new Date(b.startTime).getTime() : (b.start_date ? new Date(b.start_date).getTime() : 0);
        return timeA - timeB;
      });
      
      // Final deduplication pass to ensure no duplicates using the same key function
      const seen = new Map();
      const deduplicatedLaps = [];
      mergedLaps.forEach((lap) => {
        const key = buildLapKeyForMatching(lap);
        
        if (key && !seen.has(key)) {
          seen.set(key, true);
          deduplicatedLaps.push(lap);
        } else if (!key) {
          // If no key can be generated, still add it (shouldn't happen often)
          deduplicatedLaps.push(lap);
        }
      });
      
      if (deduplicatedLaps.length !== mergedLaps.length) {
        console.log(`Backend deduplication: Removed ${mergedLaps.length - deduplicatedLaps.length} duplicate laps. Original: ${mergedLaps.length}, Unique: ${deduplicatedLaps.length}`);
      }
      
      mergedLaps = deduplicatedLaps;
    }
    
    res.json({ 
      detail: detailResp.data, 
      streams: streamsData, 
      laps: mergedLaps,
      titleManual: savedActivity?.titleManual || null,
      description: savedActivity?.description || null,
      category: savedActivity?.category || null
    });
  } catch (e) {
    console.error('Strava activity detail error', e.response?.data || e.message);
    res.status(500).json({ error: 'activity_detail_failed' });
  }
});

// Update Strava activity title and description
router.put('/strava/activities/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const stravaId = parseInt(stripStravaActivityIdPrefix(req.params.id), 10);
    if (!Number.isFinite(stravaId) || stravaId < 1) {
      return res.status(400).json({ error: 'Invalid Strava activity ID' });
    }
    
    const { title, description, category } = req.body;

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    const oldTitle = activity.titleManual || activity.name || null;
    
    // Update title if provided
    if (title !== undefined) {
      activity.titleManual = (title && typeof title === 'string' && title.trim()) ? title.trim() : null;
    }

    // Update description if provided
    if (description !== undefined) {
      activity.description = (description && typeof description === 'string' && description.trim()) ? description.trim() : null;
    }

    // Update category if provided
    // Ensure category is either a valid enum value or null (empty string becomes null)
    if (category !== undefined) {
      const validCategories = ['endurance', 'tempo', 'threshold', 'vo2max', 'anaerobic', 'recovery', 'hills'];
      if (category === null || category === '' || category === undefined) {
        activity.category = null;
      } else if (validCategories.includes(category)) {
        activity.category = category;
      } else {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')} or null` });
      }
    }

    await activity.save();

    // Update Training records with the same title
    if (title !== undefined && title && typeof title === 'string' && title.trim()) {
      try {
        const Training = require('../models/training');
        const newTitle = title.trim();
        
        // Build query for finding Training records
        const titleQuery = [];
        if (oldTitle && typeof oldTitle === 'string') {
          titleQuery.push(oldTitle);
        }
        titleQuery.push(newTitle);
        
        // Find Training records with the same title (old or new)
        const trainingRecords = await Training.find({
          athleteId: user._id ? user._id.toString() : String(user._id),
          title: { $in: titleQuery.filter(t => t) }
        });
        
        // Update all matching Training records
        for (const trainingRecord of trainingRecords) {
          if (trainingRecord.title === oldTitle || trainingRecord.title === newTitle) {
            trainingRecord.title = newTitle;
            if (description !== undefined) {
              trainingRecord.description = description || null;
            }
            await trainingRecord.save();
          }
        }
      } catch (trainingError) {
        // Log error but don't fail the request if Training update fails
        console.error('Error updating Training records:', trainingError);
      }
    }

    res.json({
      success: true,
      activity
    });
  } catch (error) {
    console.error('Error updating Strava activity:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update Strava activity laps lactate values
router.put('/strava/activities/:id/lactate', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaId = parseInt(stripStravaActivityIdPrefix(req.params.id), 10);
    const { lactateValues } = req.body; // [{ lapIndex: number, lactate: number }]

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    // Initialize laps array if it doesn't exist
    if (!activity.laps || activity.laps.length === 0) {
      // Try to get laps from Strava API
      const token = await getValidStravaToken(user);
      try {
        const lapsResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}/laps`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        activity.laps = lapsResp.data || [];
      } catch (e) {
        return res.status(400).json({ error: 'No laps available for this activity' });
      }
    }

    // Update lactate values
    console.log('Updating lactate values:', { lactateValues, lapsCount: activity.laps?.length });
    lactateValues.forEach(({ lapIndex, lactate }) => {
      console.log(`Setting lactate for lapIndex ${lapIndex}: ${lactate}, lap exists: ${!!activity.laps[lapIndex]}`);
      if (activity.laps[lapIndex]) {
        activity.laps[lapIndex].lactate = lactate || null;
        console.log(`Lactate set for lapIndex ${lapIndex}:`, activity.laps[lapIndex].lactate);
      } else {
        console.warn(`Lap at index ${lapIndex} does not exist. Total laps: ${activity.laps?.length}`);
      }
    });

    await activity.save();
    console.log('Activity saved. Laps with lactate:', activity.laps?.map((lap, idx) => ({ idx, lactate: lap.lactate })).filter(l => l.lactate !== null && l.lactate !== undefined));

    // Sync to Training model - sync all intervals (not just those with lactate)
    try {
      const TrainingAbl = require('../abl/trainingAbl');
      // Merge activity data with detail for sync
      const activityData = {
        ...activity.toObject(),
        name: activity.name,
        titleManual: activity.titleManual,
        description: activity.description,
        sport: activity.sport,
        startDate: activity.startDate,
        elapsedTime: activity.elapsedTime,
        movingTime: activity.movingTime,
        laps: activity.laps
      };
      await TrainingAbl.syncTrainingFromSource('strava', activityData, user._id.toString());
    } catch (syncError) {
      console.error('Error syncing to Training model:', syncError);
      // Don't fail the request if sync fails
    }

    res.json({
      success: true,
      activity
    });
  } catch (error) {
    console.error('Error updating Strava activity lactate:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new lap from time range selection for Strava activity
router.post('/strava/activities/:id/laps', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaId = parseInt(stripStravaActivityIdPrefix(req.params.id), 10);
    const { startTime, endTime } = req.body; // startTime and endTime in seconds from activity start

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    // Get streams from Strava API to calculate statistics
    const token = await getValidStravaToken(user);
    let streams = null;
    try {
      const streamsResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}/streams`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { keys: 'time,velocity_smooth,heartrate,watts,altitude,cadence', key_by_type: true }
      });
      streams = streamsResp.data;
    } catch (e) {
      return res.status(400).json({ error: 'Could not fetch activity streams from Strava' });
    }

    // Find data points in the selected time range
    const timeStream = streams.time?.data || [];
    const speedStream = streams.velocity_smooth?.data || [];
    const hrStream = streams.heartrate?.data || [];
    const powerStream = streams.watts?.data || [];
    const cadenceStream = streams.cadence?.data || [];
    const altitudeStream = streams.altitude?.data || [];

    const selectedIndices = [];
    for (let i = 0; i < timeStream.length; i++) {
      const time = timeStream[i];
      if (time >= startTime && time <= endTime) {
        selectedIndices.push(i);
      }
    }

    if (selectedIndices.length === 0) {
      return res.status(400).json({ error: 'No data found in selected time range' });
    }

    // Calculate statistics from selected data points
    const speeds = selectedIndices.map(i => speedStream[i]).filter(v => v && v > 0);
    const heartRates = selectedIndices.map(i => hrStream[i]).filter(v => v && v > 0);
    const powers = selectedIndices.map(i => powerStream[i]).filter(v => v && v > 0);
    const cadences = selectedIndices.map(i => cadenceStream[i]).filter(v => v && v > 0);

    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
    const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
    const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
    const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
    const maxPower = powers.length > 0 ? Math.max(...powers) : null;
    const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null;
    const maxCadence = cadences.length > 0 ? Math.max(...cadences) : null;

    // Calculate distance (approximate from speed)
    const totalDistance = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) * (endTime - startTime) / selectedIndices.length : null;

    // Calculate elapsed time
    const elapsedTime = endTime - startTime;

    // Get activity start date from Strava API detail
    let activityStartDate = null;
    try {
      const detailResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Use start_date_local if available (more accurate), otherwise start_date
      const startDateStr = detailResp.data.start_date_local || detailResp.data.start_date;
      if (startDateStr) {
        activityStartDate = new Date(startDateStr);
      }
    } catch (e) {
      // Fallback to activity.startDate if API call fails
      activityStartDate = activity.startDate ? new Date(activity.startDate) : new Date();
    }
    
    // Final fallback if still no date
    if (!activityStartDate || isNaN(activityStartDate.getTime())) {
      activityStartDate = activity.startDate ? new Date(activity.startDate) : new Date();
    }

    // Create new lap with startTime relative to activity start_date
    const newLap = {
      lapNumber: (activity.laps?.length || 0) + 1,
      startTime: new Date(activityStartDate.getTime() + startTime * 1000),
      elapsed_time: elapsedTime,
      moving_time: elapsedTime,
      distance: totalDistance || 0,
      average_speed: avgSpeed || 0,
      max_speed: maxSpeed || 0,
      average_heartrate: avgHeartRate,
      max_heartrate: maxHeartRate,
      average_watts: avgPower,
      max_watts: maxPower,
      average_cadence: avgCadence,
      max_cadence: maxCadence
    };

    // Initialize laps array if it doesn't exist
    if (!activity.laps) {
      activity.laps = [];
    }
    activity.laps.push(newLap);

    await activity.save();

    res.json({
      success: true,
      lap: newLap,
      activity
    });
  } catch (error) {
    console.error('Error creating Strava lap:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk create laps from detected intervals
router.post('/strava/activities/:id/laps/bulk', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaId = parseInt(stripStravaActivityIdPrefix(req.params.id), 10);
    const intervals = Array.isArray(req.body.intervals) ? req.body.intervals : [];
    
    if (!intervals.length) {
      return res.status(400).json({ error: 'No intervals provided' });
    }

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    const token = await getValidStravaToken(user);
    let streams = null;
    try {
      const streamsResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}/streams`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { keys: 'time,velocity_smooth,heartrate,watts,altitude,cadence', key_by_type: true }
      });
      streams = streamsResp.data;
    } catch (e) {
      return res.status(400).json({ error: 'Could not fetch activity streams from Strava' });
    }

    // Fetch activity detail once to determine start date
    let activityStartDate = null;
    try {
      const detailResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const startDateStr = detailResp.data.start_date_local || detailResp.data.start_date;
      if (startDateStr) {
        activityStartDate = new Date(startDateStr);
      }
    } catch (e) {
      activityStartDate = activity.startDate ? new Date(activity.startDate) : new Date();
    }

    if (!activityStartDate || isNaN(activityStartDate.getTime())) {
      activityStartDate = activity.startDate ? new Date(activity.startDate) : new Date();
    }

    const activityStartMs = activityStartDate.getTime();

    const timeStream = streams.time?.data || [];
    const speedStream = streams.velocity_smooth?.data || [];
    const hrStream = streams.heartrate?.data || [];
    const powerStream = streams.watts?.data || [];
    const cadenceStream = streams.cadence?.data || [];

    if (!timeStream.length) {
      return res.status(400).json({ error: 'No time stream data available' });
    }

    const buildLapKey = (lap) => {
      const startTime = lap.startTime || lap.start_date;
      if (startTime) {
        const time = new Date(startTime).getTime();
        if (!Number.isNaN(time)) {
          return `time_${Math.floor(time / 1000)}`;
        }
      }
      if (lap.lapNumber !== undefined && lap.lapNumber !== null) {
        return `lap_${lap.lapNumber}`;
      }
      const elapsedTime = Math.round(lap.elapsed_time || 0);
      const distance = Math.round((lap.distance || 0) * 10) / 10;
      const power = Math.round((lap.average_watts || 0) * 10) / 10;
      return `fallback_t${elapsedTime}_d${distance}_p${power}`;
    };

    const existingKeys = new Set();
    if (activity.laps && activity.laps.length > 0) {
      activity.laps.forEach(lap => {
        const key = buildLapKey(lap);
        if (key) existingKeys.add(key);
      });
    }

    const computeStatsForInterval = (startTime, endTime) => {
      if (endTime <= startTime) return null;
      const selectedIndices = [];
      for (let i = 0; i < timeStream.length; i++) {
        const time = timeStream[i];
        if (time >= startTime && time <= endTime) {
          selectedIndices.push(i);
        }
        if (time > endTime) {
          break;
        }
      }

      if (!selectedIndices.length) {
        return null;
      }

      const collectValues = (stream) => selectedIndices.map(i => stream[i]).filter(v => v && v > 0);

      const speeds = collectValues(speedStream);
      const heartRates = collectValues(hrStream);
      const powers = collectValues(powerStream);
      const cadences = collectValues(cadenceStream);

      const avg = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      const max = (values) => values.length ? Math.max(...values) : null;

      const avgSpeed = avg(speeds);
      const avgHeartRate = heartRates.length ? Math.round(avg(heartRates)) : null;
      const avgPower = powers.length ? Math.round(avg(powers)) : null;
      const avgCadence = cadences.length ? Math.round(avg(cadences)) : null;

      const duration = endTime - startTime;
      const totalDistance = avgSpeed ? avgSpeed * duration : 0;

      return {
        elapsed_time: duration,
        moving_time: duration,
        distance: totalDistance || 0,
        average_speed: avgSpeed || 0,
        max_speed: max(speeds) || 0,
        average_heartrate: avgHeartRate,
        max_heartrate: max(heartRates) || null,
        average_watts: avgPower,
        max_watts: max(powers) || null,
        average_cadence: avgCadence,
        max_cadence: max(cadences) || null
      };
    };

    const results = {
      created: 0,
      skipped: {
        duplicates: 0,
        invalid: 0,
        empty: 0
      }
    };

    const newLaps = [];

    intervals.forEach((interval) => {
      const start = typeof interval.startTime === 'number' ? interval.startTime : interval.start;
      const end = typeof interval.endTime === 'number' ? interval.endTime : interval.end;

      if (!isFinite(start) || !isFinite(end) || end <= start) {
        results.skipped.invalid += 1;
        return;
      }

      const duration = end - start;
      if (duration < 5) {
        results.skipped.invalid += 1;
        return;
      }

      const lapStartDate = new Date(activityStartMs + start * 1000);
      const lapKey = buildLapKey({ startTime: lapStartDate.toISOString(), elapsed_time: duration });

      if (lapKey && existingKeys.has(lapKey)) {
        results.skipped.duplicates += 1;
        return;
      }

      const stats = computeStatsForInterval(start, end);
      if (!stats) {
        results.skipped.empty += 1;
        return;
      }

      const newLap = {
        lapNumber: (activity.laps?.length || 0) + newLaps.length + 1,
        startTime: lapStartDate,
        ...stats
      };

      newLaps.push(newLap);
      if (lapKey) {
        existingKeys.add(lapKey);
      }
    });

    if (!newLaps.length) {
      return res.json({ success: false, created: 0, ...results });
    }

    activity.laps = activity.laps ? activity.laps.concat(newLaps) : newLaps;
    await activity.save();

    results.created = newLaps.length;

    res.json({
      success: true,
      created: newLaps.length,
      skipped: results.skipped,
      activity
    });
  } catch (error) {
    console.error('Error creating Strava laps in bulk:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a lap from Strava activity
router.delete('/strava/activities/:id/laps/:lapIndex', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaId = parseInt(stripStravaActivityIdPrefix(req.params.id), 10);
    const lapIndex = parseInt(req.params.lapIndex);

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    if (!activity.laps || activity.laps.length === 0) {
      return res.status(400).json({ error: 'No laps available for this activity' });
    }

    if (lapIndex < 0 || lapIndex >= activity.laps.length) {
      return res.status(400).json({ error: 'Invalid lap index' });
    }

    // Remove the lap at the specified index
    activity.laps.splice(lapIndex, 1);
    
    // Update lap numbers for remaining laps
    activity.laps.forEach((lap, index) => {
      lap.lapNumber = index + 1;
    });

    await activity.save();

    res.json({
      success: true,
      message: 'Lap deleted successfully',
      activity
    });
  } catch (error) {
    console.error('Error deleting Strava lap:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user avatar from Strava
router.post('/strava/update-avatar', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const token = await getValidStravaToken(user);
    if (!token) {
      return res.status(400).json({ error: 'Strava not connected or token invalid. Reconnect in Settings.' });
    }

    // Get athlete profile from Strava
    const athleteResp = await axios.get('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const athlete = athleteResp.data;
    console.log('Strava athlete data:', {
      profile: athlete?.profile,
      profile_large: athlete?.profile_large,
      profile_medium: athlete?.profile_medium
    });
    
    if (athlete?.profile && athlete.profile !== 'avatar/athlete/large.png') {
      // Use profile_large if available, otherwise profile_medium, otherwise profile
      const profilePath = athlete.profile_large || athlete.profile_medium || athlete.profile;
      // Convert relative path to full URL
      let avatarUrl = null;
      if (profilePath && !profilePath.startsWith('http')) {
        avatarUrl = `https://www.strava.com/${profilePath}`;
      } else if (profilePath) {
        avatarUrl = profilePath;
      }
      
      if (avatarUrl) {
        // Use findByIdAndUpdate to ensure the update is saved properly
        const updatedUser = await User.findByIdAndUpdate(
          req.user.userId,
          { $set: { avatar: avatarUrl } },
          { new: true, runValidators: true }
        );
        
        if (!updatedUser) {
          return res.status(404).json({ error: 'User not found after update' });
        }
        
        // Verify the update was saved
        const verifyUser = await User.findById(req.user.userId);
        console.log('Avatar saved to database:', {
          userId: verifyUser._id,
          avatar: verifyUser.avatar,
          avatarType: typeof verifyUser.avatar
        });
      
      return res.json({ 
        success: true, 
          avatar: verifyUser.avatar,
        message: 'Avatar updated from Strava'
      });
      } else {
        return res.status(404).json({ error: 'No valid Strava profile picture URL found' });
      }
    } else {
      return res.status(404).json({ error: 'No Strava profile picture available' });
    }
  } catch (error) {
    console.error('Error updating avatar from Strava:', error.response?.data || error.message);
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Strava API rate limit exceeded' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.getValidStravaToken = getValidStravaToken;
