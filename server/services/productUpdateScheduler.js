/**
 * productUpdateScheduler.js
 *
 * Automatically rolls out the ACTIVE product-update newsletter issue to every
 * marketing-opted-in user, with Zoho-safe pacing.
 *
 * IMPORTANT: this scheduler is OFF by default — even in production — and only
 * runs when ENABLE_PRODUCT_UPDATE_SCHEDULER=true. A newsletter must only go out
 * once the founder has prepared and activated an issue, so we never auto-send on
 * a plain deploy the way the always-on lifecycle drips do. There is also nothing
 * to send until an issue folder exists under server/templates/productUpdate/.
 *
 * Which issue is sent:
 *   • PRODUCT_UPDATE_ACTIVE_ISSUE if set (e.g. "2026-09"), else
 *   • the newest issue on disk.
 * Per-issue idempotency (retentionEmails.productUpdates map) means a given issue
 * is delivered to each user exactly once, and switching the active issue starts
 * a fresh roll-out without touching earlier issues.
 *
 * Env:
 *   ENABLE_PRODUCT_UPDATE_SCHEDULER=true     (required — no auto-on)
 *   PRODUCT_UPDATE_ACTIVE_ISSUE=2026-09      (optional — defaults to newest)
 *   PRODUCT_UPDATE_INTERVAL_MS=1800000       default 30 min
 *   PRODUCT_UPDATE_EMAILS_PER_TICK=3         default 3
 *   PRODUCT_UPDATE_EMAIL_GAP_MS=120000       default 2 min between sends
 *   PRODUCT_UPDATE_DAILY_CAP=40              default 40/day
 */

'use strict';

const {
  getScheduledIssueId,
  findPendingUsers,
  sendOne,
} = require('./productUpdateCampaignService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    emailsPerTick: Number(process.env.PRODUCT_UPDATE_EMAILS_PER_TICK || 3),
    gapMs: Number(process.env.PRODUCT_UPDATE_EMAIL_GAP_MS || 2 * 60 * 1000),
    dailyCap: Number(process.env.PRODUCT_UPDATE_DAILY_CAP || 40),
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
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) return;

  const issueId = await getScheduledIssueId();
  if (!issueId) {
    console.log('[ProductUpdateScheduler] no issue due for sending, skipping tick');
    return;
  }

  resetDailyCounterIfNeeded();
  const { emailsPerTick, gapMs, dailyCap } = cfg();

  if (emailsSentToday >= dailyCap) {
    console.log(`[ProductUpdateScheduler] daily cap reached (${dailyCap}), skipping tick`);
    return;
  }

  isRunning = true;
  const stats = { attempted: 0, sent: 0, skipped: 0, failed: 0 };

  try {
    const slotsLeft = Math.min(emailsPerTick, dailyCap - emailsSentToday);
    const users = await findPendingUsers(issueId, slotsLeft);
    if (users.length === 0) {
      console.log(`[ProductUpdateScheduler] issue ${issueId}: no pending recipients`);
      return;
    }

    for (let i = 0; i < users.length; i++) {
      if (emailsSentToday >= dailyCap) break;
      stats.attempted += 1;

      const result = await sendOne(users[i], issueId);
      if (result.sent) {
        stats.sent += 1;
        emailsSentToday += 1;
      } else if (result.reason === 'send_failed' || String(result.reason).startsWith('relay')) {
        stats.failed += 1;
      } else {
        stats.skipped += 1;
      }

      if (i < users.length - 1 && result.sent) await sleep(gapMs);
    }

    console.log(
      `[ProductUpdateScheduler] tick done (issue ${issueId}): sent=${stats.sent} ` +
      `skipped=${stats.skipped} failed=${stats.failed} today=${emailsSentToday}/${dailyCap}`,
    );
  } catch (e) {
    console.error('[ProductUpdateScheduler] tick error:', e);
  } finally {
    isRunning = false;
  }
}

function startProductUpdateScheduler() {
  if (process.env.ENABLE_PRODUCT_UPDATE_SCHEDULER !== 'true') {
    console.log('[ProductUpdateScheduler] Disabled. Set ENABLE_PRODUCT_UPDATE_SCHEDULER=true to roll out the active issue.');
    return;
  }

  const intervalMs = Number(process.env.PRODUCT_UPDATE_INTERVAL_MS || 30 * 60 * 1000);
  const { dailyCap, emailsPerTick, gapMs } = cfg();
  const run = () => tick().catch((e) => console.error('[ProductUpdateScheduler]', e));

  // Stagger from the other lifecycle schedulers so boots don't all send at once.
  setTimeout(run, 60_000);
  setInterval(run, intervalMs);

  console.log(
    `[ProductUpdateScheduler] Started. interval=${intervalMs / 60_000}min ` +
    `perTick=${emailsPerTick} gap=${gapMs / 1000}s dailyCap=${dailyCap}`,
  );
}

module.exports = { startProductUpdateScheduler, tick };
