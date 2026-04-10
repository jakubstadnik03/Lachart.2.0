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

module.exports = { requirePremium };
