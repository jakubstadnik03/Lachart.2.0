const User = require('../models/UserModel');
const Subscription = require('../models/SubscriptionModel');

/**
 * Feature flag - set to true to enable subscription checks
 * When false, all users have access to all features (subscription system is prepared but inactive)
 */
const SUBSCRIPTION_ENABLED = process.env.SUBSCRIPTION_ENABLED === 'true';

/**
 * Middleware to check if user has required subscription feature
 * Usage: router.get('/protected', verifyToken, checkSubscription('advanced_analytics'), handler)
 * 
 * NOTE: Subscription system is prepared but inactive by default.
 * Set SUBSCRIPTION_ENABLED=true in .env to enable subscription checks.
 */
const checkSubscription = (requiredFeature) => {
  return async (req, res, next) => {
    // If subscription system is disabled, allow all access
    if (!SUBSCRIPTION_ENABLED) {
      return next();
    }

    try {
      const user = await User.findById(req.user.userId).populate('subscriptionId');
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let subscription = user.subscriptionId;
      
      // Create free subscription if doesn't exist
      if (!subscription) {
        subscription = await Subscription.create({
          userId: user._id,
          plan: 'free',
          status: 'active'
        });
        user.subscriptionId = subscription._id;
        await user.save();
      }

      // Check if subscription is active
      if (!subscription.isActive()) {
        return res.status(403).json({ 
          error: 'Subscription required',
          message: 'Your subscription has expired. Please renew to continue.',
          subscription: {
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd
          }
        });
      }

      // Check if user has required feature
      if (requiredFeature && !subscription.hasFeature(requiredFeature)) {
        return res.status(403).json({ 
          error: 'Feature not available',
          message: `This feature requires a ${requiredFeature} subscription.`,
          requiredFeature,
          currentPlan: subscription.plan
        });
      }

      // Attach subscription to request for use in route handlers
      req.subscription = subscription;
      next();
    } catch (error) {
      console.error('Error checking subscription:', error);
      res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
};

/**
 * Middleware to check subscription limits
 * Usage: router.post('/test', verifyToken, checkSubscriptionLimit('testsPerMonth'), handler)
 * 
 * NOTE: Subscription system is prepared but inactive by default.
 * Set SUBSCRIPTION_ENABLED=true in .env to enable subscription limits.
 */
const checkSubscriptionLimit = (limitType) => {
  return async (req, res, next) => {
    // If subscription system is disabled, allow all access (no limits)
    if (!SUBSCRIPTION_ENABLED) {
      return next();
    }

    try {
      const user = await User.findById(req.user.userId).populate('subscriptionId');
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      let subscription = user.subscriptionId;
      
      if (!subscription) {
        subscription = await Subscription.create({
          userId: user._id,
          plan: 'free',
          status: 'active'
        });
        user.subscriptionId = subscription._id;
        await user.save();
      }

      const { PLANS } = require('../controllers/subscriptionController');
      const plan = PLANS[subscription.plan] || PLANS.free;
      
      const limit = plan.limits[limitType];
      
      // -1 means unlimited
      if (limit === -1) {
        return next();
      }

      // Check current usage (implement based on your needs)
      // Example: count tests created this month
      if (limitType === 'testsPerMonth') {
        const Test = require('../models/test');
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        
        const testCount = await Test.countDocuments({
          athleteId: user._id.toString(),
          createdAt: { $gte: startOfMonth }
        });

        if (testCount >= limit) {
          return res.status(403).json({ 
            error: 'Limit exceeded',
            message: `You have reached your monthly limit of ${limit} tests. Upgrade your plan to continue.`,
            limit,
            current: testCount
          });
        }
      }

      // Check athlete limit for coaches
      if (limitType === 'athletes' && user.role === 'coach') {
        const athleteCount = user.athletes?.length || 0;
        
        if (athleteCount >= limit) {
          return res.status(403).json({ 
            error: 'Limit exceeded',
            message: `You have reached your athlete limit of ${limit}. Upgrade your plan to add more athletes.`,
            limit,
            current: athleteCount
          });
        }
      }

      next();
    } catch (error) {
      console.error('Error checking subscription limit:', error);
      res.status(500).json({ error: 'Failed to verify subscription limit' });
    }
  };
};

module.exports = {
  checkSubscription,
  checkSubscriptionLimit
};
