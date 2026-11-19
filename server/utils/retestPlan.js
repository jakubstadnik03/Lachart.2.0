/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * CommonJS twin of client/src/utils/retestPlan.js, produced by
 * scripts/sync-shared-utils.js. Edit the client module and re-run:
 *
 *   node scripts/sync-shared-utils.js
 *
 * Both sides of the app compute these numbers — the browser for the session in
 * front of you, the server for the history behind it — and they must agree.
 */

'use strict';

/**
 * retestPlan.js — when the next lactate test is due, and whether to say so.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Measured on production 2026-11-18, over 741 real accounts:
 *
 *   tests saved   accounts   ever paid
 *   0              317        6.6 %
 *   1              301        9.0 %
 *   2               70       15.7 %
 *   3+              51       37.3 %
 *
 * Repeat testing is the strongest behavioural predictor of paying the data
 * has. It is also the rarest: 301 accounts hold exactly one test, 274 of those
 * never paid, and 240 are more than six weeks past that test with no second
 * one. The median gap between a first and second test is six days (p25 = 0) —
 * the people who do test twice almost always do it in a single lab visit, not
 * across a training block. Retesting as a habit does not exist in the product.
 *
 * ── Why this is not an email ──────────────────────────────────────────────────
 * Because that was tried and it is spent. retentionScheduler has sent a "time
 * to retest" email every Thursday for months: 326 people received it, 4.3 %
 * tested afterwards, exactly one started a plan, and the ever-paid rate among
 * recipients (10.7 %) sits inside the noise of those who never got it (9.9 %).
 * Mailing a seven-week-dormant account asks the least engaged moment for the
 * most expensive action.
 *
 * So the retest is scheduled at the opposite moment: while the athlete is in
 * the app looking at the curve they just saved. They pick the date, it becomes
 * a commitment they made, and the reminder is in-app and push — never another
 * campaign email.
 *
 * ── Shape ─────────────────────────────────────────────────────────────────────
 * Pure, and exported as functions only (no `export const`) so
 * scripts/sync-shared-utils.js can generate the server's CommonJS twin. The
 * card in the browser and the scheduler on the server must never disagree
 * about whether a retest is due. Every function takes `now`; nothing reads a
 * clock of its own.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Default days between tests.
 *
 * Six weeks is the shortest block over which a threshold reliably moves far
 * enough to be worth re-measuring, and it is also the point the data marks as
 * "gone": past six weeks with no second test, an account almost never comes
 * back on its own.
 */
function defaultRetestIntervalDays() {
  return 42;
}

/** Floor on a chosen interval, so nothing books a lab test for tomorrow. */
function minRetestIntervalDays() {
  return 7;
}

/** Ceiling, so a stray value cannot schedule one five years out. */
function maxRetestIntervalDays() {
  return 365;
}

/**
 * At most two nudges per scheduled retest — one on the day, one a week later.
 * A third is nagging, and the email above is what nagging buys.
 */
function maxRetestReminders() {
  return 2;
}

/** Days between the first nudge and the second. */
function retestReminderGapDays() {
  return 7;
}

/**
 * Stop reminding once a plan is this far past due. A date chosen two months
 * ago and never acted on is no longer a plan; re-asking is just the Thursday
 * email with a different transport.
 */
function retestStaleAfterDays() {
  return 60;
}

/** The intervals the card offers, in days: four, six and eight weeks. */
function retestIntervalChoices() {
  return [28, 42, 56];
}

function toTime(value) {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Clamp a requested interval into the supported range. Junk falls back to the
 * default rather than throwing — this runs on request payloads.
 */
function normalizeIntervalDays(days) {
  // Number(null) and Number('') are both 0, which is finite — without this
  // guard a missing value would clamp up to the minimum and quietly schedule
  // a retest for next week instead of using the default.
  if (days == null || days === '') return defaultRetestIntervalDays();
  const n = Number(days);
  if (!Number.isFinite(n)) return defaultRetestIntervalDays();
  return Math.min(maxRetestIntervalDays(), Math.max(minRetestIntervalDays(), Math.round(n)));
}

/**
 * The date a retest falls due, counted from the test it follows.
 * Returns null when the test has no usable date — never an Invalid Date.
 */
function retestDueAt(testDate, intervalDays) {
  const base = toTime(testDate);
  if (base == null) return null;
  return new Date(base + normalizeIntervalDays(intervalDays) * DAY_MS);
}

/**
 * What to show for a scheduled retest.
 *
 * `newerTestAt` is the athlete's most recent test that is later than the one
 * this plan hangs off. Its presence means the retest happened — whether or
 * not anybody pressed a button — so the plan is 'done'. Resolving that from
 * real tests rather than a flag is deliberate: someone who simply saves their
 * next test must never be told they still owe one.
 *
 * @returns {'none'|'dismissed'|'done'|'scheduled'|'due'|'overdue'}
 */
function retestStatus({ dueAt, now, newerTestAt, dismissedAt } = {}) {
  if (toTime(newerTestAt) != null) return 'done';
  const due = toTime(dueAt);
  if (due == null) return 'none';
  if (toTime(dismissedAt) != null) return 'dismissed';
  const t = toTime(now) ?? Date.now();
  if (t < due) return 'scheduled';
  if (t - due > retestStaleAfterDays() * DAY_MS) return 'overdue';
  return 'due';
}

/** Whole days until the retest; negative once past due. null if unset. */
function daysUntilRetest({ dueAt, now } = {}) {
  const due = toTime(dueAt);
  if (due == null) return null;
  const t = toTime(now) ?? Date.now();
  return Math.round((due - t) / DAY_MS);
}

/**
 * Should we nudge about this retest right now?
 *
 * Every condition is a reason the Thursday email failed, written as code:
 * the athlete must have asked for this date themselves, it must be due and
 * not so stale the plan is dead, a later test means say nothing, a dismissal
 * is final, and at most two nudges a week apart.
 *
 * @returns {{ notify: boolean, reason: string }} reason is for the scheduler log.
 */
function shouldNotifyRetest({
  dueAt, now, newerTestAt, dismissedAt, remindedAt, reminderCount,
} = {}) {
  const status = retestStatus({ dueAt, now, newerTestAt, dismissedAt });
  if (status !== 'due') return { notify: false, reason: `status:${status}` };

  const count = Number(reminderCount) || 0;
  if (count >= maxRetestReminders()) return { notify: false, reason: 'reminder-cap' };

  const last = toTime(remindedAt);
  if (last != null) {
    const t = toTime(now) ?? Date.now();
    if (t - last < retestReminderGapDays() * DAY_MS) return { notify: false, reason: 'too-soon' };
  }
  return { notify: true, reason: 'due' };
}

/** Copy for the nudge. Here so the scheduler and the client agree. */
function retestReminderCopy({ sport, daysOverdue } = {}) {
  const what = sport === 'swim' ? 'swim' : sport === 'run' ? 'run' : sport === 'bike' ? 'bike' : null;
  const title = what ? `Your ${what} retest is due` : 'Your retest is due';
  const body = Number(daysOverdue) >= 7
    ? 'You planned a retest a week ago. Save it and LaChart will show both curves side by side.'
    : 'Today is the day you planned to test again. Save it and LaChart will show what moved.';
  return { title, body };
}

module.exports = {
  daysUntilRetest,
  defaultRetestIntervalDays,
  maxRetestIntervalDays,
  maxRetestReminders,
  minRetestIntervalDays,
  normalizeIntervalDays,
  retestDueAt,
  retestIntervalChoices,
  retestReminderCopy,
  retestReminderGapDays,
  retestStaleAfterDays,
  retestStatus,
  shouldNotifyRetest,
};
