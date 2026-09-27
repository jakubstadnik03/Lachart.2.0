/**
 * coachTesterOutreachScheduler.js — drains the cold coach/tester list slowly.
 *
 * Env:
 *   ENABLE_TESTER_OUTREACH_SCHEDULER=true   off unless set, in every environment
 *   TESTER_OUTREACH_INTERVAL_MS=3600000     default 1 h between ticks
 *   TESTER_OUTREACH_PER_TICK=3              default 3 per tick
 *   TESTER_OUTREACH_GAP_MS=120000           default 2 min between sends
 *   TESTER_OUTREACH_DAILY_CAP=15            default 15/day
 *
 * Three deliberate choices.
 *
 * It is OFF unless switched on, including in production — every other scheduler
 * here mails people who asked for an account. This one mails strangers, and a
 * deploy is not consent to start that.
 *
 * It trickles. mail.lachart.net is weeks old as a bulk sender, and a burst of
 * cold mail from a fresh subdomain undoes exactly the deliverability work this
 * campaign depends on. Fifteen a day drains ~180 candidates over a fortnight,
 * which is also long enough to read the click numbers and stop if the letter is
 * not working.
 *
 * It never re-sends. findLeads takes sentCount:0 only, and sendToLead stamps
 * that on the way out, so the same person cannot be written to twice however
 * often this ticks or restarts.
 */

'use strict';

const { sendToMany } = require('./coachTesterOutreachService');

function cfg() {
  return {
    intervalMs: Number(process.env.TESTER_OUTREACH_INTERVAL_MS || 60 * 60 * 1000),
    perTick: Number(process.env.TESTER_OUTREACH_PER_TICK || 3),
    gapMs: Number(process.env.TESTER_OUTREACH_GAP_MS || 2 * 60 * 1000),
    dailyCap: Number(process.env.TESTER_OUTREACH_DAILY_CAP || 15),
  };
}

let sentToday = 0;
let counterDate = new Date().toISOString().slice(0, 10);
let running = false;
let timer = null;

function rollDayIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== counterDate) {
    counterDate = today;
    sentToday = 0;
  }
}

async function tick() {
  if (running) return { skipped: 'already running' };
  rollDayIfNeeded();
  const { perTick, gapMs, dailyCap } = cfg();
  const room = Math.max(0, dailyCap - sentToday);
  if (room === 0) return { skipped: 'daily cap reached', sentToday };

  running = true;
  try {
    const res = await sendToMany({ limit: Math.min(perTick, room), pauseMs: gapMs });
    sentToday += res.sent;
    if (res.attempted > 0) {
      console.log(`[testerOutreach] sent ${res.sent}/${res.attempted} (${sentToday}/${dailyCap} today)`);
      for (const r of res.results.filter((x) => !x.sent)) {
        console.warn('[testerOutreach] failed:', r.email, r.error);
      }
    }
    return { ...res, sentToday };
  } catch (e) {
    console.error('[testerOutreach] tick failed:', e.message);
    return { error: e.message };
  } finally {
    running = false;
  }
}

function startTesterOutreachScheduler() {
  if (String(process.env.ENABLE_TESTER_OUTREACH_SCHEDULER).toLowerCase() !== 'true') {
    return false;
  }
  if (timer) return true;
  const { intervalMs, perTick, dailyCap } = cfg();
  console.log(`[testerOutreach] scheduler on: ${perTick}/tick, every ${Math.round(intervalMs / 60000)} min, cap ${dailyCap}/day`);
  // No tick on boot: a restart loop would otherwise mail a burst.
  timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
  if (timer.unref) timer.unref();
  return true;
}

function stopTesterOutreachScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startTesterOutreachScheduler, stopTesterOutreachScheduler, tick };
