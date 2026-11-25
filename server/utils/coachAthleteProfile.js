'use strict';

/**
 * Who an athlete is, as their coach's screens need them.
 *
 * Both coach-facing profile endpoints (`GET /user/athlete/:id` and
 * `GET /user/athlete/:id/profile`) used to spell this list out by hand, and
 * both spellings had quietly dropped `gender`. The athlete list beside them
 * goes through `toCoachSafeAthlete`, which removes secrets and keeps
 * everything else, so it carried gender all along — which is how a coach
 * could see a female avatar on the athlete chip and a male one on the very
 * same athlete's profile, a few pixels apart.
 *
 * The damage is invisible by design: the client reads
 * `athlete.gender || 'male'` (client/src/utils/avatarUtils.js), so a field
 * that never arrives does not render as missing, it renders as a man. Keeping
 * one list means the next endpoint cannot lose it on its own.
 *
 * `gender` is passed through exactly as stored, never defaulted here. The
 * schema already defaults it, and a default invented at the edge is what hid
 * this in the first place.
 */

/** The fields every coach-facing view of an athlete carries. */
const ATHLETE_IDENTITY_FIELDS = [
  'email',
  'role',
  'dateOfBirth',
  'address',
  'phone',
  'height',
  'weight',
  'sport',
  'specialization',
  'gender',
  'bio',
  'avatar',
  'coachId',
];

/**
 * @param {object} athlete a User document or plain object
 * @returns {object} the identity fields above, copied as they are
 */
function athleteIdentityFields(athlete) {
  const out = {};
  if (!athlete || typeof athlete !== 'object') return out;
  for (const field of ATHLETE_IDENTITY_FIELDS) out[field] = athlete[field];
  return out;
}

module.exports = { athleteIdentityFields, ATHLETE_IDENTITY_FIELDS };
