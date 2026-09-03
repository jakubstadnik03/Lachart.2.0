/**
 * thresholdShiftScheduler.js
 *
 * Walks athletes who have a lactate test and tells them when the training
 * since it says their threshold has moved. See thresholdShiftNoticeService for
 * the bar it has to clear.
 *
 * On in production, like the other notification schedulers — this is a push to
 * someone about their own data, not a mass email, and the service is
 * conservative enough that most ticks tell nobody anything.
 *
 * The batch is small on purpose. Reading a season of sessions for one athlete
 * is the expensive part; every read is cached per activity, so the first pass
 * over the base is slow and every pass after it is nearly free.
 *
 * Env:
 *   ENABLE_THRESHOLD_SHIFT_SCHEDULER=false  turn it off
 *   THRESHOLD_SHIFT_INTERVAL_MS=3600000     default 1 h
 *   THRESHOLD_SHIFT_USERS_PER_TICK=5        default 5
 */

'use strict';

const { checkUser, findUsersToCheck } = require('./thresholdShiftNoticeService');

let isRunning = false;

async function tick() {
  if (isRunning) return;
  isRunning = true;
  const stats = { checked: 0, notified: 0 };
  try {
    const perTick = Number(process.env.THRESHOLD_SHIFT_USERS_PER_TICK || 5);
    const users = await findUsersToCheck(perTick);
    if (!users.length) return;

    for (const user of users) {
      // eslint-disable-next-line no-await-in-loop
      const told = await checkUser(user).catch((e) => {
        console.warn('[ThresholdShiftScheduler] user', user._id, e?.message || e);
        return [];
      });
      stats.checked += 1;
      stats.notified += told.length;
      if (told.length) console.log('[ThresholdShiftScheduler] told', String(user._id), told);
    }
    if (stats.notified) console.log('[ThresholdShiftScheduler] tick', stats);
  } catch (e) {
    console.error('[ThresholdShiftScheduler] tick error:', e?.message || e);
  } finally {
    isRunning = false;
  }
}

function startThresholdShiftScheduler() {
  const enabled = process.env.ENABLE_THRESHOLD_SHIFT_SCHEDULER === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.ENABLE_THRESHOLD_SHIFT_SCHEDULER !== 'false');
  if (!enabled) {
    console.log('[ThresholdShiftScheduler] Disabled (set ENABLE_THRESHOLD_SHIFT_SCHEDULER=true to enable).');
    return;
  }
  const intervalMs = Number(process.env.THRESHOLD_SHIFT_INTERVAL_MS || 60 * 60 * 1000);
  // Late first tick: the walk reads activity streams, and a server that has
  // just come up may still be draining a sync queue.
  setTimeout(() => tick().catch((e) => console.error('[ThresholdShiftScheduler]', e)), 5 * 60 * 1000);
  setInterval(() => tick().catch((e) => console.error('[ThresholdShiftScheduler]', e)), intervalMs);
  console.log('[ThresholdShiftScheduler] Started.', { intervalMs });
}

module.exports = { startThresholdShiftScheduler, tick };
