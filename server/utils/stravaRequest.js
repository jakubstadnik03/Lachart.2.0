'use strict';

/**
 * The one way to call Strava.
 *
 * Every request has to do three things beyond the HTTP call: reserve a token
 * from the shared budget, feed Strava's own counters back into that budget,
 * and report a 429 so the whole application stands down. Call sites that did
 * the HTTP part by hand skipped all three, which is why the estimator saw
 * roughly half the traffic it was supposed to be pacing — 2 400 counted
 * against 4 400 that Strava actually recorded on 2026-08-17.
 *
 * Errors are rethrown untouched so callers keep their own handling.
 */

const axios = require('axios');
const stravaBudget = require('./stravaBudget');

/**
 * @param {string} url absolute Strava API url
 * @param {object} [config] axios config (headers, params, timeout…)
 * @param {{ bypass?: boolean, priority?: 'interactive'|'bulk' }} [opts]
 *   bypass: a user is waiting — spend the token without waiting for headroom
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function stravaGet(url, config = {}, opts = {}) {
  const { bypass = false, priority = 'interactive' } = opts;
  await stravaBudget.take({ bypass, priority });
  try {
    const resp = await axios.get(url, config);
    try { stravaBudget.reconcileFromHeaders(resp.headers); } catch { /* never break a good response */ }
    stravaBudget.clearRateLimit();
    return resp;
  } catch (err) {
    stravaBudget.noteRateLimitedResponse(err);
    throw err;
  }
}

/**
 * A read someone is waiting for — an activity being opened, laps being typed.
 *
 * Spends its token without queueing behind the soft ceiling, exactly as these
 * call sites behaved before they were routed through the budget. The point of
 * moving them here was never to start refusing them; it was to stop them being
 * invisible to the pacing that everything else obeys.
 */
function stravaGetInteractive(url, config = {}) {
  return stravaGet(url, config, { bypass: true });
}

module.exports = { stravaGet, stravaGetInteractive };
