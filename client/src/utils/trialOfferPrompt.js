/**
 * When the iOS app should offer the free trial.
 *
 * Why it exists: the welcome paywall is web-only and shows once per account
 * for ever, so of 677 accounts only 112 had ever seen it and 45 had ever
 * started a trial — while 21 of 33 finished trials converted. The offer
 * converts; almost nobody reaches it. The app never showed it at all.
 *
 * Who it asks: someone on the free plan whose product is actually working —
 * they have a lactate test and something measuring their training against it.
 * Offering a trial to an athlete whose zones govern nothing is the wrong ask;
 * that person gets the tracker prompt instead (see trackerConnectPrompt.js),
 * and the two therefore never target the same account at the same time.
 *
 * Anyone who has ever held a paid subscription is left alone. Someone who
 * cancelled does not want the same pitch again — that is the win-back
 * campaign's job, and it knows why they left.
 *
 * The offer links out to the website rather than selling in the app: there is
 * no StoreKit purchase here, and what an iOS app may do about outside payment
 * varies by storefront. Keeping the transaction on the web is the same thing
 * UpgradeModal already does on native.
 */

const STORAGE_KEY = 'trialOfferPrompt';

/** Never more than this many offers for one account, ever. */
export const MAX_OFFERS = 3;

/** A month between asks: this one follows someone around, so it is gentle. */
export const MIN_DAYS_BETWEEN = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, lastAt: 0 };
    const parsed = JSON.parse(raw);
    return { count: Number(parsed?.count) || 0, lastAt: Number(parsed?.lastAt) || 0 };
  } catch {
    return { count: 0, lastAt: 0 };
  }
}

/**
 * @param {object}  o
 * @param {object}  o.user           the signed-in user
 * @param {boolean} o.isPremium      resolved premium status — never offer to a payer
 * @param {boolean} [o.premiumResolved] false while it is still unknown
 * @param {boolean} o.hasTest        they have saved a lactate test
 * @param {boolean} o.hasTracker     a workout tracker is connected
 * @param {boolean} [o.everSubscribed] they have held a paid plan before
 * @returns {boolean}
 */
export function shouldOfferTrial({
  user,
  isPremium,
  premiumResolved = true,
  hasTest = false,
  hasTracker = false,
  everSubscribed = false,
} = {}) {
  if (!user?._id) return false;
  // Until premium resolves, "not premium" and "we don't know yet" look the
  // same, and pitching a paying subscriber is the one unacceptable mistake.
  if (!premiumResolved || isPremium) return false;
  if (everSubscribed) return false;
  if (!hasTest || !hasTracker) return false;

  const { count, lastAt } = readState();
  if (count >= MAX_OFFERS) return false;
  if (lastAt && Date.now() - lastAt < MIN_DAYS_BETWEEN * DAY_MS) return false;
  return true;
}

/** Record that the offer was shown. Call as it appears, not on click. */
export function markTrialOfferShown() {
  const { count } = readState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count: count + 1, lastAt: Date.now() }));
  } catch {
    /* storage blocked — the offer simply isn't throttled on this device */
  }
}

/** Test seam. */
export function resetTrialOfferState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
