/**
 * premiumScheduler.js
 *
 * Drains the recurring premium letter. Unlike the one-shot campaigns this one
 * never finishes — people become eligible again two months after their last
 * letter, up to three — so it is written to tick quietly forever rather than
 * to empty a queue.
 *
 * SAFETY: off by default, like every campaign that writes to the whole base.
 * Set ENABLE_PREMIUM_SCHEDULER=true once you have previewed it.
 *
 * The daily cap matters more here than elsewhere. Of a 300/day Brevo
 * allowance, a Sunday already peaked at 230 because the retention digest has
 * no cap of its own; 12/day leaves that peak alone while still reaching every
 * eligible account inside two months.
 *
 * Env:
 *   ENABLE_PREMIUM_SCHEDULER=true     (required — off by default)
 *   PREMIUM_INTERVAL_MS=3600000       default 60 min
 *   PREMIUM_EMAILS_PER_TICK=2         default 2
 *   PREMIUM_EMAIL_GAP_MS=120000       default 2 min between sends
 *   PREMIUM_DAILY_CAP=12              default 12/day
 */

'use strict';

const { sendPremiumPitch, findReadyCandidates } = require('./premiumCampaignService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    emailsPerTick: Number(process.env.PREMIUM_EMAILS_PER_TICK || 2),
    gapMs: Number(process.env.PREMIUM_EMAIL_GAP_MS || 2 * 60 * 1000),
    dailyCap: Number(process.env.PREMIUM_DAILY_CAP || 12),
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
  if (emailsSentToday >= dailyCap) return;

  isRunning = true;
  const stats = { sent: 0, skipped: 0, failed: 0 };
  try {
    const slotsLeft = Math.min(emailsPerTick, dailyCap - emailsSentToday);
    const candidates = await findReadyCandidates(slotsLeft);
    // Silence is the normal state here: most days everybody eligible is
    // inside somebody else's quiet period.
    if (candidates.length === 0) return;

    for (let i = 0; i < candidates.length; i += 1) {
      if (emailsSentToday >= dailyCap) break;
      const { user, hasTest } = candidates[i];
      const result = await sendPremiumPitch(user, { hasTest });
      if (result.sent) { stats.sent += 1; emailsSentToday += 1; }
      else if (result.reason === 'send_failed' || result.reason === 'relay_rejected') stats.failed += 1;
      else stats.skipped += 1;
      if (i < candidates.length - 1 && result.sent) await sleep(gapMs);
    }
    if (stats.sent || stats.failed) {
      console.log(`[PremiumScheduler] tick: sent=${stats.sent} skipped=${stats.skipped} ` +
        `failed=${stats.failed} today=${emailsSentToday}/${dailyCap}`);
    } else if (stats.skipped) {
      // A tick that only skips used to say nothing at all, which is exactly
      // how a queue headed by undeliverable addresses looked like a scheduler
      // that was never started.
      console.log(`[PremiumScheduler] tick: nothing sent, ${stats.skipped} skipped ` +
        `(candidates were refused at send time)`);
    }
  } catch (e) {
    console.error('[PremiumScheduler] tick error:', e);
  } finally {
    isRunning = false;
  }
}

function startPremiumScheduler() {
  if (process.env.ENABLE_PREMIUM_SCHEDULER !== 'true') {
    console.log('[PremiumScheduler] Disabled. Set ENABLE_PREMIUM_SCHEDULER=true to start the premium letter.');
    return;
  }
  const intervalMs = Number(process.env.PREMIUM_INTERVAL_MS || 60 * 60 * 1000);
  const { dailyCap, emailsPerTick, gapMs } = cfg();
  const run = () => tick().catch((e) => console.error('[PremiumScheduler]', e));
  setTimeout(run, 150_000); // last in the stagger — nothing here is urgent
  setInterval(run, intervalMs);
  console.log(`[PremiumScheduler] Started. interval=${intervalMs / 60_000}min ` +
    `perTick=${emailsPerTick} gap=${gapMs / 1000}s dailyCap=${dailyCap}`);
}

module.exports = { startPremiumScheduler, tick };
