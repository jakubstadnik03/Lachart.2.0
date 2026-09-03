/**
 * predictedCurveScheduler.js
 *
 * Drains the "here is the curve your training implies" campaign — one email
 * per athlete, ever — with the same Zoho-safe pacing as the win-back drip.
 *
 * SAFETY: like winBackScheduler, this is NOT auto-on in production. It writes
 * to people who have never tested, which is most of the base, so it has to be
 * switched on deliberately after previewing the email.
 *
 * Env:
 *   ENABLE_PREDICTED_CURVE_SCHEDULER=true   (required — off by default, even in prod)
 *   PREDICTED_CURVE_INTERVAL_MS=1800000     default 30 min
 *   PREDICTED_CURVE_EMAILS_PER_TICK=3       default 3
 *   PREDICTED_CURVE_EMAIL_GAP_MS=120000     default 2 min between sends
 *   PREDICTED_CURVE_DAILY_CAP=20            default 20/day
 */

'use strict';

const { sendPredictedCurve, findReadyCandidates } = require('./predictedCurveCampaignService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    emailsPerTick: Number(process.env.PREDICTED_CURVE_EMAILS_PER_TICK || 3),
    gapMs: Number(process.env.PREDICTED_CURVE_EMAIL_GAP_MS || 2 * 60 * 1000),
    dailyCap: Number(process.env.PREDICTED_CURVE_DAILY_CAP || 20),
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
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) return;

  resetDailyCounterIfNeeded();
  const { emailsPerTick, gapMs, dailyCap } = cfg();
  if (emailsSentToday >= dailyCap) {
    console.log(`[PredictedCurveScheduler] daily cap reached (${dailyCap}), skipping tick`);
    return;
  }

  isRunning = true;
  const stats = { attempted: 0, sent: 0, skipped: 0, failed: 0, bySport: { bike: 0, run: 0 } };
  try {
    const slotsLeft = Math.min(emailsPerTick, dailyCap - emailsSentToday);
    const candidates = await findReadyCandidates(slotsLeft);
    if (!candidates.length) { console.log('[PredictedCurveScheduler] no ready candidates'); return; }

    for (let i = 0; i < candidates.length; i += 1) {
      // Re-checked inside sendPredictedCurve: the pool was built before the
      // first send in this tick, and an athlete can enter a test in between.
      const { user } = candidates[i];
      stats.attempted += 1;
      const result = await sendPredictedCurve(user);
      if (result.sent) {
        stats.sent += 1;
        emailsSentToday += 1;
        if (stats.bySport[result.sport] != null) stats.bySport[result.sport] += 1;
      } else if (result.reason === 'send_failed' || result.reason === 'relay_rejected') {
        stats.failed += 1;
      } else {
        stats.skipped += 1;
      }
      if (i < candidates.length - 1 && emailsSentToday < dailyCap) await sleep(gapMs);
    }
    console.log('[PredictedCurveScheduler] tick', { ...stats, sentToday: emailsSentToday });
  } catch (e) {
    console.error('[PredictedCurveScheduler] tick error:', e?.message || e);
  } finally {
    isRunning = false;
  }
}

function startPredictedCurveScheduler() {
  if (process.env.ENABLE_PREDICTED_CURVE_SCHEDULER !== 'true') {
    console.log('[PredictedCurveScheduler] Disabled (set ENABLE_PREDICTED_CURVE_SCHEDULER=true to enable).');
    return;
  }
  const intervalMs = Number(process.env.PREDICTED_CURVE_INTERVAL_MS || 30 * 60 * 1000);
  // Late first tick: the estimate reads activity summaries, and a server that
  // has just come up may still be draining a sync queue.
  setTimeout(() => tick().catch((e) => console.error('[PredictedCurveScheduler]', e)), 3 * 60 * 1000);
  setInterval(() => tick().catch((e) => console.error('[PredictedCurveScheduler]', e)), intervalMs);
  console.log('[PredictedCurveScheduler] Started.', { intervalMs, ...cfg() });
}

module.exports = { startPredictedCurveScheduler, tick };
