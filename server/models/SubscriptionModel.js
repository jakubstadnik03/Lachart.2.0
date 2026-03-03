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

// Helper method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  if (this.status !== 'active' && this.status !== 'trialing') {
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
