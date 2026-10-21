/**
 * Who gets the second cold letter.
 *
 * The first one went to 373 coaches. 109 opened it, 1 registered, nobody
 * replied. A 29% open rate on cold B2B is not a delivery problem — the letter
 * was read and put down. So the people worth writing to again are exactly the
 * ones who opened it: they are the only evidence in the whole list that
 * anybody is on the other end.
 *
 * It is one more letter and then never again. A stranger who has ignored you
 * twice has answered.
 *
 * Nothing here reveals that opens are tracked, and the letter must not either.
 * "I saw you opened my email" is the sentence that turns a cold mail into a
 * creepy one.
 */

const MS_DAY = 24 * 60 * 60 * 1000;

/** Long enough that it reads as a considered follow-up, not a nudge. */
const MIN_GAP_DAYS = 21;

function daysSince(date) {
  if (!date) return Infinity;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / MS_DAY;
}

/**
 * @param {object} lead  a CoachOutreachLead
 * @param {object} [o]
 * @param {number} [o.minGapDays]
 * @returns {{ok: boolean, reason: string|null}}
 */
function shouldFollowUp(lead, { minGapDays = MIN_GAP_DAYS } = {}) {
  if (!lead?.email) return { ok: false, reason: 'no_email' };

  // Asked not to be written to. First and loudest, because getting this wrong
  // on cold mail in the EU is not a cosmetic mistake.
  if (lead.unsubscribed === true) return { ok: false, reason: 'unsubscribed' };

  // They already answered, one way or the other.
  if (lead.responded === true) return { ok: false, reason: 'already_replied' };
  if (lead.registered === true) return { ok: false, reason: 'already_registered' };

  // A follow-up to a letter nobody got is just a cold letter with the wrong
  // opening — those belong in the first campaign.
  if (!(Number(lead.sentCount) > 0)) return { ok: false, reason: 'never_written_to' };

  // The whole premise. Somebody who never opened the first one has no more
  // reason to open the second, and mailing them again is how a sender earns
  // its spam reputation.
  if (!(Number(lead.opens) > 0)) return { ok: false, reason: 'never_opened' };

  if (Number(lead.followUpCount) > 0) return { ok: false, reason: 'already_followed_up' };

  if (daysSince(lead.lastSentAt) < minGapDays) return { ok: false, reason: 'too_soon' };

  return { ok: true, reason: null };
}

/**
 * Order within the eligible set. Someone who clicked is warmer than someone
 * who only opened, and someone who opened repeatedly is warmer than someone
 * who opened once and never came back.
 */
function warmth(lead) {
  return (Number(lead?.clicks) || 0) * 100 + (Number(lead?.opens) || 0);
}

module.exports = { shouldFollowUp, warmth, daysSince, MIN_GAP_DAYS };
