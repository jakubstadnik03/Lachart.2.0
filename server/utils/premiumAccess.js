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
 * @returns {{ isPremium: boolean, source: 'manual'|'subscription'|'none' }}
 *
 * Premium access rules (post-beta, paid launch):
 *   1. user.premium === true  →  manual admin grant (comp accounts, support, testers)
 *   2. Active paid Subscription (status active/trialing, plan != free)  →  Stripe-driven
 *   3. Otherwise → no premium. Admins are NOT auto-premium — they get
 *      access only via the same two paths above so paywall can be tested
 *      and dogfooded.
 *
 * To re-enable a "free for everyone" mode (e.g. early access campaign),
 * set BETA_ALL_PREMIUM=true on the server.
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

  // Optional escape hatch for early-access campaigns.
  // Default is OFF so admins / regular users are gated like real customers.
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
