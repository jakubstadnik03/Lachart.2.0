const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'coach', 'team', 'enterprise'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired'],
    default: 'active'
  },
  // Who bills this user. Absent on every row written before the App Store and
  // Google Play were sold through, and those are all Stripe — see
  // utils/billingProvider.providerOf, which defaults rather than making this
  // required, so no migration has to run across live billing data.
  provider: {
    type: String,
    enum: ['stripe', 'apple', 'google'],
    default: 'stripe'
  },
  // The store's own identity for this subscription. Apple's
  // originalTransactionId survives renewals, upgrades and restores, which is
  // what makes it the thing to key on rather than the per-renewal id.
  // Unique because one store purchase may pay for exactly one account.
  appleOriginalTransactionId: {
    type: String,
    sparse: true,
    unique: true
  },
  googlePurchaseToken: {
    type: String,
    sparse: true,
    unique: true
  },
  // The product id inside the store — Apple's and Google's answer to
  // stripePriceId, and the only place the in-app price is named.
  storeProductId: {
    type: String
  },
  // Stripe subscription ID
  stripeSubscriptionId: {
    type: String,
    sparse: true,
    unique: true
  },
  // Stripe customer ID
  stripeCustomerId: {
    type: String,
    sparse: true,
    index: true
  },
  // Stripe price ID
  stripePriceId: {
    type: String
  },
  // Current period
  currentPeriodStart: {
    type: Date
  },
  currentPeriodEnd: {
    type: Date
  },
  // Trial period
  trialStart: {
    type: Date
  },
  trialEnd: {
    type: Date
  },
  // Cancellation
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  },
  canceledAt: {
    type: Date
  },
  // Why they left, asked (optionally) in the cancel dialog. Null means they
  // skipped the question — never that they had no reason.
  cancelReason: {
    type: String,
    enum: [...require('../constants/cancelReasons').CANCEL_REASONS, null],
    default: null
  },
  cancelNote: {
    type: String,
    default: null
  },
  cancelReasonAt: {
    type: Date,
    default: null
  },
  // Billing
  billingCycleAnchor: {
    type: Date
  },
  // Metadata
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Index for finding active subscriptions
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });
// Store notifications arrive knowing only the store's own id, never ours.
subscriptionSchema.index({ provider: 1, status: 1 });

// Helper method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  // past_due too: the card is being retried (same rule as utils/premiumAccess).
  if (this.status !== 'active' && this.status !== 'trialing' && this.status !== 'past_due') {
    return false;
  }
  if (this.currentPeriodEnd && new Date() > this.currentPeriodEnd) {
    return false;
  }
  return true;
};

// Helper method to check if subscription has access to feature
subscriptionSchema.methods.hasFeature = function(feature) {
  if (!this.isActive()) {
    return false;
  }
  
  const features = {
    free: ['basic_testing', 'basic_analytics'],
    pro: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync'],
    coach: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes'],
    team: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes', 'team_branding', 'csv_export'],
    enterprise: ['basic_testing', 'basic_analytics', 'advanced_analytics', 'population_comparison', 'export_pdf', 'strava_sync', 'coach_dashboard', 'multiple_athletes', 'team_branding', 'csv_export', 'white_label', 'priority_support', 'custom_onboarding']
  };
  
  return features[this.plan]?.includes(feature) || false;
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
