'use strict';

/**
 * What a coach may receive about an athlete. The stored user document carries
 * the password hash, one-time tokens (reset, registration, invitation, e-mail
 * verification) and the tracker OAuth tokens — none of that is the coach's.
 *
 * Tracker sub-documents keep their ids and settings and get `connected: true`
 * in place of the tokens, so the client's "is Strava/Garmin linked" checks
 * (client/src/utils/syncSources.js) still answer the same.
 */

const SECRET_FIELDS = [
  'password',
  'resetPasswordToken',
  'resetPasswordExpires',
  'registrationToken',
  'registrationTokenExpires',
  'invitationToken',
  'invitationTokenExpires',
  'emailVerificationToken',
  'emailVerificationTokenExpires',
  'calendarFeedToken',
  'pushTokens',
  'expoPushToken',
  'expoPushTokens',
  'apnsToken',
  'apnsTokens',
  'deviceTokens',
  // Sign-up / last-login geolocation (IP address included) is admin telemetry.
  'registrationLocation',
  'lastLoginLocation',
];

const TRACKERS = ['strava', 'garmin', 'polar', 'coros'];
const TRACKER_SECRET = /token|secret|verifier/i;

function toCoachSafeAthlete(athlete) {
  if (!athlete || typeof athlete !== 'object') return athlete;
  const plain = typeof athlete.toObject === 'function' ? athlete.toObject() : { ...athlete };

  for (const field of SECRET_FIELDS) delete plain[field];

  for (const tracker of TRACKERS) {
    const sub = plain[tracker];
    if (!sub || typeof sub !== 'object') continue;
    const safe = {};
    let hadToken = false;
    for (const [key, value] of Object.entries(sub)) {
      if (TRACKER_SECRET.test(key)) {
        if (value) hadToken = true;
        continue;
      }
      safe[key] = value;
    }
    if (hadToken && safe.connected === undefined) safe.connected = true;
    plain[tracker] = safe;
  }
  return plain;
}

module.exports = { toCoachSafeAthlete, SECRET_FIELDS };
