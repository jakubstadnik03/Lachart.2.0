/**
 * coachFollowUpScheduler.js
 *
 * Drains the second cold letter to coaches who opened the first — about a
 * hundred people, so this finishes in a fortnight and then sits idle, which
 * is correct: one follow-up per lead, ever.
 *
 * SAFETY: off by default, like every campaign that writes to strangers.
 *
 * Paced harder than the in-product campaigns. mail.lachart.net is young, these
 * are cold recipients, and a burst of cold mail from a fresh subdomain is the
 * fastest way to undo the deliverability the transactional domain depends on.
 * Eight a day, five minutes apart.
 *
 * Env:
 *   ENABLE_COACH_FOLLOWUP_SCHEDULER=true   (required — off by default)
 *   COACH_FOLLOWUP_INTERVAL_MS=5400000     default 90 min
 *   COACH_FOLLOWUP_PER_TICK=2              default 2
 *   COACH_FOLLOWUP_GAP_MS=300000           default 5 min between sends
 *   COACH_FOLLOWUP_DAILY_CAP=8             default 8/day
 *   COACH_FOLLOWUP_MIN_GAP_DAYS=21         days since the first letter
 */

'use strict';

const { findFollowUpLeads, sendFollowUp } = require('./coachFollowUpService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cfg() {
  return {
    perTick: Number(process.env.COACH_FOLLOWUP_PER_TICK || 2),
    gapMs: Number(process.env.COACH_FOLLOWUP_GAP_MS || 5 * 60 * 1000),
    dailyCap: Number(process.env.COACH_FOLLOWUP_DAILY_CAP || 8),
    minGapDays: process.env.COACH_FOLLOWUP_MIN_GAP_DAYS
      ? Number(process.env.COACH_FOLLOWUP_MIN_GAP_DAYS) : undefined,
  };
}

let sentToday = 0;
let counterDate = new Date().toISOString().slice(0, 10);
let isRunning = false;

function resetDailyCounterIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== counterDate) { counterDate = today; sentToday = 0; }
}

async function tick() {
  if (isRunning) return;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) return;

  resetDailyCounterIfNeeded();
  const { perTick, gapMs, dailyCap, minGapDays } = cfg();
  if (sentToday >= dailyCap) return;

  isRunning = true;
  const stats = { sent: 0, skipped: 0, failed: 0 };
  try {
    const slots = Math.min(perTick, dailyCap - sentToday);
    const leads = await findFollowUpLeads({ limit: slots, minGapDays });
    if (leads.length === 0) return;

    for (let i = 0; i < leads.length; i += 1) {
      if (sentToday >= dailyCap) break;
      const result = await sendFollowUp(leads[i]);
      if (result.sent) { stats.sent += 1; sentToday += 1; }
      else if (result.reason === 'send_failed') stats.failed += 1;
      else stats.skipped += 1;
      if (i < leads.length - 1 && result.sent) await sleep(gapMs);
    }
    if (stats.sent || stats.failed) {
      console.log(`[CoachFollowUp] tick: sent=${stats.sent} skipped=${stats.skipped} ` +
        `failed=${stats.failed} today=${sentToday}/${dailyCap}`);
    }
  } catch (e) {
    console.error('[CoachFollowUp] tick error:', e);
  } finally {
    isRunning = false;
  }
}

function startCoachFollowUpScheduler() {
  if (process.env.ENABLE_COACH_FOLLOWUP_SCHEDULER !== 'true') {
    console.log('[CoachFollowUp] Disabled. Set ENABLE_COACH_FOLLOWUP_SCHEDULER=true to start the second letter.');
    return;
  }
  const intervalMs = Number(process.env.COACH_FOLLOWUP_INTERVAL_MS || 90 * 60 * 1000);
  const { dailyCap, perTick, gapMs } = cfg();
  const run = () => tick().catch((e) => console.error('[CoachFollowUp]', e));
  setTimeout(run, 210_000);
  setInterval(run, intervalMs);
  console.log(`[CoachFollowUp] Started. interval=${intervalMs / 60_000}min perTick=${perTick} ` +
    `gap=${gapMs / 1000}s dailyCap=${dailyCap}`);
}

module.exports = { startCoachFollowUpScheduler, tick };
