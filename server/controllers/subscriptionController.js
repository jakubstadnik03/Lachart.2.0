// Initialize Stripe only if subscription system is enabled
const stripe = process.env.SUBSCRIPTION_ENABLED === 'true' && process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;
const User = require('../models/UserModel');
const Subscription = require('../models/SubscriptionModel');

// Available subscription plans (exported for use in middleware)
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    features: ['basic_testing', 'basic_analytics'],
    limits: {
      testsPerMonth: 5,
      athletes: 0
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 9.99,
    interval: 'month',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO, // Set in .env
    features: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync'],
    limits: {
      testsPerMonth: -1, // unlimited
      athletes: 0
    }
  },
  coach: {
    id: 'coach',
    name: 'Coach',
    price: 19.99,
    interval: 'month',
    stripePriceId: process.env.STRIPE_PRICE_ID_COACH,
    features: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes'],
    limits: {
      testsPerMonth: -1,
      athletes: 10
    }
  },
  team: {
    id: 'team',
    name: 'Team',
    price: 49.99,
    interval: 'month',
    stripePriceId: process.env.STRIPE_PRICE_ID_TEAM,
    features: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes', 'team_branding', 'csv_export'],
    limits: {
      testsPerMonth: -1,
      athletes: 25
    }
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99.99,
    interval: 'month',
    stripePriceId: process.env.STRIPE_PRICE_ID_ENTERPRISE,
    features: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes', 'team_branding', 'csv_export', 'white_label', 'priority_support', 'custom_onboarding'],
    limits: {
      testsPerMonth: -1,
      athletes: 60
    }
  }
};

// Export PLANS for use in middleware
exports.PLANS = PLANS;

/**
 * Get available subscription plans
 */
exports.getPlans = async (req, res) => {
  try {
    const plans = Object.values(PLANS).map(plan => ({
      id: plan.id,
      name: plan.name,
      price: plan.price,
      interval: plan.interval,
      features: plan.features,
      limits: plan.limits
    }));
    res.json({ plans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
};

/**
 * Get current user's subscription
 * NOTE: Works even when subscription system is inactive (for UI display)
 */
exports.getCurrentSubscription = async (req, res) => {
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

    const plan = PLANS[subscription.plan] || PLANS.free;
    
    res.json({
      subscription: {
        id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        isActive: subscription.isActive(),
        planDetails: plan,
        systemEnabled: process.env.SUBSCRIPTION_ENABLED === 'true'
      }
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
};

/**
 * Create Stripe checkout session
 * NOTE: Subscription system is prepared but inactive by default.
 * Set SUBSCRIPTION_ENABLED=true in .env to enable.
 */
exports.createCheckoutSession = async (req, res) => {
  // Check if subscription system is enabled
  if (process.env.SUBSCRIPTION_ENABLED !== 'true' || !stripe) {
    return res.status(503).json({ 
      error: 'Subscription system not enabled',
      message: 'Subscription system is prepared but currently inactive. Contact administrator.'
    });
  }

  try {
    const { planId, successUrl, cancelUrl } = req.body;
    
    if (!planId || planId === 'free') {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const plan = PLANS[planId];
    if (!plan || !plan.stripePriceId) {
      return res.status(400).json({ error: 'Plan not available' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!stripe) {
      return res.status(503).json({ 
        error: 'Stripe not configured',
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.'
      });
    }

    // Get or create Stripe customer
    let customerId = null;
    let subscription = await Subscription.findOne({ userId: user._id });
    
    if (subscription?.stripeCustomerId) {
      customerId = subscription.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user._id.toString()
        }
      });
      customerId = customer.id;
      
      if (!subscription) {
        subscription = await Subscription.create({
          userId: user._id,
          plan: 'free',
          status: 'active'
        });
        user.subscriptionId = subscription._id;
        await user.save();
      }
      
      subscription.stripeCustomerId = customerId;
      await subscription.save();
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: successUrl || `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/subscription/cancel`,
      metadata: {
        userId: user._id.toString(),
        planId: planId
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

/**
 * Handle Stripe webhook
 * NOTE: Subscription system is prepared but inactive by default.
 * Webhooks will still be processed if subscription system is enabled.
 */
exports.handleWebhook = async (req, res) => {
  // Check if subscription system is enabled
  if (process.env.SUBSCRIPTION_ENABLED !== 'true' || !stripe) {
    console.log('[Webhook] Subscription system not enabled, ignoring webhook');
    return res.json({ received: true, ignored: true });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

async function handleCheckoutCompleted(session) {
  if (!stripe) {
    console.error('Stripe not configured, cannot handle checkout');
    return;
  }

  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  if (!userId || !planId) {
    console.error('Missing metadata in checkout session');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription);
  const user = await User.findById(userId);
  
  if (!user) {
    console.error('User not found:', userId);
    return;
  }

  let userSubscription = await Subscription.findOne({ userId: user._id });
  
  if (!userSubscription) {
    userSubscription = await Subscription.create({
      userId: user._id,
      plan: planId,
      status: subscription.status,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      stripePriceId: subscription.items.data[0]?.price.id,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });
  } else {
    userSubscription.plan = planId;
    userSubscription.status = subscription.status;
    userSubscription.stripeSubscriptionId = subscription.id;
    userSubscription.stripeCustomerId = subscription.customer;
    userSubscription.stripePriceId = subscription.items.data[0]?.price.id;
    userSubscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    userSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    userSubscription.trialStart = subscription.trial_start ? new Date(subscription.trial_start * 1000) : null;
    userSubscription.trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    userSubscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    await userSubscription.save();
  }

  user.subscriptionId = userSubscription._id;
  await user.save();
}

async function handleSubscriptionUpdate(stripeSubscription) {
  if (!stripe) {
    console.error('Stripe not configured, cannot handle subscription update');
    return;
  }

  const subscription = await Subscription.findOne({ stripeSubscriptionId: stripeSubscription.id });
  
  if (!subscription) {
    console.error('Subscription not found:', stripeSubscription.id);
    return;
  }

  subscription.status = stripeSubscription.status;
  subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
  subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
  subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
  
  if (stripeSubscription.canceled_at) {
    subscription.canceledAt = new Date(stripeSubscription.canceled_at * 1000);
  }

  // If subscription is canceled or past_due, downgrade to free
  if (stripeSubscription.status === 'canceled' || stripeSubscription.status === 'past_due') {
    subscription.plan = 'free';
  }

  await subscription.save();
}

async function handlePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (subscription) {
    subscription.status = 'active';
    await subscription.save();
  }
}

async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (subscription) {
    subscription.status = 'past_due';
    await subscription.save();
  }
}

/**
 * Cancel subscription (at period end)
 */
exports.cancelSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('subscriptionId');
    
    if (!user || !user.subscriptionId) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = user.subscriptionId;
    
    if (subscription.stripeSubscriptionId && stripe) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
    }

    subscription.cancelAtPeriodEnd = true;
    await subscription.save();

    res.json({ message: 'Subscription will be canceled at period end' });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
};

/**
 * Reactivate canceled subscription
 */
exports.reactivateSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('subscriptionId');
    
    if (!user || !user.subscriptionId) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = user.subscriptionId;
    
    if (subscription.stripeSubscriptionId && stripe) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false
      });
    }

    subscription.cancelAtPeriodEnd = false;
    await subscription.save();

    res.json({ message: 'Subscription reactivated' });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
};

/**
 * Get Stripe customer portal URL
 */
exports.getPortalUrl = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ 
        error: 'Stripe not configured',
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.'
      });
    }

    const user = await User.findById(req.user.userId).populate('subscriptionId');
    
    if (!user || !user.subscriptionId?.stripeCustomerId) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.subscriptionId.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/settings?tab=subscription`
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
};
