const Subscription = require('../models/SubscriptionModel');

/**
 * Same rules as SubscriptionModel.methods.isActive, for lean/plain objects.
 */
function subscriptionRecordIsActive(sub) {
  if (!sub || typeof sub !== 'object') return false;
  const st = sub.status;
  if (st !== 'active' && st !== 'trialing') return false;
  if (sub.currentPeriodEnd && new Date() > new Date(sub.currentPeriodEnd)) return false;
  return true;
}

function subscriptionGrantsPremium(sub) {
  if (!subscriptionRecordIsActive(sub)) return false;
  const plan = sub.plan;
  return Boolean(plan && plan !== 'free');
}

/**
 * @param {object} user - User document or lean (must have optional `premium`)
 * @param {object|null} subscription - Subscription lean/doc or null
 * @returns {{ isPremium: boolean, source: 'manual'|'subscription'|'beta'|'system_disabled'|'none' }}
 *
 * Premium access rules (in priority order):
 *   1. user.premium === true            →  'manual'   (admin grant: comp/support/testers)
 *   2. Active paid Subscription         →  'subscription' (Stripe trialing or active)
 *   3. SUBSCRIPTION_ENABLED !== 'true'  →  'system_disabled' (paywall is off entirely —
 *                                          if we can't sell, we shouldn't gate)
 *   4. BETA_ALL_PREMIUM === 'true'      →  'beta' (early-access override even while
 *                                          subscriptions are live)
 *   5. Otherwise                        →  'none' (free user, gated)
 *
 * Rules 3 and 4 are independent escape hatches:
 *   - Set SUBSCRIPTION_ENABLED=false to turn the paywall off completely (e.g.
 *     during a feature rebuild, or while waiting for Stripe Tax setup).
 *   - Set BETA_ALL_PREMIUM=true to keep selling but also give every logged-in
 *     user premium access (e.g. promotional period running in parallel).
 */
function resolvePremiumAccess(user, subscription) {
  if (!user) return { isPremium: false, source: 'none' };

  // Manual override always wins (admin granted via PUT /admin/users/:id { premium: true })
  if (user.premium === true) {
    return { isPremium: true, source: 'manual' };
  }

  // Real Stripe subscription
  if (subscriptionGrantsPremium(subscription)) {
    return { isPremium: true, source: 'subscription' };
  }

  // If subscriptions are disabled at the system level, there is no way to
  // pay. Gating features would just lock users out with no recovery, so
  // unlock everything until subscriptions are turned back on.
  if (process.env.SUBSCRIPTION_ENABLED !== 'true') {
    return { isPremium: true, source: 'system_disabled' };
  }

  // Optional escape hatch for early-access / promo campaigns.
  if (process.env.BETA_ALL_PREMIUM === 'true') {
    return { isPremium: true, source: 'beta' };
  }

  return { isPremium: false, source: 'none' };
}

async function loadSubscriptionForUser(user) {
  if (!user || !user.subscriptionId) return null;
  return Subscription.findById(user.subscriptionId).lean();
}

async function resolvePremiumForUserDocument(user) {
  const sub = await loadSubscriptionForUser(user);
  return resolvePremiumAccess(user, sub);
}

module.exports = {
  subscriptionRecordIsActive,
  subscriptionGrantsPremium,
  resolvePremiumAccess,
  loadSubscriptionForUser,
  resolvePremiumForUserDocument,
};
