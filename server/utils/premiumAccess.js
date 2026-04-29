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
 * @returns {{ isPremium: boolean, source: 'manual'|'subscription'|'beta'|'none' }}
 */
function resolvePremiumAccess(user, subscription) {
  // Manual override always wins
  if (user && user.premium === true) {
    return { isPremium: true, source: 'manual' };
  }

  // Admin sees real subscription state (so they can test the Stripe paywall)
  if (user && user.role === 'admin') {
    if (subscriptionGrantsPremium(subscription)) {
      return { isPremium: true, source: 'subscription' };
    }
    return { isPremium: false, source: 'none' };
  }

  // All other logged-in users get full access for free during beta
  if (user) {
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
