/**
 * cancelFeedbackScheduler.js
 *
 * Drains the cancel-feedback campaign gradually. The churned handful goes out
 * first — there are two dozen of them and they are the ones with something to
 * say — and the five hundred who never started a plan follow behind at a pace
 * the relay will tolerate.
 *
 * SAFETY: off by default, in production too. A mass mail to the existing base
 * is switched on deliberately, after previewing both segments through the
 * admin routes. Same rule as the win-back scheduler, for the same reason.
 *
 * Env:
 *   ENABLE_CANCEL_FEEDBACK_SCHEDULER=true   (required — off by default)
 *   CANCEL_FEEDBACK_INTERVAL_MS=1800000     default 30 min
 *   CANCEL_FEEDBACK_EMAILS_PER_TICK=3       default 3
 *   CANCEL_FEEDBACK_EMAIL_GAP_MS=120000     default 2 min between sends
 *   CANCEL_FEEDBACK_DAILY_CAP=30            default 30/day (~2.5 weeks for 500)
 */

'use strict';

const { sendCancelFeedback, findReadyCandidates } = require('./cancelFeedbackCampaignService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    emailsPerTick: Number(process.env.CANCEL_FEEDBACK_EMAILS_PER_TICK || 3),
    gapMs: Number(process.env.CANCEL_FEEDBACK_EMAIL_GAP_MS || 2 * 60 * 1000),
    dailyCap: Number(process.env.CANCEL_FEEDBACK_DAILY_CAP || 30),
  };
}

let emailsSentToday = 0;
let dailyCounterDate = new Date().toISOString().slice(0, 10);
let isRunning = false;

function resetDailyCounterIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyCounterDate) { dailyCounterDate = today; emailsSentToday = 0; }
}

async function tick() {
  if (isRunning) return;
  if (process.env.ENABLE_CANCEL_FEEDBACK_SCHEDULER !== 'true') return;
  isRunning = true;
  try {
    resetDailyCounterIfNeeded();
    const { emailsPerTick, gapMs, dailyCap } = cfg();
    const room = Math.min(emailsPerTick, Math.max(0, dailyCap - emailsSentToday));
    if (room <= 0) return;

    // findReadyCandidates already puts the churned segment first.
    const candidates = await findReadyCandidates(room);
    for (let i = 0; i < candidates.length; i += 1) {
      const { user, segment } = candidates[i];
      const result = await sendCancelFeedback(user, { segment });
      if (result.sent) emailsSentToday += 1;
      if (i < candidates.length - 1) await sleep(gapMs);
    }
    if (candidates.length) {
      console.log(`[cancelFeedbackScheduler] ${candidates.length} processed, ${emailsSentToday}/${dailyCap} today`);
    }
  } catch (e) {
    console.error('[cancelFeedbackScheduler] tick failed:', e?.message || e);
  } finally {
    isRunning = false;
  }
}

function startCancelFeedbackScheduler() {
  if (process.env.ENABLE_CANCEL_FEEDBACK_SCHEDULER !== 'true') {
    console.log('[cancelFeedbackScheduler] disabled (set ENABLE_CANCEL_FEEDBACK_SCHEDULER=true)');
    return null;
  }
  const intervalMs = Number(process.env.CANCEL_FEEDBACK_INTERVAL_MS || 30 * 60 * 1000);
  console.log(`[cancelFeedbackScheduler] on — every ${Math.round(intervalMs / 60000)} min, cap ${cfg().dailyCap}/day`);
  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { startCancelFeedbackScheduler, tick };
