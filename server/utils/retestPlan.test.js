/**
 * node server/utils/retestPlan.test.js
 *
 * Exercises the GENERATED server twin, so this also catches the twin falling
 * out of step with client/src/utils/retestPlan.js (the real source).
 *
 * The numbers these rules exist to protect, measured on production 2026-11-18:
 * 301 accounts hold exactly one test and 240 of those are more than six weeks
 * past it; and the Thursday "time to retest" email reached 326 people for
 * 4.3 % retests and exactly one plan started. So every guard below is a reason
 * that email failed, and the tests say so.
 */

'use strict';

const assert = require('assert');
const {
  defaultRetestIntervalDays,
  maxRetestReminders,
  normalizeIntervalDays,
  retestDueAt,
  retestStatus,
  daysUntilRetest,
  shouldNotifyRetest,
  retestReminderCopy,
} = require('./retestPlan');

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-11-18T10:00:00Z').getTime();
const days = (n) => new Date(T0 + n * DAY);

// ── normalizeIntervalDays ────────────────────────────────────────────────────
assert.strictEqual(normalizeIntervalDays(56), 56, 'a sane value passes through');
assert.strictEqual(normalizeIntervalDays(undefined), defaultRetestIntervalDays());
assert.strictEqual(normalizeIntervalDays('soon'), defaultRetestIntervalDays(), 'junk falls back, never throws');
assert.strictEqual(normalizeIntervalDays(null), defaultRetestIntervalDays());
assert.strictEqual(normalizeIntervalDays(1), 7, 'nothing schedules a lab test for tomorrow');
assert.strictEqual(normalizeIntervalDays(99999), 365, 'nor five years out');

// ── retestDueAt ──────────────────────────────────────────────────────────────
assert.strictEqual(retestDueAt(days(0), 42).getTime(), days(42).getTime());
assert.strictEqual(retestDueAt(days(0)).getTime(), days(defaultRetestIntervalDays()).getTime(), 'six weeks by default');
assert.strictEqual(retestDueAt('2026-11-18T10:00:00Z', 7).toISOString(), '2026-11-25T10:00:00.000Z');
assert.strictEqual(retestDueAt(null), null, 'no date in, no Invalid Date out');
assert.strictEqual(retestDueAt('not a date'), null);

// ── retestStatus ─────────────────────────────────────────────────────────────
assert.strictEqual(retestStatus({ dueAt: null, now: T0 }), 'none');
assert.strictEqual(retestStatus({ dueAt: days(10), now: T0 }), 'scheduled');
assert.strictEqual(retestStatus({ dueAt: days(0), now: T0 }), 'due', 'due on the day itself');
assert.strictEqual(retestStatus({ dueAt: days(-30), now: T0 }), 'due');
assert.strictEqual(retestStatus({ dueAt: days(-61), now: T0 }), 'overdue', 'a 60-day-stale plan is not a plan');
assert.strictEqual(
  retestStatus({ dueAt: days(-5), now: T0, newerTestAt: days(-1) }), 'done',
  'a later test closes the plan however it was left',
);
assert.strictEqual(
  retestStatus({ dueAt: days(-5), now: T0, newerTestAt: days(-1), dismissedAt: days(-3) }), 'done',
  'a real test beats a dismissal — never tell someone who tested that they still owe one',
);
assert.strictEqual(retestStatus({ dueAt: days(-5), now: T0, dismissedAt: days(-4) }), 'dismissed');

// ── daysUntilRetest ──────────────────────────────────────────────────────────
assert.strictEqual(daysUntilRetest({ dueAt: days(14), now: T0 }), 14);
assert.strictEqual(daysUntilRetest({ dueAt: days(-3), now: T0 }), -3);
assert.strictEqual(daysUntilRetest({ dueAt: null, now: T0 }), null);

// ── shouldNotifyRetest ───────────────────────────────────────────────────────
assert.deepStrictEqual(shouldNotifyRetest({ dueAt: days(0), now: T0 }), { notify: true, reason: 'due' });
assert.strictEqual(shouldNotifyRetest({ dueAt: days(3), now: T0 }).notify, false, 'nothing before the date');
assert.deepStrictEqual(
  shouldNotifyRetest({ dueAt: days(-1), now: T0, newerTestAt: days(0) }),
  { notify: false, reason: 'status:done' },
);
assert.strictEqual(
  shouldNotifyRetest({ dueAt: days(-1), now: T0, dismissedAt: days(-1) }).notify, false,
  'a dismissal is final',
);
assert.deepStrictEqual(
  shouldNotifyRetest({ dueAt: days(-20), now: T0, reminderCount: maxRetestReminders(), remindedAt: days(-14) }),
  { notify: false, reason: 'reminder-cap' },
  'two nudges, then silence — a third is the Thursday email again',
);
assert.deepStrictEqual(
  shouldNotifyRetest({ dueAt: days(-2), now: T0, reminderCount: 1, remindedAt: days(-2) }),
  { notify: false, reason: 'too-soon' },
);
assert.deepStrictEqual(
  shouldNotifyRetest({ dueAt: days(-8), now: T0, reminderCount: 1, remindedAt: days(-8) }),
  { notify: true, reason: 'due' },
  'the second nudge lands a week after the first',
);
assert.deepStrictEqual(
  shouldNotifyRetest({ dueAt: days(-90), now: T0 }),
  { notify: false, reason: 'status:overdue' },
);
assert.strictEqual(
  shouldNotifyRetest({ dueAt: null, now: T0 }).notify, false,
  'this is opt-in: a test nobody scheduled a retest for is never nudged',
);

// ── copy ─────────────────────────────────────────────────────────────────────
assert.strictEqual(retestReminderCopy({ sport: 'bike' }).title, 'Your bike retest is due');
assert.strictEqual(retestReminderCopy({ sport: null }).title, 'Your retest is due');
assert.strictEqual(retestReminderCopy({ sport: 'hyrox' }).title, 'Your retest is due', 'unknown sport stays generic');
assert.match(retestReminderCopy({ daysOverdue: 7 }).body, /a week ago/);
assert.match(retestReminderCopy({ daysOverdue: 0 }).body, /Today/);

console.log('retestPlan: opt-in, capped at two nudges, and closed by a real test');
