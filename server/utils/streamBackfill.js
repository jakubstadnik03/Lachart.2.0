/**
 * Fetch the per-second streams a zone distribution actually needs.
 *
 * Streams are stored only for newly synced activities and ones an athlete has
 * opened, so a back catalogue has none. Without them the Balance view falls
 * back to placing a whole session in the zone of its average heart rate — which
 * reads 97% easy for someone doing 16×1min at 420 W, because an average
 * dissolves exactly the intervals the chart exists to show.
 *
 * So the missing ones are fetched. Deliberately a few at a time: this account
 * already hits Strava's budget during sync, and a view that tried to backfill a
 * year of activities at once would take the integration down to fill in a
 * chart. A handful per request means the chart sharpens over a few visits
 * instead, and each activity is fetched once ever.
 */

'use strict';

const axios = require('axios');
const StravaStream = require('../models/StravaStream');
const User = require('../models/UserModel');
const stravaBudget = require('./stravaBudget');
const { getValidStravaToken } = require('./stravaToken');

/** Per request. Low on purpose — see the file header. */
const DEFAULT_LIMIT = 8;

/**
 * Key sets, widest first: Strava 400s on latlng for indoor activities, and on
 * watts where there is no power meter, so the request steps down until one is
 * accepted rather than giving up on the first refusal.
 *
 * latlng is asked for even though the zone chart has no use for it. Without it
 * the weather lookup has no location on the activity and has to buy the start
 * point with a second Strava request — from the same exhausted bulk lane that
 * made this file necessary. One request that answers both questions costs
 * nothing extra; the indoor rungs below drop it, which is exactly when there
 * is no weather to look up anyway.
 */
const KEY_SETS = [
  'time,heartrate,watts,velocity_smooth,distance,latlng',
  'time,heartrate,velocity_smooth,distance,latlng',
  'time,heartrate,distance,latlng',
  'time,heartrate,watts,velocity_smooth,distance',
  'time,heartrate,velocity_smooth,distance',
  'time,heartrate,distance',
  'time,heartrate',
];

async function fetchStreams(token, stravaId) {
  for (const keys of KEY_SETS) {
    try {
      await stravaBudget.take({ priority: 'bulk' });
      const resp = await axios.get(
        `https://www.strava.com/api/v3/activities/${stravaId}/streams`,
        {
          params: { keys, key_by_type: true },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 20000,
        },
      );
      try { stravaBudget.reconcileFromHeaders(resp.headers); } catch { /* swallow */ }

      const raw = resp.data || {};
      const out = {};
      for (const [key, val] of Object.entries(raw)) {
        if (Array.isArray(val?.data)) out[key] = val.data;
      }
      // A response with no heart rate is still worth storing: it stops this
      // activity being asked about again, and the caller can see there is
      // genuinely none rather than assuming it was never fetched.
      if (Object.keys(out).length) return out;
      return {};
    } catch (err) {
      const status = err?.response?.status;
      // Tell the shared budget about a rate limit so every other Strava caller
      // stands down too, not just this loop.
      stravaBudget.noteRateLimitedResponse(err);
      // 400 means this key set does not apply to the activity — try a narrower
      // one. Anything else (429, 401, network) is not fixed by asking again.
      if (status !== 400) {
        // A budget refusal is the common case and "reserved for interactive
        // traffic" alone does not say which ceiling was hit or how close it
        // was — print the counters so the next diagnosis is one line, not a
        // code read.
        if (err?.code === 'STRAVA_BUDGET_EXHAUSTED') {
          const s = err.snapshot || {};
          console.warn(
            `[streams] ${stravaId} refused by local budget — window ${s.windowUsed}/${s.bulkWindowLimit}, `
            + `day ${s.dayUsed}/${s.bulkDayLimit}, resets in ${err.retryAfterSec}s`,
          );
        } else {
          console.warn(`[streams] ${stravaId} failed:`, status || err.message);
        }
        return null;
      }
    }
  }
  return {};
}

/**
 * Store streams for activities that have none.
 *
 * @param {string} userId
 * @param {Array<string|number>} stravaIds  candidates, most useful first
 * @param {object} opts
 * @returns {Promise<{ fetched: number, remaining: number }>}
 */
async function backfillStreams(userId, stravaIds = [], { limit = DEFAULT_LIMIT } = {}) {
  const ids = [...new Set(stravaIds.map(String))].filter(Boolean);
  if (!ids.length) return { fetched: 0, remaining: 0 };

  const have = await StravaStream.find({ userId, stravaId: { $in: ids } })
    .select('stravaId').lean();
  const haveSet = new Set(have.map((d) => String(d.stravaId)));
  const missing = ids.filter((id) => !haveSet.has(id));
  if (!missing.length) return { fetched: 0, remaining: 0 };

  const user = await User.findById(userId).select('strava');
  if (!user?.strava?.accessToken) return { fetched: 0, remaining: missing.length };

  const token = await getValidStravaToken(user);
  if (!token) return { fetched: 0, remaining: missing.length };

  let fetched = 0;
  for (const stravaId of missing.slice(0, limit)) {
    // eslint-disable-next-line no-await-in-loop
    const streams = await fetchStreams(token, stravaId);
    // null means the request failed — leave it unstored so a later visit
    // retries, rather than recording an empty stream as the truth.
    if (streams === null) break;
    // eslint-disable-next-line no-await-in-loop
    await StravaStream.updateOne(
      { userId, stravaId },
      { $set: { streams, fetchedAt: new Date() } },
      { upsert: true },
    );
    fetched += 1;
  }

  return { fetched, remaining: Math.max(0, missing.length - fetched) };
}

module.exports = { backfillStreams, DEFAULT_LIMIT };
