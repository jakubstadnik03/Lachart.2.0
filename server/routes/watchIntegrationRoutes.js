/**
 * Polar Flow and COROS connect, sync, and activity detail.
 *
 * Mounted beside the Strava/Garmin router at /api/integrations.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt.config');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const WatchActivity = require('../models/WatchActivity');
const { athleteHasCoachUser } = require('../utils/athleteCoachAccess');
const { reconnectState, clearNeedsReconnect } = require('../utils/integrationReconnect');
const {
  isProvider,
  credentials,
  missingCredentialsMessage,
  exchangePolarCode,
  exchangeCorosCode,
  registerPolarUser,
  syncWatchProvider,
  deauthorize,
  COROS_API,
} = require('../services/watchSync');

const router = express.Router();

const POLAR_AUTHORIZE = 'https://flow.polar.com/oauth2/authorization';

function frontendBase() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function callbackUri(provider, req) {
  const envKey = provider === 'polar' ? 'POLAR_REDIRECT_URI' : 'COROS_REDIRECT_URI';
  if (process.env[envKey]) return process.env[envKey];
  const backend = process.env.BACKEND_URL || process.env.API_URL || process.env.RENDER_EXTERNAL_URL;
  if (backend) return `${backend.replace(/\/$/, '')}/api/integrations/${provider}/callback`;
  if (req) {
    const host = req.get('host');
    if (host) return `${req.protocol || 'https'}://${host}/api/integrations/${provider}/callback`;
  }
  if (process.env.NODE_ENV === 'production') {
    return `https://lachart.onrender.com/api/integrations/${provider}/callback`;
  }
  return null;
}

function finishRedirect(res, { platform, provider, ok, message }) {
  if (platform === 'ios') {
    const scheme = process.env.IOS_URL_SCHEME || 'com.lachart.app';
    const flag = ok ? 'connected' : 'error';
    const q = ok ? 'ok=1' : `message=${encodeURIComponent(message || 'failed')}`;
    return res.redirect(`${scheme}://${provider}-${flag}?${q}`);
  }
  const params = new URLSearchParams();
  params.set(provider, ok ? 'connected' : 'error');
  if (message) params.set('message', String(message).slice(0, 300));
  return res.redirect(`${frontendBase()}/settings?tab=integrations&${params.toString()}`);
}

function bearerUserId(req) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return null;
  try {
    return jwt.verify(bearer, JWT_SECRET)?.userId || null;
  } catch {
    return null;
  }
}

function isAdminUser(user) {
  return user?.admin === true || String(user?.role || '').toLowerCase() === 'admin';
}

async function resolveTargetUserId(requester, athleteIdParam) {
  if (!athleteIdParam || String(athleteIdParam) === String(requester._id)) return requester._id;
  const role = String(requester.role || '').toLowerCase();
  const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role) || requester.admin === true;
  if (!isCoachLike) {
    const err = new Error('You are not authorized to view this activity');
    err.status = 403;
    throw err;
  }
  const athlete = await User.findById(athleteIdParam).select('coachId coachIds').lean();
  if (!athlete) {
    const err = new Error('Athlete not found');
    err.status = 404;
    throw err;
  }
  if (!athleteHasCoachUser(athlete, requester._id) && !isAdminUser(requester)) {
    const err = new Error('Not authorised to manage this athlete');
    err.status = 403;
    throw err;
  }
  return athlete._id;
}

function bustActivitiesCache(userId) {
  try {
    const integrations = require('./integrationsRoutes');
    if (typeof integrations.invalidateActivitiesCacheForUser === 'function') {
      integrations.invalidateActivitiesCacheForUser(userId);
    }
  } catch (err) {
    console.warn('[watch] cache bust failed:', err?.message || err);
  }
}

router.get('/:provider/auth-url', (req, res) => {
  const provider = String(req.params.provider || '');
  if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
  try {
    const { clientId, clientSecret } = credentials(provider);
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: missingCredentialsMessage(provider) });
    }
    const redirectUri = callbackUri(provider, req);
    if (!redirectUri) {
      return res.status(500).json({ error: `${provider} redirect URI could not be determined` });
    }
    const userId = bearerUserId(req);
    if (!userId) return res.status(401).json({ error: 'Missing auth token' });
    const platform = req.query.platform === 'ios' ? 'ios' : 'web';
    const state = jwt.sign({ provider, userId, platform }, JWT_SECRET, { expiresIn: '15m' });
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });
    if (provider === 'polar') params.set('scope', 'accesslink.read_all');
    const base = provider === 'polar' ? POLAR_AUTHORIZE : `${COROS_API}/oauth2/authorize`;
    res.json({ url: `${base}?${params.toString()}` });
  } catch (error) {
    console.error(`${provider} auth-url error:`, error.message);
    res.status(500).json({ error: error.message || 'Failed to start connect flow' });
  }
});

router.get('/:provider/callback', async (req, res) => {
  const provider = String(req.params.provider || '');
  if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
  let platform = 'web';
  try {
    const { code, state, error, error_description: errorDescription } = req.query || {};
    if (state) {
      try {
        platform = jwt.verify(String(state), JWT_SECRET)?.platform === 'ios' ? 'ios' : 'web';
      } catch { /* verified again below */ }
    }
    if (error) {
      return finishRedirect(res, { platform, provider, ok: false, message: errorDescription || error });
    }
    if (!code || !state) return res.status(400).json({ error: 'Missing OAuth code or state' });

    let decoded;
    try {
      decoded = jwt.verify(String(state), JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired OAuth state' });
    }
    if (decoded?.provider !== provider || !decoded?.userId) {
      return res.status(401).json({ error: 'Malformed OAuth state' });
    }
    platform = decoded.platform === 'ios' ? 'ios' : 'web';

    const { clientId, clientSecret } = credentials(provider);
    if (!clientId || !clientSecret) {
      return finishRedirect(res, { platform, provider, ok: false, message: missingCredentialsMessage(provider) });
    }
    const redirectUri = callbackUri(provider, req);
    const token = provider === 'polar'
      ? await exchangePolarCode({ code, redirectUri })
      : await exchangeCorosCode({ code, redirectUri });
    if (!token.accessToken) {
      return finishRedirect(res, { platform, provider, ok: false, message: 'Token exchange returned no access token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let athleteId = token.openId || token.userId || user[provider]?.athleteId || null;
    if (provider === 'polar') {
      try {
        const polarUserId = await registerPolarUser(token.accessToken, String(user._id));
        if (polarUserId) athleteId = polarUserId;
      } catch (regErr) {
        console.warn('[polar] user register failed:', regErr?.response?.status || regErr.message);
      }
    }

    const previous = user[provider]?.toObject?.() || user[provider] || {};
    user[provider] = {
      athleteId: athleteId ? String(athleteId) : (previous.athleteId || null),
      accessToken: token.accessToken,
      refreshToken: token.refreshToken || previous.refreshToken || null,
      expiresAt: token.expiresIn ? Math.floor(Date.now() / 1000) + token.expiresIn : (previous.expiresAt || null),
      autoSync: true,
      connected: true,
      lastSyncDate: previous.lastSyncDate || null,
    };
    await user.save();
    await clearNeedsReconnect(user._id, provider);

    const lookback = provider === 'coros' ? 90 : 30;
    setTimeout(() => {
      User.findById(user._id)
        .then((fresh) => (fresh ? syncWatchProvider(fresh, provider, { days: lookback }) : null))
        .then((result) => {
          if (result) console.log(`[${provider} callback] sync: ${result.imported} imported, ${result.updated} updated`);
        })
        .catch((err) => console.warn(`[${provider} callback] sync failed:`, err?.message || err));
    }, 600);

    return finishRedirect(res, { platform, provider, ok: true });
  } catch (err) {
    console.error(`${provider} callback error`, err?.response?.status || '', err?.response?.data || err.message);
    const message = err?.response?.data?.error_description
      || err?.response?.data?.message
      || err.message
      || 'Connect failed';
    return finishRedirect(res, { platform, provider, ok: false, message });
  }
});

router.get('/:provider/status', verifyToken, async (req, res) => {
  const provider = String(req.params.provider || '');
  if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
  try {
    const user = await User.findById(req.user.userId).select(`${provider} integrationAlerts`).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const slot = user[provider] || {};
    res.json({
      connected: !!slot.accessToken,
      autoSync: slot.autoSync !== undefined ? !!slot.autoSync : false,
      lastSyncDate: slot.lastSyncDate || null,
      athleteId: slot.athleteId || null,
      configured: !!(credentials(provider).clientId && credentials(provider).clientSecret),
      ...reconnectState(user, provider),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'status_failed' });
  }
});

router.post('/:provider/sync', verifyToken, async (req, res) => {
  const provider = String(req.params.provider || '');
  if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
  try {
    const user = await User.findById(req.user.userId);
    if (!user?.[provider]?.accessToken) {
      return res.status(400).json({ error: `${provider} is not connected` });
    }
    const requested = Number(req.body?.days);
    const cap = provider === 'polar' ? 30 : 365;
    const days = Number.isFinite(requested) ? Math.max(1, Math.min(cap, requested)) : 30;
    const result = await syncWatchProvider(user, provider, { days });
    bustActivitiesCache(user._id);
    res.json(result);
  } catch (error) {
    const status = error?.response?.status;
    console.error(`${provider} sync error:`, status || '', error?.response?.data || error.message);
    res.status(status === 401 || status === 403 ? 401 : 502).json({
      error: error?.response?.data?.message || error.message || 'Sync failed',
    });
  }
});

router.post('/:provider/auto-sync', verifyToken, async (req, res) => {
  const provider = String(req.params.provider || '');
  if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
  try {
    const user = await User.findById(req.user.userId);
    if (!user?.[provider]?.accessToken) {
      return res.status(400).json({ error: `${provider} is not connected` });
    }
    if (!user[provider].autoSync) {
      return res.json({ imported: 0, updated: 0, message: 'Auto-sync is disabled' });
    }
    let days = provider === 'polar' ? 30 : 14;
    if (user[provider].lastSyncDate) {
      const elapsed = Date.now() - new Date(user[provider].lastSyncDate).getTime();
      days = Math.max(2, Math.min(days, Math.ceil(elapsed / 86400000) + 1));
    }
    const result = await syncWatchProvider(user, provider, { days });
    if (result.imported > 0 || result.updated > 0) bustActivitiesCache(user._id);
    res.json(result);
  } catch (error) {
    console.error(`${provider} auto-sync error:`, error?.message || error);
    res.json({ imported: 0, updated: 0, error: error.message || 'Auto-sync failed' });
  }
});

router.put('/:provider/auto-sync', verifyToken, async (req, res) => {
  const provider = String(req.params.provider || '');
  if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
  try {
    const enabled = !!req.body?.enabled;
    await User.updateOne({ _id: req.user.userId }, { $set: { [`${provider}.autoSync`]: enabled } });
    res.json({ autoSync: enabled });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update auto-sync' });
  }
});

router.post('/:provider/disconnect', verifyToken, async (req, res) => {
  const provider = String(req.params.provider || '');
  if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await deauthorize(user, provider);
    user[provider] = {
      athleteId: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      autoSync: false,
      connected: false,
      lastSyncDate: user[provider]?.lastSyncDate || null,
    };
    await user.save();
    await clearNeedsReconnect(user._id, provider);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Disconnect failed' });
  }
});

router.get('/watch/activities/:provider/:id', verifyToken, async (req, res) => {
  try {
    const provider = String(req.params.provider || '');
    if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
    const requester = await User.findById(req.user.userId);
    if (!requester) return res.status(404).json({ error: 'User not found' });
    const watchId = String(req.params.id || '').replace(new RegExp(`^${provider}-`, 'i'), '').trim();
    if (!watchId) return res.status(400).json({ error: 'Invalid activity id' });
    const targetUserId = await resolveTargetUserId(requester, req.query.athleteId);
    const activity = await WatchActivity.findOne({ userId: targetUserId, source: provider, watchId }).lean();
    if (!activity) return res.status(404).json({ error: 'Activity not found' });
    res.json({
      detail: {
        id: watchId,
        name: activity.titleManual || activity.name,
        sport: activity.sport,
        start_date: activity.startDate,
        distance: activity.distance,
        moving_time: activity.movingTime ?? activity.elapsedTime,
        movingTime: activity.movingTime ?? activity.elapsedTime,
        elapsed_time: activity.elapsedTime,
        average_heartrate: activity.averageHeartRate,
        average_watts: activity.averagePower,
        average_speed: activity.averageSpeed,
        calories: activity.calories ?? null,
      },
      streams: {},
      laps: Array.isArray(activity.laps) ? activity.laps : [],
      titleManual: activity.titleManual || null,
      description: activity.description || null,
      category: activity.category || null,
      movingTime: activity.movingTime ?? null,
      elapsedTime: activity.elapsedTime ?? null,
      distance: activity.distance ?? null,
      manualTss: activity.manualTss ?? null,
      tssDisplayMode: activity.tssDisplayMode ?? null,
      lactate: activity.lactate ?? null,
      source: provider,
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'activity_detail_failed' });
  }
});

router.put('/watch/activities/:provider/:id', verifyToken, async (req, res) => {
  try {
    const provider = String(req.params.provider || '');
    if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
    const requester = await User.findById(req.user.userId);
    if (!requester) return res.status(404).json({ error: 'User not found' });
    const watchId = String(req.params.id || '').replace(new RegExp(`^${provider}-`, 'i'), '').trim();
    const targetUserId = await resolveTargetUserId(requester, req.query.athleteId);
    const activity = await WatchActivity.findOne({ userId: targetUserId, source: provider, watchId });
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const {
      title, description, category, movingTime, duration, elapsedTime,
      distance, calories, rpe, lactate, tss, tssDisplayMode, startDate,
    } = req.body || {};
    if (title !== undefined) {
      activity.titleManual = (title && String(title).trim()) ? String(title).trim() : null;
    }
    if (description !== undefined) {
      activity.description = (description && String(description).trim()) ? String(description).trim() : null;
    }
    if (category !== undefined) activity.category = category || null;
    const durationSecs = movingTime ?? duration ?? elapsedTime;
    if (durationSecs !== undefined && durationSecs !== null && durationSecs !== '') {
      const secs = Math.max(0, Math.round(Number(durationSecs)));
      if (Number.isFinite(secs)) {
        activity.movingTime = secs;
        activity.elapsedTime = secs;
        activity.metricsManualized = true;
      }
    }
    if (distance !== undefined && distance !== null && distance !== '') {
      const metres = Math.max(0, Math.round(Number(distance)));
      if (Number.isFinite(metres)) {
        activity.distance = metres;
        activity.metricsManualized = true;
      }
    }
    if (calories !== undefined && calories !== null && calories !== '') {
      const kcal = Math.max(0, Math.round(Number(calories)));
      if (Number.isFinite(kcal)) activity.calories = kcal;
    }
    if (rpe !== undefined && rpe !== null && rpe !== '') {
      const rpeVal = Math.max(0, Math.round(Number(rpe)));
      if (Number.isFinite(rpeVal)) activity.rpe = rpeVal;
    }
    if (lactate !== undefined && lactate !== null && lactate !== '') {
      const lac = Number(lactate);
      if (Number.isFinite(lac)) activity.lactate = lac;
    }
    if (tss !== undefined && tss !== null && tss !== '') {
      const load = Math.max(0, Math.round(Number(tss)));
      if (Number.isFinite(load)) {
        activity.manualTss = load;
        activity.metricsManualized = true;
      }
    }
    if (tssDisplayMode !== undefined) {
      if (tssDisplayMode === null || tssDisplayMode === '') activity.tssDisplayMode = null;
      else if (['manual', 'power', 'hr'].includes(String(tssDisplayMode))) {
        activity.tssDisplayMode = String(tssDisplayMode);
      }
    }
    if (startDate) {
      const d = new Date(startDate);
      if (!Number.isNaN(d.getTime())) {
        activity.startDate = d;
        activity.metricsManualized = true;
      }
    }
    await activity.save();
    bustActivitiesCache(targetUserId);
    res.json({ success: true, activity });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'update_failed' });
  }
});

router.delete('/watch/activities/:provider/:id', verifyToken, async (req, res) => {
  try {
    const provider = String(req.params.provider || '');
    if (!isProvider(provider)) return res.status(404).json({ error: 'Unknown provider' });
    const requester = await User.findById(req.user.userId);
    if (!requester) return res.status(404).json({ error: 'User not found' });
    const watchId = String(req.params.id || '').replace(new RegExp(`^${provider}-`, 'i'), '').trim();
    const targetUserId = await resolveTargetUserId(requester, req.query.athleteId);
    const deleted = await WatchActivity.deleteOne({ userId: targetUserId, source: provider, watchId });
    bustActivitiesCache(targetUserId);
    res.json({ ok: true, deleted: deleted.deletedCount || 0 });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'delete_failed' });
  }
});

module.exports = router;
