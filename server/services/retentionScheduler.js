/**
 * retentionScheduler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified scheduler for all LaChart retention / lifecycle emails.
 *
 * Architecture — designed to be gentle on both the DB and the SMTP server:
 *
 *  1. BULK PRE-FETCH  — 2 aggregation queries replace N individual DB calls:
 *       • test counts per user
 *       • latest test per user (date + results for LT2 estimation)
 *
 *  2. SINGLE PASS     — one loop over all users produces a list of (user, emailType)
 *                       pairs.  Each user gets at most ONE email per tick.
 *                       Priority: milestone > anniversary > LT2 > re-engagement > scheduled.
 *
 *  3. SEND QUEUE      — pairs are pushed into a persistent in-memory queue.
 *                       Scheduled campaigns (weekly / monthly / reminder) are
 *                       enqueued once per campaign window; subsequent ticks
 *                       continue draining without re-queuing.
 *
 *  4. ASYNC DRAIN     — each tick drains EMAILS_PER_TICK items from the queue
 *                       with EMAIL_GAP_MS pause between each send.
 *                       Runs non-blocking so it never stalls the server.
 *
 *  5. DAILY GUARD     — a user who received any retention email in the past
 *                       DAILY_GUARD_H hours is skipped for new candidate selection.
 *
 * Env vars (all optional):
 *  ENABLE_RETENTION_SCHEDULER=true        auto-on in production
 *  RETENTION_SCHEDULER_INTERVAL_MS=1800000   tick interval  (default 30 min)
 *  RETENTION_EMAILS_PER_TICK=10           queue items drained per tick (default 10)
 *  RETENTION_EMAIL_GAP_MS=3000            pause between sends       (default 3 s)
 *  RETENTION_WEEKLY_HOUR_UTC=7
 *  RETENTION_MONTHLY_HOUR_UTC=9
 *  RETENTION_REMINDER_HOUR_UTC=8
 */

'use strict';

const User = require('../models/UserModel');
const Test = require('../models/test');
const {
  sendWeeklyProgressEmail,
  sendMonthlyReportEmail,
  sendTestReminderEmail,
  sendReengagementEmail,
  sendMilestoneEmail,
  sendLT2ImprovementEmail,
  sendAnniversaryEmail,
  sendInviteCoachEmail,
  estimateLT2,
  getRecentTests,
} = require('./retentionEmailService');

// ─── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  get EMAILS_PER_TICK()  { return Number(process.env.RETENTION_EMAILS_PER_TICK  || 10); },
  get EMAIL_GAP_MS()     { return Number(process.env.RETENTION_EMAIL_GAP_MS     || 3_000); },
  get WEEKLY_HOUR()      { return Number(process.env.RETENTION_WEEKLY_HOUR_UTC  || 7); },
  get MONTHLY_HOUR()     { return Number(process.env.RETENTION_MONTHLY_HOUR_UTC || 9); },
  get REMINDER_HOUR()    { return Number(process.env.RETENTION_REMINDER_HOUR_UTC|| 8); },
  DAILY_GUARD_H:    48,   // hours — skip user if they got any retention email this recently
  REENG_MIN_DAYS:   21,
  REENG_MAX_DAYS:   90,
  REENG_THROTTLE:   45,   // days between re-engagement mails
  REMINDER_THROTTLE:49,   // days between test-reminder mails (~7 weeks)
  WEEKLY_THROTTLE:   7,   // days between weekly progress mails
  MONTHLY_THROTTLE: 28,   // days between monthly report mails
};

// ─── In-memory queue (persists across ticks, reset per campaign window) ───────
/** @type {{ userId: string, type: string, user: object }[]} */
let sendQueue   = [];
let isdraining  = false;  // guard — only one drain at a time

// Campaign window trackers (ISO date strings like '2024-06-03')
const campaignSent = { weekly: null, monthly: null, reminder: null };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function daysSince(date) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / 86_400_000;
}
function hoursSince(date) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / 3_600_000;
}
function monthsSince(date) {
  if (!date) return 0;
  const d = new Date(date), n = new Date();
  return (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth());
}

/** Returns the ISO date string for today (UTC) e.g. '2024-06-03'. */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function isEligible(user) {
  if (!user.email)   return false;
  if (!user.isActive) return false;
  if (user.notifications?.emailNotifications === false) return false;
  return true;
}

/** True if user already received any retention email within DAILY_GUARD_H hours. */
function receivedRecentlyAny(user) {
  const re = user.retentionEmails || {};
  const candidates = [
    re.weeklyProgressLastSent,
    re.monthlyReportLastSent,
    re.testReminderLastSent,
    re.reengagementLastSent,
  ];
  return candidates.some(d => d && hoursSince(d) < CFG.DAILY_GUARD_H);
}

// ─── Bulk DB pre-fetch ────────────────────────────────────────────────────────
/**
 * Returns two Maps populated with a single aggregation each:
 *   countMap:  userId → total test count
 *   latestMap: userId → { date, sport, results[] }  (most recent test)
 */
async function bulkFetchTestData() {
  const [counts, latests] = await Promise.all([

    // Test counts per athlete
    Test.aggregate([
      { $group: { _id: '$athleteId', count: { $sum: 1 } } }
    ]),

    // Latest test per athlete (we only need date + sport + results for LT2)
    Test.aggregate([
      { $sort: { date: -1 } },
      { $group: {
          _id: '$athleteId',
          date:    { $first: '$date'    },
          sport:   { $first: '$sport'   },
          results: { $first: '$results' },
      }},
    ]),

  ]);

  const countMap  = new Map(counts.map(c  => [String(c._id),  c.count]));
  const latestMap = new Map(latests.map(l => [String(l._id), {
    date:    l.date,
    sport:   l.sport,
    results: l.results || [],
  }]));

  return { countMap, latestMap };
}

// ─── Candidate selection — single pass ───────────────────────────────────────
/**
 * Evaluates all users and returns a list of candidates.
 * Each candidate has exactly ONE email type assigned (highest priority).
 * Users are NOT contacted more than once per DAILY_GUARD_H hours.
 *
 * Priority (highest → lowest):
 *   milestone > anniversary > lt2Improvement > reEngagement
 *   scheduled campaigns (weekly / monthly / reminder) handled separately.
 */
async function buildEventCandidates(users, countMap, latestMap) {
  const candidates = [];

  for (const user of users) {
    if (!isEligible(user))          continue;
    if (receivedRecentlyAny(user))  continue;

    const uid        = String(user._id);
    const milestones = user.retentionEmails?.milestones || {};
    const totalTests = countMap.get(uid) || 0;
    const latest     = latestMap.get(uid) || null;
    const months     = monthsSince(user.createdAt);

    // ── Priority 1: test-count milestones ──
    const milestoneChecks = [
      { key: 'firstTest',       count: 1,  sent: milestones.firstTestSent       },
      { key: 'fiveTests',       count: 5,  sent: milestones.fiveTestsSent       },
      { key: 'tenTests',        count: 10, sent: milestones.tenTestsSent        },
      { key: 'twentyFiveTests', count: 25, sent: milestones.twentyFiveTestsSent },
    ];
    const pendingMilestone = milestoneChecks.find(m => !m.sent && totalTests >= m.count);
    if (pendingMilestone) {
      candidates.push({ user, type: 'milestone', extra: pendingMilestone.key });
      continue;
    }

    // ── Priority 2: anniversary ──
    if (!milestones.anniversaryOneYearSent && months >= 12) {
      candidates.push({ user, type: 'anniversary', extra: 12 });
      continue;
    }
    if (!milestones.anniversarySixMonthsSent && months >= 6) {
      candidates.push({ user, type: 'anniversary', extra: 6 });
      continue;
    }

    // ── Priority 3: LT2 improvement (needs latest LT2; baseline already stored) ──
    if (!milestones.lt2Improvement10Sent && latest && totalTests >= 2) {
      const latestLT2  = estimateLT2(latest);
      const baseline   = milestones.lt2ImprovementBaseline;
      if (latestLT2 && baseline) {
        const gain = latestLT2.value - baseline;
        if (gain >= 5) {
          const tier = gain >= 10 ? 'lt2_10' : 'lt2_5';
          if (tier === 'lt2_10' || !milestones.lt2Improvement5Sent) {
            candidates.push({ user, type: 'lt2Improvement',
              extra: { gain, value: latestLT2.value, sport: latestLT2.sport, tier } });
            continue;
          }
        }
      }
      // Set baseline if missing (no email, just a DB write — done outside the queue)
      if (!baseline && latest) {
        const lt2 = estimateLT2(latest);
        if (lt2) {
          // fire-and-forget baseline write
          User.updateOne({ _id: user._id },
            { $set: { 'retentionEmails.milestones.lt2ImprovementBaseline': lt2.value } }
          ).catch(() => {});
        }
      }
    }

    // ── Priority 4: invite coach (athletes only, ≥1 test, no coach yet) ──
    const isAthleteRole = !user.role || String(user.role).toLowerCase() === 'athlete';
    const hasNoCoach    = !user.coachIds || user.coachIds.length === 0;
    const inviteCoachSent = milestones.inviteCoachSent;
    if (isAthleteRole && hasNoCoach && !inviteCoachSent && totalTests >= 1) {
      candidates.push({ user, type: 'inviteCoach' });
      continue;
    }

    // ── Priority 5: re-engagement ──
    const inactiveDays = daysSince(user.lastLogin);
    if (inactiveDays >= CFG.REENG_MIN_DAYS && inactiveDays <= CFG.REENG_MAX_DAYS) {
      const lastReeng = user.retentionEmails?.reengagementLastSent;
      if (!lastReeng || daysSince(lastReeng) >= CFG.REENG_THROTTLE) {
        candidates.push({ user, type: 'reEngagement' });
        continue;
      }
    }

    // (scheduled campaigns handled in buildScheduledCandidates)
  }

  return candidates;
}

/**
 * Build candidates for time-triggered campaigns (weekly / monthly / reminder).
 * Each campaign is enqueued only ONCE per window day — subsequent ticks just drain.
 */
function buildScheduledCandidates(users, latestMap, day, hour, date) {
  const candidates = [];
  const today = todayUTC();

  // ── Weekly progress (Monday 07:xx–08:xx UTC) ──
  const wantWeekly = day === 1 && hour >= CFG.WEEKLY_HOUR && hour <= CFG.WEEKLY_HOUR + 1;
  if (wantWeekly && campaignSent.weekly !== today) {
    campaignSent.weekly = today;
    for (const user of users) {
      if (!isEligible(user)) continue;
      if (receivedRecentlyAny(user)) continue;
      if (user.notifications?.weeklyReports === false) continue;
      const lastSent = user.retentionEmails?.weeklyProgressLastSent;
      if (lastSent && daysSince(lastSent) < CFG.WEEKLY_THROTTLE) continue;
      // Only send if they have at least 1 test
      if (!(latestMap.has(String(user._id)))) continue;
      candidates.push({ user, type: 'weekly' });
    }
    console.log(`[Retention] Weekly campaign queued: ${candidates.length} users`);
  }

  // ── Monthly report (1st of month 09:xx–10:xx UTC) ──
  const wantMonthly = date === 1 && hour >= CFG.MONTHLY_HOUR && hour <= CFG.MONTHLY_HOUR + 1;
  if (wantMonthly && campaignSent.monthly !== today) {
    campaignSent.monthly = today;
    for (const user of users) {
      if (!isEligible(user)) continue;
      if (receivedRecentlyAny(user)) continue;
      const lastSent = user.retentionEmails?.monthlyReportLastSent;
      if (lastSent && daysSince(lastSent) < CFG.MONTHLY_THROTTLE) continue;
      if (!(latestMap.has(String(user._id)))) continue;
      candidates.push({ user, type: 'monthly' });
    }
    console.log(`[Retention] Monthly campaign queued: ${candidates.length} users`);
  }

  // ── Test reminder (Thursday 08:xx–09:xx UTC) ──
  const wantReminder = day === 4 && hour >= CFG.REMINDER_HOUR && hour <= CFG.REMINDER_HOUR + 1;
  if (wantReminder && campaignSent.reminder !== today) {
    campaignSent.reminder = today;
    for (const user of users) {
      if (!isEligible(user)) continue;
      if (receivedRecentlyAny(user)) continue;
      const lastSent = user.retentionEmails?.testReminderLastSent;
      if (lastSent && daysSince(lastSent) < CFG.REMINDER_THROTTLE) continue;
      const latest = latestMap.get(String(user._id));
      if (!latest) continue;
      // Only remind if last test was 7+ weeks ago
      if (daysSince(latest.date) < 49) continue;
      candidates.push({ user, type: 'testReminder' });
    }
    console.log(`[Retention] Reminder campaign queued: ${candidates.length} users`);
  }

  return candidates;
}

// ─── Queue management ─────────────────────────────────────────────────────────
function enqueue(candidates) {
  // Avoid duplicating users already in the queue
  const inQueue = new Set(sendQueue.map(i => String(i.user._id)));
  const added   = candidates.filter(c => !inQueue.has(String(c.user._id)));
  sendQueue.push(...added);
  if (added.length) {
    console.log(`[Retention] Enqueued ${added.length} new items (queue size: ${sendQueue.length})`);
  }
}

/**
 * Drain up to `limit` items from the front of sendQueue.
 * Sends one email per item with EMAIL_GAP_MS delay between each.
 * Non-blocking — caller should NOT await if it doesn't want to block the tick.
 */
async function drainQueue(limit) {
  if (isdraining) {
    console.log('[Retention] Drain already in progress — skipping tick drain.');
    return;
  }
  isdraining = true;

  let sent = 0, errors = 0;

  try {
    while (sendQueue.length > 0 && sent + errors < limit) {
      const item = sendQueue.shift();   // take from front (FIFO)
      const { user, type, extra } = item;

      try {
        let ok = false;

        switch (type) {
          case 'weekly':       ok = await sendWeeklyProgressEmail(user);                                break;
          case 'monthly':      ok = await sendMonthlyReportEmail(user);                                 break;
          case 'testReminder': ok = await sendTestReminderEmail(user);                                  break;
          case 'reEngagement': ok = await sendReengagementEmail(user);                                  break;
          case 'milestone':    ok = await sendMilestoneEmail(user, extra);                              break;
          case 'anniversary':  ok = await sendAnniversaryEmail(user, extra);                            break;
          case 'inviteCoach':  ok = await sendInviteCoachEmail(user);                                   break;
          case 'lt2Improvement':
            ok = await sendLT2ImprovementEmail(user, extra.gain, extra.value, extra.sport);
            break;
          default:
            console.warn('[Retention] Unknown email type:', type);
        }

        ok ? sent++ : errors++;
      } catch (e) {
        errors++;
        console.error(`[Retention] Send error (${type}) for ${user.email}:`, e.message);
      }

      // Pause between every email regardless of batch boundary
      if (sendQueue.length > 0 && (sent + errors) < limit) {
        await sleep(CFG.EMAIL_GAP_MS);
      }
    }
  } finally {
    isdraining = false;
    console.log(`[Retention] Drain done: sent=${sent} errors=${errors} remaining=${sendQueue.length}`);
  }
}

// ─── Main tick ────────────────────────────────────────────────────────────────
async function tick() {
  const now  = new Date();
  const day  = now.getUTCDay();
  const hour = now.getUTCHours();
  const date = now.getUTCDate();

  console.log(`[Retention] Tick ${now.toISOString()} queue=${sendQueue.length}`);

  // ── Step 1: Load users (lean, only fields we need) ──
  const users = await User
    .find({ email: { $exists: true, $ne: null } })
    .select('name surname email isActive lastLogin createdAt sport role notifications retentionEmails coachIds')
    .lean();

  // ── Step 2: Bulk-fetch test data (2 aggregations, not N queries) ──
  const { countMap, latestMap } = await bulkFetchTestData();

  // ── Step 3: Build new candidates (only if queue is running low) ──
  // We re-evaluate event-driven candidates every tick (they're cheap with the bulk maps).
  // Scheduled campaigns are enqueued once per day automatically.
  const eventCandidates     = await buildEventCandidates(users, countMap, latestMap);
  const scheduledCandidates = buildScheduledCandidates(users, latestMap, day, hour, date);

  enqueue([...eventCandidates, ...scheduledCandidates]);

  // ── Step 4: Drain EMAILS_PER_TICK items from the queue (non-blocking) ──
  if (sendQueue.length > 0 && !isdraining) {
    drainQueue(CFG.EMAILS_PER_TICK)
      .catch(e => console.error('[Retention] drainQueue error:', e));
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
function startRetentionScheduler() {
  const enabled =
    process.env.ENABLE_RETENTION_SCHEDULER === 'true' ||
    process.env.NODE_ENV === 'production';

  if (!enabled) {
    console.log('[RetentionScheduler] Disabled. Set ENABLE_RETENTION_SCHEDULER=true to enable.');
    return;
  }

  const intervalMs = Number(process.env.RETENTION_SCHEDULER_INTERVAL_MS || 30 * 60 * 1000);

  const run = () => tick().catch(e => console.error('[RetentionScheduler] tick error:', e));

  // First tick after 25 s (let server finish booting)
  setTimeout(run, 25_000);

  // Recurring ticks
  setInterval(run, intervalMs);

  console.log(
    `[RetentionScheduler] Started. interval=${intervalMs / 60_000}min ` +
    `emailsPerTick=${CFG.EMAILS_PER_TICK} gap=${CFG.EMAIL_GAP_MS}ms`
  );
}

module.exports = { startRetentionScheduler };
