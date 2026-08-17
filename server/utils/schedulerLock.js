'use strict';

/**
 * A lease that lets only one process run a given scheduled job.
 *
 * Every instance of the server starts the same setInterval loops, and the
 * Strava quota is per-application — so two instances mean twice the outbound
 * calls against one allowance, with each process counting only its own half.
 * Observed on production 2026-08-17: the polling tick logged 20 runs per
 * 5-minute interval against a configured batch of 10, while each instance's
 * estimator reported the window barely touched.
 *
 * Correctness comes from Mongo's atomic findOneAndUpdate: the filter only
 * matches an expired (or self-held) lease, so exactly one caller can win.
 * A crashed holder is not a problem — the lease simply expires.
 *
 * Deliberately not a strong distributed lock: the worst case of a stale clock
 * is that two instances run one tick, which is exactly today's behaviour.
 */

const mongoose = require('mongoose');

const COLLECTION = 'schedulerlocks';

/** Identifies this process in the lease, for logging and self-renewal. */
const HOLDER = `${process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || 'local'}-${process.pid}`;

/**
 * Try to hold `name` for the next `ttlMs`.
 *
 * @param {string} name job identifier, e.g. 'strava-auto-sync'
 * @param {number} ttlMs how long the lease is good for — set it longer than
 *   the tick interval so a slow tick is not overtaken by the next instance
 * @returns {Promise<boolean>} true when this process may run the job
 */
async function claimSchedulerLock(name, ttlMs) {
  // No database yet (boot race) — let the caller run rather than stall the job.
  if (mongoose.connection?.readyState !== 1) return true;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    const res = await mongoose.connection.db.collection(COLLECTION).findOneAndUpdate(
      {
        _id: name,
        $or: [
          { expiresAt: { $lte: now } },
          { holder: HOLDER },
        ],
      },
      { $set: { holder: HOLDER, expiresAt, updatedAt: now } },
      { upsert: true, returnDocument: 'after' },
    );
    // Driver 4/5 wrap the document in {value}; driver 6 returns it directly.
    // The wrapper is truthy even when value is null, so unwrap before testing.
    const doc = res && Object.prototype.hasOwnProperty.call(res, 'value') ? res.value : res;
    return Boolean(doc);
  } catch (e) {
    // Duplicate key = someone else holds a live lease. Anything else is
    // infrastructure noise, and a scheduler that cannot reach Mongo has
    // nothing useful to do anyway.
    if (e?.code === 11000) return false;
    console.warn(`[SchedulerLock] ${name}: ${e?.message || e}`);
    return false;
  }
}

module.exports = { claimSchedulerLock, HOLDER };
