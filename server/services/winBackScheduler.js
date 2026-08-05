/**
 * winBackScheduler.js
 *
 * Drains the win-back campaign gradually (one email per eligible user, ever)
 * with Zoho-safe pacing and a daily cap.
 *
 * SAFETY: unlike the other schedulers this is NOT auto-on in production. A
 * mass campaign to the existing base must be switched on deliberately — set
 * ENABLE_WINBACK_SCHEDULER=true once you've previewed via the admin route.
 *
 * Env:
 *   ENABLE_WINBACK_SCHEDULER=true    (required — off by default, even in prod)
 *   WINBACK_INTERVAL_MS=1800000      default 30 min
 *   WINBACK_EMAILS_PER_TICK=3        default 3
 *   WINBACK_EMAIL_GAP_MS=120000      default 2 min between sends
 *   WINBACK_DAILY_CAP=20             default 20/day  (~1 month for 400 users)
 */

'use strict';

const { sendWinBack, findReadyCandidates } = require('./winBackCampaignService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    emailsPerTick: Number(process.env.WINBACK_EMAILS_PER_TICK || 3),
    gapMs: Number(process.env.WINBACK_EMAIL_GAP_MS || 2 * 60 * 1000),
    dailyCap: Number(process.env.WINBACK_DAILY_CAP || 20),
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
    console.log(`[WinBackScheduler] daily cap reached (${dailyCap}), skipping tick`);
    return;
  }

  isRunning = true;
  const stats = { attempted: 0, sent: 0, skipped: 0, failed: 0, bySegment: { 'test-runner': 0, inactive: 0 } };
  try {
    const slotsLeft = Math.min(emailsPerTick, dailyCap - emailsSentToday);
    const candidates = await findReadyCandidates(slotsLeft);
    if (candidates.length === 0) { console.log('[WinBackScheduler] no ready candidates'); return; }

    for (let i = 0; i < candidates.length; i++) {
      if (emailsSentToday >= dailyCap) break;
      const { user, segment } = candidates[i];
      stats.attempted += 1;
      const result = await sendWinBack(user, segment);
      if (result.sent) {
        stats.sent += 1;
        stats.bySegment[segment] = (stats.bySegment[segment] || 0) + 1;
        emailsSentToday += 1;
      } else if (result.reason === 'send_failed' || result.reason === 'relay_rejected') {
        stats.failed += 1;
      } else {
        stats.skipped += 1;
      }
      if (i < candidates.length - 1 && result.sent) await sleep(gapMs);
    }
    console.log(
      `[WinBackScheduler] tick done: sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed} ` +
      `today=${emailsSentToday}/${dailyCap} bySegment=${JSON.stringify(stats.bySegment)}`,
    );
  } catch (e) {
    console.error('[WinBackScheduler] tick error:', e);
  } finally {
    isRunning = false;
  }
}

function startWinBackScheduler() {
  if (process.env.ENABLE_WINBACK_SCHEDULER !== 'true') {
    console.log('[WinBackScheduler] Disabled. Set ENABLE_WINBACK_SCHEDULER=true to start the win-back campaign.');
    return;
  }
  const intervalMs = Number(process.env.WINBACK_INTERVAL_MS || 30 * 60 * 1000);
  const { dailyCap, emailsPerTick, gapMs } = cfg();
  const run = () => tick().catch((e) => console.error('[WinBackScheduler]', e));
  setTimeout(run, 90_000); // stagger after the other schedulers
  setInterval(run, intervalMs);
  console.log(
    `[WinBackScheduler] Started. interval=${intervalMs / 60_000}min perTick=${emailsPerTick} ` +
    `gap=${gapMs / 1000}s dailyCap=${dailyCap}`,
  );
}

module.exports = { startWinBackScheduler, tick };
