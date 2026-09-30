/**
 * trackerConnectScheduler.js
 *
 * Drains the "zones ready — connect Strava/Garmin" campaign (one email per
 * eligible user, ever) with Zoho-safe pacing.
 *
 * SAFETY: NOT auto-on. Set ENABLE_TRACKER_CONNECT_SCHEDULER=true after
 * previewing via the admin route.
 *
 * Env:
 *   ENABLE_TRACKER_CONNECT_SCHEDULER=true  (required — off by default)
 *   TRACKER_CONNECT_INTERVAL_MS=1800000    default 30 min
 *   TRACKER_CONNECT_EMAILS_PER_TICK=3      default 3
 *   TRACKER_CONNECT_EMAIL_GAP_MS=120000    default 2 min between sends
 *   TRACKER_CONNECT_DAILY_CAP=20           default 20/day
 */

'use strict';

const { sendTrackerConnect, findReadyCandidates } = require('./trackerConnectCampaignService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    emailsPerTick: Number(process.env.TRACKER_CONNECT_EMAILS_PER_TICK || 3),
    gapMs: Number(process.env.TRACKER_CONNECT_EMAIL_GAP_MS || 2 * 60 * 1000),
    dailyCap: Number(process.env.TRACKER_CONNECT_DAILY_CAP || 20),
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
    console.log(`[TrackerConnectScheduler] daily cap reached (${dailyCap}), skipping tick`);
    return;
  }

  isRunning = true;
  const stats = { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  try {
    const slotsLeft = Math.min(emailsPerTick, dailyCap - emailsSentToday);
    const candidates = await findReadyCandidates(slotsLeft);
    if (candidates.length === 0) {
      console.log('[TrackerConnectScheduler] no ready candidates');
      return;
    }

    for (let i = 0; i < candidates.length; i++) {
      if (emailsSentToday >= dailyCap) break;
      const { user } = candidates[i];
      stats.attempted += 1;
      const result = await sendTrackerConnect(user);
      if (result.sent) {
        stats.sent += 1;
        emailsSentToday += 1;
      } else if (result.reason === 'send_failed' || result.reason === 'relay_rejected') {
        stats.failed += 1;
      } else {
        stats.skipped += 1;
      }
      if (i < candidates.length - 1 && result.sent) await sleep(gapMs);
    }
    console.log(
      `[TrackerConnectScheduler] tick done: sent=${stats.sent} skipped=${stats.skipped} ` +
      `failed=${stats.failed} today=${emailsSentToday}/${dailyCap}`,
    );
  } catch (e) {
    console.error('[TrackerConnectScheduler] tick error:', e);
  } finally {
    isRunning = false;
  }
}

function startTrackerConnectScheduler() {
  if (process.env.ENABLE_TRACKER_CONNECT_SCHEDULER !== 'true') {
    console.log('[TrackerConnectScheduler] Disabled. Set ENABLE_TRACKER_CONNECT_SCHEDULER=true to start.');
    return;
  }
  const intervalMs = Number(process.env.TRACKER_CONNECT_INTERVAL_MS || 30 * 60 * 1000);
  const { dailyCap, emailsPerTick, gapMs } = cfg();
  const run = () => tick().catch((e) => console.error('[TrackerConnectScheduler]', e));
  setTimeout(run, 120_000);
  setInterval(run, intervalMs);
  console.log(
    `[TrackerConnectScheduler] Started. interval=${intervalMs / 60_000}min perTick=${emailsPerTick} ` +
    `gap=${gapMs / 1000}s dailyCap=${dailyCap}`,
  );
}

module.exports = { startTrackerConnectScheduler, tick };
