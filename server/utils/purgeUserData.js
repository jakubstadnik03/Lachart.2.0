/**
 * Everything one account owns, removed — and its billing stopped first.
 *
 * The delete used to clear six collections and the user document. Two things
 * were wrong with that, and the second one costs money.
 *
 * It never touched Stripe. A paying subscriber who deleted their account went
 * on being charged, with no account left to cancel from and no way to reach the
 * portal. Cancellation here is IMMEDIATE, not `cancel_at_period_end` as the
 * Settings cancel button does: that flag exists so someone keeps the access
 * they paid for until the period ends, and there is nobody left to have it.
 *
 * And it left eight collections behind while telling the caller "all associated
 * data deleted successfully" — a claim a GDPR erasure request is entitled to
 * rely on.
 *
 * ── Ownership, not authorship ──────────────────────────────────────────────
 *
 * Documents are removed by the fields that mean "this is theirs" — userId,
 * athleteId, recipientId — and never by `createdBy`. A coach's account closing
 * must not delete the planned workouts, day plans or race entries sitting in
 * their athletes' calendars: those belong to the athletes, who did not ask for
 * anything. The dangling createdBy reference is harmless; the alternative is
 * wiping training plans out from under people.
 *
 * ── Both id forms ──────────────────────────────────────────────────────────
 *
 * Some collections store userId as an ObjectId and some as a string, and a few
 * hold both across different rows — stravaactivities is the known case, where
 * one athlete had 6229 documents under an ObjectId and none under the string.
 * Matching one form silently leaves the other behind, which for a deletion is
 * the difference between "erased" and "erased, mostly".
 */

'use strict';

const mongoose = require('mongoose');

/** Match an id however that collection happens to store it. */
function idForms(id) {
  const str = String(id);
  const forms = [str];
  if (mongoose.Types.ObjectId.isValid(str)) forms.push(new mongoose.Types.ObjectId(str));
  return { $in: forms };
}

/**
 * Collections keyed by the user who OWNS the rows.
 * `model` is the file under ../models; `field` is the ownership field.
 */
const OWNED = [
  ['../models/training', 'athleteId'],
  ['../models/fitTraining', 'athleteId'],
  ['../models/test', 'athleteId'],
  ['../models/cpTest', 'athleteId'],
  ['../models/vlamaxTest', 'athleteId'],
  ['../models/lactateSession', 'athleteId'],
  ['../models/FieldLactateMeasurement', 'athleteId'],
  ['../models/DailyMetric', 'athleteId'],
  ['../models/HealthCheckIn', 'athleteId'],
  ['../models/HealthEpisode', 'athleteId'],
  ['../models/WeeklyReview', 'athleteId'],
  ['../models/PlannedWorkout', 'athleteId'],
  ['../models/DayPlan', 'athleteId'],
  ['../models/CalendarPeriod', 'athleteId'],
  ['../models/RaceEvent', 'athleteId'],
  ['../models/AnnualTrainingPlan', 'athleteId'],
  ['../models/StravaActivity', 'userId'],
  ['../models/StravaStream', 'userId'],
  ['../models/StravaSyncLog', 'userId'],
  ['../models/GarminActivity', 'userId'],
  ['../models/GarminStream', 'userId'],
  ['../models/GarminWellness', 'userId'],
  ['../models/AppleHealthActivity', 'userId'],
  ['../models/AppleHealthWellness', 'userId'],
  ['../models/ActivityWeather', 'userId'],
  ['../models/ThresholdDriftRead', 'userId'],
  ['../models/Event', 'userId'],
  ['../models/Notification', 'recipientId'],
];

/**
 * Stop the money first.
 *
 * Deliberately best-effort: a Stripe outage must not block an erasure request,
 * and a subscription that was already cancelled throws. The outcome is reported
 * rather than thrown so the caller can log it — and so a failure here is
 * visible instead of being swallowed into a successful-looking delete.
 */
async function cancelBillingFor(userId) {
  const out = { attempted: false, cancelled: false, error: null };
  try {
    const Subscription = require('../models/SubscriptionModel');
    const subs = await Subscription.find({ userId: idForms(userId) });
    if (!subs.length) return out;

    let stripe = null;
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      }
    } catch (e) {
      out.error = `stripe unavailable: ${e.message}`;
    }

    for (const sub of subs) {
      if (!sub.stripeSubscriptionId || !stripe) continue;
      out.attempted = true;
      try {
        // Immediate, not at period end: there is no account left to use the
        // remainder of the period.
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        out.cancelled = true;
      } catch (e) {
        // Already cancelled or unknown to Stripe is fine — anything else is
        // worth surfacing, because it means someone may still be billed.
        const code = e?.code || e?.raw?.code || '';
        if (code !== 'resource_missing') out.error = e.message;
      }
    }
    await Subscription.deleteMany({ userId: idForms(userId) });
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

/**
 * Delete every document this user owns.
 * @returns {Promise<{billing: object, deleted: Record<string, number>, errors: string[]}>}
 */
async function purgeUserData(userId) {
  const billing = await cancelBillingFor(userId);
  const deleted = {};
  const errors = [];
  const match = idForms(userId);

  for (const [modelPath, field] of OWNED) {
    try {
      const Model = require(modelPath);
      // eslint-disable-next-line no-await-in-loop
      const res = await Model.deleteMany({ [field]: match });
      if (res.deletedCount) deleted[Model.modelName] = res.deletedCount;
    } catch (e) {
      // One missing or renamed model must not abort the rest of the erasure.
      errors.push(`${modelPath}: ${e.message}`);
    }
  }

  return { billing, deleted, errors };
}

module.exports = { purgeUserData, cancelBillingFor, idForms, OWNED };
