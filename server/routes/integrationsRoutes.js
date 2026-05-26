const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRET } = require('../config/jwt.config');
const verifyToken = require('../middleware/verifyToken');
const StravaActivity = require('../models/StravaActivity');
const AppleHealthActivity = require('../models/AppleHealthActivity');
const StravaStream = require('../models/StravaStream');
const GarminActivity = require('../models/GarminActivity');
const User = require('../models/UserModel');
const Training = require('../models/training');
const TrainingAbl = require('../abl/trainingAbl');
const { athleteHasCoachUser } = require('../utils/athleteCoachAccess');
const { notifyCoachesOfAthlete, notifyAthlete } = require('../utils/notificationHelper');
const router = express.Router();

// Process-wide token bucket so no single hot path can drain Strava's quota.
// take() awaits a slot inside our SAFE-headroom window (500/15min, 1800/day).
const stravaBudget = require('../utils/stravaBudget');

// ────────────────────────────────────────────────────────────────────────────
// Global Strava rate-limit memo (process-local, single-instance).
//
// Strava's rate limit is per-app, not per-user. Once we get one 429, EVERY
// subsequent request from ANY user across our app will also 429 until the
// window resets. Without this guard each user retry produced another wasted
// outbound call to Strava — burning quota on the same 429s and slowing the
// recovery. We now remember the unlock timestamp from the first 429's
// Retry-After header and short-circuit every Strava-bound endpoint until
// that moment, returning 429 to the client instantly without contacting
// Strava at all.
// ────────────────────────────────────────────────────────────────────────────
let stravaUnlockAt = 0; // Unix ms — earliest time we're allowed to retry Strava.

function stravaIsLockedNow() {
  return Date.now() < stravaUnlockAt;
}

function stravaLockoutSecondsRemaining() {
  return Math.max(0, Math.ceil((stravaUnlockAt - Date.now()) / 1000));
}

/** Record a 429 from Strava and stop talking to them for `retryAfterSec`.
 *  Clamped to 60 s..30 min so a busted Retry-After header can't lock us out
 *  for half a day. */
function stravaNoteRateLimit(retryAfterSec) {
  const sec = Math.min(Math.max(Number(retryAfterSec) || 300, 60), 30 * 60);
  const candidate = Date.now() + sec * 1000;
  // Honour the LATEST 429 even if it's longer — Strava sometimes escalates.
  if (candidate > stravaUnlockAt) stravaUnlockAt = candidate;
  console.warn(`[StravaRateLimit] locked for ${sec}s (until ${new Date(stravaUnlockAt).toISOString()})`);
}

/** Clear the lockout — call after any successful Strava response so a single
 *  conservative 429 estimate doesn't keep us idle once Strava is happy again. */
function stravaClearRateLimit() {
  if (stravaUnlockAt > 0) {
    console.log('[StravaRateLimit] cleared');
    stravaUnlockAt = 0;
  }
}

/** Shared 429 short-circuit for Express handlers. Returns true if the
 *  handler should bail; the response is already sent. */
function bailIfStravaLocked(res) {
  if (!stravaIsLockedNow()) return false;
  const sec = stravaLockoutSecondsRemaining();
  res.status(429).json({
    error: 'Strava rate limit active',
    message: `Strava API quota was exhausted. Retry in about ${Math.max(1, Math.ceil(sec / 60))} min.`,
    retryAfter: sec,
    appLevelLockout: true,
  });
  return true;
}

/** Resolve athlete user id for integration routes (pending lactate, lactate form). */
async function resolveIntegrationTargetUserId(req) {
  const userId = req.user.userId;
  const user = await User.findById(userId);
  if (!user) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  let targetUserId = userId;
  const requesterRole = String(user.role || '').toLowerCase();
  const isCoachLikeRequester = ['coach', 'tester', 'testing', 'admin'].includes(requesterRole) ||
    (user.admin === true && requesterRole !== 'athlete');
  if (req.query.athleteId) {
    if (isCoachLikeRequester) {
      if (String(req.query.athleteId) === String(userId)) {
        targetUserId = userId;
      } else {
        const athlete = await User.findById(req.query.athleteId);
        if (!athlete) {
          return { ok: false, status: 404, error: 'Athlete not found' };
        }
        // Admin can access any athlete; coaches/testers must be linked
        if (requesterRole !== 'admin' && !athleteHasCoachUser(athlete, userId)) {
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
// Max simultaneous historical backfills — keeps total API calls predictable
const MAX_CONCURRENT_BACKFILLS = 2;

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
    // Only cache successful responses — never cache 4xx/5xx or error bodies
    const isErrorStatus = res.statusCode < 200 || res.statusCode >= 300;
    const isErrorBody = body && typeof body === 'object' && (body.error || body.errors);
    if (!isErrorStatus && !isErrorBody) {
      activitiesCache.set(cacheKey, body);
    }
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
  // FRONTEND_URL must be set explicitly in Render env vars to your frontend domain
  // (e.g. https://lachart.net). RENDER_EXTERNAL_URL is the BACKEND URL — do NOT
  // use it here or OAuth redirects will land on the API server instead of the React app.
  const url =
    process.env.FRONTEND_URL ||
    'http://localhost:3000';
  return url.replace(/\/$/, '');
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

// Apple Health is LAST so when the same workout exists in Strava/Garmin (very
// common — both feed Health) the better-quality source wins the merge.
const EXTERNAL_SOURCE_PRIORITY = ['strava', 'garmin', 'coros', 'polar', 'fit', 'apple_health'];

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
//
// Backfill state is now persisted to `user.strava.backfillCursorBefore` and
// `user.strava.backfillState` on every successful batch. On server boot,
// `resumeInterruptedStravaBackfills()` (registered with the app) scans for
// users with `backfillState === 'running'` and reinvokes this function with
// their saved cursor — so a Render redeploy mid-backfill no longer silently
// drops the rest of someone's history.
async function startStravaHistoricalBackfill(userId, initialBefore = null) {
  const lockKey = String(userId);
  if (stravaBackfillLocks.has(lockKey)) return;
  // Global concurrency cap — prevent multiple simultaneous backfills from burning rate limits
  if (stravaBackfillLocks.size >= MAX_CONCURRENT_BACKFILLS) {
    // Retry after a delay so the backfill eventually starts once a slot opens up
    setTimeout(() => startStravaHistoricalBackfill(userId, initialBefore), 5 * 60 * 1000);
    return;
  }
  stravaBackfillLocks.add(lockKey);

  // Determine the starting cursor: explicit param > persisted cursor > now.
  // Persisted cursor lets us pick up exactly where a previous (interrupted)
  // backfill left off.
  if (initialBefore == null) {
    try {
      const u = await User.findById(userId).select('strava.backfillCursorBefore').lean();
      initialBefore = u?.strava?.backfillCursorBefore || Math.floor(Date.now() / 1000);
    } catch (_) {
      initialBefore = Math.floor(Date.now() / 1000);
    }
  }
  // Mark running so a boot-time scanner knows to resume this user.
  try {
    await User.findByIdAndUpdate(userId, {
      'strava.backfillState': 'running',
      'strava.backfillCursorBefore': initialBefore,
      'strava.backfillStartedAt': new Date(),
    });
  } catch (e) {
    console.warn('[StravaBackfill] could not persist start state:', e?.message);
  }

  const perPage = 100;
  // Aggressive defaults caused the budget to burn ~100 req / 15-min window
  // per user for the entire duration of a backfill (could be 75+ min for
  // a multi-year history). Slowed to ~3× — finishes in maybe 3-4 h for a
  // big history instead of 75 min, but stays at ≤30 req / window so it
  // can't visibly affect daily Strava budget or other users' real-time
  // webhook deliveries.
  const maxPagesPerBatch = Number(process.env.STRAVA_BACKFILL_MAX_PAGES || 2);
  const delayBetweenPagesMs = Number(process.env.STRAVA_BACKFILL_PAGE_DELAY_MS || 5000);
  const delayBetweenBatchesMs = Number(process.env.STRAVA_BACKFILL_BATCH_DELAY_MS || 90000);
  // Hard ceiling on consecutive batches in one session — defence against
  // a cursor-stuck loop. 80 × 2 pages × 100 activities = 16 000 activities,
  // far more than any real history. If the user has more, the next time the
  // scheduler ticks it'll keep filling.
  const maxBatchesPerSession = Number(process.env.STRAVA_BACKFILL_MAX_BATCHES || 80);
  let batchesRun = 0;

  const runBatch = async (beforeCursor, retryDelay = delayBetweenBatchesMs) => {
    let nextCursor = beforeCursor;
    let shouldContinue = true;
    batchesRun += 1;
    if (batchesRun > maxBatchesPerSession) {
      console.log(`[StravaBackfill] Hit batch cap (${maxBatchesPerSession}) for user ${userId}; stopping.`);
      stravaBackfillLocks.delete(lockKey);
      return;
    }

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
        await stravaBudget.take();
        const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: perPage, page: 1, before: nextCursor },
          timeout: 30000
        });
        try { stravaBudget.reconcileFromHeaders(resp.headers); } catch (_) { /* swallow */ }

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

      // Persist the cursor + last-sync after every successful batch.
      // If the server is killed mid-backfill, the next boot resumes from
      // exactly this point instead of starting over (or worse, never
      // continuing).
      await User.findByIdAndUpdate(user._id, {
        'strava.lastSyncDate': new Date(),
        'strava.backfillCursorBefore': nextCursor,
      });
    } catch (error) {
      const status = error?.response?.status;
      console.error('[StravaBackfill] Batch failed:', status || '', error?.response?.data || error?.message);
      if (status === 429) {
        // Rate limited — exponential backoff: double the delay each time, cap at 30 minutes
        const nextRetry = Math.min(retryDelay * 2, 30 * 60 * 1000);
        console.log(`[StravaBackfill] Rate limited for user ${userId}, backing off ${Math.round(nextRetry / 1000)}s`);
        setTimeout(() => {
          runBatch(nextCursor, nextRetry).catch((e) => {
            console.error('[StravaBackfill] Retry error:', e?.message || e);
            stravaBackfillLocks.delete(lockKey);
          });
        }, nextRetry);
        return; // don't fall through to the normal continue/stop logic below
      } else if (status >= 500 && status < 600) {
        // Transient server error — retry once after a longer pause, then give up
        shouldContinue = true;
      } else {
        shouldContinue = false;
      }
    }

    if (shouldContinue) {
      setTimeout(() => {
        runBatch(nextCursor, delayBetweenBatchesMs).catch((e) => {
          console.error('[StravaBackfill] Unhandled async error:', e?.message || e);
          stravaBackfillLocks.delete(lockKey);
        });
      }, delayBetweenBatchesMs);
    } else {
      // Backfill reached the end (or hit a non-retryable error). Mark done
      // so the boot-resume scanner ignores this user going forward.
      stravaBackfillLocks.delete(lockKey);
      try {
        await User.findByIdAndUpdate(userId, {
          'strava.backfillState': 'done',
          'strava.backfillFinishedAt': new Date(),
        });
      } catch (_) { /* ignore */ }
    }
  };

  setTimeout(() => {
    runBatch(initialBefore).catch((e) => {
      console.error('[StravaBackfill] Initial async error:', e?.message || e);
      stravaBackfillLocks.delete(lockKey);
    });
  }, 4000);
}

/**
 * Boot-time recovery: any user whose `strava.backfillState === 'running'`
 * had their backfill interrupted by a server restart. We resume each one,
 * starting from their persisted `backfillCursorBefore`. Concurrency cap
 * is enforced inside startStravaHistoricalBackfill so resumption can't
 * thunder-herd.
 *
 * Call this from server bootstrap, after the Mongo connection is ready.
 */
async function resumeInterruptedStravaBackfills() {
  try {
    const users = await User.find({ 'strava.backfillState': 'running' })
      .select('_id strava.backfillCursorBefore')
      .lean();
    if (!users.length) return;
    console.log(`[StravaBackfill] resuming ${users.length} interrupted backfills`);
    for (const u of users) {
      // Don't await — let the concurrency cap inside startStravaHistoricalBackfill
      // decide whether to defer.
      startStravaHistoricalBackfill(u._id, u.strava?.backfillCursorBefore || null);
    }
  } catch (e) {
    console.error('[StravaBackfill] resume on boot failed:', e?.message || e);
  }
}

// GET /api/integrations/strava/auth-url
//
// `platform` query param:
//   - 'web' (default) → callback redirects back to lachart.net
//   - 'ios'           → callback redirects to com.lachart.app:// deep link
//     so the native Capacitor app receives the connection result instead
//     of leaving the user stranded on a web page.
router.get('/strava/auth-url', (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID || 'STRAVA_CLIENT_ID';

  const redirectUri = resolveStravaOAuthRedirectUri(req);
  if (!redirectUri) {
    return res.status(500).json({ error: 'Strava redirect URI could not be determined; set STRAVA_REDIRECT_URI or BACKEND_URL.' });
  }

  const scope = 'activity:read_all,profile:read_all,read_all';
  // Forward current JWT in state so callback can identify user without Authorization header.
  // We prefix the JWT with the platform marker (ios|web) so the callback knows
  // whether to redirect to a web URL or to the iOS deep-link scheme.
  const platform = (req.query.platform === 'ios') ? 'ios' : 'web';
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  const state = encodeURIComponent(`${platform}:${jwt}`);

  console.log('Strava auth URL generation:', {
    clientId,
    redirectUri,
    platform,
    host: req.get('host'),
    protocol: req.protocol
  });

  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&approval_prompt=auto&state=${state}`;
  res.json({ url });
});

// OAuth callback - exchange code for tokens and save to user
router.get('/strava/callback', async (req, res) => {
  // Track whether the original auth-url request came from iOS so we know
  // which URL to redirect back to at the end. Defaults to 'web' for
  // legacy state values that don't carry a platform prefix.
  let platform = 'web';
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    // Extract user from state. New format: `<platform>:<jwt>`. Old format:
    // bare JWT (no colon). Detect by presence of a colon — if found and
    // the prefix is recognised, strip it before JWT verify.
    if (!state) return res.status(401).json({ error: 'Missing auth state' });
    let rawState = decodeURIComponent(state);
    const colonIdx = rawState.indexOf(':');
    if (colonIdx > 0 && colonIdx < 12) {
      const maybe = rawState.slice(0, colonIdx);
      if (maybe === 'ios' || maybe === 'web') {
        platform = maybe;
        rawState = rawState.slice(colonIdx + 1);
      }
    }
    let decoded;
    try {
      decoded = jwt.verify(rawState, JWT_SECRET);
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

    // iOS flow: send the user back to the native LaChart app via custom
    // URL scheme. Safari prompts "Open in LaChart?" — the app's deep-link
    // listener (initCapacitorShell.js) intercepts and refreshes the
    // integration status so the Settings card flips to "Connected"
    // without the user having to relaunch the app manually.
    if (platform === 'ios') {
      const scheme = process.env.IOS_URL_SCHEME || 'com.lachart.app';
      return res.redirect(`${scheme}://strava-connected?ok=1`);
    }
    const frontend = getFrontendBaseUrl();
    // Web flow: redirect back to the training calendar with a flag.
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

// GET /api/integrations/strava/status — connection + real-time sync health
// Used by the Settings card to display "Real-time sync: active / inactive"
// and the last webhook event timestamp. A webhook event in the last 7 days
// is treated as "healthy" — Strava typically pushes within seconds of upload,
// so anything older means either the user hasn't uploaded recently or the
// push subscription has gone silently stale.
router.get('/strava/status', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('strava').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const s = user.strava || {};
    const connected = !!s.accessToken && !!s.athleteId;
    const webhookLastEventAt = s.webhookLastEventAt || null;
    const webhookHealthy = !!webhookLastEventAt &&
      (Date.now() - new Date(webhookLastEventAt).getTime()) < 7 * 24 * 60 * 60 * 1000;
    // Webhook subscription health — exposes the boot bootstrap result so
    // the Settings card can tell users "real-time sync is dead" instead of
    // letting them assume webhook is fine when actually no subscription
    // was ever registered (e.g. missing SERVER_PUBLIC_URL on Render).
    let webhookSubscription = null;
    try {
      const { getWebhookStatus } = require('../services/stravaWebhookBootstrap');
      webhookSubscription = getWebhookStatus();
    } catch (_) { /* optional */ }
    res.json({
      connected,
      autoSync: !!s.autoSync,
      lastSyncDate: s.lastSyncDate || null,
      backfillState: s.backfillState || null,
      backfillCursorBefore: s.backfillCursorBefore || null,
      backfillStartedAt: s.backfillStartedAt || null,
      backfillFinishedAt: s.backfillFinishedAt || null,
      webhookLastEventAt,
      webhookHealthy,
      webhookSubscription,
      // App-wide Strava rate-limit lockout — when this is non-zero, every
      // /strava/sync and /strava/auto-sync call will short-circuit with 429.
      // UI can show a "Strava API quota — retry in N min" banner.
      rateLimitedUntil: stravaUnlockAt > Date.now() ? new Date(stravaUnlockAt).toISOString() : null,
      rateLimitedSecondsLeft: stravaLockoutSecondsRemaining(),
      // Live token-bucket usage — helpful for the diagnose-the-spike workflow.
      budget: stravaBudget.snapshot(),
    });
  } catch (error) {
    console.error('[Strava status] error:', error);
    res.status(500).json({ error: error.message || 'Failed to load Strava status' });
  }
});

// POST /api/integrations/strava/budget/reset — zero the local token bucket.
//
// When the soft estimator gets stuck at MAX (e.g. a backfill ran wild
// overnight and snapped windowUsed to 100, then reconcile never had a
// chance to snap back down), users can't manually sync until the day
// rolls over at UTC midnight. This endpoint clears the in-process
// counters so the next call goes straight to Strava — whose own
// rate-limit headers will then reconcile us to truth.
//
// Auth-gated to "admin" role so a regular user can't grief other
// tenants on the same instance. Any authenticated user can read the
// budget via /strava/status, but only admin can reset.
router.post('/strava/budget/reset', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('role email');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const before = stravaBudget.snapshot();
    stravaBudget.reset();
    const after = stravaBudget.snapshot();
    console.log(`[Strava] budget reset by ${user.email}: ${before.windowUsed}/${before.windowLimit} window, ${before.dayUsed}/${before.dayLimit} day → cleared`);
    res.json({ ok: true, before, after });
  } catch (error) {
    console.error('[Strava budget reset] error:', error);
    res.status(500).json({ error: error.message || 'Failed to reset budget' });
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

// Token-refresh logic moved to server/utils/stravaToken.js so the routes
// and the auto-sync service share a single implementation. See that file
// for the invariant that we only wipe user.strava on invalid_grant.
const { getValidStravaToken, stravaExpiresAtSeconds } = require('../utils/stravaToken');

/**
 * Streams often fail with 400 for some activity types or stream key combos; detail still loads.
 * Strava returns 400 (not 404) when any requested key is unsupported for the activity —
 * this happens with older Garmin activities that don't expose `watts` or `velocity_smooth`.
 * We retry with progressively narrower key sets to get as much data as possible.
 */
async function fetchStravaActivityStreams(token, stravaId, { bypass = false } = {}) {
  const url = `https://www.strava.com/api/v3/activities/${stravaId}/streams`;
  const KEY_SETS = [
    // With latlng (outdoor activities — GPS available)
    'time,velocity_smooth,heartrate,watts,altitude,latlng,distance,cadence',
    'time,velocity_smooth,heartrate,altitude,latlng,distance,cadence',
    'time,heartrate,altitude,latlng,distance,cadence',
    'time,heartrate,latlng,distance',
    'time,latlng,distance',
    // Without latlng (indoor / trainer activities — GPS absent causes 400)
    'time,velocity_smooth,heartrate,watts,altitude,distance,cadence',
    'time,velocity_smooth,heartrate,altitude,distance,cadence',
    'time,heartrate,altitude,distance,cadence',
    'time,heartrate,distance',
    'time,heartrate',
    // Absolute minimum fallbacks — Garmin / third-party edge cases
    'time,watts',
    'time,distance',
    'time',
  ];

  // Helper: check whether a stream key has real array data
  const hasArr = (obj, key) => {
    if (!obj || !obj[key]) return false;
    const arr = Array.isArray(obj[key].data) ? obj[key].data : (Array.isArray(obj[key]) ? obj[key] : null);
    return arr && arr.length > 0;
  };

  let bestResult = null; // keep the richest partial result across retries

  for (const keys of KEY_SETS) {
    await stravaBudget.take({ bypass });
    try {
      const r = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 45000,
        params: { keys, key_by_type: true },
      });
      let data = r.data || {};

      // Strava should return an object when key_by_type=true, but some device
      // uploads (Garmin, certain third-party apps) occasionally return an array
      // even with that flag.  Normalise to object-keyed-by-type so the rest of
      // the code can assume a consistent shape.
      if (Array.isArray(data)) {
        const normalised = {};
        for (const stream of data) {
          if (stream?.type) normalised[stream.type] = stream;
        }
        console.log(`[Strava] streams: array response normalised for ${stravaId} — keys: ${Object.keys(normalised).join(',')}`);
        data = normalised;
      }

      console.log(`[Strava] streams: keys="${keys.split(',').slice(0,3).join(',')}…" response keys=[${Object.keys(data).join(',')}] hasTime=${hasArr(data,'time')} for ${stravaId}`);

      // Prefer result that has time-series data
      if (hasArr(data, 'time')) {
        if (keys !== KEY_SETS[0]) {
          console.log(`[Strava] streams: fell back to keys="${keys}" for activity ${stravaId}`);
        }
        return data;
      }

      // Some Apple Watch / HealthKit activities have distance-based streams (no time key).
      // Keep the richest partial result so we can still return heartrate/speed/altitude/latlng.
      const richness = ['heartrate','velocity_smooth','altitude','latlng','distance','watts'].filter(k => hasArr(data, k)).length;
      if (richness > 0 && (!bestResult || richness > Object.keys(bestResult).length)) {
        bestResult = data;
      }
      // Try narrower key set in case a specific key caused the missing time
    } catch (e) {
      const st = e.response?.status;
      if (st === 400 || st === 500 || st === 502 || st === 503) {
        // 400 = unsupported key — retry narrower
        // 5xx = Strava transient error for this key set (common with Garmin uploads) — retry narrower
        console.log(`[Strava] streams: ${st} for keys="${keys.split(',').slice(0,3).join(',')}…" activity ${stravaId} — retrying narrower`);
        continue;
      }
      if (st === 404) return {};
      // For 401 (expired token), 429 (rate limit) — don't hammer further; return best so far.
      console.warn(`[Strava] streams: non-retryable error ${st} for activity ${stravaId} — returning best partial`);
      return bestResult || {};
    }
  }

  // If we never got time data but have partial streams (e.g. latlng + heartrate),
  // return the best partial result — the client will synthesise time from distance.
  if (bestResult) {
    console.log(`[Strava] streams: no time data for ${stravaId}, returning best partial (keys: ${Object.keys(bestResult).join(',')})`);
    return bestResult;
  }
  console.warn(`[Strava] streams: all KEY_SETS exhausted with no data for activity ${stravaId}`);
  return {};
}

// Helper function to delay requests to respect rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Per-activity cache for /strava/activities/:id (Strava 100/15min limit) ──
const STRAVA_ACTIVITY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const stravaActivityCache = new Map(); // key: `${userId}:${stravaId}` → { data, expiresAt }

function getCachedStravaActivity(key) {
  const hit = stravaActivityCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    stravaActivityCache.delete(key);
    return null;
  }
  return hit.data;
}

function setCachedStravaActivity(key, data) {
  stravaActivityCache.set(key, { data, expiresAt: Date.now() + STRAVA_ACTIVITY_CACHE_TTL_MS });
  // Cap size to avoid unbounded growth on long-lived processes
  if (stravaActivityCache.size > 500) {
    const firstKey = stravaActivityCache.keys().next().value;
    stravaActivityCache.delete(firstKey);
  }
}

function invalidateStravaActivityCache(userId, stravaId) {
  if (userId && stravaId) stravaActivityCache.delete(`${userId}:${stravaId}`);
}

/** Normalize Strava / Garmin sport type → 'bike' | 'run' | 'swim' | null */
function normalizeSportForNotif(sport) {
  if (!sport) return null;
  const s = String(sport).toLowerCase();
  if (/ride|bike|cycl|velo/.test(s)) return 'bike';
  if (/run|trail|treadmill|walk|hike/.test(s)) return 'run';
  if (/swim/.test(s)) return 'swim';
  return null;
}

function notifyStravaImportedPush(userId, imported, latestStravaId = null, latestSport = null, activityDoc = null) {
  const n = Number(imported);
  if (!userId || !Number.isFinite(n) || n < 1) return;

  // Expo push (mobile) — pass full activity doc so the helper can build a
  // rich "You logged a 10.2 km run!" message.
  const { notifyUserStravaActivitiesImported } = require('../utils/expoPushNotifications');
  notifyUserStravaActivitiesImported(userId, n, {
    latestActivityId: latestStravaId,
    activity: activityDoc || null,
  }).catch((e) => console.error('[Strava sync push]', e.message || e));

  // In-app notification (bell) — show sport + distance when available.
  const { sendNotification } = require('../utils/notificationHelper');
  let body;
  if (n === 1 && activityDoc) {
    const dist = activityDoc.distance >= 1000
      ? `${(activityDoc.distance / 1000).toFixed(1)} km`
      : activityDoc.distance > 0 ? `${Math.round(activityDoc.distance)} m` : null;
    const sport = normalizeSportForNotif(activityDoc.sport) || 'activity';
    body = dist ? `New ${sport} logged — ${dist}.` : `New ${sport} logged.`;
  } else {
    body = n === 1 ? '1 new activity imported from Strava.' : `${n} new activities imported from Strava.`;
  }
  sendNotification(String(userId), {
    type: 'strava_import',
    title: 'New training synced',
    body,
    resourceType: 'strava',
    sport: normalizeSportForNotif(latestSport),
    ...(latestStravaId ? { resourceId: String(latestStravaId) } : {}),
  }).catch((e) => console.error('[Strava sync notification]', e.message || e));
}

// ─── Strava webhook (push subscription) ──────────────────────────────────────
// Real-time activity sync. Strava sends a POST when an athlete creates or
// updates an activity; we fetch it and store it immediately so users don't
// have to wait for the periodic auto-sync tick.

async function fetchAndSaveStravaActivity(user, stravaActivityId) {
  const token = await getValidStravaToken(user);
  if (!token) throw new Error('No valid Strava token');
  // Wait for a budget slot — a single morning upload burst from many users
  // used to fire ~300 of these in 15 min and tip us over Strava's limit.
  await stravaBudget.take();
  const resp = await axios.get(
    `https://www.strava.com/api/v3/activities/${stravaActivityId}`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
  );
  try { stravaBudget.reconcileFromHeaders(resp.headers); } catch (_) { /* swallow */ }
  const a = resp.data;
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
        ? Number(a.weighted_average_watts) : null,
    raw: a,
  };
  const result = await StravaActivity.updateOne(
    { userId: user._id, stravaId: a.id },
    { $set: doc },
    { upsert: true }
  );

  // ── Pre-warm laps + streams so the activity modal renders fully on the
  // first open (no "loading…" round-trip to Strava when the user taps).
  // Best-effort — failures here don't block the upsert above, they'll be
  // retried lazily when the user opens the activity.
  prewarmStravaActivityExtras(user, stravaActivityId, token).catch((e) =>
    console.warn('[Strava] prewarm failed for', stravaActivityId, '-', e?.message || e)
  );

  return { activity: doc, isNew: result.upsertedCount > 0 };
}

/**
 * Fetch + cache laps and streams for a Strava activity in the background.
 *
 * Strava activity streams (HR, power, latlng) are usually unavailable for
 * 30–120 s after the upload completes — that's why webhook-imported
 * activities used to open with no map and no graphs: by the time the user
 * tapped, the lazy-fetch on /activities/:id called Strava and got 404
 * (silently swallowed), so streams stayed missing forever.
 *
 * This prewarmer retries the streams fetch on 404, with backoff up to ~5
 * minutes. Once Strava returns data we persist it into the StravaStream
 * collection so the next view of the activity is instant.
 */
async function prewarmStravaActivityExtras(user, stravaActivityId, token) {
  // 1) Laps — usually ready immediately. Persist onto the StravaActivity doc.
  try {
    await stravaBudget.take();
    const lapsResp = await axios.get(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}/laps`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 },
    );
    try { stravaBudget.reconcileFromHeaders(lapsResp.headers); } catch (_) { /* swallow */ }
    const laps = Array.isArray(lapsResp.data) ? lapsResp.data : [];
    if (laps.length > 0) {
      await StravaActivity.updateOne(
        { userId: user._id, stravaId: stravaActivityId },
        { $set: { laps } },
      );
    }
  } catch (e) {
    console.warn('[Strava] prewarm laps failed:', e?.response?.status || e?.message);
  }

  // 2) Streams — retry on 404 because Strava takes time to generate them.
  // Schedule: now, +60s, +180s, +300s. After the last try we give up and
  // the next manual user-open will retry lazily.
  const tryStreams = async () => {
    try {
      const streams = await fetchStravaActivityStreams(token, stravaActivityId);
      if (streams && Object.keys(streams).length > 0) {
        await StravaStream.updateOne(
          { userId: user._id, stravaId: stravaActivityId },
          { $set: { streams, fetchedAt: new Date() } },
          { upsert: true },
        );
        return true;
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) return false; // not ready yet — caller retries
      console.warn('[Strava] prewarm streams non-404 error:', status, e?.message);
    }
    return false;
  };

  // First attempt immediate.
  if (await tryStreams()) return;
  // Then exponential-ish backoff. Use setTimeout so we don't block the
  // webhook ack. Each attempt also re-validates the token in case 30 min
  // have passed.
  for (const delaySec of [60, 180, 300]) {
    setTimeout(async () => {
      try {
        const freshUser = await User.findById(user._id);
        if (!freshUser) return;
        const freshToken = await getValidStravaToken(freshUser);
        if (!freshToken) return;
        const streams = await fetchStravaActivityStreams(freshToken, stravaActivityId);
        if (streams && Object.keys(streams).length > 0) {
          await StravaStream.updateOne(
            { userId: user._id, stravaId: stravaActivityId },
            { $set: { streams, fetchedAt: new Date() } },
            { upsert: true },
          );
          console.log(`[Strava] prewarm streams ok after ${delaySec}s for ${stravaActivityId}`);
        }
      } catch (_) { /* swallow — final user-open will retry */ }
    }, delaySec * 1000);
  }
}

// GET /api/integrations/strava/webhook — subscription verification handshake
router.get('/strava/webhook', (req, res) => {
  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'lachart-strava-webhook';
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[StravaWebhook] subscription verified');
    return res.status(200).json({ 'hub.challenge': challenge });
  }
  console.warn('[StravaWebhook] verification failed', { mode, hasChallenge: !!challenge });
  res.sendStatus(403);
});

// POST /api/integrations/strava/webhook — receive activity events
router.post('/strava/webhook', async (req, res) => {
  // ACK fast (Strava expects 200 within 2 s; processing happens async)
  res.sendStatus(200);

  const event = req.body || {};
  const { aspect_type, object_type, object_id, owner_id } = event;

  try {
    if (object_type !== 'activity') return; // ignore athlete events
    if (!owner_id || !object_id) return;

    // Map Strava owner_id → LaChart user
    const user = await User.findOne({ 'strava.athleteId': Number(owner_id) });
    if (!user) {
      console.warn('[StravaWebhook] no user for athlete', owner_id);
      return;
    }

    if (aspect_type === 'create' || aspect_type === 'update') {
      const { activity, isNew } = await fetchAndSaveStravaActivity(user, object_id);
      // Update lastSyncDate so the scheduler doesn't redundantly re-fetch this
      // activity on its next tick (the webhook already handled it).
      // Also stamp webhookLastEventAt so the UI / /strava/status endpoint can
      // distinguish "real-time sync working" from "falling back to polling".
      const eventStamp = new Date();
      await User.findByIdAndUpdate(user._id, {
        'strava.lastSyncDate': eventStamp,
        'strava.webhookLastEventAt': eventStamp,
      });
      if (aspect_type === 'create' && isNew) {
        notifyStravaImportedPush(user._id, 1, object_id, activity?.sport, activity);
      }
      console.log(`[StravaWebhook] ${aspect_type} activity ${object_id} for user ${user._id} (new=${isNew})`);
    } else if (aspect_type === 'delete') {
      await StravaActivity.deleteOne({ userId: user._id, stravaId: Number(object_id) });
      await User.findByIdAndUpdate(user._id, { 'strava.webhookLastEventAt': new Date() });
      console.log(`[StravaWebhook] deleted activity ${object_id} for user ${user._id}`);
    }
  } catch (err) {
    console.error('[StravaWebhook] processing error:', err.message || err);
  }
});

// POST /api/integrations/strava/webhook/subscribe — admin-only bootstrap helper
// curl -X POST https://lachart.onrender.com/api/integrations/strava/webhook/subscribe \
//   -H "Authorization: Bearer <admin-jwt>"
router.post('/strava/webhook/subscribe', verifyToken, async (req, res) => {
  try {
    const u = await User.findById(req.user.userId).select('admin role').lean();
    if (!u || !(u.admin === true || ['admin'].includes(String(u.role || '').toLowerCase()))) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const callbackUrl = process.env.STRAVA_WEBHOOK_CALLBACK_URL
      || `${(process.env.SERVER_PUBLIC_URL || '').replace(/\/+$/, '')}/api/integrations/strava/webhook`;
    const verifyTokenStr = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'lachart-strava-webhook';
    if (!callbackUrl || !callbackUrl.startsWith('http')) {
      return res.status(400).json({ error: 'STRAVA_WEBHOOK_CALLBACK_URL or SERVER_PUBLIC_URL must be set' });
    }
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: verifyTokenStr,
    });
    const resp = await axios.post(
      `https://www.strava.com/api/v3/push_subscriptions?${params.toString()}`
    );
    res.json({ ok: true, subscription: resp.data, callbackUrl });
  } catch (e) {
    console.error('[StravaWebhook] subscribe error:', e.response?.data || e.message);
    res.status(500).json({ error: 'subscribe_failed', details: e.response?.data || e.message });
  }
});

// GET /api/integrations/strava/webhook/subscriptions — list active subs (admin)
router.get('/strava/webhook/subscriptions', verifyToken, async (req, res) => {
  try {
    const u = await User.findById(req.user.userId).select('admin role').lean();
    if (!u || !(u.admin === true || ['admin'].includes(String(u.role || '').toLowerCase()))) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const params = new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
    });
    const resp = await axios.get(`https://www.strava.com/api/v3/push_subscriptions?${params.toString()}`);
    res.json(resp.data);
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// POST /api/integrations/strava/sync (basic history fetch)
router.post('/strava/sync', verifyToken, async (req, res) => {
  let imported = 0;
  let updated = 0;
  let total = 0;
  const lockKey = String(req.user?.userId || '');

  // App-wide Strava lockout — return 429 immediately without touching Strava.
  if (bailIfStravaLocked(res)) return;

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

    // Optional: support 'since' parameter to fetch activities after a specific date
    const { since } = req.body || {};
    const params = { per_page };
    if (since) {
      params.after = new Date(since).getTime() / 1000; // Strava expects Unix timestamp
    }

    // Page cap scales with the `since` window — there's no reason to scan
    // 200 pages (20 000 activities) for a 7-day refresh request. The old
    // blanket 200-page ceiling was the main reason a single user tapping
    // "Sync now" could burn through the entire Strava 600 req/15 min quota
    // and force everyone (including the webhook handler) into a 429 wall.
    // Heuristic: ~25 activities/day for the most active multi-sport athlete,
    // round generously to 50/day → 1 page per 2 days, floor 3, cap 20.
    let maxPages;
    if (since) {
      const days = Math.max(1, Math.ceil((Date.now() - new Date(since).getTime()) / (24 * 60 * 60 * 1000)));
      maxPages = Math.min(20, Math.max(3, Math.ceil(days / 2)));
    } else {
      maxPages = 50; // No `since` = full-history request, but still capped so one user can't drain quota.
    }
    console.log(`[/strava/sync] page cap=${maxPages} (since=${since || 'none'})`);
    
    // Strava rate limit: 600 requests per 15 minutes = ~1 request per 1.5 seconds
    // Add delay between requests to avoid hitting rate limit
    const delayBetweenRequests = 2000; // 2 seconds between requests (conservative)
    
    console.log(`Starting Strava sync for user ${user._id}, max pages: ${maxPages}`);
    
    // User-initiated sync = bypass the soft budget for the FIRST page.
    // A user clicking "Sync now" should never get rejected by our own
    // conservative estimator — Strava will return a real 429 if we're
    // truly over, and that's handled in the catch block below. The
    // bypass still increments the counter so subsequent automated
    // calls back off. Default is false (safe) so auto-sync / webhook
    // paths keep the normal soft-budget gate.
    const userInitiated = req.query.userInitiated === 'true' || req.body?.userInitiated === true;
    while (page <= maxPages) {
      try {
        console.log(`Fetching page ${page}...`);
        // Only the FIRST page uses bypass; if Strava lets that through
        // we know we're not actually rate-limited and subsequent pages
        // can use the normal budget gate. This keeps a manual click
        // from accidentally draining 50 pages in one shot.
        await stravaBudget.take({ bypass: userInitiated && page === 1 });

        const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
          headers: { Authorization: `Bearer ${token}` },
          params: { ...params, page },
          timeout: 30000 // 30 second timeout per request
        });
        // Snap our local counter to whatever Strava just told us in the
        // response headers — protects against drift from concurrent
        // processes sharing the same Strava app credentials.
        stravaBudget.reconcileFromHeaders(resp.headers);

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

          // Remember the lockout app-wide so every subsequent request
          // short-circuits without burning more quota on the same 429.
          stravaNoteRateLimit(retryAfter);

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
    // Successful path through the Strava API → quota window is healthy.
    // Clear any prior lockout so we don't keep short-circuiting.
    stravaClearRateLimit();

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
      stravaNoteRateLimit(retryAfter);
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

    // Local-budget exhaustion (our own token bucket said "no" for longer than
    // MAX_WAIT_MS). Surface as a 429 with retryAfter so the client shows a
    // friendly "try again in N min" toast instead of a generic 500.
    if (err.code === 'STRAVA_BUDGET_EXHAUSTED') {
      const retryAfter = Number(err.retryAfterSec) || 60;
      return res.status(429).json({
        error: 'Strava sync deferred',
        message: `Strava API budget is currently saturated (likely an in-progress historical backfill or a busy upload window). Please try again in ${Math.ceil(retryAfter / 60)} min.`,
        retryAfter,
        imported,
        updated,
        totalFetched: total,
        partial: total > 0,
      });
    }

    // Token-refresh wiped the connection mid-flight — return 400, not 500,
    // so the client doesn't keep retrying with stale credentials.
    if (/no valid strava token|invalid strava token/i.test(err.message || '')) {
      return res.status(400).json({
        error: 'Invalid or expired Strava token. Reconnect Strava in Settings.',
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
  // App-wide Strava lockout — bail before doing anything that would call Strava.
  if (bailIfStravaLocked(res)) return;
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.strava?.accessToken) {
      return res.status(400).json({ error: 'Strava not connected' });
    }

    // Server-side cooldown only applies to background / opportunistic syncs
    // (app cold-start, polling). User-initiated syncs — pull-to-refresh, a
    // "Sync now" button tap — set `force: true` and bypass the gap so the
    // user always sees fresh data, even right after a webhook event.
    const isForced = req.body && req.body.force === true;
    const MIN_AUTO_SYNC_GAP_MS = 60 * 1000; // 1 min for background syncs (was 5 min)
    if (!isForced && user.strava?.lastSyncDate) {
      const msSinceLast = Date.now() - new Date(user.strava.lastSyncDate).getTime();
      if (msSinceLast < MIN_AUTO_SYNC_GAP_MS) {
        return res.json({ imported: 0, updated: 0, skipped: true, message: 'Synced recently, skipping' });
      }
    }

    // Use the service function. Thread `force` through so the service skips
    // its own autoSync-disabled bail-out — a manual "Sync now" must always
    // pull, even for users who keep background auto-sync turned off.
    const { syncStravaForUser } = require('../services/stravaAutoSyncService');
    const result = await syncStravaForUser(user, { force: isForced });
    
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
    
    res.json({
      imported: result.imported,
      updated: result.updated,
      message: result.message,
      latestActivityId: result.latestActivityId || null,
    });
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
    console.log('Garmin OAuth token response keys:', Object.keys(tokenData));
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
      const { GarminConnect } = require('garmin-connect');
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
    // Use $unset to cleanly remove the garmin subdocument from MongoDB.
    // Setting user.garmin = undefined via save() may leave the field in the DB.
    await User.findByIdAndUpdate(
      req.user.userId,
      { $unset: { garmin: '' } },
      { new: true }
    );

    res.json({ success: true, message: 'Garmin disconnected' });
  } catch (error) {
    console.error('Error disconnecting Garmin:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect Garmin' });
  }
});

// Helper function to get Garmin activities using garmin-connect library
async function getGarminActivities(user, since = null) {
  // ── OAuth path ────────────────────────────────────────────────────────────
  // Garmin Health API max window per request = 86400 seconds (1 day).
  // We loop through 1-day chunks from startSec → nowSec.
  if (user?.garmin?.refreshToken) {
    const CHUNK_SEC = 86400; // Garmin API hard limit: 1 day per request
    const nowSec = Math.floor(Date.now() / 1000);
    let startSec = nowSec - 7 * 24 * 3600; // default: last 7 days for "Sync Now"
    if (since) {
      const d = new Date(since);
      if (!Number.isNaN(d.getTime())) {
        startSec = Math.floor(d.getTime() / 1000);
      }
    }

    const activitiesUrl = `${getGarminWellnessApiBaseUrl()}/rest/activities`;
    const allActivities = [];
    let cursor = startSec;

    while (cursor < nowSec) {
      const windowEnd = Math.min(cursor + CHUNK_SEC, nowSec);
      const tokenData = await getValidGarminToken(user); // refreshes token if needed
      console.log(`Garmin OAuth: fetching activities ${new Date(cursor * 1000).toISOString().slice(0,10)} → ${new Date(windowEnd * 1000).toISOString().slice(0,10)}`);

      let resp;
      try {
        resp = await axios.get(activitiesUrl, {
          headers: { Authorization: `${tokenData.tokenType} ${tokenData.accessToken}` },
          params: {
            uploadStartTimeInSeconds: cursor,
            uploadEndTimeInSeconds: windowEnd
          },
          timeout: 15000
        });
      } catch (apiErr) {
        const status = apiErr.response?.status;
        const body   = apiErr.response?.data;
        const bodyStr = typeof body === 'object' ? JSON.stringify(body) : (body || '');
        console.error(`Garmin activity API error ${status}:`, body || apiErr.message);
        if (bodyStr.includes('InvalidPullTokenException')) {
          throw new Error(
            `InvalidPullTokenException: your Garmin OAuth token does not have activity pull permission. ` +
            `Please disconnect and reconnect your Garmin account, and make sure to enable the ` +
            `"Activities" and "Historical Data" toggles on the Garmin consent screen. ` +
            `If this persists, your Garmin Health API app may need SUMMARY_PULL permission enabled ` +
            `in the Garmin developer portal (health.developer.garmin.com).`
          );
        }
        if (status === 401 || status === 403) {
          throw new Error(
            `Garmin API access denied (${status}). Try reconnecting your Garmin account. ` +
            `Error: ${bodyStr || apiErr.message}`
          );
        }
        throw new Error(
          `Garmin API returned ${status || 'network error'}: ${bodyStr || apiErr.message}`
        );
      }

      const batch = Array.isArray(resp.data)
        ? resp.data
        : Array.isArray(resp.data?.activities)
          ? resp.data.activities
          : [];

      allActivities.push(...batch);
      cursor = windowEnd;
    }

    console.log(`Garmin OAuth: fetched ${allActivities.length} activities total`);
    return allActivities;
  }

  // ── Username/password path (legacy garmin-connect library) ────────────────
  try {
    const { GarminConnect } = require('garmin-connect');

    // Decode credentials from base64
    const credentials = Buffer.from(user.garmin.accessToken, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (!username || !password) {
      throw new Error('Invalid Garmin credentials format (base64 decode failed)');
    }

    const garminClient = new GarminConnect({ username, password });
    await garminClient.login();

    let activities = [];
    const startDate = since ? new Date(since) : null;
    let start = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      try {
        const batch = await garminClient.getActivities(start, limit);

        if (!batch || batch.length === 0) {
          hasMore = false;
          break;
        }

        if (startDate) {
          const filtered = batch.filter(a => {
            const d = new Date(a.startTimeGMT || a.startTimeLocal);
            return d >= startDate;
          });
          activities = activities.concat(filtered);
          if (batch.length < limit || filtered.length < batch.length) hasMore = false;
        } else {
          activities = activities.concat(batch);
        }

        if (batch.length < limit) {
          hasMore = false;
        } else {
          start += limit;
        }

        // Safety cap
        if (activities.length >= 1000) hasMore = false;
      } catch (batchError) {
        console.error('Error fetching Garmin activities batch:', batchError);
        hasMore = false;
      }
    }

    console.log(`Fetched ${activities.length} Garmin activities (username/password)`);
    return activities;
  } catch (error) {
    console.error('Error fetching Garmin activities (username/password path):', error);
    // If login fails, stored credentials are invalid — clear them
    if (error.message && (error.message.includes('login') || error.message.includes('credentials'))) {
      await User.findByIdAndUpdate(user._id, { $unset: { garmin: '' } });
    }
    throw new Error(`Garmin login failed: ${error.message}`);
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

    const { since } = req.body || {};

    let activities;
    try {
      activities = await getGarminActivities(user, since);
    } catch (apiErr) {
      // Surface the real Garmin API error to the frontend
      console.error('Garmin API error during sync:', apiErr.message);
      return res.status(502).json({
        error: 'Garmin API error',
        message: apiErr.message
      });
    }

    console.log(`Garmin sync: fetched ${activities.length} activities for user ${user._id}`);
    const { imported, updated, total } = await upsertGarminActivities(user, activities);
    console.log(`Garmin sync done: imported ${imported}, updated ${updated}, total ${total}`);

    // Stamp sync date
    await User.findByIdAndUpdate(user._id, { 'garmin.lastSyncDate': new Date() });

    res.json({ imported, updated, totalFetched: total, status: 'ok' });
  } catch (err) {
    console.error('Garmin sync error:', err);
    res.status(500).json({
      error: 'Garmin sync failed',
      message: err.message
    });
  }
});

// POST /api/integrations/garmin/sync-history
// Full history import: 2 years back, OAuth path loops in 1-day chunks (Garmin API max = 86400s).
router.post('/garmin/sync-history', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.garmin?.accessToken) {
      return res.status(400).json({ error: 'Garmin not connected' });
    }

    // Start from 2 years ago — getGarminActivities handles 1-day chunk looping for OAuth
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000);

    let activities;
    try {
      activities = await getGarminActivities(user, twoYearsAgo);
    } catch (apiErr) {
      console.error('Garmin history sync API error:', apiErr.message);
      return res.status(502).json({ error: 'Garmin API error', message: apiErr.message });
    }

    console.log(`Garmin history: fetched ${activities.length} activities over 2 years`);
    const { imported, updated, total } = await upsertGarminActivities(user, activities);
    await User.findByIdAndUpdate(user._id, { 'garmin.lastSyncDate': new Date() });
    console.log(`Garmin history done: ${imported} imported, ${updated} updated`);
    res.json({ imported, updated, totalFetched: total, status: 'ok' });
  } catch (err) {
    console.error('Garmin history sync error:', err);
    res.status(500).json({ error: 'Garmin history sync failed', message: err.message });
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

// GET /api/integrations/garmin/test-connection
// Validates the stored Garmin token by calling the Wellness user-id endpoint.
// Returns { ok: true, athleteId } or { ok: false, error, status }.
router.get('/garmin/test-connection', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user?.garmin?.accessToken) {
      return res.json({ ok: false, error: 'Garmin not connected' });
    }

    // OAuth path
    if (user.garmin.refreshToken) {
      let tokenData;
      try {
        tokenData = await getValidGarminToken(user);
      } catch (tokenErr) {
        return res.json({ ok: false, error: `Token refresh failed: ${tokenErr.message}` });
      }

      const authHeader = { Authorization: `${tokenData.tokenType} ${tokenData.accessToken}` };

      // 1. Test user/id (basic connectivity)
      let userIdResult = { ok: false, status: null, body: null };
      try {
        const r = await axios.get(`${getGarminWellnessApiBaseUrl()}/rest/user/id`, {
          headers: authHeader, timeout: 15000
        });
        userIdResult = { ok: true, status: r.status, body: r.data };
      } catch (e) {
        userIdResult = {
          ok: false,
          status: e.response?.status || null,
          body: e.response?.data || e.message
        };
      }

      // 2. Check user permissions — shows exactly what this token is allowed to pull
      let permissionsResult = { ok: false, status: null, permissions: null };
      try {
        const r = await axios.get(`${getGarminWellnessApiBaseUrl()}/rest/user/permissions`, {
          headers: authHeader, timeout: 15000
        });
        permissionsResult = { ok: true, status: r.status, permissions: r.data };
        console.log('Garmin user permissions:', JSON.stringify(r.data));
      } catch (e) {
        permissionsResult = {
          ok: false,
          status: e.response?.status || null,
          body: e.response?.data || e.message
        };
      }

      // 3. Test activities endpoint — must send BOTH params, max window = 86400s (1 day)
      const activitiesUrl = `${getGarminWellnessApiBaseUrl()}/rest/activities`;
      const nowSec = Math.floor(Date.now() / 1000);
      let activitiesResult = { ok: false, status: null, body: null };
      try {
        const r = await axios.get(activitiesUrl, {
          headers: authHeader,
          params: {
            uploadStartTimeInSeconds: nowSec - 86400,
            uploadEndTimeInSeconds: nowSec
          },
          timeout: 15000
        });
        const count = Array.isArray(r.data) ? r.data.length
          : Array.isArray(r.data?.activities) ? r.data.activities.length : 0;
        activitiesResult = { ok: true, status: r.status, count };
      } catch (e) {
        activitiesResult = {
          ok: false,
          status: e.response?.status || null,
          body: e.response?.data || e.message
        };
      }

      return res.json({
        ok: userIdResult.ok && activitiesResult.ok,
        method: 'oauth',
        athleteId: userIdResult.body?.userId || userIdResult.body?.id || null,
        userIdEndpoint: userIdResult,
        permissionsEndpoint: permissionsResult,
        activitiesEndpoint: { url: activitiesUrl, ...activitiesResult }
      });
    }

    // Username/password path — just check the token format
    try {
      const creds = Buffer.from(user.garmin.accessToken, 'base64').toString('utf-8');
      const [u] = creds.split(':');
      return res.json({ ok: !!u, athleteId: u || null, method: 'username_password', note: 'Credential format OK — login tested on next sync' });
    } catch {
      return res.json({ ok: false, error: 'Invalid credential format', method: 'username_password' });
    }
  } catch (err) {
    console.error('Garmin test-connection error:', err);
    res.status(500).json({ ok: false, error: err.message });
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

      // Compute intensity signals from laps for client-side scoring
      const lapHrs = laps
        .map(l => l.avgHeartRate ?? l.avg_heart_rate ?? l.average_heartrate ?? l.averageHeartRate ?? 0)
        .filter(v => Number(v) > 0).map(Number);
      const lapWatts = laps
        .map(l => l.avgPower ?? l.avg_power ?? l.average_watts ?? l.averageWatts ?? 0)
        .filter(v => Number(v) > 0).map(Number);
      const lapTimes = laps
        .map(l => l.moving_time ?? l.totalTimerTime ?? l.totalElapsedTime ?? l.elapsed_time ?? 0)
        .filter(v => Number(v) > 0).map(Number);
      const arrAvg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
      const avgHr = lapHrs.length ? Math.round(arrAvg(lapHrs)) : null;
      const maxHr = lapHrs.length ? Math.max(...lapHrs) : null;
      const avgWatts = lapWatts.length ? Math.round(arrAvg(lapWatts)) : null;
      // Coefficient of variation of lap durations — low value = regular/structured intervals
      const lapDurationCv = lapTimes.length >= 2
        ? +( Math.sqrt(arrAvg(lapTimes.map(v => (v - arrAvg(lapTimes)) ** 2))) / arrAvg(lapTimes) ).toFixed(3)
        : null;

      activities.push({
        _id: a._id,
        stravaId: a.stravaId,
        name: a.name || 'Activity',
        sport: a.sport,
        startDate: a.startDate,
        lapCount: laps.length,
        missingLactateCount: laps.length === 0 ? null : missingLactateCount,
        openPath,
        // Intensity signals for smart scoring
        avgHr,
        maxHr,
        avgWatts,
        lapDurationCv,
        movingTime: a.movingTime || a.moving_time || null,
        distance: a.distance || null,
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

    // Filter laps to exactly match what syncTrainingFromSource used for results,
    // so the chart bars align 1-to-1 with table rows.
    const getLapDur = (lap) => {
      const t = lap.moving_time ?? lap.movingTime ?? lap.elapsed_time ?? lap.elapsedTime ?? lap.duration ?? 0;
      return typeof t === 'number' ? t : parseFloat(t) || 0;
    };
    const filteredLapsForChart = lapsForSync.filter((lap) => {
      const dur = getLapDur(lap);
      if (dur <= 0) return false;                                               // zero-duration
      if (dur < 10) return false;                                               // micro-lap / GPS artefact
      if (activityDurationSec > 0 && dur >= activityDurationSec * 0.95) return false; // full-activity single lap
      return true;
    });

    return res.json({ training, laps: filteredLapsForChart });
  } catch (error) {
    console.error('[integrations] training-for-lactate-form:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
});

// ── Similar activities (for Compare tab) ─────────────────────────────────────
// GET /api/integrations/activities/similar
// Must be declared BEFORE /activities to avoid the :id wildcard catching it.
router.get('/activities/similar', verifyToken, async (req, res) => {
  try {
    const { title, category, sport, lactate, excludeId, limit = 30 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 30, 100);

    // Resolve target user (supports coach athleteId param)
    const resolved = await resolveIntegrationTargetUserId(req);
    if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
    const { targetUserId } = resolved;

    // Build OR filter conditions based on provided params
    const orConditions = [];
    if (title) {
      const titleRegex = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      orConditions.push(
        { titleManual: titleRegex },
        { titleAuto: titleRegex },
        { title: titleRegex },
        { name: titleRegex }
      );
    }
    if (category) {
      orConditions.push({ category });
    }
    if (lactate != null && !isNaN(parseFloat(lactate))) {
      const la = parseFloat(lactate);
      orConditions.push({ lactate: { $gte: la - 1.5, $lte: la + 1.5, $gt: 0 } });
    }

    if (orConditions.length === 0) {
      return res.json([]);
    }

    const FitTraining = require('../models/fitTraining');

    // Build queries for each source
    const stravaFilter = { userId: targetUserId.toString(), $or: orConditions };
    if (sport) stravaFilter.sport = sport;
    if (excludeId) {
      const numId = parseInt(String(excludeId).replace(/^strava-/i, ''), 10);
      if (!isNaN(numId)) stravaFilter.stravaId = { $ne: numId };
    }

    const fitFilter = { athleteId: targetUserId.toString(), $or: orConditions };
    if (sport) fitFilter.sport = sport;
    if (excludeId && String(excludeId).startsWith('fit-')) {
      fitFilter._id = { $ne: String(excludeId).replace(/^fit-/, '') };
    }

    const trainingFilter = { athleteId: targetUserId.toString(), $or: orConditions.filter(c => c.title || c.category) };
    if (sport) trainingFilter.sport = sport;
    if (excludeId && String(excludeId).startsWith('regular-')) {
      trainingFilter._id = { $ne: String(excludeId).replace(/^regular-/, '') };
    }

    const [stravaActs, fitActs, trainingActs] = await Promise.all([
      StravaActivity.find(stravaFilter)
        .sort({ startDate: -1 })
        .limit(limitNum)
        .select('stravaId titleManual category lactate sport startDate distance elapsed_time average_heartrate average_watts average_speed total_elevation_gain laps')
        .lean(),
      FitTraining.find(fitFilter)
        .sort({ timestamp: -1 })
        .limit(limitNum)
        .select('_id titleManual titleAuto category lactate sport timestamp totalDistance totalElapsedTime avgHeartRate avgPower avgSpeed laps')
        .lean(),
      trainingFilter.$or && trainingFilter.$or.length > 0
        ? Training.find(trainingFilter)
            .sort({ date: -1 })
            .limit(limitNum)
            .select('_id title category sport date duration results')
            .lean()
        : Promise.resolve([]),
    ]);

    // Normalize to unified shape
    const unified = [
      ...stravaActs.map(a => ({
        id: `strava-${a.stravaId}`,
        type: 'strava',
        date: a.startDate,
        title: a.titleManual || a.name || 'Activity',
        category: a.category || null,
        lactate: a.lactate != null ? Number(a.lactate) : null,
        sport: a.sport || null,
        distance: Number(a.distance || 0),
        duration: Number(a.elapsed_time || 0),
        avgHr: Number(a.average_heartrate || 0),
        avgPower: Number(a.average_watts || 0),
        avgSpeed: Number(a.average_speed || 0),
        elevation: Number(a.total_elevation_gain || 0),
        laps: Array.isArray(a.laps) ? a.laps : [],
      })),
      ...fitActs.map(a => ({
        id: `fit-${a._id}`,
        type: 'fit',
        date: a.timestamp,
        title: a.titleManual || a.titleAuto || 'FIT Activity',
        category: a.category || null,
        lactate: a.lactate != null ? Number(a.lactate) : null,
        sport: a.sport || null,
        distance: Number(a.totalDistance || 0),
        duration: Number(a.totalElapsedTime || 0),
        avgHr: Number(a.avgHeartRate || 0),
        avgPower: Number(a.avgPower || 0),
        avgSpeed: Number(a.avgSpeed || 0),
        elevation: 0,
        laps: Array.isArray(a.laps) ? a.laps : [],
      })),
      ...trainingActs.map(a => ({
        id: `regular-${a._id}`,
        type: 'regular',
        date: a.date,
        title: a.title || 'Training',
        category: a.category || null,
        lactate: null,
        sport: a.sport || null,
        distance: 0,
        duration: 0,
        avgHr: 0,
        avgPower: 0,
        avgSpeed: 0,
        elevation: 0,
        laps: [],
      })),
    ];

    // Sort by date descending
    unified.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json(unified.slice(0, limitNum));
  } catch (err) {
    console.error('[integrations] similar activities:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
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
    const isCoachLikeActivities = ['coach', 'tester', 'testing', 'admin'].includes(requesterRole) ||
      (user.admin === true && requesterRole !== 'athlete');

    // Determine which userId to use
    let targetUserId = userId;
    if (req.query.athleteId) {
      // If query parameter is provided, validate access
      if (isCoachLikeActivities) {
        // Coach / tester / admin: own or linked athletes' activities
        if (req.query.athleteId === userId.toString()) {
          targetUserId = userId;
        } else {
          const athlete = await User.findById(req.query.athleteId);
          if (!athlete) {
            return res.status(404).json({ error: 'Athlete not found' });
          }
          // Admin can access any athlete; coaches/testers must be linked
          if (requesterRole !== 'admin' && !athleteHasCoachUser(athlete, userId)) {
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
    
    const [stravaActs, garminActs, appleHealthActs] = await Promise.all([
      StravaActivity.find({
        userId: targetUserId.toString(),
        startDate: { $gte: dateCutoff }
      })
      .sort({ startDate: -1 })
        .limit(activityLimit)
      .select(
        'stravaId name titleManual category sport startDate elapsedTime movingTime distance averageSpeed averageHeartRate average_heartrate averagePower weightedAveragePower lactate laps.lactate'
      )
        .lean(),
      GarminActivity.find({
        userId: targetUserId.toString(),
        startDate: { $gte: dateCutoff }
      })
        .sort({ startDate: -1 })
        .limit(activityLimit)
        .select('garminId name titleManual category sport startDate elapsedTime movingTime distance averageSpeed averageHeartRate averagePower lactate laps.lactate')
        .lean(),
      AppleHealthActivity.find({
        userId: targetUserId,
        startDate: { $gte: dateCutoff },
      })
        .sort({ startDate: -1 })
        .limit(activityLimit)
        .lean(),
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
      })),
      // Apple Health uses different field names — normalize to the same shape
      // the calendar/dedup expect (elapsedTime/movingTime/distance/averageHeartRate).
      ...appleHealthActs.map(a => ({
        ...a,
        elapsedTime:      a.durationSeconds ?? null,
        movingTime:       a.durationSeconds ?? null,
        distance:         a.distanceMeters ?? null,
        averageHeartRate: a.avgHeartRate ?? null,
        source: 'apple_health',
        sourceId: a.healthKitId,
      })),
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

// Connection status — NOT cached (connect/disconnect must be reflected immediately)
router.get('/status', verifyToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    let targetUser = requester;

    // Coach/admin can check an athlete's integration status via ?athleteId=
    if (req.query.athleteId && req.query.athleteId !== String(requester._id)) {
      const requesterRole = String(requester?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(requesterRole) || requester?.admin === true;
      if (isCoachLike) {
        const athlete = await User.findById(req.query.athleteId).select('strava garmin');
        if (athlete) targetUser = athlete;
      }
    }

    const stravaConnected = Boolean(targetUser?.strava?.accessToken);
    const garminConnected = Boolean(targetUser?.garmin?.accessToken);
    res.json({
      stravaConnected,
      garminConnected,
      garminAutoSync: Boolean(targetUser?.garmin?.autoSync),
      garminLastSync: targetUser?.garmin?.lastSyncDate || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'status_failed' });
  }
});

// Detailed activity with streams (time, speed, HR, power)
// Supports both MongoDB _id and stravaId
// DELETE /api/integrations/strava/activities/:id — remove an imported
// Strava activity from LaChart. This does NOT touch the activity on
// Strava itself (we have no permission to delete from the user's
// Strava account), only our local copy. We also wipe the cached
// streams document so re-import via webhook/sync starts fresh.
//
// Coach scope: the activity is matched by (userId, stravaId). A coach
// can delete an athlete's activity only if they pass ?athleteId=<id>
// AND the athlete is linked to them via the coach relationship — same
// rule the GET path uses (see resolveStravaActivityScope below).
router.delete('/strava/activities/:id', verifyToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId);
    if (!requester) return res.status(404).json({ error: 'User not found' });
    const role = String(requester.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role) ||
      (requester.admin === true && role !== 'athlete');

    let id = req.params.id;
    if (typeof id === 'string') id = id.replace(/^strava-/i, '');
    const stravaId = Number(id);
    if (!Number.isFinite(stravaId)) {
      return res.status(400).json({ error: 'Invalid Strava activity id' });
    }

    // Determine target user — same logic as the detail GET handler.
    let targetUserId = requester._id;
    const athleteIdParam = req.query.athleteId;
    if (athleteIdParam && isCoachLike) {
      // Verify coach-athlete link before letting a coach delete.
      const athlete = await User.findById(athleteIdParam).select('coaches').lean();
      if (!athlete) return res.status(404).json({ error: 'Athlete not found' });
      const isLinkedCoach = Array.isArray(athlete.coaches) &&
        athlete.coaches.some((c) => String(c) === String(requester._id));
      if (!isLinkedCoach && role !== 'admin') {
        return res.status(403).json({ error: 'Not authorised to manage this athlete' });
      }
      targetUserId = athlete._id;
    }

    const StravaStream = require('../models/StravaStream');
    const [actDel, streamDel] = await Promise.all([
      StravaActivity.deleteOne({ userId: targetUserId, stravaId }),
      StravaStream.deleteOne({ userId: targetUserId, stravaId }).catch(() => ({ deletedCount: 0 })),
    ]);

    if (actDel.deletedCount === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Bust the in-process detail cache so a subsequent GET doesn't
    // resurrect the doc from memory.
    invalidateStravaActivityCache(targetUserId, stravaId);

    console.log(`[Strava] user ${requester._id} deleted activity ${stravaId} for user ${targetUserId} (activity=${actDel.deletedCount}, streams=${streamDel.deletedCount})`);
    res.json({ ok: true, deleted: { activity: actDel.deletedCount, streams: streamDel.deletedCount } });
  } catch (err) {
    console.error('[Strava delete] error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Failed to delete activity' });
  }
});

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
    const isCoachLikeDetail = ['coach', 'tester', 'testing', 'admin'].includes(detailRequesterRole) ||
      (user.admin === true && detailRequesterRole !== 'athlete');

    // Determine which userId to use (for coach viewing athlete's activities)
    let targetUserId = user._id.toString();
    if (req.query.athleteId) {
      if (isCoachLikeDetail) {
        if (req.query.athleteId === user._id.toString()) {
          targetUserId = user._id.toString();
        } else {
          const athlete = await User.findById(req.query.athleteId);
          if (!athlete) {
            return res.status(404).json({ error: 'Athlete not found' });
          }
          // Admin can access any athlete; coaches/testers must be linked
          if (detailRequesterRole !== 'admin' && !athleteHasCoachUser(athlete, user._id)) {
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
    } else if (isCoachLikeDetail) {
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
      
      // Verify access for coach/admin
      if (isCoachLikeDetail && savedActivity.userId.toString() !== user._id.toString()) {
        // Admin can view any activity; coaches/testers must be linked to the athlete
        if (detailRequesterRole !== 'admin') {
          const activityOwner = await User.findById(savedActivity.userId);
          if (!activityOwner || !athleteHasCoachUser(activityOwner, user._id)) {
            return res.status(403).json({ error: 'You are not authorized to view this activity' });
          }
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
      
      // If not found and we're a coach/admin, try to find the activity and verify it belongs to coach or their athlete
      if (!savedActivity && isCoachLikeDetail) {
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
    
    // ── Cache check (avoid hammering Strava: 100 req / 15 min limit) ──
    const cacheKey = `${targetUserId}:${stravaId}`;
    const wantsRefreshEarly = String(req.query?.refresh || '') === '1';
    // When the user force-refreshes, bust the in-memory cache so we go straight
    // to Strava instead of returning a stale (possibly streams-empty) cached copy.
    if (wantsRefreshEarly) invalidateStravaActivityCache(targetUserId, stravaId);
    const cached = wantsRefreshEarly ? null : getCachedStravaActivity(cacheKey);
    let detailResp = cached ? { data: cached.detail } : null;
    // Only use cached streams if they actually contain time-series data.
    const cachedStreamsHaveData = cached?.streams &&
      Array.isArray(cached.streams.time?.data) && cached.streams.time.data.length > 0;
    let streamsData = cachedStreamsHaveData ? cached.streams : {};
    let laps = cached ? (cached.laps || []) : [];

    // Prefer the persisted Strava raw payload — activities are immutable once
    // recorded, and user-side title/description/category are stored separately.
    if (!cached && !req.query?.refresh && savedActivity?.raw && Object.keys(savedActivity.raw).length > 5) {
      detailResp = { data: savedActivity.raw };
    }
    if (!cached && !detailResp) try {
      detailResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000
      });
      // Persist for future reads
      try {
        await StravaActivity.updateOne(
          { userId: targetUser._id, stravaId },
          { $set: { raw: detailResp.data } }
        );
      } catch {}
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
            // Never forward Strava's 401 to the client — it would trigger app-wide logout.
            // Use 400 (bad request / token issue) or 502 (bad gateway) instead.
            const retryStatus = retryError.response?.status;
            const safeStatus = retryStatus === 401 ? 400 : (retryStatus || 500);
            return res.status(safeStatus).json({
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
        // Never forward Strava's 401 to the client — it would trigger app-wide logout.
        const errStatus = apiError.response?.status;
        const safeStatus = errStatus === 401 ? 400 : (errStatus || 500);
        return res.status(safeStatus).json({
          error: 'Failed to fetch activity from Strava',
          details: apiError.response?.data || apiError.message
        });
      }
    }

    if (!cached || !cachedStreamsHaveData) {
      // ── Streams: prefer persisted DB copy (Strava activities are immutable
      //    once recorded). Only call Strava when we don't have it yet, then
      //    write back to DB so future reads — even after a server restart —
      //    are free.
      const wantsRefresh = String(req.query?.refresh || '') === '1';
      let streamFromDb = null;
      if (!wantsRefresh) {
        streamFromDb = await StravaStream.findOne({ userId: targetUser._id, stravaId }).lean();
      } else {
        // On force-refresh, wipe any previously cached latlng-only stub so the
        // subsequent Strava fetch can write back a clean real-streams record.
        StravaStream.deleteOne({ userId: targetUser._id, stravaId }).catch(() => {});
      }
      // Use cached streams only when they contain time-series data (time key).
      // If the DB only has latlng (from the polyline fallback on a previous
      // failed fetch), we still need to re-fetch the full streams so the
      // TrainingChart (power/HR over time) can render.
      const dbStreamsHaveTimeSeries = streamFromDb?.streams &&
        Object.keys(streamFromDb.streams).length > 0 && (
          (Array.isArray(streamFromDb.streams.time?.data) && streamFromDb.streams.time.data.length > 0) ||
          (Array.isArray(streamFromDb.streams.distance?.data) && streamFromDb.streams.distance.data.length > 0) ||
          (Array.isArray(streamFromDb.streams.heartrate?.data) && streamFromDb.streams.heartrate.data.length > 0)
        );

      // If the activity has heart-rate data (has_heartrate=true) but the cached
      // streams don't include a non-empty heartrate array, the prewarm job likely
      // ran before Strava finished processing the HR data. Treat the cache as
      // stale so we re-fetch and get the full stream set including heartrate.
      const activityHasHr = detailResp?.data?.has_heartrate === true;
      const dbStreamsHaveHr = Array.isArray(streamFromDb?.streams?.heartrate?.data)
        && streamFromDb.streams.heartrate.data.some(v => v > 0);
      const dbStreamsMissingHr = dbStreamsHaveTimeSeries && activityHasHr && !dbStreamsHaveHr;

      if (dbStreamsHaveTimeSeries && !dbStreamsMissingHr) {
        streamsData = streamFromDb.streams;
      } else {
        try {
          streamsData = await fetchStravaActivityStreams(token, stravaId, { bypass: wantsRefresh });
        } catch (streamErr) {
          console.warn('[Strava] streams failed (detail already loaded):', streamErr.response?.status || streamErr.message);
          // Fall back to whatever the DB had (might just be latlng from polyline)
          streamsData = streamFromDb?.streams || {};
        }
        const hasUsableStreams = streamsData && Object.keys(streamsData).length > 0 && (
          (Array.isArray(streamsData.time?.data) && streamsData.time.data.length > 0) ||
          (Array.isArray(streamsData.distance?.data) && streamsData.distance.data.length > 0) ||
          (Array.isArray(streamsData.heartrate?.data) && streamsData.heartrate.data.length > 0)
        );
        if (hasUsableStreams) {
          // Persist any streams that have at least one usable channel so future
          // reads don't re-fetch from Strava unnecessarily.
          StravaStream.updateOne(
            { userId: targetUser._id, stravaId },
            { $set: { streams: streamsData, fetchedAt: new Date() } },
            { upsert: true }
          ).catch(err => console.warn('[Strava] failed to persist streams:', err.message));
        }
      }

      // ── latlng fallback from polyline ────────────────────────────────
      // Strava's /streams endpoint sometimes omits the `latlng` key (very
      // short rides, transient 400/404, certain Garmin uploads). But the
      // activity detail almost always carries `map.summary_polyline` (or
      // `map.polyline` for full detail) as a Google-encoded polyline
      // string — that's what powers the map preview on strava.com itself.
      //
      // Decode it and slot it into streams.latlng so the client's map
      // renderer (CalendarView ActivityFullModal) doesn't have to know
      // there are two source formats. The decoded polyline has lower
      // resolution than the latlng stream (one point per ~10–50 m vs.
      // one per second) but it's plenty for drawing the route shape.
      if (!streamsData.latlng || !streamsData.latlng.data || streamsData.latlng.data.length === 0) {
        const poly = detailResp?.data?.map?.polyline || detailResp?.data?.map?.summary_polyline;
        if (poly && typeof poly === 'string') {
          try {
            const { decodePolyline } = require('../utils/polyline');
            const pts = decodePolyline(poly);
            if (pts.length > 0) {
              streamsData.latlng = { data: pts, original_size: pts.length, resolution: 'low', series_type: 'distance' };
              console.log(`[Strava] map: filled latlng from polyline fallback (${pts.length} points)`);
            }
          } catch (decodeErr) {
            console.warn('[Strava] polyline decode failed:', decodeErr.message);
          }
        }
      }

      // ── Laps: prefer the persisted savedActivity.laps when present.
      const persistedLaps = Array.isArray(savedActivity?.laps) && savedActivity.laps.length > 0
        ? savedActivity.laps : null;
      if (persistedLaps && !wantsRefresh) {
        laps = persistedLaps;
      } else {
        try {
          const lapsResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}/laps`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          laps = lapsResp.data || [];
          // Persist a stripped copy of laps so we don't refetch them next time.
          if (laps.length > 0) {
            const stripped = laps.map(l => ({
              lapNumber: l.lap_index,
              startTime: l.start_date,
              elapsed_time: l.elapsed_time,
              moving_time: l.moving_time,
              distance: l.distance,
              average_speed: l.average_speed,
              max_speed: l.max_speed,
              average_heartrate: l.average_heartrate,
              max_heartrate: l.max_heartrate,
              average_watts: l.average_watts,
              max_watts: l.max_watts,
              average_cadence: l.average_cadence,
              total_elevation_gain: l.total_elevation_gain,
            }));
            StravaActivity.updateOne(
              { userId: targetUser._id, stravaId },
              { $set: { laps: stripped } }
            ).catch(err => console.warn('[Strava] failed to persist laps:', err.message));
          }
        } catch (e) {}
      }

      // Cache the Strava-side data; saved title/description/category come from DB
      setCachedStravaActivity(cacheKey, { detail: detailResp.data, streams: streamsData, laps });
    }
    
    // Get saved title, description and laps with lactate from database (if not already loaded)
    if (!savedActivity) {
      savedActivity = await StravaActivity.findOne({ userId: user._id, stravaId: stravaId });
    }
    
    // Merge saved laps with lactate values into laps from API
    // Always use saved laps from database as base (they include manually created laps)
    // Then enrich with API lap data where available
    let mergedLaps = laps;
    // Convert saved laps to plain objects so spreading works correctly with Mongoose subdocuments
    const savedLapsPlain = (savedActivity?.laps || []).map(l => (typeof l.toObject === 'function' ? l.toObject() : { ...l }));
    if (savedLapsPlain.length > 0) {
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
      savedLapsPlain.forEach((savedLap) => {
        const key = buildLapKeyForMatching(savedLap);

        if (!seenSavedLaps.has(key)) {
          seenSavedLaps.set(key, true);
          uniqueSavedLaps.push(savedLap);
        }
      });

      if (uniqueSavedLaps.length !== savedLapsPlain.length) {
        console.log(`Backend: Removed ${savedLapsPlain.length - uniqueSavedLaps.length} duplicate saved laps. Original: ${savedLapsPlain.length}, Unique: ${uniqueSavedLaps.length}`);
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

    // Update category if provided.
    //
    // Originally this was a fixed enum of the seven built-in categories
    // (endurance / lt1 / tempo / lt2 / zone2 / vo2max / hills). But the
    // app lets users define their OWN categories via CategoryProvider
    // (stored in localStorage, with arbitrary nanoid-style ids), and
    // those don't match the enum — so picking a custom category in the
    // mobile modal 400'd silently and the user thought the save was lost.
    //
    // The Category model is purely client-side metadata (color + label),
    // and the activity.category field just stores a string tag. There's
    // no security risk in accepting any string — we cap length so it
    // can't be abused.
    if (category !== undefined) {
      if (category === null || category === '' || category === undefined) {
        activity.category = null;
      } else if (typeof category === 'string' && category.length > 0 && category.length <= 64) {
        activity.category = category;
      } else {
        return res.status(400).json({ error: 'Category must be a string up to 64 characters or null.' });
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

    // Notify coaches (athlete annotated Strava training with lactate) — fire-and-forget
    ;(async () => {
      try {
        const actorFull = await User.findById(user._id).select('name surname role').lean();
        const actorName = actorFull ? `${actorFull.name} ${actorFull.surname}`.trim() : 'Your athlete';
        const trainingTitle = activity.name || activity.titleManual || 'a Strava activity';

        if (!actorFull || actorFull.role !== 'coach') {
          await notifyCoachesOfAthlete(String(user._id), {
            type: 'lactate_added',
            title: 'Lactate added to training',
            body: `${actorName} added lactate values to "${trainingTitle}"`,
            resourceId: `strava-${stravaId}`,
            resourceType: 'strava',
            fromName: actorName,
          });
        } else {
          // Coach adding on behalf of athlete — notify athlete (userId from activity)
          if (activity.userId && String(activity.userId) !== String(user._id)) {
            await notifyAthlete(String(activity.userId), {
              type: 'lactate_added',
              title: 'Lactate added to your training',
              body: `${actorName} added lactate values to "${trainingTitle}"`,
              resourceId: `strava-${stravaId}`,
              resourceType: 'strava',
              fromName: actorName,
            });
          }
        }
      } catch (e) {
        console.error('[StravaLactate] notification error:', e.message);
      }
    })();

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

// ─── Auto-classify Strava activities ────────────────────────────────────────

/** Normalise sport string to 'cycling' | 'running' | 'swimming' | null */
function _acNormSport(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return 'running';
  if (s.includes('swim')) return 'swimming';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual')) return 'cycling';
  return null;
}

function _acParseNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Find which zone key a metric value falls in, using the same robust logic as the client */
function _acFindZone(metric, zonesObj) {
  if (!metric || !zonesObj) return null;
  const keys = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];
  let prevMax = null;
  let lastValidKey = null;
  let lastValidMax = null;
  for (const zKey of keys) {
    const def = zonesObj[zKey];
    if (!def) continue;
    let min = _acParseNum(def.min);
    const max = def.max === undefined ? null : _acParseNum(def.max);
    if (min === null && prevMax !== null) min = prevMax;
    if (min === null) { prevMax = max ?? prevMax; continue; }
    if (max === null || max === Infinity) {
      if (metric >= min) return zKey;
      prevMax = min; continue;
    }
    const lo = Math.min(min, max), hi = Math.max(min, max);
    if (metric >= lo && metric <= hi) return zKey;
    prevMax = hi;
    lastValidKey = zKey;
    if (lastValidMax === null || hi > lastValidMax) lastValidMax = hi;
  }
  if (lastValidKey && lastValidMax !== null && metric > lastValidMax) return lastValidKey;
  return null;
}

const _AC_ZONE_CAT = { zone1: 'endurance', zone2: 'zone2', zone3: 'lt1', zone4: 'lt2', zone5: 'vo2max' };
const _AC_CAT_LABEL = { endurance: 'Endurance', zone2: 'Zone 2', lt1: 'LT1', lt2: 'LT2', vo2max: 'VO₂max', tempo: 'Tempo', hills: 'Hills' };
const _AC_SPORT_LABEL = { cycling: 'Ride', running: 'Run', swimming: 'Swim' };

/**
 * Interval-aware dominant zone detection.
 * If the activity has repeating lap intervals, classify based on the work laps
 * (not the overall average which is diluted by warmup/recovery laps).
 */
function _acFindDominantZone(act, normSport, pZones, hZones) {
  // Try interval-aware classification first
  if (Array.isArray(act.laps) && act.laps.length >= 3) {
    const significantLaps = act.laps.filter(l => (l.elapsed_time || l.moving_time || 0) >= 60);
    if (significantLaps.length >= 3) {
      const durations = significantLaps.map(l => l.elapsed_time || l.moving_time || 0).sort((a, b) => a - b);
      const medDur = durations[Math.floor(durations.length / 2)];
      // Work laps: within 70–130% of median duration
      const workLaps = significantLaps.filter(l => {
        const d = l.elapsed_time || l.moving_time || 0;
        return d >= medDur * 0.7 && d <= medDur * 1.3;
      });
      if (workLaps.length >= 2) {
        const avgPowers = workLaps.map(l => l.average_watts || null).filter(v => v != null && v > 0);
        const avgHRs = workLaps.map(l => l.average_heartrate || null).filter(v => v != null && v > 0);
        const workPower = avgPowers.length ? avgPowers.reduce((a, b) => a + b) / avgPowers.length : null;
        const workHR = avgHRs.length ? avgHRs.reduce((a, b) => a + b) / avgHRs.length : null;
        let zone = null;
        if (workPower && normSport === 'cycling') zone = _acFindZone(workPower, pZones);
        if (!zone && workHR) zone = _acFindZone(workHR, hZones);
        if (!zone && workPower && normSport !== 'cycling') zone = _acFindZone(workPower, pZones);
        if (zone) return zone;
      }
    }
  }
  // Fall back to overall averages
  const powerMetric = normSport === 'cycling'
    ? (act.weightedAveragePower || act.averagePower || null)
    : (act.averagePower || null);
  const hrMetric = act.averageHeartRate || null;
  let zone = null;
  if (powerMetric && normSport === 'cycling') zone = _acFindZone(powerMetric, pZones);
  if (!zone && hrMetric) zone = _acFindZone(hrMetric, hZones);
  if (!zone && powerMetric && normSport !== 'cycling') zone = _acFindZone(powerMetric, pZones);
  return zone;
}

/** Build a human-readable title for the activity */
function _acBuildTitle(category, sport, movingTimeSec, distanceM, laps) {
  const sLabel = _AC_SPORT_LABEL[sport] || 'Workout';
  const cLabel = _AC_CAT_LABEL[category] || '';
  const movMin = Math.round((movingTimeSec || 0) / 60);

  // Detect repeating interval structure from laps
  if (Array.isArray(laps) && laps.length >= 4) {
    const active = laps.filter(l => (l.elapsed_time || l.moving_time || 0) > 20);
    if (active.length >= 3 && active.length <= 20) {
      const durations = active.map(l => l.elapsed_time || l.moving_time || 0).sort((a, b) => a - b);
      const medDur = durations[Math.floor(durations.length / 2)];
      const workLaps = active.filter(l => {
        const d = l.elapsed_time || l.moving_time || 0;
        return d >= medDur * 0.7 && d <= medDur * 1.3;
      });
      if (workLaps.length >= 2) {
        const dMin = Math.floor(medDur / 60);
        const dSec = Math.round(medDur % 60);
        const dStr = dSec > 0 ? `${dMin}:${String(dSec).padStart(2, '0')}'` : `${dMin}'`;
        return cLabel ? `${workLaps.length}×${dStr} ${cLabel} ${sLabel}` : `${workLaps.length}×${dStr} ${sLabel}`;
      }
    }
  }

  // Distance-based title for longer efforts
  if (distanceM > 2000) {
    if (sport === 'cycling' && distanceM >= 10000) {
      const km = Math.round(distanceM / 1000);
      return cLabel ? `${km}km ${cLabel} ${sLabel}` : `${km}km ${sLabel}`;
    }
    if (sport === 'running' && distanceM >= 3000) {
      const km = (distanceM / 1000).toFixed(1).replace('.0', '');
      return cLabel ? `${km}km ${cLabel} ${sLabel}` : `${km}km ${sLabel}`;
    }
    if (sport === 'swimming' && distanceM >= 1000) {
      const km = (distanceM / 1000).toFixed(1).replace('.0', '');
      return cLabel ? `${km}km ${cLabel} ${sLabel}` : `${km}km ${sLabel}`;
    }
  }

  // Duration-based fallback
  return cLabel ? `${movMin}' ${cLabel} ${sLabel}` : `${movMin}' ${sLabel}`;
}

/**
 * GET /api/integrations/strava/auto-classify
 * Returns proposed category + title for uncategorised activities.
 * Query params: sport (all|cycling|running|swimming), skipCategorized (true|false), limit (int)
 */
router.get('/strava/auto-classify', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(401).json({ error: 'User not found' });

    const { sport = 'all', skipCategorized = 'true', limit = '300' } = req.query;

    const query = { userId: user._id };
    if (skipCategorized === 'true') query.category = { $in: [null, undefined, ''] };

    const activities = await StravaActivity.find(query)
      .select('_id stravaId name sport startDate movingTime elapsedTime distance averageHeartRate averagePower weightedAveragePower total_elevation_gain titleManual category laps')
      .sort({ startDate: -1 })
      .limit(Math.min(parseInt(limit) || 300, 1000))
      .lean();

    const powerZones = user.powerZones || {};
    const hrZones = user.heartRateZones || {};

    const proposals = [];
    for (const act of activities) {
      const normSport = _acNormSport(act.sport);
      if (!normSport) continue;
      if (sport !== 'all' && normSport !== sport) continue;

      const pZones = powerZones[normSport] || {};
      const hZones = hrZones[normSport] || {};

      // Elevation-based hills detection (>20m gain per km)
      const elevPerKm = act.total_elevation_gain && act.distance > 0
        ? (act.total_elevation_gain / (act.distance / 1000))
        : 0;
      const isHillsWorkout = elevPerKm > 20;

      // Use interval-aware zone detection
      const dominantZone = _acFindDominantZone(act, normSport, pZones, hZones);

      let category = null;
      if (isHillsWorkout && !dominantZone) {
        // Only hills when no zone data available
        category = 'hills';
      } else if (dominantZone) {
        category = _AC_ZONE_CAT[dominantZone] || null;
        // If significant elevation and classified as endurance/zone2, override to hills
        if (isHillsWorkout && elevPerKm > 35 && (category === 'endurance' || category === 'zone2')) {
          category = 'hills';
        }
      }

      if (!category) continue; // can't classify without zone data

      const title = _acBuildTitle(category, normSport, act.movingTime || act.elapsedTime, act.distance, act.laps);

      proposals.push({
        _id: String(act._id),
        stravaId: act.stravaId,
        name: act.name,
        titleManual: act.titleManual || null,
        sport: normSport,
        startDate: act.startDate,
        movingTime: act.movingTime || act.elapsedTime || 0,
        currentCategory: act.category || null,
        dominantZone: dominantZone || 'hills',
        proposedCategory: category,
        proposedTitle: title,
      });
    }

    res.json({ proposals, total: activities.length });
  } catch (err) {
    console.error('[auto-classify] preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/integrations/strava/auto-classify/apply
 * Applies selected category + title changes.
 * Body: { items: [{ _id, category, title }] }
 */
router.post('/strava/auto-classify/apply', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(401).json({ error: 'User not found' });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ updated: 0 });

    let updated = 0;
    for (const item of items) {
      if (!item._id) continue;
      const patch = {};
      if (item.applyCategory && item.category !== undefined) patch.category = item.category || null;
      if (item.applyTitle && item.title) patch.titleManual = item.title;
      if (!Object.keys(patch).length) continue;
      const result = await StravaActivity.updateOne(
        { _id: item._id, userId: user._id },
        { $set: patch }
      );
      if (result.modifiedCount > 0) updated++;
    }

    res.json({ updated });
  } catch (err) {
    console.error('[auto-classify] apply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Apple Health ─────────────────────────────────────────────────────────────
// (AppleHealthActivity is required at the top of the file alongside Strava/Garmin
// so the /activities aggregator can use it.)

const APPLE_HEALTH_SPORT_MAP = {
  Running: 'running',
  Cycling: 'cycling',
  Swimming: 'swimming',
  Walking: 'running',
  Hiking: 'running',
  Rowing: 'other',
  Elliptical: 'other',
  StairClimbing: 'other',
  CrossTraining: 'other',
  Other: 'other',
};

/**
 * POST /api/integrations/apple-health/sync
 * Receives workouts from the iOS app and upserts them as StravaActivity-like docs.
 * Body: { workouts: HealthWorkout[] }
 */
router.post('/apple-health/sync', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { workouts } = req.body;

    if (!Array.isArray(workouts) || workouts.length === 0) {
      return res.json({ imported: 0, message: 'No workouts provided' });
    }

    let imported = 0;

    for (const w of workouts) {
      if (!w.id || !w.startDate) continue;

      const sport = APPLE_HEALTH_SPORT_MAP[w.type] ?? 'other';
      const startDate = new Date(w.startDate);
      const durationSec = Number(w.durationSeconds) || 0;
      const distanceMeters = Number(w.distanceMeters) || 0;

      // Use StravaActivity model with source=apple_health to reuse existing pipeline
      const doc = {
        userId,
        healthKitId: w.id,
        name: w.type ? `${w.type} (Apple Health)` : 'Apple Health Workout',
        type: w.type ?? 'Other',
        sport,
        startDate,
        endDate: w.endDate ? new Date(w.endDate) : null,
        durationSeconds: durationSec,
        distanceMeters,
        calories: Number(w.calories) || null,
        avgHeartRate: w.avgHeartRate ?? null,
        sourceName: w.sourceName ?? 'Apple Health',
      };

      const result = await AppleHealthActivity.updateOne(
        { userId, healthKitId: doc.healthKitId },
        { $setOnInsert: doc },
        { upsert: true }
      );

      if (result.upsertedCount > 0) imported++;
    }

    // Notify athlete + coaches (fire-and-forget)
    if (imported > 0) {
      const body = imported === 1
        ? '1 Apple Health workout synced.'
        : `${imported} Apple Health workouts synced.`;
      notifyAthlete(String(userId), {
        type: 'apple_health_sync',
        title: 'Apple Health synced',
        body,
        resourceType: 'strava',
      }).catch(() => {});
      // Coaches are not notified on Apple Health sync — only lactate/comments trigger coach notifications.
    }

    res.json({ imported, total: workouts.length });
  } catch (err) {
    console.error('[apple-health] sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/integrations/apple-health/status
 * Returns last sync date and count for this user.
 */
router.get('/apple-health/status', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const count = await AppleHealthActivity.countDocuments({ userId });
    const last = await AppleHealthActivity.findOne({ userId })
      .sort({ createdAt: -1 })
      .select('createdAt startDate')
      .lean();
    res.json({ count, lastSync: last?.createdAt ?? null, lastActivity: last?.startDate ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/integrations/apple-health
 * Wipes every AppleHealthActivity record for this user. Used by the
 * "Disconnect" button in Settings — combined with the client clearing
 * its local sync-state, this returns the integration to its initial
 * "not connected" condition on the server side.
 *
 * iOS itself does not allow apps to revoke their own HealthKit
 * authorization — the user must do that in iOS Settings → Health →
 * Data Access & Devices → LaChart. The UI surfaces a button that
 * deep-links there.
 */
router.delete('/apple-health', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await AppleHealthActivity.deleteMany({ userId });
    res.json({ deleted: result?.deletedCount ?? 0 });
  } catch (err) {
    console.error('[apple-health] disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.getValidStravaToken = getValidStravaToken;
// Boot-time recovery for backfills interrupted by a restart.
module.exports.resumeInterruptedStravaBackfills = resumeInterruptedStravaBackfills;
