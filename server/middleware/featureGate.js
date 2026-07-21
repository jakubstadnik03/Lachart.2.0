/**
 * featureGate.js
 *
 * Unified middleware for the LaChart paywall. One source of truth for which
 * plan unlocks which feature, paired with a single helper for "is this user
 * over their quota?" checks.
 *
 * Bypass rules (in priority order, mirror server/utils/premiumAccess.js):
 *   1. `req.user.userId` resolves to a doc with `admin === true`        → always allowed
 *   2. `user.premium === true` (manual admin grant)                      → always allowed
 *   3. SUBSCRIPTION_ENABLED !== 'true' (paywall off systemwide)          → always allowed
 *   4. BETA_ALL_PREMIUM === 'true' (early-access override)               → always allowed
 *   5. Active paid Stripe subscription whose plan unlocks the feature    → allowed
 *   6. Otherwise → 403 with { code, requiredPlans, currentPlan }
 *
 * The matrix below MUST stay in sync with:
 *   client/src/pages/About.jsx          (marketing pitch)
 *   client/src/pages/SettingsPage.jsx   (PLANS_UI feature list)
 *   client/src/components/UpgradeModal.jsx (PLAN_DETAILS feature list)
 *   client/src/components/WhatsNewModal.jsx (release-notes copy)
 *
 * Drift is unfriendly to users — they pay for one thing and get gated on
 * another. Treat this file as the contract.
 */

const User = require('../models/UserModel');
const { resolvePremiumForUserDocument } = require('../utils/premiumAccess');

/**
 * Which plans unlock which feature. Free is implicit when listed.
 * Coach inherits everything in Pro (we list explicitly for clarity).
 */
const FEATURE_MATRIX = {
  // === Free tier (everyone logged-in) ===
  basic_testing:          ['free', 'pro', 'coach', 'team', 'enterprise'],
  strava_sync:            ['free', 'pro', 'coach', 'team', 'enterprise'],
  fit_upload:             ['free', 'pro', 'coach', 'team', 'enterprise'],
  add_lactate_to_interval:['free', 'pro', 'coach', 'team', 'enterprise'],
  connect_coach:          ['free', 'pro', 'coach', 'team', 'enterprise'],
  basic_analytics:        ['free', 'pro', 'coach', 'team', 'enterprise'],

  // === Pro tier ===
  unlimited_tests:        ['pro', 'coach', 'team', 'enterprise'],
  plan_workouts:          ['pro', 'coach', 'team', 'enterprise'],
  start_training_in_app:  ['pro', 'coach', 'team', 'enterprise'],
  smart_trainer:          ['pro', 'coach', 'team', 'enterprise'],
  advanced_analytics:     ['pro', 'coach', 'team', 'enterprise'],
  population_comparison:  ['pro', 'coach', 'team', 'enterprise'],
  test_history:           ['pro', 'coach', 'team', 'enterprise'], // view/compare past tests + LT trend (gated client-side)
  calendar_full_history:  ['pro', 'coach', 'team', 'enterprise'], // >30 days calendar + load charts (enforced in /integrations/activities)
  pdf_export:             ['pro', 'coach', 'team', 'enterprise'],
  apple_health_sync:      ['pro', 'coach', 'team', 'enterprise'],
  priority_support:       ['pro', 'coach', 'team', 'enterprise'],

  // === Coach tier (and above) ===
  manage_athletes:        ['coach', 'team', 'enterprise'],
  plan_for_athletes:      ['coach', 'team', 'enterprise'],
  unlimited_pdf:          ['coach', 'team', 'enterprise'],
  pdf_branding:           ['coach', 'team', 'enterprise'],
  coach_dashboard:        ['coach', 'team', 'enterprise'],

  // === Team / Enterprise extras ===
  team_branding:          ['team', 'enterprise'],
  csv_bulk_export:        ['team', 'enterprise'],
  white_label:            ['enterprise'],
};

/**
 * Quantity caps. `-1` = unlimited.
 * Mirrors PLANS.limits in server/controllers/subscriptionController.js but
 * lives here because the gate middleware reads it on every request.
 */
const QUOTA_LIMITS = {
  // Total lactate tests a free athlete can create (lifetime). The UI advertises
  // "1 lactate test" — we enforce the cap at create time.
  tests:    { free: 1, pro: -1, coach: -1, team: -1, enterprise: -1 },
  // Linked athletes a coach can have. Pro is a solo athlete plan so it gets 0.
  athletes: { free: 0, pro: 0,  coach: -1, team: 25, enterprise: 60 },
};

const KNOWN_PLANS = ['free', 'pro', 'coach', 'team', 'enterprise'];

/**
 * Resolve the plan tier we should evaluate gates against. Always falls back
 * to "free" rather than throwing — gates never crash the request pipeline.
 */
async function resolveUserPlan(req) {
  const userId = req.user?.userId;
  if (!userId) return { user: null, plan: 'free', bypass: 'unauthenticated' };

  const user = await User.findById(userId).populate('subscriptionId');
  if (!user) return { user: null, plan: 'free', bypass: 'no_user' };

  // 1. Admins
  if (user.admin === true || String(user.role || '').toLowerCase() === 'admin') {
    return { user, plan: 'coach', bypass: 'admin' };
  }

  // 2. SUBSCRIPTION_ENABLED off systemwide
  if (process.env.SUBSCRIPTION_ENABLED !== 'true') {
    return { user, plan: 'coach', bypass: 'system_disabled' };
  }

  // 3. Manual premium grant
  if (user.premium === true) {
    return { user, plan: 'coach', bypass: 'manual' };
  }

  // 4. Beta override
  if (process.env.BETA_ALL_PREMIUM === 'true') {
    return { user, plan: 'coach', bypass: 'beta' };
  }

  // 5. Real subscription
  const subPlain = user.subscriptionId && typeof user.subscriptionId.toObject === 'function'
    ? user.subscriptionId.toObject()
    : user.subscriptionId;
  const { isPremium } = await resolvePremiumForUserDocument(user);
  const subPlan = subPlain?.plan && KNOWN_PLANS.includes(subPlain.plan) ? subPlain.plan : 'free';
  if (isPremium && subPlan !== 'free') {
    return { user, plan: subPlan, bypass: null };
  }

  return { user, plan: 'free', bypass: null };
}

/**
 * Express middleware: require that the user's plan unlocks `featureKey`.
 * On failure responds 403 with { error, code, feature, currentPlan, requiredPlans }
 * so the client can show a tailored upgrade prompt.
 *
 * Usage:
 *   router.post('/api/foo', verifyToken, requireFeature('plan_workouts'), handler);
 */
function requireFeature(featureKey) {
  if (!FEATURE_MATRIX[featureKey]) {
    // Programming error — fail closed so we notice in tests/logs.
    return (req, res) => {
      console.error(`[featureGate] Unknown feature key: ${featureKey}`);
      return res.status(500).json({ error: 'Misconfigured feature gate' });
    };
  }

  return async (req, res, next) => {
    try {
      const { plan, bypass } = await resolveUserPlan(req);
      if (bypass) {
        req.gatePlan = plan;
        req.gateBypass = bypass;
        return next();
      }
      const allowed = FEATURE_MATRIX[featureKey];
      if (allowed.includes(plan)) {
        req.gatePlan = plan;
        return next();
      }
      // Cheapest plan that unlocks the feature — UI uses this to deep-link
      // straight to the right Stripe price.
      const minPlan = allowed[0];
      return res.status(403).json({
        error: `This feature requires the ${minPlan} plan or higher`,
        code: 'FEATURE_REQUIRES_UPGRADE',
        feature: featureKey,
        currentPlan: plan,
        requiredPlans: allowed,
        suggestedPlan: minPlan,
      });
    } catch (err) {
      console.error('[featureGate.requireFeature]', err);
      return res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
}

/**
 * Express middleware: require that the user has not yet exceeded the
 * `quotaKey` limit on their plan. `countCurrentUsage(req, user)` is an
 * async function returning the current usage number — the middleware
 * compares it against QUOTA_LIMITS[quotaKey][plan].
 *
 * Usage:
 *   router.post('/api/test', verifyToken,
 *     requireQuotaSlot('tests', async (req, user) =>
 *       Test.countDocuments({ athleteId: user._id.toString() })),
 *     handler);
 */
function requireQuotaSlot(quotaKey, countCurrentUsage) {
  if (!QUOTA_LIMITS[quotaKey]) {
    return (req, res) => {
      console.error(`[featureGate] Unknown quota key: ${quotaKey}`);
      return res.status(500).json({ error: 'Misconfigured quota gate' });
    };
  }
  if (typeof countCurrentUsage !== 'function') {
    return (req, res) => {
      console.error(`[featureGate] Missing countCurrentUsage for ${quotaKey}`);
      return res.status(500).json({ error: 'Misconfigured quota gate' });
    };
  }

  return async (req, res, next) => {
    try {
      const { user, plan, bypass } = await resolveUserPlan(req);
      if (bypass) {
        req.gatePlan = plan;
        req.gateBypass = bypass;
        return next();
      }
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const limit = QUOTA_LIMITS[quotaKey][plan] ?? 0;
      if (limit === -1) {
        req.gatePlan = plan;
        return next();
      }
      const current = await countCurrentUsage(req, user);
      if (current < limit) {
        req.gatePlan = plan;
        return next();
      }
      // Cheapest plan that grants more headroom (limit > current).
      const upgradePlan = KNOWN_PLANS.find(
        (p) => (QUOTA_LIMITS[quotaKey][p] === -1)
            || (QUOTA_LIMITS[quotaKey][p] > limit),
      ) || 'coach';
      return res.status(403).json({
        error: `You've reached the ${plan} plan limit for ${quotaKey} (${limit}).`,
        code: 'QUOTA_EXCEEDED',
        quota: quotaKey,
        currentPlan: plan,
        limit,
        current,
        suggestedPlan: upgradePlan,
      });
    } catch (err) {
      console.error('[featureGate.requireQuotaSlot]', err);
      return res.status(500).json({ error: 'Failed to verify quota' });
    }
  };
}

module.exports = {
  FEATURE_MATRIX,
  QUOTA_LIMITS,
  resolveUserPlan,
  requireFeature,
  requireQuotaSlot,
};
