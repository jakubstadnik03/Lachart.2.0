/**
 * When this person last had a marketing email from us, whichever campaign sent
 * it.
 *
 * Every campaign used to answer this for itself, from a hand-written list of
 * the other campaigns' keys. Two problems with that. A new campaign is
 * invisible to the throttle until it is added to every existing list, so the
 * one thing that stops mail stacking depends on nobody forgetting. And the
 * lists had already fallen behind: neither of them mentioned
 * retentionEmails.productUpdates, the issue-based newsletter — nine hundred
 * and fifty sends, the largest campaign on the account, invisible to the only
 * guard against mailing somebody twice in a week.
 *
 * So this reads whatever is there instead of what it was told to expect. Any
 * date anywhere under retentionEmails counts, nested maps included, and a new
 * campaign is throttled by every other one the day it ships, without anybody
 * editing anything.
 */

const MS_DAY = 24 * 60 * 60 * 1000;

/** Deepest date under an object, or null. Cycles and junk are survived. */
function deepestDate(node, depth = 0) {
  if (node == null || depth > 4) return null;
  if (node instanceof Date) return Number.isNaN(node.getTime()) ? null : node;
  if (typeof node === 'string' || typeof node === 'number') {
    const d = new Date(node);
    // A bare count ("3 emails sent") is not a date. Anything before 2020 is
    // either a small integer read as an epoch or data we do not want.
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 2020) return null;
    return d;
  }
  if (typeof node !== 'object') return null;

  let best = null;
  for (const v of Object.values(node)) {
    const d = deepestDate(v, depth + 1);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

/**
 * @param {object} user  a lean User with retentionEmails selected
 * @returns {Date|null}
 */
function lastMarketingSend(user) {
  const candidates = [
    deepestDate(user?.retentionEmails),
    // One-offs that predate retentionEmails and live elsewhere on the doc.
    deepestDate(user?.appDownloadEmail?.lastSent),
  ].filter(Boolean);
  if (!candidates.length) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

function daysSince(date) {
  if (!date) return Infinity;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / MS_DAY;
}

/**
 * True when this person has had marketing too recently to have another.
 * @param {object} user
 * @param {number} gapDays
 */
function withinQuietPeriod(user, gapDays) {
  const gap = Number(gapDays);
  if (!Number.isFinite(gap) || gap <= 0) return false;
  return daysSince(lastMarketingSend(user)) < gap;
}

module.exports = { lastMarketingSend, daysSince, withinQuietPeriod, MS_DAY };
