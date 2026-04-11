const User = require('../models/UserModel');
const { resolvePremiumForUserDocument } = require('../utils/premiumAccess');

/**
 * Express middleware: 403 unless user has premium (manual `premium` flag or active paid subscription).
 */
async function requirePremium(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found', code: 'UNAUTHORIZED' });
    }
    // Admins bypass premium (no subscription needed for operations / testing the product).
    if (user.admin === true || user.role === 'admin') {
      return next();
    }
    const { isPremium } = await resolvePremiumForUserDocument(user);
    if (!isPremium) {
      return res.status(403).json({
        error: 'Premium subscription required',
        code: 'PREMIUM_REQUIRED',
      });
    }
    next();
  } catch (e) {
    console.error('[requirePremium]', e);
    return res.status(500).json({ error: 'Failed to verify subscription' });
  }
}

/**
 * When REQUIRE_PREMIUM_ACCESS=true, enforces premium (see requirePremium).
 *
 * Production safety: if NODE_ENV is "production", the gate does nothing unless
 * PREMIUM_GATE_LIVE=true is also set (so Render/prod stays open until you explicitly go live).
 * For local / staging with NODE_ENV=development (or non-production), REQUIRE_PREMIUM_ACCESS=true is enough.
 */
function requirePremiumIfEnabled(req, res, next) {
  if (process.env.REQUIRE_PREMIUM_ACCESS !== 'true') {
    return next();
  }
  if (process.env.NODE_ENV === 'production' && process.env.PREMIUM_GATE_LIVE !== 'true') {
    return next();
  }
  return requirePremium(req, res, next);
}

module.exports = { requirePremium, requirePremiumIfEnabled };
