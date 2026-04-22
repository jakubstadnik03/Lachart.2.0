const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const subscriptionController = require('../controllers/subscriptionController');

/**
 * Subscription Routes
 * 
 * NOTE: Subscription system is PREPARED but INACTIVE by default.
 * - All routes are available but subscription checks are disabled
 * - Set SUBSCRIPTION_ENABLED=true in .env to activate
 * - When inactive: all users have access to all features
 * - getPlans() and getCurrentSubscription() work for UI display
 * - createCheckoutSession() and webhooks return error when inactive
 */

/**
 * GET /api/subscription/plans
 * Get available subscription plans
 */
router.get('/plans', subscriptionController.getPlans);

/**
 * GET /api/subscription/current
 * Get current user's subscription
 */
router.get('/current', verifyToken, subscriptionController.getCurrentSubscription);

/**
 * POST /api/subscription/create-checkout-session
 * Create Stripe checkout session
 */
router.post('/create-checkout-session', verifyToken, subscriptionController.createCheckoutSession);

/**
 * POST /api/subscription/webhook
 * Stripe webhook endpoint (no auth required)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.handleWebhook);

/**
 * POST /api/subscription/cancel
 * Cancel subscription (at period end)
 */
router.post('/cancel', verifyToken, subscriptionController.cancelSubscription);

/**
 * POST /api/subscription/reactivate
 * Reactivate canceled subscription
 */
router.post('/reactivate', verifyToken, subscriptionController.reactivateSubscription);

/**
 * GET /api/subscription/portal
 * Get Stripe customer portal URL
 */
router.get('/portal', verifyToken, subscriptionController.getPortalUrl);

/**
 * POST /api/subscription/send-promo-email
 * Admin-only: send promo code email to all registered users.
 * M3: protected by JWT auth + admin role check (replaces static x-admin-secret header)
 * Body: { promoCode: "LACHART3FREE", subject?: "...", dryRun?: true }
 */
router.post('/send-promo-email', verifyToken, (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  const isAdmin = role === 'admin' || req.user?.admin === true;
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
}, subscriptionController.sendPromoEmail);

module.exports = router;
