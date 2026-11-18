/**
 * retestReminderScheduler.js
 *
 * Nudges athletes about a retest *they themselves scheduled* — in-app
 * notification and push only. No email, by design.
 *
 * ── Why not email ─────────────────────────────────────────────────────────────
 * retentionScheduler has sent a "time to retest" email every Thursday for
 * months, to anyone whose last test was 49+ days old. Measured on production
 * 2026-11-18: 326 people received it, 4.3 % saved a test afterwards, exactly
 * one started a plan, and the ever-paid rate among recipients (10.7 %) sits
 * inside the noise of the people who never got it (9.9 %). The channel is
 * spent, and opt-outs have climbed from 7.4 % to 9.5 % of the base meanwhile.
 *
 * The difference here is not the transport, it is the consent. This scheduler
 * only ever speaks about a date the athlete picked while looking at the curve
 * they had just saved. A test with no `retest.dueAt` is never touched — this
 * is a reminder service, not a campaign, and it cannot become one by
 * accident: there is no query here that selects users by inactivity.
 *
 * SAFETY: off by default like every scheduler that writes to many accounts.
 *
 * Env:
 *   ENABLE_RETEST_SCHEDULER=true      (required — off by default)
 *   RETEST_INTERVAL_MS=3600000        default 60 min
 *   RETEST_PER_TICK=25                default 25 reminders per tick
 *   RETEST_DAILY_CAP=60               default 60/day
 */

'use strict';

const Test = require('../models/test');
const { sendNotification } = require('../utils/notificationHelper');
// Generated twin of client/src/utils/retestPlan.js — the card that offers the
// retest and this scheduler must agree about whether one is due.
const {
  shouldNotifyRetest,
  retestReminderCopy,
  daysUntilRetest,
  maxRetestReminders,
} = require('../utils/retestPlan');

function cfg() {
  return {
    perTick:  Number(process.env.RETEST_PER_TICK  || 25),
    dailyCap: Number(process.env.RETEST_DAILY_CAP || 60),
  };
}

let sentToday = 0;
let dailyCounterDate = new Date().toISOString().slice(0, 10);
let isRunning = false;

function resetDailyCounterIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyCounterDate) { dailyCounterDate = today; sentToday = 0; }
}

/**
 * Tests whose scheduled retest has come due and still has nudges left.
 *
 * The `reminderCount` bound is in the query rather than only in the filter so
 * a long backlog of finished plans cannot crowd out the tests that still need
 * a nudge — without it, `perTick` would be spent re-rejecting the same rows
 * every hour.
 */
async function findDueTests(limit) {
  return Test.find({
    'retest.dueAt': { $ne: null, $lte: new Date() },
    'retest.dismissedAt': null,
    'retest.reminderCount': { $lt: maxRetestReminders() },
  })
    .select('_id athleteId sport date retest')
    .sort({ 'retest.dueAt': 1 })
    .limit(limit)
    .lean();
}

async function tick() {
  if (isRunning) return;
  resetDailyCounterIfNeeded();
  const { perTick, dailyCap } = cfg();
  if (sentToday >= dailyCap) return;

  isRunning = true;
  const stats = { sent: 0, skipped: 0, failed: 0 };
  try {
    const slots = Math.min(perTick, dailyCap - sentToday);
    const due = await findDueTests(slots);
    if (!due.length) return;

    const now = new Date();
    for (const test of due) {
      if (sentToday >= dailyCap) break;
      try {
        // A later test closes the plan. Resolve it from real tests rather
        // than a flag, so an athlete who simply saved their next test is
        // never told they still owe one.
        const newer = await Test.findOne({
          athleteId: String(test.athleteId),
          date: { $gt: test.date },
        }).select('date').lean();

        const decision = shouldNotifyRetest({
          dueAt: test.retest?.dueAt,
          now,
          newerTestAt: newer?.date || null,
          dismissedAt: test.retest?.dismissedAt,
          remindedAt: test.retest?.remindedAt,
          reminderCount: test.retest?.reminderCount,
        });

        if (!decision.notify) {
          stats.skipped += 1;
          // Closing the plan stops it being re-examined every tick forever.
          if (decision.reason === 'status:done' || decision.reason === 'status:overdue') {
            await Test.updateOne(
              { _id: test._id },
              { $set: { 'retest.reminderCount': maxRetestReminders() } },
            );
          }
          continue;
        }

        const overdue = Math.max(0, -(daysUntilRetest({ dueAt: test.retest.dueAt, now }) || 0));
        const { title, body } = retestReminderCopy({ sport: test.sport, daysOverdue: overdue });

        await sendNotification(String(test.athleteId), {
          type: 'retest_due',
          title,
          body,
          resourceId: String(test._id),
          resourceType: 'test',
          sport: test.sport || null,
        });

        await Test.updateOne({ _id: test._id }, {
          $set: { 'retest.remindedAt': now },
          $inc: { 'retest.reminderCount': 1 },
        });
        stats.sent += 1;
        sentToday += 1;
      } catch (e) {
        stats.failed += 1;
        console.error('[RetestScheduler] test', test._id, e?.message || e);
      }
    }

    if (stats.sent || stats.failed) {
      console.log(`[RetestScheduler] tick: sent=${stats.sent} skipped=${stats.skipped} `
        + `failed=${stats.failed} today=${sentToday}/${dailyCap}`);
    } else if (stats.skipped) {
      // Say something on a skip-only tick. A premium-letter queue headed by
      // undeliverable addresses once looked exactly like a scheduler that had
      // never been started, because nothing logged unless a send happened.
      console.log(`[RetestScheduler] tick: nothing sent, ${stats.skipped} plans already closed or too soon`);
    }
  } catch (e) {
    console.error('[RetestScheduler] tick error:', e);
  } finally {
    isRunning = false;
  }
}

function startRetestReminderScheduler() {
  if (process.env.ENABLE_RETEST_SCHEDULER !== 'true') {
    console.log('[RetestScheduler] Disabled. Set ENABLE_RETEST_SCHEDULER=true to start retest reminders.');
    return;
  }
  const intervalMs = Number(process.env.RETEST_INTERVAL_MS || 60 * 60 * 1000);
  const { perTick, dailyCap } = cfg();
  const run = () => tick().catch((e) => console.error('[RetestScheduler]', e));
  setTimeout(run, 100_000);
  setInterval(run, intervalMs);
  console.log(`[RetestScheduler] Started. interval=${intervalMs / 60_000}min `
    + `perTick=${perTick} dailyCap=${dailyCap}`);
}

module.exports = { startRetestReminderScheduler, tick, findDueTests };
