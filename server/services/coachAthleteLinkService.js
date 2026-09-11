/**
 * The one way an athlete and a coach get connected.
 *
 * Five routes used to do this by hand — accept the coach's invitation, finish
 * registering from one, accept the athlete's invitation, the admin link, the
 * by-email add — and each cleared a different subset of the invitation flags.
 * The leftovers were not harmless: an athlete linked with `pendingCoachId`
 * still set showed in the coach's bar and refused to open, because the list
 * asked "linked?" and the profile asked "invited?". Linking here clears every
 * flag the pair could have, on both sides, so there is nothing left to
 * disagree about.
 */

'use strict';

const mongoose = require('mongoose');
const User = require('../models/UserModel');
const { mergeCoachIds, athleteHasCoachUser } = require('../utils/athleteCoachAccess');

const oid = (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : id);

/**
 * Link `athlete` to `coachId` and clear the invitation between them, in both
 * directions. Idempotent: linking an already-linked pair only tidies flags.
 *
 * @param {object} athlete  a User document (or lean object) — read for its
 *                          current coach list, not written through
 * @param {string|ObjectId} coachId
 * @returns {{ coachIds: ObjectId[], coachId: ObjectId|null, alreadyLinked: boolean }}
 */
async function linkAthleteToCoach(athlete, coachId) {
  if (!athlete?._id || !coachId) throw new Error('linkAthleteToCoach needs an athlete and a coach');
  const alreadyLinked = athleteHasCoachUser(athlete, coachId);
  const merged = mergeCoachIds(athlete, coachId);

  const athleteSet = { coachIds: merged.coachIds, coachId: merged.coachId };
  // The invitation this coach sent, if it is the one still recorded.
  if (String(athlete.pendingCoachId || '') === String(coachId)) {
    Object.assign(athleteSet, {
      pendingCoachId: null,
      invitationToken: null,
      invitationTokenExpires: null,
    });
  }
  await User.updateOne({ _id: athlete._id }, { $set: athleteSet });

  // Coach side: on the team, off the waiting list. The athlete-to-coach
  // direction keeps its own single slot; clear it when it names this athlete.
  await User.updateOne(
    { _id: oid(coachId) },
    {
      $addToSet: { athletes: athlete._id },
      $pull: { pendingAthleteIds: athlete._id },
    },
  );
  await User.updateOne(
    { _id: oid(coachId), pendingAthleteId: athlete._id },
    { $set: { pendingAthleteId: null, invitationToken: null, invitationTokenExpires: null } },
  );

  return { ...merged, alreadyLinked };
}

/**
 * Drop the invitation flags of a pair that is already linked.
 *
 * Reads that find such a pair call this in passing — fire and forget — so the
 * data heals the next time the coach opens their list, without a migration.
 */
async function clearStalePendingFlags(athlete, coach) {
  if (!athlete?._id || !coach?._id) return;
  if (!athleteHasCoachUser(athlete, coach._id)) return;
  const flaggedOnAthlete = String(athlete.pendingCoachId || '') === String(coach._id);
  const flaggedOnCoach = Array.isArray(coach.pendingAthleteIds)
    && coach.pendingAthleteIds.some((id) => String(id) === String(athlete._id));
  if (!flaggedOnAthlete && !flaggedOnCoach) return;
  await linkAthleteToCoach(athlete, coach._id);
}

/**
 * Turn the stub an invitation left behind into the account of the person who
 * just signed up with that address.
 *
 * Before this, that person was told "an account with this email already
 * exists" — the stub, which they could neither log into nor replace — and a
 * Google or Apple sign-in quietly logged them into a nameless one. Whoever
 * proves the address gets the record: it carries whatever the coach has
 * already set up for them, and the coach link the invitation promised.
 *
 * @param {object} stub    the isPreRegistered user document
 * @param {object} fields  what the signup knows — name, surname, and one of
 *                         password (already hashed) / googleId / appleId,
 *                         plus anything else the signup path would have set
 * @returns the updated user document
 */
async function claimPreRegisteredStub(stub, fields = {}) {
  if (!stub?._id) throw new Error('claimPreRegisteredStub needs the stub');
  const $set = {
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
    isPreRegistered: false,
    isRegistrationComplete: true,
    invitationToken: null,
    invitationTokenExpires: null,
  };
  if (!$set.name) $set.name = stub.name || 'Athlete';
  if (!$set.surname) $set.surname = stub.surname || '-';
  await User.updateOne({ _id: stub._id }, { $set });

  const coachId = stub.pendingCoachId || stub.coachId || null;
  if (coachId) await linkAthleteToCoach(stub, coachId);
  return User.findById(stub._id);
}

module.exports = { linkAthleteToCoach, clearStalePendingFlags, claimPreRegisteredStub };
