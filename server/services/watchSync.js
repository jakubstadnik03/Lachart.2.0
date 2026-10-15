/**
 * Polar AccessLink and COROS Open API: OAuth token refresh and workout pull.
 *
 * Both providers only hand a partner the workouts uploaded after the athlete
 * connects, and Polar only keeps the last 30 days available. The calendar
 * therefore fills from the connect date forward; older sessions still arrive
 * through a FIT upload.
 */

const axios = require('axios');
const User = require('../models/UserModel');
const WatchActivity = require('../models/WatchActivity');
const {
  mapPolarExercise,
  mapCorosWorkout,
  dateWindows,
  corosRows,
  polarRows,
} = require('../utils/watchActivityMap');
const { flagNeedsReconnect, clearNeedsReconnect, isReconnectableAuthError } = require('../utils/integrationReconnect');

const POLAR_API = 'https://www.polaraccesslink.com';
const POLAR_TOKEN_URL = 'https://polarremote.com/v2/oauth2/token';
const COROS_API = (process.env.COROS_API_BASE_URL || 'https://open.coros.com').replace(/\/$/, '');

const PROVIDERS = new Set(['polar', 'coros']);

function isProvider(name) {
  return PROVIDERS.has(String(name || ''));
}

function credentials(provider) {
  if (provider === 'polar') {
    return {
      clientId: process.env.POLAR_CLIENT_ID || '',
      clientSecret: process.env.POLAR_CLIENT_SECRET || '',
    };
  }
  return {
    clientId: process.env.COROS_CLIENT_ID || '',
    clientSecret: process.env.COROS_CLIENT_SECRET || '',
  };
}

function missingCredentialsMessage(provider) {
  const label = provider === 'polar' ? 'Polar' : 'COROS';
  const idKey = provider === 'polar' ? 'POLAR_CLIENT_ID' : 'COROS_CLIENT_ID';
  const secretKey = provider === 'polar' ? 'POLAR_CLIENT_SECRET' : 'COROS_CLIENT_SECRET';
  return `${label} is not configured on this server yet. Set ${idKey} and ${secretKey}.`;
}

function basicAuth(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function exchangePolarCode({ code, redirectUri }) {
  const { clientId, clientSecret } = credentials('polar');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri,
  });
  const resp = await axios.post(POLAR_TOKEN_URL, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(clientId, clientSecret),
      Accept: 'application/json',
    },
    timeout: 30000,
  });
  return readOAuthToken(resp.data);
}

async function exchangeCorosCode({ code, redirectUri }) {
  const { clientId, clientSecret } = credentials('coros');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const resp = await axios.post(`${COROS_API}/oauth2/accesstoken`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    timeout: 30000,
  });
  return readOAuthToken(resp.data);
}

function readOAuthToken(body) {
  const src = body?.data && (body.data.access_token || body.data.accessToken) ? body.data : (body || {});
  return {
    accessToken: src.access_token || src.accessToken || null,
    refreshToken: src.refresh_token || src.refreshToken || null,
    expiresIn: Number(src.expires_in || src.expiresIn || 0) || null,
    openId: src.openId || src.open_id || src.openid || null,
    userId: src.x_user_id || src.user_id || src.polar_user_id || null,
  };
}

/**
 * Polar will not return exercises until the access token's user is registered
 * with this client. 409 means they already are.
 */
async function registerPolarUser(accessToken, memberId) {
  try {
    const resp = await axios.post(`${POLAR_API}/v3/users`, { 'member-id': String(memberId) }, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 20000,
    });
    const data = resp.data || {};
    return String(data['polar-user-id'] || data.polar_user_id || data['polar_user_id'] || '') || null;
  } catch (err) {
    if (err?.response?.status === 409) return null;
    throw err;
  }
}

async function refreshTokens(provider, refreshToken) {
  const { clientId, clientSecret } = credentials(provider);
  if (provider === 'polar') {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const resp = await axios.post(POLAR_TOKEN_URL, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth(clientId, clientSecret),
        Accept: 'application/json',
      },
      timeout: 30000,
    });
    return readOAuthToken(resp.data);
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const resp = await axios.post(`${COROS_API}/oauth2/refresh-token`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    timeout: 30000,
  });
  return readOAuthToken(resp.data);
}

async function ensureAccessToken(user, provider) {
  const slot = user?.[provider] || {};
  if (!slot.accessToken) {
    const err = new Error(`${provider} is not connected`);
    err.status = 400;
    throw err;
  }
  const expiresAt = Number(slot.expiresAt || 0);
  const refreshNeeded = expiresAt > 0 && expiresAt * 1000 < Date.now() + 5 * 60 * 1000;
  if (!refreshNeeded || !slot.refreshToken) return slot.accessToken;

  try {
    const next = await refreshTokens(provider, slot.refreshToken);
    if (!next.accessToken) throw new Error('refresh returned no access token');
    const patch = {
      [`${provider}.accessToken`]: next.accessToken,
      [`${provider}.expiresAt`]: next.expiresIn ? Math.floor(Date.now() / 1000) + next.expiresIn : null,
    };
    if (next.refreshToken) patch[`${provider}.refreshToken`] = next.refreshToken;
    await User.updateOne({ _id: user._id }, { $set: patch });
    user[provider].accessToken = next.accessToken;
    if (next.refreshToken) user[provider].refreshToken = next.refreshToken;
    await clearNeedsReconnect(user._id, provider);
    return next.accessToken;
  } catch (err) {
    if (isReconnectableAuthError(err)) await flagNeedsReconnect(user._id, provider, 'refresh_failed');
    throw err;
  }
}

async function pullPolarExercises(accessToken) {
  const resp = await axios.get(`${POLAR_API}/v3/exercises`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 30000,
    validateStatus: (status) => status === 200 || status === 204,
  });
  return polarRows(resp.data).map(mapPolarExercise).filter(Boolean);
}

async function pullCorosWorkouts(accessToken, openId, since) {
  const until = new Date();
  const days = Math.max(1, Math.min(365, Math.ceil((until - since) / 86400000) || 30));
  const windows = dateWindows(until, days, 30);
  const seen = new Map();
  for (const window of windows) {
    const resp = await axios.get(`${COROS_API}/coros/sport/list`, {
      params: {
        token: accessToken,
        openId,
        startDate: window.startDate,
        endDate: window.endDate,
      },
      timeout: 30000,
    });
    const body = resp.data || {};
    if (body.result && String(body.result) !== '0000') {
      const err = new Error(body.message || `COROS sport list failed (${body.result})`);
      err.response = { status: /token|auth/i.test(String(body.message || '')) ? 401 : 502, data: body };
      throw err;
    }
    for (const row of corosRows(body)) {
      const mapped = mapCorosWorkout(row);
      if (mapped) seen.set(mapped.watchId, mapped);
    }
  }
  return [...seen.values()];
}

function preserveManual(existing, doc) {
  if (!existing?.metricsManualized) return doc;
  const next = { ...doc };
  if (existing.startDate != null) next.startDate = existing.startDate;
  if (existing.movingTime != null) next.movingTime = existing.movingTime;
  if (existing.elapsedTime != null) next.elapsedTime = existing.elapsedTime;
  if (existing.distance != null) next.distance = existing.distance;
  if (existing.manualTss != null) next.manualTss = existing.manualTss;
  if (existing.tssDisplayMode != null) next.tssDisplayMode = existing.tssDisplayMode;
  next.metricsManualized = true;
  next.titleManual = existing.titleManual;
  next.category = existing.category;
  return next;
}

async function upsertWatchDocs(userId, docs) {
  let imported = 0;
  let updated = 0;
  for (const doc of docs) {
    const existing = await WatchActivity.findOne({
      userId,
      source: doc.source,
      watchId: doc.watchId,
    }).select('titleManual category manualTss tssDisplayMode metricsManualized startDate movingTime elapsedTime distance').lean();
    const set = preserveManual(existing, { ...doc, userId });
    if (existing?.titleManual) set.titleManual = existing.titleManual;
    if (existing?.category) set.category = existing.category;
    const res = await WatchActivity.updateOne(
      { userId, source: doc.source, watchId: doc.watchId },
      { $set: set },
      { upsert: true },
    );
    if (res.upsertedCount) imported += 1;
    else if (res.modifiedCount || res.matchedCount) updated += res.modifiedCount ? 1 : 0;
  }
  return { imported, updated };
}

/**
 * Pull recent workouts for one connected account and store them.
 * `days` is how far back to ask. Polar ignores it — AccessLink only
 * returns the last 30 days either way.
 */
async function syncWatchProvider(user, provider, { days = 30 } = {}) {
  if (!isProvider(provider)) throw new Error('Unknown watch provider');
  const token = await ensureAccessToken(user, provider);
  let docs = [];
  try {
    if (provider === 'polar') {
      docs = await pullPolarExercises(token);
    } else {
      const since = new Date(Date.now() - days * 86400000);
      docs = await pullCorosWorkouts(token, user.coros?.athleteId, since);
    }
  } catch (err) {
    if (isReconnectableAuthError(err)) await flagNeedsReconnect(user._id, provider, 'unauthorized');
    throw err;
  }

  const { imported, updated } = await upsertWatchDocs(user._id, docs);
  if (imported > 0 || updated > 0 || docs.length >= 0) {
    await User.updateOne({ _id: user._id }, { $set: { [`${provider}.lastSyncDate`]: new Date() } });
  }
  await clearNeedsReconnect(user._id, provider);
  return { imported, updated, fetched: docs.length };
}

async function deauthorize(user, provider) {
  const slot = user?.[provider];
  if (!slot?.accessToken) return;
  try {
    if (provider === 'polar' && slot.athleteId) {
      await axios.delete(`${POLAR_API}/v3/users/${encodeURIComponent(slot.athleteId)}`, {
        headers: { Authorization: `Bearer ${slot.accessToken}` },
        timeout: 15000,
      });
    } else if (provider === 'coros') {
      const body = new URLSearchParams({ token: slot.accessToken });
      await axios.post(`${COROS_API}/oauth2/deauthorize`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });
    }
  } catch (err) {
    console.warn(`[${provider}] deauthorize failed:`, err?.response?.status || err.message);
  }
}

module.exports = {
  isProvider,
  credentials,
  missingCredentialsMessage,
  exchangePolarCode,
  exchangeCorosCode,
  registerPolarUser,
  syncWatchProvider,
  deauthorize,
  COROS_API,
};
