'use strict';

/**
 * The Strava profile picture, and when to fetch it again.
 *
 * Strava's picture URLs are not stable: the day an athlete changes the
 * photo, the old CDN address answers 403, and the app was keeping the URL
 * it saved at connect time for good. A coach's own picture had been broken
 * in the header for months. So the periodic sync re-reads it, and only ever
 * replaces an avatar that came from Strava in the first place — a photo the
 * athlete uploaded here stays.
 */

const STRAVA_DEFAULT_PICTURE = 'avatar/athlete/large.png';
const STRAVA_HOSTED = /^https?:\/\/(www\.)?strava\.com\/|cloudfront\.net\/pictures\/athletes\//i;
const AVATAR_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** The picture URL from a Strava athlete payload, or null when it is the stock one. */
function stravaAvatarUrlFrom(athlete) {
  if (!athlete || !athlete.profile || athlete.profile === STRAVA_DEFAULT_PICTURE) return null;
  const path = athlete.profile_large || athlete.profile_medium || athlete.profile;
  if (!path) return null;
  return /^https?:\/\//i.test(path) ? path : `https://www.strava.com/${path}`;
}

function isStravaAvatar(url) {
  return !!url && STRAVA_HOSTED.test(String(url));
}

/** Once a week is plenty; the call costs one request against Strava's daily limit. */
function avatarRefreshDue(user, now = Date.now()) {
  const at = user && user.strava && user.strava.avatarRefreshedAt;
  if (!at) return true;
  const t = new Date(at).getTime();
  return !Number.isFinite(t) || now - t > AVATAR_REFRESH_MS;
}

/**
 * What to write after reading the athlete: the new avatar when it changed
 * and the stored one is Strava's (or empty), otherwise just the timestamp.
 */
function avatarUpdateFor(user, athlete, now = new Date()) {
  const fresh = stravaAvatarUrlFrom(athlete);
  const current = user && user.avatar ? String(user.avatar) : '';
  const set = { 'strava.avatarRefreshedAt': now };
  if (fresh && fresh !== current && (!current || isStravaAvatar(current))) set.avatar = fresh;
  return set;
}

module.exports = {
  AVATAR_REFRESH_MS,
  stravaAvatarUrlFrom,
  isStravaAvatar,
  avatarRefreshDue,
  avatarUpdateFor,
};
