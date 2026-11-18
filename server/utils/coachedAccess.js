/**
 * Coached access — what a coach's plan unlocks in their athletes' own logins.
 *
 * Coaches told us the athlete subscription was the barrier: their clients will
 * not pay for a second app, so the coach's planning never reached them. Most
 * of the loop was already free (reading a planned session, the Garmin push,
 * marking it done), but an athlete looking at their own account still hit
 * locked charts, three browsable tests and a 30-day calendar, and read that as
 * "my coach's app wants my money too".
 *
 * So an athlete linked to a coach on a coach-tier plan gets the read-only side
 * of Pro: their whole test history with zones, the full calendar, and the
 * load/form charts. Nothing that creates work — planning their own sessions,
 * saving tests past the free cap, PDFs — because that is what the Athlete plan
 * sells to people who train without a coach, and a coached athlete who wants
 * it can still buy it.
 *
 * Only the coach's own paid plan (or a manual comp grant) counts. The
 * systemwide bypasses already unlock everyone, and an admin's free pass is not
 * a plan their athletes should inherit.
 */

'use strict';

const { athleteCoachIdSet } = require('./athleteCoachAccess');
const { resolvePremiumAccess } = require('./premiumAccess');

/** Features a coach-tier plan opens for its linked athletes. Keys match FEATURE_MATRIX. */
const COACHED_FEATURES = Object.freeze([
  'test_history',
  'calendar_full_history',
  'advanced_analytics',
]);

const COACH_TIER_PLANS = new Set(['coach', 'team', 'enterprise']);

const NONE = Object.freeze({ active: false, coachId: null, coachName: null });

function displayName(coach) {
  return [coach?.name, coach?.surname].filter(Boolean).join(' ').trim() || null;
}

/**
 * Whether this coach, with this subscription, pays for their athletes.
 * Pure — the caller loads both.
 */
function coachPlanCoversAthletes(coach, subscription) {
  if (!coach) return false;
  if (coach.premium === true) return true;
  const { source } = resolvePremiumAccess(coach, subscription);
  return source === 'subscription' && COACH_TIER_PLANS.has(subscription?.plan);
}

/**
 * @param {object} athlete  user doc or lean, with coachId / coachIds
 * @param {object} [deps]   { loadCoaches(ids) → [{ ...coach, subscriptionId: sub|null }] }
 *                          defaults to a Mongo lookup; tests pass their own.
 * @returns {Promise<{ active: boolean, coachId: string|null, coachName: string|null }>}
 */
async function resolveCoachedAccess(athlete, deps = {}) {
  if (!athlete) return NONE;
  const coachIds = [...athleteCoachIdSet(athlete)];
  if (coachIds.length === 0) return NONE;

  const loadCoaches = deps.loadCoaches || defaultLoadCoaches;
  let coaches;
  try {
    coaches = await loadCoaches(coachIds);
  } catch (err) {
    // A failed lookup leaves the athlete on their own plan — never a 500.
    console.warn('[coachedAccess] coach lookup failed:', err.message);
    return NONE;
  }

  // Keep the athlete's own coach order, so the primary coach is named first.
  const byId = new Map((coaches || []).map((c) => [String(c._id), c]));
  for (const id of coachIds) {
    const coach = byId.get(id);
    if (!coach) continue;
    const sub = coach.subscriptionId && typeof coach.subscriptionId === 'object'
      ? coach.subscriptionId
      : null;
    if (coachPlanCoversAthletes(coach, sub)) {
      return { active: true, coachId: id, coachName: displayName(coach) };
    }
  }
  return NONE;
}

async function defaultLoadCoaches(ids) {
  // Required lazily so the pure helpers above load without a database.
  const User = require('../models/UserModel');
  return User.find({ _id: { $in: ids } })
    .select('name surname premium subscriptionId')
    .populate('subscriptionId')
    .lean();
}

function coachedFeatureAllowed(featureKey, coached) {
  return Boolean(coached?.active) && COACHED_FEATURES.includes(featureKey);
}

/** The shape every user payload carries, so the client can unlock the same three things. */
function coachedAccessPayload(coached) {
  if (!coached?.active) return { active: false };
  return { active: true, coachName: coached.coachName, features: [...COACHED_FEATURES] };
}

module.exports = {
  COACHED_FEATURES,
  coachPlanCoversAthletes,
  resolveCoachedAccess,
  coachedFeatureAllowed,
  coachedAccessPayload,
};
