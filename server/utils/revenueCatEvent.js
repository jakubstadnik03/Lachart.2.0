/**
 * Turning a RevenueCat webhook event into a Subscription row.
 *
 * RevenueCat sits in front of StoreKit and Play Billing and tells us what
 * happened in one shape for both. This file is the translation only — no
 * database, no network — because the rules worth being sure about are all
 * decisions: which plan was bought, whether it is still live, and whether this
 * event may touch this account at all.
 *
 * Two things are refused rather than guessed:
 *
 *   • A product we do not recognise. Granting "pro" to anything that arrives
 *     would hand out premium for a mistyped product id in App Store Connect.
 *   • A sandbox event, unless explicitly allowed. Sandbox purchases are free
 *     and anybody with a test account can make them.
 */

const { APPLE, GOOGLE, STRIPE } = require('./billingProvider');

const STORE_PROVIDER = {
  APP_STORE: APPLE,
  MAC_APP_STORE: APPLE,
  PLAY_STORE: GOOGLE,
  AMAZON: null,     // not sold through
  STRIPE: STRIPE,   // relayed, but our own Stripe webhook owns those rows
  PROMOTIONAL: null,
};

/**
 * Which entitlement or product means which plan. Entitlement ids are
 * RevenueCat's own abstraction and are the stable thing to key on; product
 * ids are accepted too so a store product can be mapped before its
 * entitlement exists.
 *
 * Override with REVENUECAT_PLAN_MAP, a JSON object of id → plan.
 */
const DEFAULT_PLAN_MAP = {
  athlete: 'pro',
  coach: 'coach',
  'net.lachart.athlete.monthly': 'pro',
  'net.lachart.coach.monthly': 'coach',
};

function planMapFromEnv(raw) {
  if (!raw) return DEFAULT_PLAN_MAP;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...DEFAULT_PLAN_MAP, ...parsed } : DEFAULT_PLAN_MAP;
  } catch {
    // A malformed override must not silently disable the map and start
    // rejecting every real purchase — fall back and let the caller log.
    return DEFAULT_PLAN_MAP;
  }
}

/** Events that say nothing about whether someone may use the product. */
const IGNORED_TYPES = new Set([
  'TEST',
  'NON_RENEWING_PURCHASE',   // we only sell subscriptions
  'TEMPORARY_ENTITLEMENT_GRANT',
  'INVOICE_ISSUANCE',
  'VIRTUAL_CURRENCY_TRANSACTION',
]);

const msToDate = (ms) => {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n) : null;
};

/**
 * @param {object} event             the `event` object from the webhook body
 * @param {object} [o]
 * @param {string} [o.planMapRaw]    process.env.REVENUECAT_PLAN_MAP
 * @param {boolean} [o.allowSandbox] accept SANDBOX events (test rigs only)
 * @returns {{action: 'upsert'|'ignore'|'reject', reason: string|null,
 *            userId: string|null, provider: string|null, patch: object|null}}
 */
function mapRevenueCatEvent(event, { planMapRaw, allowSandbox = false } = {}) {
  const nothing = (action, reason) => ({ action, reason, userId: null, provider: null, patch: null });

  if (!event || typeof event !== 'object') return nothing('reject', 'no_event');

  const type = String(event.type || '').toUpperCase();
  if (!type) return nothing('reject', 'no_type');
  if (IGNORED_TYPES.has(type)) return nothing('ignore', `ignored_type:${type}`);

  // A sandbox purchase costs nothing and anybody can make one.
  const environment = String(event.environment || '').toUpperCase();
  if (environment === 'SANDBOX' && !allowSandbox) {
    return nothing('ignore', 'sandbox');
  }

  // Which of our users this is. The client calls Purchases.logIn(userId), so
  // app_user_id is the LaChart id; an anonymous one ($RCAnonymousID:…) means
  // the purchase happened before login and cannot be attached to anybody yet.
  const userId = String(event.app_user_id || '');
  if (!userId || userId.startsWith('$RCAnonymousID')) {
    return nothing('reject', 'anonymous_app_user_id');
  }

  const store = String(event.store || '').toUpperCase();
  const provider = STORE_PROVIDER[store];
  if (!provider) return nothing('ignore', `unsold_store:${store || 'unknown'}`);
  if (provider === STRIPE) {
    // Relayed for completeness; our own Stripe webhook is the authority and
    // two writers on one row is how they drift apart.
    return nothing('ignore', 'stripe_owned_by_its_own_webhook');
  }

  // TRANSFER moves a purchase between app user ids. Getting it wrong either
  // strands a payer or grants premium to the wrong account, so it is surfaced
  // rather than guessed at.
  if (type === 'TRANSFER') return { action: 'reject', reason: 'transfer_needs_review', userId, provider, patch: null };

  const planMap = planMapFromEnv(planMapRaw);
  const candidates = [
    ...(Array.isArray(event.entitlement_ids) ? event.entitlement_ids : []),
    event.entitlement_id,
    event.product_id,
  ].filter(Boolean).map(String);
  const matched = candidates.find((c) => planMap[c]);
  if (!matched) {
    return { action: 'reject', reason: `unknown_product:${candidates.join(',') || 'none'}`, userId, provider, patch: null };
  }
  const plan = planMap[matched];

  const expiresAt = msToDate(event.expiration_at_ms);
  const purchasedAt = msToDate(event.purchased_at_ms);
  const isTrial = String(event.period_type || '').toUpperCase() === 'TRIAL';

  const patch = {
    provider,
    plan,
    storeProductId: event.product_id ? String(event.product_id) : null,
    currentPeriodStart: purchasedAt,
    currentPeriodEnd: expiresAt,
    cancelAtPeriodEnd: false,
  };
  if (provider === APPLE && event.original_transaction_id) {
    patch.appleOriginalTransactionId = String(event.original_transaction_id);
  }
  if (provider === GOOGLE && (event.transaction_id || event.original_transaction_id)) {
    patch.googlePurchaseToken = String(event.transaction_id || event.original_transaction_id);
  }
  if (isTrial) {
    patch.trialStart = purchasedAt;
    patch.trialEnd = expiresAt;
  }

  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'SUBSCRIPTION_EXTENDED':
      patch.status = isTrial ? 'trialing' : 'active';
      break;

    case 'CANCELLATION':
      // Turned off auto-renew. They keep what they paid for until it expires,
      // which is also the only window in which a win-back can reach them.
      patch.status = isTrial ? 'trialing' : 'active';
      patch.cancelAtPeriodEnd = true;
      patch.canceledAt = new Date();
      break;

    case 'SUBSCRIPTION_PAUSED':
      // Play Store only. Access runs to the end of the paid period, then stops.
      patch.status = 'active';
      patch.cancelAtPeriodEnd = true;
      break;

    case 'EXPIRATION':
      patch.status = 'canceled';
      patch.cancelAtPeriodEnd = false;
      break;

    case 'BILLING_ISSUE':
      // In the stores' grace period: still a customer, payment retrying.
      patch.status = 'past_due';
      break;

    default:
      return nothing('ignore', `unhandled_type:${type}`);
  }

  return { action: 'upsert', reason: null, userId, provider, patch };
}

module.exports = { mapRevenueCatEvent, DEFAULT_PLAN_MAP, STORE_PROVIDER };
