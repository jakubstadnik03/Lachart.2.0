/**
 * appReengagementScheduler.js
 *
 * Automatically drains the 3-step web-only re-engagement drip with
 * Zoho-safe pacing:
 *   • tick every 30 min (configurable)
 *   • max N emails per tick with gap between sends
 *   • daily cap so we never blow the Zoho free-tier budget
 *
 * Env:
 *   ENABLE_APP_REENGAGEMENT_SCHEDULER=true   (auto-on in production)
 *   APP_REENGAGEMENT_INTERVAL_MS=1800000     default 30 min
 *   APP_REENGAGEMENT_EMAILS_PER_TICK=3       default 3
 *   APP_REENGAGEMENT_EMAIL_GAP_MS=120000     default 2 min between sends
 *   APP_REENGAGEMENT_DAILY_CAP=15            default 15/day
 *   APP_REENGAGEMENT_STEP_GAP_DAYS=7         days between drip steps
 *   APP_REENGAGEMENT_MIN_GAP_DAYS=6          min days between any step mail
 */

'use strict';

const {
  sendStep,
  findReadyCandidates,
} = require('./appReengagementCampaignService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    emailsPerTick: Number(process.env.APP_REENGAGEMENT_EMAILS_PER_TICK || 3),
    gapMs: Number(process.env.APP_REENGAGEMENT_EMAIL_GAP_MS || 2 * 60 * 1000),
    dailyCap: Number(process.env.APP_REENGAGEMENT_DAILY_CAP || 15),
  };
}

let emailsSentToday = 0;
let dailyCounterDate = new Date().toISOString().slice(0, 10);
let isRunning = false;

function resetDailyCounterIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyCounterDate) {
    dailyCounterDate = today;
    emailsSentToday = 0;
  }
}

async function tick() {
  if (isRunning) return;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    return;
  }

  resetDailyCounterIfNeeded();
  const { emailsPerTick, gapMs, dailyCap } = cfg();

  if (emailsSentToday >= dailyCap) {
    console.log(`[AppReengagementScheduler] daily cap reached (${dailyCap}), skipping tick`);
    return;
  }

  isRunning = true;
  const stats = { attempted: 0, sent: 0, skipped: 0, failed: 0, byStep: { 1: 0, 2: 0, 3: 0 } };

  try {
    const slotsLeft = Math.min(emailsPerTick, dailyCap - emailsSentToday);
    const candidates = await findReadyCandidates(slotsLeft);

    if (candidates.length === 0) {
      console.log('[AppReengagementScheduler] no ready candidates');
      return;
    }

    for (let i = 0; i < candidates.length; i++) {
      if (emailsSentToday >= dailyCap) break;

      const { user, step } = candidates[i];
      stats.attempted += 1;

      const result = await sendStep(user, step);
      if (result.sent) {
        stats.sent += 1;
        stats.byStep[step] = (stats.byStep[step] || 0) + 1;
        emailsSentToday += 1;
      } else if (result.reason === 'send_failed' || result.reason === 'relay_rejected') {
        stats.failed += 1;
      } else {
        stats.skipped += 1;
      }

      if (i < candidates.length - 1 && result.sent) {
        await sleep(gapMs);
      }
    }

    console.log(
      `[AppReengagementScheduler] tick done: sent=${stats.sent} skipped=${stats.skipped} ` +
      `failed=${stats.failed} today=${emailsSentToday}/${dailyCap} byStep=${JSON.stringify(stats.byStep)}`,
    );
  } catch (e) {
    console.error('[AppReengagementScheduler] tick error:', e);
  } finally {
    isRunning = false;
  }
}

function startAppReengagementScheduler() {
  const enabled =
    process.env.ENABLE_APP_REENGAGEMENT_SCHEDULER === 'true' ||
    process.env.NODE_ENV === 'production';

  if (!enabled) {
    console.log('[AppReengagementScheduler] Disabled. Set ENABLE_APP_REENGAGEMENT_SCHEDULER=true.');
    return;
  }

  const intervalMs = Number(process.env.APP_REENGAGEMENT_INTERVAL_MS || 30 * 60 * 1000);
  const { dailyCap, emailsPerTick, gapMs } = cfg();

  const run = () => tick().catch((e) => console.error('[AppReengagementScheduler]', e));

  // First tick after boot — stagger from retention scheduler
  setTimeout(run, 45_000);
  setInterval(run, intervalMs);

  console.log(
    `[AppReengagementScheduler] Started. interval=${intervalMs / 60_000}min ` +
    `perTick=${emailsPerTick} gap=${gapMs / 1000}s dailyCap=${dailyCap}`,
  );
}

module.exports = { startAppReengagementScheduler, tick };
