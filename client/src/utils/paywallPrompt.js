/**
 * When the iOS app shows the full-screen Premium offer to a free user.
 *
 * Regular but not nagging: never in the first days, when someone is still
 * finding out what the app does; then at most once every few days, once per
 * app session, and never to anyone who pays or whose status is not known yet.
 * The schedule lives on the device, which is fine for something whose only
 * job is to not show up too often.
 */

const STORAGE_KEY = 'premiumPaywallPrompt';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days after first opening the app before the first offer. */
export const FIRST_AFTER_DAYS = 2;
/** Days between offers after that. */
export const EVERY_DAYS = 3;

let shownThisSession = false;

function readState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { firstSeenAt: Number(parsed?.firstSeenAt) || 0, lastAt: Number(parsed?.lastAt) || 0, count: Number(parsed?.count) || 0 };
  } catch {
    return { firstSeenAt: 0, lastAt: 0, count: 0 };
  }
}

function writeState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode: just ask less reliably */ }
}

/**
 * @param {object}  o
 * @param {object}  o.user
 * @param {boolean} o.isPremium
 * @param {boolean} o.premiumResolved
 * @param {boolean} o.canBuy          an App Store purchase is possible in this build
 * @param {boolean} [o.impersonating] an admin is looking through someone's account
 * @param {number}  [o.now]
 */
export function shouldShowPaywall({ user, isPremium, premiumResolved, canBuy, impersonating = false, now = Date.now() } = {}) {
  if (!user?._id || !canBuy || impersonating) return false;
  // "Not premium" and "not known yet" look alike; pitching a payer is the one
  // mistake this must never make.
  if (!premiumResolved || isPremium) return false;
  if (shownThisSession) return false;

  const state = readState();
  if (!state.firstSeenAt) {
    writeState({ ...state, firstSeenAt: now });
    return false;
  }
  if (now - state.firstSeenAt < FIRST_AFTER_DAYS * DAY_MS) return false;
  if (state.lastAt && now - state.lastAt < EVERY_DAYS * DAY_MS) return false;
  return true;
}

/** Record the offer as it appears, not on a tap. */
export function markPaywallShown(now = Date.now()) {
  shownThisSession = true;
  const state = readState();
  writeState({ ...state, firstSeenAt: state.firstSeenAt || now, lastAt: now, count: state.count + 1 });
}

/** Tests only. */
export function resetPaywallSessionForTests() {
  shownThisSession = false;
}
