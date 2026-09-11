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

/**
 * Whether this coach's invitation to the athlete is still waiting on the
 * athlete.
 *
 * Linked wins. An athlete can end up linked with the invitation flags still
 * set — the pair got connected from the athlete's side, or by an admin, after
 * the coach had already invited them — and reading the flags first turned a
 * linked athlete into one the coach could see in the bar but not open: the
 * list filtered on "linked", the profile refused on "invited". Both now ask
 * this one question.
 */
function hasPendingInviteFromCoach(athlete, coachUser) {
  if (!athlete || !coachUser) return false;
  const coachId = String(coachUser._id || '');
  if (!coachId) return false;
  if (athleteHasCoachUser(athlete, coachId)) return false;
  if (String(athlete.pendingCoachId || '') === coachId) return true;
  if (Array.isArray(coachUser.pendingAthleteIds)) {
    return coachUser.pendingAthleteIds.some((id) => String(id) === String(athlete._id));
  }
  return false;
}

/**
 * Whether the athlete has an account of their own — as opposed to a record a
 * coach created for them that nobody has logged into yet.
 *
 * Two kinds of coach-made record exist: the stub an email invitation leaves
 * behind when there is no account for that address (isPreRegistered), and the
 * athlete a coach registers by name, who gets a login only once they open the
 * registration link (signupMethod coach_invite, registration not complete).
 * isRegistrationComplete on its own cannot answer this: it was never set for
 * ordinary email signups, so it reads false for most real accounts.
 */
function athleteHasOwnAccount(athlete) {
  if (!athlete) return false;
  if (athlete.isPreRegistered === true) return false;
  if (String(athlete.signupMethod || '') === 'coach_invite' && athlete.isRegistrationComplete !== true) return false;
  return true;
}

/**
 * The link fields every list of athletes hands the client, so that a bar, a
 * card and a profile page never disagree about the same person.
 *
 *   coachLinkStatus  'active' | 'pending' — can the coach see their data
 *   invitationPending  the same thing as a boolean (older readers)
 *   hasAccount       false for a record the coach created that nobody has
 *                    logged into yet; the coach can still open it
 */
function coachLinkFields(athlete, coachUser) {
  const pending = hasPendingInviteFromCoach(athlete, coachUser);
  return {
    invitationPending: pending,
    coachLinkStatus: pending ? 'pending' : 'active',
    hasAccount: athleteHasOwnAccount(athlete),
  };
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
  hasPendingInviteFromCoach,
  athleteHasOwnAccount,
  coachLinkFields,
  athletesLinkedToCoachQuery,
  mergeCoachIds,
  removeCoachFromAthleteIds,
  COACH_LIKE_ROLES,
};
