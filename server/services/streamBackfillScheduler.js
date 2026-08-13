/**
 * streamBackfillScheduler.js
 *
 * Fetches the per-second traces the Balance chart needs, at times when nobody
 * is competing for the Strava budget.
 *
 * WHY THIS EXISTS: the backfill used to run inside the request that renders the
 * chart. That is exactly the wrong moment. Opening the app is when interactive
 * Strava traffic peaks — the auto-sync, the activity the athlete just tapped —
 * so the 15-minute window is at its fullest precisely when the backfill asks
 * for it. Marked 'bulk', it loses that contest every time and take() throws
 * "Strava budget reserved for interactive traffic" before a single request
 * leaves the server. Observed on production 2026-08-13: every attempt refused,
 * no trace ever fetched, so Balance kept estimating from session averages.
 *
 * take() waits at most 30s for headroom; a full window is up to 15 minutes from
 * resetting, so waiting could never have helped either.
 *
 * The work is not time-critical — it just has to be done before the athlete
 * next looks. So it moves out of the request and into a tick that only spends
 * budget when there is slack, and skips entirely when there is not. Overnight
 * the whole allowance sits idle; that is when a back catalogue gets filled.
 *
 * Env:
 *   ENABLE_STREAM_BACKFILL=false     opt out (on by default)
 *   STREAM_BACKFILL_INTERVAL_MS      default 20 min
 *   STREAM_BACKFILL_USERS            default 5  users per tick
 *   STREAM_BACKFILL_PER_USER         default 12 activities per user per tick
 *   STREAM_BACKFILL_DAYS             default 120 — how far back to bother
 *   STREAM_BACKFILL_HEADROOM         default 15 — window slots left untouched
 */

'use strict';

const StravaActivity = require('../models/StravaActivity');
const StravaStream = require('../models/StravaStream');
const User = require('../models/UserModel');
const stravaBudget = require('../utils/stravaBudget');
const { backfillStreams } = require('../utils/streamBackfill');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    intervalMs: Number(process.env.STREAM_BACKFILL_INTERVAL_MS || 20 * 60 * 1000),
    users: Number(process.env.STREAM_BACKFILL_USERS || 5),
    perUser: Number(process.env.STREAM_BACKFILL_PER_USER || 12),
    days: Number(process.env.STREAM_BACKFILL_DAYS || 120),
    headroom: Number(process.env.STREAM_BACKFILL_HEADROOM || 15),
  };
}

let isRunning = false;
/** Rotates the starting point so the same users aren't always served first. */
let cursor = 0;

/**
 * Is there room to spend on traces right now?
 *
 * Deliberately stricter than take() itself: this asks whether there is
 * comfortable slack, not whether one more request would squeeze in. Being the
 * lowest-priority work in the system, it should leave before it is pushed.
 */
function hasHeadroom(headroom) {
  const s = stravaBudget.snapshot();
  return (
    s.windowUsed + headroom < s.bulkWindowLimit
    && s.dayUsed + headroom < s.bulkDayLimit
  );
}

/** Recent activities of this user that have no stored trace. */
async function missingFor(userId, since, limit) {
  const acts = await StravaActivity.find({ userId, startDate: { $gte: since } })
    .select('stravaId')
    .sort({ startDate: -1 })
    .limit(400)
    .lean();
  if (!acts.length) return [];

  const ids = acts.map((a) => String(a.stravaId)).filter(Boolean);
  const have = await StravaStream.find({ userId, stravaId: { $in: ids } })
    .select('stravaId')
    .lean();
  const haveSet = new Set(have.map((d) => String(d.stravaId)));

  // Newest first: the weeks an athlete actually looks at sharpen soonest.
  return ids.filter((id) => !haveSet.has(id)).slice(0, limit);
}

async function backfillDueStreams() {
  const { users, perUser, days, headroom } = cfg();

  if (!hasHeadroom(headroom)) {
    const s = stravaBudget.snapshot();
    console.log(
      `[StreamBackfill] skipped — no slack (window ${s.windowUsed}/${s.bulkWindowLimit}, `
      + `day ${s.dayUsed}/${s.bulkDayLimit})`,
    );
    return { attempted: 0, fetched: 0 };
  }

  const connected = await User.find({ 'strava.accessToken': { $exists: true, $ne: null } })
    .select('_id email')
    .sort({ _id: 1 })
    .lean();
  if (!connected.length) return { attempted: 0, fetched: 0 };

  // Rotate so a user late in the list is not permanently last in the queue.
  const start = cursor % connected.length;
  const slice = [...connected.slice(start), ...connected.slice(0, start)].slice(0, users);
  cursor = (start + slice.length) % connected.length;

  const since = new Date(Date.now() - days * 86400000);
  const stats = { attempted: 0, fetched: 0, users: 0 };

  for (const u of slice) {
    // Re-check between users: an athlete may have opened the app mid-tick, and
    // their sync matters more than this does.
    if (!hasHeadroom(headroom)) {
      console.log('[StreamBackfill] stopping early — interactive traffic arrived');
      break;
    }

    const ids = await missingFor(u._id, since, perUser);
    if (!ids.length) continue;

    stats.users += 1;
    stats.attempted += ids.length;
    try {
      const { fetched } = await backfillStreams(u._id, ids, { limit: perUser });
      stats.fetched += fetched;
    } catch (e) {
      console.warn(`[StreamBackfill] ${u.email || u._id} failed: ${e?.message || e}`);
    }
    await sleep(500); // gentle, and leaves gaps for interactive requests
  }

  if (stats.attempted) {
    console.log(
      `[StreamBackfill] users=${stats.users} missing=${stats.attempted} fetched=${stats.fetched}`,
    );
  }
  return stats;
}

async function tick() {
  if (isRunning) return;
  isRunning = true;
  try {
    await backfillDueStreams();
  } catch (e) {
    console.error('[StreamBackfill] tick error:', e?.message || e);
  } finally {
    isRunning = false;
  }
}

function startStreamBackfillScheduler() {
  if (process.env.ENABLE_STREAM_BACKFILL === 'false') {
    console.log('[StreamBackfill] Disabled via ENABLE_STREAM_BACKFILL=false.');
    return;
  }
  const { intervalMs, users, perUser } = cfg();
  const run = () => tick().catch((e) => console.error('[StreamBackfill]', e));
  setTimeout(run, 90_000); // well behind the sync schedulers on boot
  setInterval(run, intervalMs);
  console.log(
    `[StreamBackfill] Started. interval=${Math.round(intervalMs / 60000)}min `
    + `users=${users} perUser=${perUser}`,
  );
}

module.exports = {
  startStreamBackfillScheduler,
  backfillDueStreams,
  hasHeadroom,
  missingFor,
  tick,
};
