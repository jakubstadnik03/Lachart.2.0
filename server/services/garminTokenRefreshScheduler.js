/**
 * garminTokenRefreshScheduler.js
 *
 * Keeps Garmin OAuth2 access tokens alive.
 *
 * WHY THIS EXISTS: refreshing used to happen only inside getValidGarminToken(),
 * i.e. only when something already wanted to call Garmin for that user. A user
 * whose activities arrive by webhook (the normal case) is never the subject of
 * an outbound call, so nothing ever refreshed them and their token simply
 * expired. Measured on production 2026-08-05: 9 of 10 connected Garmin users
 * held an expired access token, one of them 17 days stale.
 *
 * Expiry is not fatal on its own — a refresh_token exchange still succeeded for
 * a token 17 days past expiry — but it silently breaks every pull, backfill and
 * webhook follow-up in the meantime, and Garmin refresh tokens do not live
 * forever. Refresh proactively, before expiry, instead of reactively.
 *
 * Env:
 *   ENABLE_GARMIN_TOKEN_REFRESH=false   opt out (on by default in production)
 *   GARMIN_TOKEN_REFRESH_INTERVAL_MS    default 30 min
 *   GARMIN_TOKEN_REFRESH_LEAD_SEC       default 6h — refresh this long before expiry
 *   GARMIN_TOKEN_REFRESH_BATCH          default 25 users per tick
 */

'use strict';

const axios = require('axios');
const User = require('../models/UserModel');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    intervalMs: Number(process.env.GARMIN_TOKEN_REFRESH_INTERVAL_MS || 30 * 60 * 1000),
    leadSec: Number(process.env.GARMIN_TOKEN_REFRESH_LEAD_SEC || 6 * 3600),
    batch: Number(process.env.GARMIN_TOKEN_REFRESH_BATCH || 25),
  };
}

let isRunning = false;

/**
 * Exchange a refresh token for a fresh access token and persist both.
 * Mirrors requestGarminToken()'s Basic-auth-then-body-credentials fallback.
 */
async function refreshOne(userDoc) {
  const tokenUrl = process.env.GARMIN_TOKEN_URL || process.env.GARMIN_OAUTH_TOKEN_URL;
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) return { ok: false, reason: 'config_missing' };

  const refreshToken = userDoc?.garmin?.refreshToken;
  if (!refreshToken) return { ok: false, reason: 'no_refresh_token' };

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const base = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

  let resp;
  try {
    resp = await axios.post(tokenUrl, base.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      timeout: 30000,
      validateStatus: () => true,
    });
    if ([400, 401, 403].includes(resp.status)) {
      const withCreds = new URLSearchParams(base.toString());
      withCreds.set('client_id', clientId);
      withCreds.set('client_secret', clientSecret);
      resp = await axios.post(tokenUrl, withCreds.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000,
        validateStatus: () => true,
      });
    }
  } catch (e) {
    return { ok: false, reason: `network:${e?.message || 'error'}` };
  }

  const data = resp?.data || {};
  const accessToken = data.access_token || data.accessToken;
  if (resp.status !== 200 || !accessToken) {
    return { ok: false, reason: `http_${resp?.status}`, body: JSON.stringify(data).slice(0, 160) };
  }

  const expiresIn = Number(data.expires_in || data.expiresIn || 0) || 0;
  await User.findByIdAndUpdate(userDoc._id, {
    'garmin.accessToken': accessToken,
    'garmin.refreshToken': data.refresh_token || data.refreshToken || refreshToken,
    'garmin.expiresAt': expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null,
    'garmin.tokenRefreshedAt': new Date(),
    $unset: { 'garmin.tokenRefreshError': '' },
  });
  return { ok: true };
}

/** Refresh everyone whose token is expired or expiring within the lead window. */
async function refreshDueTokens({ batch, leadSec } = cfg()) {
  const threshold = Math.floor(Date.now() / 1000) + leadSec;
  const users = await User.find({
    'garmin.refreshToken': { $exists: true, $ne: null },
    $or: [
      { 'garmin.expiresAt': { $lt: threshold } },
      { 'garmin.expiresAt': { $exists: false } },
      { 'garmin.expiresAt': null },
    ],
  })
    .select('_id email garmin.refreshToken garmin.expiresAt')
    // Most-expired first, so a long-dead token is never starved by the batch cap.
    .sort({ 'garmin.expiresAt': 1 })
    .limit(batch)
    .lean();

  if (!users.length) return { attempted: 0, refreshed: 0, failed: 0 };

  const stats = { attempted: 0, refreshed: 0, failed: 0 };
  for (const u of users) {
    stats.attempted += 1;
    const r = await refreshOne(u);
    if (r.ok) {
      stats.refreshed += 1;
    } else {
      stats.failed += 1;
      console.warn(`[GarminTokenRefresh] ${u.email || u._id} failed: ${r.reason}${r.body ? ' ' + r.body : ''}`);
      // Record it so a user who truly must re-authorize is visible, rather than
      // being retried silently forever.
      await User.findByIdAndUpdate(u._id, { 'garmin.tokenRefreshError': r.reason }).catch(() => {});
    }
    await sleep(250); // gentle on Garmin's auth endpoint
  }
  console.log(`[GarminTokenRefresh] attempted=${stats.attempted} refreshed=${stats.refreshed} failed=${stats.failed}`);
  return stats;
}

async function tick() {
  if (isRunning) return;
  isRunning = true;
  try {
    await refreshDueTokens();
  } catch (e) {
    console.error('[GarminTokenRefresh] tick error:', e?.message || e);
  } finally {
    isRunning = false;
  }
}

function startGarminTokenRefreshScheduler() {
  if (process.env.ENABLE_GARMIN_TOKEN_REFRESH === 'false') {
    console.log('[GarminTokenRefresh] Disabled via ENABLE_GARMIN_TOKEN_REFRESH=false.');
    return;
  }
  const { intervalMs, leadSec, batch } = cfg();
  const run = () => tick().catch((e) => console.error('[GarminTokenRefresh]', e));
  setTimeout(run, 45_000); // after boot, staggered behind the sync schedulers
  setInterval(run, intervalMs);
  console.log(
    `[GarminTokenRefresh] Started. interval=${Math.round(intervalMs / 60000)}min ` +
    `lead=${Math.round(leadSec / 3600)}h batch=${batch}`,
  );
}

module.exports = { startGarminTokenRefreshScheduler, refreshDueTokens, refreshOne, tick };
