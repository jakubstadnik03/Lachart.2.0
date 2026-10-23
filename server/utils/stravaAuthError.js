/**
 * Telling a Strava authorisation failure that will fix itself from one that
 * never will.
 *
 * The backfill treated both the same: pause five minutes, start again. For a
 * token that merely needs refreshing that is right. For a user who has
 * withdrawn the activity scope it is a loop with no exit — the log shows the
 * same user failing every five minutes, indefinitely, and each attempt spends
 * calls from an app-wide rate limit that every other user shares.
 *
 * Strava distinguishes them in the body:
 *
 *   {"message":"Authorization Error","errors":[
 *     {"resource":"AccessToken","field":"activity:read_permission","code":"missing"}]}
 *
 * A missing *permission* is a decision the athlete made in their Strava
 * settings. No retry reverses it; only they can, by reconnecting.
 */

'use strict';

/**
 * A field naming a permission rather than a parameter. Strava reports a
 * withdrawn scope as `activity:read_permission`, and names the scopes
 * themselves the other way round — `profile:read_all`, `activity:write`. Both
 * are the athlete's decision. A plain `id` or `access_token` is neither, and
 * must not stop a backfill for good.
 */
const PERMISSION_FIELD = /_permission$|^(read|read_all)$|^[a-z]+:(read|read_all|write)$/i;

/**
 * @param {any} error  an axios error from the Strava API
 * @returns {{permanent: boolean, reason: string|null}}
 */
function classifyStravaAuthError(error) {
  const status = error?.response?.status;
  if (status !== 401 && status !== 403) return { permanent: false, reason: null };

  const body = error?.response?.data;
  const errors = Array.isArray(body?.errors) ? body.errors : [];

  for (const e of errors) {
    const field = String(e?.field || '');
    const code = String(e?.code || '').toLowerCase();
    // The athlete removed, or never granted, a scope.
    if (code === 'missing' && PERMISSION_FIELD.test(field)) {
      return { permanent: true, reason: `scope_missing:${field}` };
    }
    // Strava says this one outright when the athlete disconnects the app.
    if (code === 'invalid' && /^(access_?token|refresh_?token)$/i.test(field)) {
      return { permanent: true, reason: `token_invalid:${field}` };
    }
  }

  // A 401 we cannot read precisely — an expired access token looks like this,
  // and refreshing fixes it. Retryable, but the caller must bound it.
  return { permanent: false, reason: 'auth_unclear' };
}

module.exports = { classifyStravaAuthError };
