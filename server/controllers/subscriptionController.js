// Initialize Stripe only if subscription system is enabled
const stripe = process.env.SUBSCRIPTION_ENABLED === 'true' && process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;
const User = require('../models/UserModel');
const Subscription = require('../models/SubscriptionModel');
const { canStartCheckout, manageBilling, providerOf, STRIPE } = require('../utils/billingProvider');
const { planForStripePrice } = require('../utils/stripePlan');
const { canBindStoreTransaction, APPLE } = require('../utils/billingProvider');
const { mapRevenueCatEvent } = require('../utils/revenueCatEvent');
const crypto = require('crypto');
const { resolvePremiumAccess } = require('../utils/premiumAccess');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { sendPremiumActivationEmail } = require('../services/premiumActivationEmailService');
const { normalizeCancelReason, normalizeCancelNote } = require('../constants/cancelReasons');
const {
  sendTrialEndingEmail,
  sendPaymentReceiptEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
  sendCancelScheduledEmail,
  sendReactivatedEmail,
} = require('../services/subscriptionLifecycleEmailService');

// Available subscription plans (exported for use in middleware)
/**
 * Keep the account role in step with the plan that was just paid for.
 *
 * Buying the Coach plan while holding an athlete role left people paying for
 * a coach seat with no way to add athletes — the capability is gated on role,
 * not on plan. Promote them automatically instead of making them ask.
 *
 * The reverse (coach -> athlete on the Athlete plan) only happens when the
 * coach manages nobody. Demoting a coach who has athletes assigned would strip
 * access to real people's data, which is not something a plan change should
 * ever do silently; those accounts keep the coach role and are left alone.
 *
 * Mutates `user` — the caller saves.
 * @returns {string|null} the new role, or null if nothing changed.
 */
async function syncRoleWithPlan(user, planId) {
  const role = String(user?.role || '').toLowerCase();

  if (planId === 'coach' && role !== 'coach') {
    user.role = 'coach';
    console.log(`[Subscription] role ${role || '(none)'} -> coach for ${user.email} (Coach plan)`);
    return 'coach';
  }

  if (planId === 'pro' && role === 'coach') {
    const managed = await User.countDocuments({ coachId: user._id });
    if (managed > 0) {
      console.log(`[Subscription] keeping coach role for ${user.email}: manages ${managed} athlete(s)`);
      return null;
    }
    user.role = 'athlete';
    console.log(`[Subscription] role coach -> athlete for ${user.email} (Athlete plan, no athletes managed)`);
    return 'athlete';
  }

  return null;
}

const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    currency: 'eur',
    features: ['basic_testing', 'basic_analytics'],
    // Keep in step with QUOTA_LIMITS in server/middleware/featureGate.js
    // (the gate that enforces it) and client/src/constants/planLimits.js.
    limits: {
      tests: 3,
      athletes: 1
    }
  },
  pro: {
    id: 'pro',
    name: 'Athlete',
    price: 6.99,
    interval: 'month',
    currency: 'eur',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO, // Set in .env
    features: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync'],
    limits: {
      tests: -1, // unlimited
      athletes: 0
    }
  },
  coach: {
    id: 'coach',
    name: 'Coach',
    price: 14.99,
    interval: 'month',
    currency: 'eur',
    stripePriceId: process.env.STRIPE_PRICE_ID_COACH,
    features: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes'],
    limits: {
      tests: -1,
      athletes: -1
    }
  },
  team: {
    id: 'team',
    name: 'Team',
    price: 49.99,
    interval: 'month',
    currency: 'eur',
    stripePriceId: process.env.STRIPE_PRICE_ID_TEAM,
    features: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes', 'team_branding', 'csv_export'],
    limits: {
      tests: -1,
      athletes: 25
    }
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99.99,
    interval: 'month',
    currency: 'eur',
    stripePriceId: process.env.STRIPE_PRICE_ID_ENTERPRISE,
    features: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes', 'team_branding', 'csv_export', 'white_label', 'priority_support', 'custom_onboarding'],
    limits: {
      tests: -1,
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
/**
 * Apple and Google subscriptions can only be cancelled or changed in the
 * store's own UI. Marking one cancelled here would tell the subscriber they
 * are done while the store keeps charging them, so refuse and say where to go.
 * Returns true when it has answered.
 */
function refuseStoreBilled(subscription, res) {
  const where = manageBilling(subscription);
  if (where.selfServe) return false;
  const provider = providerOf(subscription);
  res.status(409).json({
    error: 'Managed by the store',
    reason: 'managed_by_store',
    provider,
    manageUrl: where.url,
    message: provider === 'apple'
      ? 'This subscription is billed through the App Store. Manage or cancel it on your iPhone: Settings → your name → Subscriptions.'
      : 'This subscription is billed through Google Play. Manage or cancel it in the Play Store.',
  });
  return true;
}

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

    const subPlain =
      subscription && typeof subscription.toObject === 'function'
        ? subscription.toObject()
        : subscription;
    const premiumState = resolvePremiumAccess(user, subPlain);
    const billing = manageBilling(subPlain);

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
        systemEnabled: process.env.SUBSCRIPTION_ENABLED === 'true',
        // Where it is billed, and where to manage it when that is not us.
        provider: providerOf(subPlain),
        manageUrl: billing.url,
        selfServe: billing.selfServe,
      },
      premium: user.premium === true,
      isPremium: premiumState.isPremium,
      premiumSource: premiumState.source
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

    // Get or create Stripe customer.
    //
    // IMPORTANT: customer IDs are scoped to the Stripe mode they were created in
    // (Test vs Live). If we switch modes (or restore from a backup, or the
    // customer was deleted in the dashboard), the cached ID becomes invalid and
    // Stripe responds with `resource_missing` ("No such customer"). When that
    // happens we transparently create a fresh customer and overwrite the ID,
    // so users never see the error.
    let customerId = null;
    let subscription = await Subscription.findOne({ userId: user._id });

    // Refuse to sell a second subscription to somebody already paying through
    // a store. Rows are one per user, so going ahead would overwrite theirs
    // and leave them billed by two systems that cannot see each other — and
    // we cannot cancel the store's side for them. See utils/billingProvider.
    const gate = canStartCheckout({ subscription, provider: STRIPE });
    if (!gate.allowed && gate.reason === 'active_elsewhere') {
      const where = manageBilling(subscription);
      return res.status(409).json({
        error: 'Subscription active elsewhere',
        reason: gate.reason,
        activeProvider: gate.activeProvider,
        manageUrl: where.url,
        message: gate.activeProvider === 'apple'
          ? 'Your LaChart subscription is billed through the App Store. Cancel it in iPhone Settings before subscribing here, or manage it from your iPhone.'
          : 'Your LaChart subscription is billed through Google Play. Cancel it in the Play Store before subscribing here, or manage it from your phone.',
      });
    }

    if (subscription?.stripeCustomerId) {
      try {
        const existing = await stripe.customers.retrieve(subscription.stripeCustomerId);
        if (!existing || existing.deleted) {
          customerId = null; // fall through to create
        } else {
          customerId = existing.id;
        }
      } catch (err) {
        // Most likely "No such customer" because the ID was created in the
        // other Stripe mode. Wipe it and create a fresh one below.
        if (err?.code === 'resource_missing' || err?.statusCode === 404) {
          console.warn(`[Checkout] Stripe customer ${subscription.stripeCustomerId} not found in current mode, recreating.`);
          customerId = null;
        } else {
          throw err;
        }
      }
    }

    if (!customerId) {
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
      // Reset Stripe-only fields tied to the stale customer.
      subscription.stripeSubscriptionId = undefined;
      subscription.stripePriceId = undefined;
      await subscription.save();
    }

    // Check if user already used a trial (prevent abuse)
    const existingSub = await Subscription.findOne({ userId: user._id });
    const alreadyTrialed = existingSub?.trialStart != null;

    // Create checkout session
    //
    // Payment methods: 'card' covers Apple Pay & Google Pay automatically —
    // Stripe Checkout detects the device/browser and surfaces the wallet
    // sheet on iOS Safari and Chrome on Android with no extra config.
    // The wallet buttons appear above the card form when supported.
    //
    // We intentionally don't enumerate Apple Pay separately; passing it as
    // a separate payment_method_type would trigger a domain-verification
    // requirement for any non-Checkout flows. Hosted Checkout doesn't need
    // it — verification is automatic for the Stripe-hosted URL.
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      // Omit payment_method_types entirely so Stripe shows every method
      // enabled in the Dashboard (card, Apple/Google Pay, SEPA, Link, …)
      // based on the buyer's region. Best UX out of the box.
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      // Stripe Tax: when enabled in the Dashboard (Settings → Tax), this
      // makes Checkout collect the buyer's country, compute the right VAT
      // for EU customers, and emit a tax-compliant invoice.
      automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
      // Required when automatic_tax is on so we have a buyer address to
      // base VAT on. Safe to set even when tax is off — just collects it.
      billing_address_collection: 'required',
      // Let customers add their VAT/DIČ at checkout — useful for B2B coach
      // accounts; flows straight into the Stripe invoice.
      tax_id_collection: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
      // 14-day (2 weeks) free trial for first-time subscribers.
      // Overridable per-deploy via STRIPE_TRIAL_DAYS env var.
      subscription_data: alreadyTrialed ? undefined : {
        trial_period_days: Number(process.env.STRIPE_TRIAL_DAYS) || 14,
      },
      // Require card upfront even during trial
      payment_method_collection: 'always',
      // Allow users to enter promo/coupon codes at checkout
      allow_promotion_codes: true,
      success_url: successUrl || `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/subscription/cancel`,
      metadata: {
        userId: user._id.toString(),
        planId: planId
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    // Verbose logging so Render logs always show the underlying Stripe / DB error.
    console.error('[Checkout] Failed to create session:', {
      message: error?.message,
      type: error?.type,
      code: error?.code,
      param: error?.param,
      statusCode: error?.statusCode,
      requestId: error?.requestId,
      raw: error?.raw?.message,
      stack: error?.stack,
    });

    // For admins (or when SUBSCRIPTION_DEBUG=true), surface details to the client
    // so we don't have to dig through Render logs while wiring things up.
    let userDoc = null;
    try {
      userDoc = await User.findById(req.user?.userId).lean();
    } catch { /* ignore */ }
    const isAdminOrDebug =
      process.env.SUBSCRIPTION_DEBUG === 'true' ||
      userDoc?.admin === true ||
      String(userDoc?.role || '').toLowerCase() === 'admin';

    const payload = { error: 'Failed to create checkout session' };
    if (isAdminOrDebug) {
      payload.debug = {
        message: error?.message,
        type: error?.type,
        code: error?.code,
        param: error?.param,
        statusCode: error?.statusCode,
        requestId: error?.requestId,
        hint: error?.raw?.message,
      };
    }
    res.status(500).json(payload);
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
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        // Stripe also fires this when a canceled-at-period-end sub finally ends.
        await handleSubscriptionCanceledEmail(subscription);
        break;
      }
      // Fires ~3 days before the trial converts. We use it to send a friendly
      // "your trial ends on X" reminder so the charge isn't a surprise.
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object;
        await handleTrialWillEndEmail(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice);
        // Friendly receipt email — Stripe also sends its own PDF invoice when
        // the "Email invoices" setting is on in the Dashboard.
        await handleInvoicePaidEmail(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        await handleInvoiceFailedEmail(invoice);
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

/**
 * The billing period, wherever this Stripe API version keeps it.
 *
 * Stripe moved `current_period_start` / `current_period_end` off the
 * subscription and onto its items in the 2025-03-31 API version. Read at the
 * top level they are now undefined, and `undefined * 1000` is NaN — which
 * Mongoose refuses to cast, so the whole save throws. A renewal webhook
 * recorded nothing at all and the stored status drifted away from Stripe's,
 * silently, because the throw happened after the 200 had gone back.
 *
 * Null rather than an Invalid Date when a value is missing, so a caller can
 * leave what it has alone instead of overwriting a good date with a broken
 * one.
 */
function stripeBillingPeriod(sub) {
  const item = sub?.items?.data?.[0] || {};
  const at = (sec) => {
    const n = Number(sec);
    if (!Number.isFinite(n) || n <= 0) return null;
    const d = new Date(n * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return {
    start: at(sub?.current_period_start ?? item.current_period_start),
    end: at(sub?.current_period_end ?? item.current_period_end),
  };
}

exports.stripeBillingPeriod = stripeBillingPeriod;

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
  // Capture previous plan so we only email on a real free→paid transition.
  const previousPlan = userSubscription?.plan || 'free';
  const period = stripeBillingPeriod(subscription);

  if (!userSubscription) {
    userSubscription = await Subscription.create({
      userId: user._id,
      plan: planId,
      status: subscription.status,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      stripePriceId: subscription.items.data[0]?.price.id,
      currentPeriodStart: period.start ?? undefined,
      currentPeriodEnd: period.end ?? undefined,
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
    // Left alone when Stripe sent no period, rather than overwritten with a
    // date that cannot be cast.
    if (period.start) userSubscription.currentPeriodStart = period.start;
    if (period.end) userSubscription.currentPeriodEnd = period.end;
    userSubscription.trialStart = subscription.trial_start ? new Date(subscription.trial_start * 1000) : null;
    userSubscription.trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    userSubscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    await userSubscription.save();
  }

  user.subscriptionId = userSubscription._id;
  // A paid Coach seat is useless while the account still holds an athlete role.
  await syncRoleWithPlan(user, planId);
  await user.save();

  // Fire-and-forget confirmation email on a real free→paid transition.
  // Don't block the webhook response on email delivery.
  if (previousPlan === 'free' && planId !== 'free') {
    const planPrice = PLANS[planId]?.price;
    sendPremiumActivationEmail(user, {
      plan: planId,
      status: subscription.status,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      amount: planPrice,
      currency: PLANS[planId]?.currency || 'eur',
    }).catch((err) => console.error('[Checkout] activation email failed:', err?.message));
  }
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
  const period = stripeBillingPeriod(stripeSubscription);
  if (period.start) subscription.currentPeriodStart = period.start;
  if (period.end) subscription.currentPeriodEnd = period.end;
  subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
  
  if (stripeSubscription.canceled_at) {
    subscription.canceledAt = new Date(stripeSubscription.canceled_at * 1000);
  }

  // Only a canceled subscription goes back to free. past_due is Stripe still
  // retrying the card: the plan stays (premiumAccess gives that grace), so a
  // payment that goes through later restores everything by itself. Setting
  // it to free here left paying customers on free for good.
  if (stripeSubscription.status === 'canceled') {
    subscription.plan = 'free';
  } else {
    const plan = planForStripePrice(stripeSubscription.items?.data?.[0]?.price);
    if (plan) subscription.plan = plan;
  }

  await subscription.save();
}

async function handlePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (subscription) {
    subscription.status = 'active';
    // A plan lost to the old past_due → free downgrade comes back with the
    // money. The invoice line says what was paid for.
    if (!subscription.plan || subscription.plan === 'free') {
      const line = invoice.lines?.data?.find((l) => l.price) || invoice.lines?.data?.[0];
      const plan = planForStripePrice(line?.price || line?.pricing?.price_details?.price);
      if (plan) subscription.plan = plan;
    }
    await subscription.save();
  }
}

/** Paid after at least one failed attempt: a recovered payment. */
function isRecoveredPayment(invoice) {
  return Number(invoice?.attempt_count) > 1;
}

/**
 * Find the LaChart user behind a Stripe subscription / invoice, plus the
 * matching local Subscription doc. Returns { user, subscription, plan } or
 * nulls when we can't resolve them (e.g. subscription was created in a
 * different mode). Helpers below use this to send lifecycle emails without
 * each one re-doing the same lookup.
 */
async function resolveUserAndPlanFromStripeSub(stripeSubscriptionId) {
  if (!stripeSubscriptionId) return { user: null, subscription: null, plan: 'pro' };
  const subscription = await Subscription.findOne({ stripeSubscriptionId });
  if (!subscription) return { user: null, subscription: null, plan: 'pro' };
  const user = await User.findById(subscription.userId);
  return { user, subscription, plan: subscription.plan || 'pro' };
}

/**
 * customer.subscription.trial_will_end → send "trial ends in 3 days" email.
 */
async function handleTrialWillEndEmail(stripeSubscription) {
  try {
    const { user, plan } = await resolveUserAndPlanFromStripeSub(stripeSubscription.id);
    if (!user) return;
    const priceItem = stripeSubscription.items?.data?.[0]?.price;
    await sendTrialEndingEmail(user, {
      plan,
      trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
      amount: priceItem?.unit_amount, // minor units
      currency: priceItem?.currency,
    });
  } catch (err) {
    console.error('[Webhook] trial_will_end email failed:', err?.message);
  }
}

/**
 * invoice.payment_succeeded → send receipt for non-zero recurring charges.
 * Trial-activation invoices are $0 and handled by sendPremiumActivationEmail.
 */
async function handleInvoicePaidEmail(invoice) {
  try {
    // Skip zero-amount invoices (the trial-activation $0 invoice).
    if (!invoice.amount_paid || invoice.amount_paid === 0) return;
    const { user, plan } = await resolveUserAndPlanFromStripeSub(invoice.subscription);
    if (!user) return;
    await sendPaymentReceiptEmail(user, {
      plan,
      // After failed attempts this is the "it went through, Premium is back"
      // note rather than a plain receipt.
      recovered: isRecoveredPayment(invoice),
      amount: invoice.amount_paid, // minor units
      currency: invoice.currency,
      periodEnd: invoice.lines?.data?.[0]?.period?.end
        ? new Date(invoice.lines.data[0].period.end * 1000)
        : null,
      invoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
    });
  } catch (err) {
    console.error('[Webhook] invoice.paid email failed:', err?.message);
  }
}

/**
 * invoice.payment_failed → tell the user to update their card.
 */
async function handleInvoiceFailedEmail(invoice) {
  try {
    const { user, plan } = await resolveUserAndPlanFromStripeSub(invoice.subscription);
    if (!user) return;
    await sendPaymentFailedEmail(user, {
      plan,
      amount: invoice.amount_due,
      currency: invoice.currency,
    });
  } catch (err) {
    console.error('[Webhook] invoice.failed email failed:', err?.message);
  }
}

/**
 * customer.subscription.deleted → final "subscription ended" email.
 * Only sent for actual cancellations (cancellation_reason / status canceled),
 * not for plan switches that happen to fire the same event.
 */
async function handleSubscriptionCanceledEmail(stripeSubscription) {
  try {
    if (stripeSubscription.status !== 'canceled') return;
    const { user, plan } = await resolveUserAndPlanFromStripeSub(stripeSubscription.id);
    if (!user) return;
    await sendSubscriptionCanceledEmail(user, {
      plan,
      endedAt: stripeSubscription.canceled_at
        ? new Date(stripeSubscription.canceled_at * 1000)
        : new Date(),
    });
  } catch (err) {
    console.error('[Webhook] subscription.canceled email failed:', err?.message);
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
 * Sync the user's subscription state from Stripe → MongoDB.
 *
 * Defensive endpoint: webhooks are the primary delivery channel, but if a
 * webhook is misconfigured, blocked, or signature-mismatched, the user's DB
 * record will lag behind Stripe. The client calls this endpoint right after
 * a successful checkout (?success=1) and the page reload picks up the result.
 *
 * Pulls the latest customer's subscriptions, picks the most recent
 * non-canceled one, and writes its fields onto the user's Subscription doc.
 */
exports.syncSubscriptionFromStripe = async (req, res) => {
  if (process.env.SUBSCRIPTION_ENABLED !== 'true' || !stripe) {
    return res.status(503).json({ error: 'Subscription system not enabled' });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    let userSubscription = await Subscription.findOne({ userId: user._id });
    let customerId = userSubscription?.stripeCustomerId;

    // No cached customer? Try to find by email — covers the case where the
    // checkout completed but our local stripeCustomerId was wiped earlier
    // (e.g. test→live mode switch).
    if (!customerId && user.email) {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      if (found.data.length > 0) {
        customerId = found.data[0].id;
      }
    }

    if (!customerId) {
      return res.json({ synced: false, reason: 'no_stripe_customer' });
    }

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 5,
    });

    // Prefer trialing/active over canceled.
    const liveSub =
      subs.data.find((s) => s.status === 'trialing' || s.status === 'active') ||
      subs.data[0];

    if (!liveSub) {
      return res.json({ synced: false, reason: 'no_stripe_subscription', customerId });
    }

    // Map Stripe price → our plan id.
    const priceToPlan = {
      [process.env.STRIPE_PRICE_ID_PRO]: 'pro',
      [process.env.STRIPE_PRICE_ID_COACH]: 'coach',
      [process.env.STRIPE_PRICE_ID_TEAM]: 'team',
      [process.env.STRIPE_PRICE_ID_ENTERPRISE]: 'enterprise',
    };
    const priceId = liveSub.items?.data?.[0]?.price?.id;
    const livePeriod = stripeBillingPeriod(liveSub);
    const planId = priceToPlan[priceId] || userSubscription?.plan || 'pro';

    // Capture previous plan for activation-email gating.
    const previousPlan = userSubscription?.plan || 'free';

    if (!userSubscription) {
      userSubscription = await Subscription.create({
        userId: user._id,
        plan: planId,
        status: liveSub.status,
        stripeSubscriptionId: liveSub.id,
        stripeCustomerId: customerId,
        stripePriceId: priceId,
        currentPeriodStart: livePeriod.start ?? undefined,
        currentPeriodEnd: livePeriod.end ?? undefined,
        trialStart: liveSub.trial_start ? new Date(liveSub.trial_start * 1000) : null,
        trialEnd: liveSub.trial_end ? new Date(liveSub.trial_end * 1000) : null,
        cancelAtPeriodEnd: liveSub.cancel_at_period_end,
      });
    } else {
      userSubscription.plan = planId;
      userSubscription.status = liveSub.status;
      userSubscription.stripeSubscriptionId = liveSub.id;
      userSubscription.stripeCustomerId = customerId;
      userSubscription.stripePriceId = priceId;
      // These two never threw, because they were already guarded — but the
      // guard read the top level only, so on the new API version they stored
      // undefined every time and the period quietly went missing.
      if (livePeriod.start) userSubscription.currentPeriodStart = livePeriod.start;
      if (livePeriod.end) userSubscription.currentPeriodEnd = livePeriod.end;
      userSubscription.trialStart = liveSub.trial_start ? new Date(liveSub.trial_start * 1000) : null;
      userSubscription.trialEnd = liveSub.trial_end ? new Date(liveSub.trial_end * 1000) : null;
      userSubscription.cancelAtPeriodEnd = liveSub.cancel_at_period_end;
      await userSubscription.save();
    }

    // Same role sync as the webhook path: /sync is the fallback that runs when
    // a webhook was missed, so it has to leave the account in the same state.
    const roleChanged = await syncRoleWithPlan(user, planId);
    if (!user.subscriptionId || roleChanged) {
      user.subscriptionId = userSubscription._id;
      await user.save();
    }

    // Activation email — only on real free→paid transitions, so users who
    // hit /sync repeatedly (or come back from refresh) don't get spammed.
    if (previousPlan === 'free' && planId !== 'free') {
      const planPrice = PLANS[planId]?.price;
      sendPremiumActivationEmail(user, {
        plan: planId,
        status: liveSub.status,
        trialEnd: liveSub.trial_end ? new Date(liveSub.trial_end * 1000) : null,
        amount: planPrice,
        currency: PLANS[planId]?.currency || 'eur',
      }).catch((err) => console.error('[Sync] activation email failed:', err?.message));
    }

    res.json({
      synced: true,
      subscription: {
        plan: userSubscription.plan,
        status: userSubscription.status,
        currentPeriodEnd: userSubscription.currentPeriodEnd,
        trialEnd: userSubscription.trialEnd,
        cancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd,
      },
    });
  } catch (error) {
    console.error('[Sync] Failed:', { message: error?.message, code: error?.code });
    res.status(500).json({ error: 'Sync failed', message: error?.message });
  }
};

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
    if (refuseStoreBilled(subscription, res)) return;

    if (subscription.stripeSubscriptionId && stripe) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
    }

    // If the local doc was already flagged as cancelling, the user clicked
    // cancel twice — don't re-spam them with another email.
    const alreadyScheduled = subscription.cancelAtPeriodEnd === true;

    subscription.cancelAtPeriodEnd = true;

    // Why they left, if they chose to say. The question is optional and must
    // never stand between someone and cancelling: anything we don't recognise
    // is dropped silently rather than rejected. A second click doesn't erase
    // the answer the first one gave.
    const reason = normalizeCancelReason(req.body?.reason);
    const note = normalizeCancelNote(req.body?.note);
    if (reason || note) {
      if (reason) subscription.cancelReason = reason;
      if (note) subscription.cancelNote = note;
      subscription.cancelReasonAt = new Date();
    }

    await subscription.save();

    if (!alreadyScheduled) {
      // Fire-and-forget — don't block the API response on email delivery.
      sendCancelScheduledEmail(user, {
        plan: subscription.plan,
        endsAt: subscription.currentPeriodEnd,
      }).catch((err) => console.error('[Cancel] confirmation email failed:', err?.message));
    }

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
    if (refuseStoreBilled(subscription, res)) return;

    // Only email if there was actually a pending cancel to undo. Clicking
    // 'Reactivate' on an already-active subscription shouldn't trigger spam.
    const wasScheduledForCancel = subscription.cancelAtPeriodEnd === true;

    if (subscription.stripeSubscriptionId && stripe) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false
      });
    }

    subscription.cancelAtPeriodEnd = false;
    await subscription.save();

    if (wasScheduledForCancel) {
      sendReactivatedEmail(user, {
        plan: subscription.plan,
        renewsAt: subscription.currentPeriodEnd,
      }).catch((err) => console.error('[Reactivate] confirmation email failed:', err?.message));
    }

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
    if (user?.subscriptionId && refuseStoreBilled(user.subscriptionId, res)) return;
    
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

/**
 * POST /api/subscription/send-promo-email
 * Admin-only: Send promo code email to all registered users (or a subset).
 * Protected by ADMIN_SECRET header.
 */
exports.sendPromoEmail = async (req, res) => {
  // Auth is enforced by verifyToken + admin check in subscriptionRoutes.js (M3)
  const { promoCode, subject, dryRun = false } = req.body;
  if (!promoCode) return res.status(400).json({ error: 'promoCode is required' });

  const transporter = createEmailTransporter();
  if (!transporter) {
    return res.status(503).json({ error: 'Email not configured' });
  }

  try {
    // Fetch all users with email
    const users = await User.find({ email: { $exists: true, $ne: null } }, 'email name').lean();

    const emailSubject = subject || `🎁 3 months of LaChart Athlete — free, just for you`;

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const user of users) {
      if (!user.email) continue;
      const firstName = user.name || 'there';

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);padding:32px 32px 24px;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">LaChart</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Lactate threshold analytics</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:700;">Hey ${firstName} 👋</h2>
      <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
        Thank you for being an early LaChart user. As a thank-you, I'm giving you <strong>3 months of LaChart Athlete completely free</strong>.
      </p>
      <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
        Athlete unlocks FIT file analysis with interval detection &amp; power charts, unlimited lactate tests, PDF report export, and more.
      </p>

      <!-- Promo code box -->
      <div style="background:#f0f9ff;border:2px dashed #3b82f6;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
        <p style="margin:0 0 8px;color:#1d4ed8;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your promo code</p>
        <p style="margin:0;color:#1e3a8a;font-size:28px;font-weight:800;letter-spacing:0.05em;">${promoCode}</p>
        <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">3 months free · No credit card required during trial</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${process.env.FRONTEND_URL}/settings?tab=subscription"
           style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">
          Activate my free Athlete access →
        </a>
      </div>

      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
        How to use: Go to <strong>Settings → Subscription</strong>, choose the Athlete plan, and enter the code at checkout. You won't be charged for 3 months.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        You're receiving this because you have a LaChart account.
        Questions? Reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;

      if (dryRun) {
        console.log(`[DRY RUN] Would send promo email to: ${user.email}`);
        sent++;
        continue;
      }

      try {
        await transporter.sendMail({
          from: `LaChart <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: emailSubject,
          html,
        });
        sent++;
        // Small delay to avoid SMTP rate limits
        await new Promise(r => setTimeout(r, 200));
      } catch (emailErr) {
        console.error(`[PromoEmail] Failed for ${user.email}:`, emailErr.message);
        failed++;
        errors.push({ email: user.email, error: emailErr.message });
      }
    }

    res.json({
      success: true,
      dryRun,
      total: users.length,
      sent,
      failed,
      errors: errors.slice(0, 10), // return first 10 errors max
    });

  } catch (error) {
    console.error('Error sending promo emails:', error);
    res.status(500).json({ error: 'Failed to send promo emails' });
  }
};


/**
 * POST /api/subscription/revenuecat/webhook
 *
 * The store side of billing, for App Store and Play Store subscriptions that
 * RevenueCat relays to us in one shape. The decisions all live in
 * utils/revenueCatEvent, which is pure and tested; this is the part that
 * touches the database.
 *
 * Always answers 200 once the caller is authenticated, including for events
 * we decline to act on. RevenueCat retries a non-2xx for hours, and retrying
 * an unmappable product or a transfer that needs a human will not make either
 * of them mappable — so those are logged loudly instead.
 */
exports.revenueCatWebhook = async (req, res) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[revenuecat] REVENUECAT_WEBHOOK_SECRET is not set — refusing every delivery');
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  // RevenueCat sends whatever Authorization value is configured on the
  // integration, verbatim. Accept it with or without a Bearer prefix, and
  // compare in constant time so the endpoint cannot be used as an oracle.
  const header = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn('[revenuecat] rejected a delivery with a bad Authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const event = req.body?.event;
    const mapped = mapRevenueCatEvent(event, {
      planMapRaw: process.env.REVENUECAT_PLAN_MAP,
      allowSandbox: process.env.REVENUECAT_ALLOW_SANDBOX === 'true',
    });

    if (mapped.action === 'ignore') {
      console.log('[revenuecat] ignored:', mapped.reason, '| event', event?.type, event?.id);
      return res.json({ received: true, applied: false, reason: mapped.reason });
    }
    if (mapped.action === 'reject') {
      // Worth a look by a person: a product that is not mapped, a transfer
      // between accounts, or a purchase made before anybody logged in.
      console.error('[revenuecat] REJECTED:', mapped.reason, '| event', event?.type, event?.id,
        '| app_user_id', event?.app_user_id);
      return res.json({ received: true, applied: false, reason: mapped.reason });
    }

    const { userId, patch, provider } = mapped;
    const user = await User.findById(userId);
    if (!user) {
      console.error('[revenuecat] no such user', userId, '| event', event?.id);
      return res.json({ received: true, applied: false, reason: 'unknown_user' });
    }

    // One store purchase pays for one account. Check before writing, because
    // the unique index would otherwise reject the save with a duplicate-key
    // error that says nothing about why.
    const storeKey = provider === APPLE
      ? { appleOriginalTransactionId: patch.appleOriginalTransactionId }
      : { googlePurchaseToken: patch.googlePurchaseToken };
    const storeId = Object.values(storeKey)[0];
    if (storeId) {
      const owner = await Subscription.findOne(storeKey).select('userId').lean();
      const bind = canBindStoreTransaction({ existingUserId: owner?.userId, userId });
      if (!bind.allowed) {
        console.error('[revenuecat] REFUSED to bind', storeId, 'to', userId,
          '— already owned by', String(owner?.userId), '| event', event?.id);
        return res.json({ received: true, applied: false, reason: bind.reason });
      }
    }

    const subscription = await Subscription.findOneAndUpdate(
      { userId: user._id },
      { $set: { userId: user._id, ...patch } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    // Premium is read through user.subscriptionId (premiumAccess), so the row
    // must be linked to the account — most accounts have never had one. And
    // the same role sync the Stripe path does: buying the Coach plan is how
    // somebody becomes a coach, whichever till the money went through.
    const roleChanged = await syncRoleWithPlan(user, patch.plan);
    if (roleChanged || String(user.subscriptionId || '') !== String(subscription._id)) {
      user.subscriptionId = subscription._id;
      await user.save();
    }

    console.log('[revenuecat] applied', event?.type, '→', patch.plan, patch.status,
      'for', userId, '| until', patch.currentPeriodEnd);
    return res.json({ received: true, applied: true, plan: subscription.plan, status: subscription.status });
  } catch (error) {
    console.error('[revenuecat] handler threw:', error);
    // A 500 here does earn a retry — this one might genuinely be transient.
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};
