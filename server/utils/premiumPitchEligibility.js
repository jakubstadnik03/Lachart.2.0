/**
 * Who gets the recurring premium letter, and how often.
 *
 * Unlike the one-shot campaigns, this one comes back — so the rules are about
 * restraint rather than about a segment. Three things it will not do:
 *
 *   • Pitch somebody who already pays. The one unacceptable mistake, and the
 *     reason paying status is required rather than inferred from a flag on the
 *     user document.
 *   • Stack on another campaign. The shared throttle covers every campaign at
 *     once, newsletter included.
 *   • Keep asking. Three letters, two months apart, and then never again. An
 *     offer that follows somebody around is the offer they unsubscribe from,
 *     and there are 51 opt-outs on a base of 687 already.
 *
 * Mirrors client/src/utils/trialOfferPrompt.js, which decides the same thing
 * for the in-app card. Email is the more intrusive of the two, so the gap here
 * is twice as long.
 */

const { withinQuietPeriod, daysSince } = require('./marketingThrottle');

const STATE_KEY = 'premiumPitch';

/** Never more than this many premium letters to one person, ever. */
const MAX_SENDS = 3;
/** Two months between them. */
const MIN_GAP_DAYS = 60;
/** And never within this many days of any other campaign. */
const QUIET_DAYS = 14;
/** Let a new account finish onboarding before selling to it. */
const MIN_ACCOUNT_AGE_DAYS = 7;

function pitchState(user) {
  const s = user?.retentionEmails?.[STATE_KEY];
  if (!s || typeof s !== 'object') return { count: 0, lastAt: null };
  return {
    count: Number(s.count) || 0,
    lastAt: s.lastAt ? new Date(s.lastAt) : null,
  };
}

/**
 * @param {object}  o
 * @param {object}  o.user       lean User with retentionEmails + notifications
 * @param {boolean} o.isPaying   has an active or trialing subscription
 * @param {number}  [o.maxSends]
 * @param {number}  [o.minGapDays]
 * @param {number}  [o.quietDays]
 * @returns {{ok: boolean, reason: string|null}}
 */
function shouldPitchPremium({
  user,
  isPaying,
  maxSends = MAX_SENDS,
  minGapDays = MIN_GAP_DAYS,
  quietDays = QUIET_DAYS,
} = {}) {
  if (!user?._id) return { ok: false, reason: 'no_user' };
  if (!user.email) return { ok: false, reason: 'no_email' };
  if (user.isActive === false) return { ok: false, reason: 'inactive_account' };
  if (user.notifications?.emailNotifications === false) return { ok: false, reason: 'unsubscribed' };
  if (user.notifications?.marketingEmails === false) return { ok: false, reason: 'marketing_opt_out' };
  if (user.marketingEmails === false) return { ok: false, reason: 'marketing_opt_out' };

  // Selling a subscription to a subscriber. Required as an argument rather
  // than read off the user, because the answer lives in another collection
  // and a missing field would read as "not paying".
  if (isPaying !== false) {
    return { ok: false, reason: isPaying === true ? 'already_paying' : 'paying_status_unknown' };
  }

  if (daysSince(user.createdAt) < MIN_ACCOUNT_AGE_DAYS) {
    return { ok: false, reason: 'account_too_new' };
  }

  const { count, lastAt } = pitchState(user);
  if (count >= maxSends) return { ok: false, reason: 'asked_enough' };
  if (lastAt && daysSince(lastAt) < minGapDays) return { ok: false, reason: 'too_soon' };

  // Checked last: the most likely reason to skip somebody on any given day,
  // and the cheapest to recover from — they simply come round again.
  if (withinQuietPeriod(user, quietDays)) return { ok: false, reason: 'another_campaign_recently' };

  return { ok: true, reason: null };
}

module.exports = {
  shouldPitchPremium, pitchState,
  STATE_KEY, MAX_SENDS, MIN_GAP_DAYS, QUIET_DAYS, MIN_ACCOUNT_AGE_DAYS,
};
