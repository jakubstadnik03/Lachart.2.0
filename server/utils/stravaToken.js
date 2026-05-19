/**
 * Shared Strava OAuth token helpers.
 *
 * Why this file exists: the route module and the auto-sync service used
 * to each carry their own copy of `getValidStravaToken`. They drifted:
 * the service version called `user.strava = undefined; await user.save()`
 * on ANY 4xx response from Strava's token endpoint, which meant a
 * momentary Strava outage or a malformed body silently disconnected the
 * user. That was a major contributor to "občas to nejde stáhnout".
 *
 * This module is now the single source of truth. The key invariant:
 * we ONLY wipe `user.strava` when Strava explicitly tells us the
 * refresh_token is invalid/revoked. Every other failure path keeps the
 * existing token and tells the caller "try again". A user reconnecting
 * is a manual action that should never happen because of a server-side
 * blip.
 */

const axios = require('axios');

/** Normalise `user.strava.expiresAt` to a UNIX-seconds number. The schema
 *  has at various times stored it as Number, Date, or a String — accept all. */
function stravaExpiresAtSeconds(expiresAt) {
  if (expiresAt == null) return null;
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) return expiresAt;
  if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
    return Math.floor(expiresAt.getTime() / 1000);
  }
  const n = Number(expiresAt);
  return Number.isFinite(n) ? n : null;
}

/**
 * Return a working access token for this user, refreshing first if the
 * current one expires in <= 60 seconds.
 *
 * Returns `null` ONLY when:
 *   - User has no Strava connection at all
 *   - Strava explicitly rejected the refresh_token (invalid_grant /
 *     refresh_token revoked) — in that case we also wipe user.strava
 *     so the UI shows "Not connected" and the user can reconnect.
 *
 * On any other failure (5xx, network timeout, env var missing, transient
 * 4xx without invalid_grant) we return the user's current access token
 * — it might still work, and at worst the caller's next Strava request
 * will fail loudly with a real 401 that the caller can handle.
 */
async function getValidStravaToken(user) {
  if (!user?.strava?.accessToken) return null;

  const now = Math.floor(Date.now() / 1000);
  const exp = stravaExpiresAtSeconds(user.strava.expiresAt);
  if (exp != null && exp - 60 > now) return user.strava.accessToken;

  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    console.error('[stravaToken] credentials missing for refresh');
    return user.strava.accessToken;
  }
  if (!user.strava.refreshToken) {
    console.error('[stravaToken] no refresh token for user', String(user._id));
    return user.strava.accessToken;
  }

  try {
    const resp = await axios.post('https://www.strava.com/oauth/token', {
      client_id,
      client_secret,
      grant_type: 'refresh_token',
      refresh_token: user.strava.refreshToken,
    }, { timeout: 15000 });

    user.strava.accessToken = resp.data.access_token;
    user.strava.refreshToken = resp.data.refresh_token || user.strava.refreshToken;
    user.strava.expiresAt = resp.data.expires_at;
    await user.save();
    return user.strava.accessToken;
  } catch (error) {
    const body = error.response?.data;
    const msg = typeof body?.message === 'string' ? body.message.toLowerCase() : '';
    const invalidGrant =
      msg.includes('invalid') && (msg.includes('grant') || msg.includes('refresh'));
    const errors = Array.isArray(body?.errors) ? body.errors : [];
    const refreshRevoked = errors.some(
      (e) =>
        String(e?.field || '') === 'refresh_token' &&
        String(e?.code || '').toLowerCase().includes('invalid'),
    );

    const status = error.response?.status;
    console.error('[stravaToken] refresh error:', status || '', body || error.message);

    // Only wipe the connection when Strava explicitly says the refresh
    // token itself is dead. Every other 4xx/5xx stays connected so the
    // user doesn't lose their integration over a 5-second Strava blip.
    if ((status === 400 || status === 401) && (invalidGrant || refreshRevoked)) {
      console.log('[stravaToken] refresh rejected (invalid_grant); clearing Strava connection for user', String(user._id));
      user.strava = undefined;
      try { await user.save(); } catch (saveErr) {
        console.error('[stravaToken] failed to save user after wipe:', saveErr.message);
      }
      return null;
    }
    return user.strava.accessToken || null;
  }
}

module.exports = { getValidStravaToken, stravaExpiresAtSeconds };
