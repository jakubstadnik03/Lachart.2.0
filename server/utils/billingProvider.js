/**
 * Who bills this user, and what that allows.
 *
 * Until now there was one answer — Stripe — so nothing had to ask. Selling the
 * same subscription through the App Store and Google Play makes it a question,
 * and the two rules in here are the ones that cost real money when they are
 * wrong:
 *
 *   1. Nobody may start a second subscription while one is already running
 *      somewhere else. Subscription rows are one-per-user (userId is unique),
 *      so a Stripe payer who buys through the App Store would overwrite their
 *      own row and quietly pay twice, in two places neither of which knows
 *      about the other.
 *
 *   2. One store transaction belongs to exactly one LaChart account. An Apple
 *      subscription is tied to an Apple ID, not to a login, so without this
 *      the same purchase restores onto any number of accounts.
 *
 * None of this touches resolvePremiumAccess: once a row says plan/status/
 * currentPeriodEnd, where it came from stops mattering. That is deliberate —
 * every feature gate in the app keeps working untouched.
 */

const STRIPE = 'stripe';
const APPLE = 'apple';
const GOOGLE = 'google';

const PROVIDERS = [STRIPE, APPLE, GOOGLE];

/** Where a subscriber goes to change or cancel. Only Stripe is ours to drive. */
const MANAGE_TARGET = {
  [STRIPE]: 'stripe_portal',
  [APPLE]: 'ios_settings',
  [GOOGLE]: 'play_settings',
};

/** Apple and Google will not let a server cancel for the user. */
const APPLE_MANAGE_URL = 'https://apps.apple.com/account/subscriptions';
const GOOGLE_MANAGE_URL = 'https://play.google.com/store/account/subscriptions';

/**
 * Rows written before this existed have no `provider` and are all Stripe.
 * Defaulting rather than backfilling keeps a migration out of the billing path.
 */
function providerOf(subscription) {
  const p = String(subscription?.provider || '').toLowerCase();
  return PROVIDERS.includes(p) ? p : STRIPE;
}

function isLive(subscription) {
  if (!subscription || typeof subscription !== 'object') return false;
  const st = subscription.status;
  if (st !== 'active' && st !== 'trialing') return false;
  if (subscription.plan === 'free' || !subscription.plan) return false;
  if (subscription.currentPeriodEnd && new Date() > new Date(subscription.currentPeriodEnd)) return false;
  return true;
}

/**
 * May this user start paying through `provider` right now?
 *
 * @returns {{allowed: boolean, reason: string|null, activeProvider: string|null}}
 *   reason is 'already_subscribed' when they already pay us here, and
 *   'active_elsewhere' when they pay us somewhere we cannot cancel for them.
 */
function canStartCheckout({ subscription, provider } = {}) {
  const want = String(provider || '').toLowerCase();
  if (!PROVIDERS.includes(want)) {
    return { allowed: false, reason: 'unknown_provider', activeProvider: null };
  }
  if (!isLive(subscription)) {
    return { allowed: true, reason: null, activeProvider: null };
  }
  const have = providerOf(subscription);
  if (have === want) {
    // Not an error — but it is a plan change, not a new subscription, and the
    // two are different calls in every one of the three billing systems.
    return { allowed: false, reason: 'already_subscribed', activeProvider: have };
  }
  return { allowed: false, reason: 'active_elsewhere', activeProvider: have };
}

/**
 * Where to send someone who wants to cancel or change plan.
 *
 * @returns {{target: string, url: string|null, selfServe: boolean}}
 *   selfServe is false when the cancellation happens in Apple's or Google's
 *   own UI, which means we never find out it happened except through a store
 *   notification — and that the cancel-reason question has to be asked before
 *   they leave, not after.
 */
function manageBilling(subscription) {
  const provider = providerOf(subscription);
  if (provider === APPLE) {
    return { target: MANAGE_TARGET[APPLE], url: APPLE_MANAGE_URL, selfServe: false };
  }
  if (provider === GOOGLE) {
    return { target: MANAGE_TARGET[GOOGLE], url: GOOGLE_MANAGE_URL, selfServe: false };
  }
  return { target: MANAGE_TARGET[STRIPE], url: null, selfServe: true };
}

/**
 * May this store transaction be attached to this account?
 *
 * Called on every verify AND every restore. `existingUserId` is whoever the
 * transaction is already bound to, if anyone.
 *
 * @returns {{allowed: boolean, reason: string|null}}
 */
function canBindStoreTransaction({ existingUserId, userId } = {}) {
  if (!userId) return { allowed: false, reason: 'no_user' };
  if (!existingUserId) return { allowed: true, reason: null };
  // Restoring onto the same account — a reinstall or a second device.
  if (String(existingUserId) === String(userId)) return { allowed: true, reason: null };
  // One purchase, one account. Without this, handing somebody your Apple ID
  // hands them a subscription for as many LaChart accounts as they like.
  return { allowed: false, reason: 'bound_to_another_account' };
}

module.exports = {
  PROVIDERS, STRIPE, APPLE, GOOGLE,
  APPLE_MANAGE_URL, GOOGLE_MANAGE_URL,
  providerOf, isLive, canStartCheckout, manageBilling, canBindStoreTransaction,
};
