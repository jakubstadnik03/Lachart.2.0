/**
 * Helpers for athlete ↔ coach links.
 * Legacy: athlete.coachId (single). New: athlete.coachIds[] for multiple coaches.
 */

const mongoose = require('mongoose');

const COACH_LIKE_ROLES = ['coach', 'tester', 'testing'];

function isCoachLikeRole(role) {
  return COACH_LIKE_ROLES.includes(String(role || '').toLowerCase());
}

/** All coach user IDs linked to this athlete (legacy coachId + coachIds). */
function athleteCoachIdSet(athlete) {
  const ids = new Set();
  if (!athlete) return ids;
  if (athlete.coachId) ids.add(String(athlete.coachId));
  if (Array.isArray(athlete.coachIds)) {
    athlete.coachIds.forEach((id) => {
      if (id) ids.add(String(id));
    });
  }
  return ids;
}

function athleteHasCoachUser(athlete, coachUserId) {
  if (!athlete || !coachUserId) return false;
  return athleteCoachIdSet(athlete).has(String(coachUserId));
}

/** Mongoose query: athletes linked to this coach (legacy coachId or coachIds contains). */
function athletesLinkedToCoachQuery(coachIdObj) {
  return {
    $or: [{ coachId: coachIdObj }, { coachIds: coachIdObj }],
  };
}

/** Build normalized coachIds array + primary coachId (first in list). */
function mergeCoachIds(athlete, newCoachId) {
  const set = athleteCoachIdSet(athlete);
  set.add(String(newCoachId));
  const ordered = Array.from(set);
  const objectIds = ordered.map((id) =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
  );
  return { coachIds: objectIds, coachId: objectIds[0] || null };
}

function removeCoachFromAthleteIds(athlete, coachUserId) {
  const set = athleteCoachIdSet(athlete);
  set.delete(String(coachUserId));
  const ordered = Array.from(set);
  const objectIds = ordered.map((id) =>
    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
  );
  return {
    coachIds: objectIds,
    coachId: objectIds.length ? objectIds[0] : null,
  };
}

module.exports = {
  isCoachLikeRole,
  athleteCoachIdSet,
  athleteHasCoachUser,
  athletesLinkedToCoachQuery,
  mergeCoachIds,
  removeCoachFromAthleteIds,
  COACH_LIKE_ROLES,
};
