/**
 * Strava picture refresh rules. Plain Node, no jest — run with:
 *
 *   node server/utils/stravaAvatar.test.js
 */

'use strict';

const assert = require('assert');
const { stravaAvatarUrlFrom, isStravaAvatar, avatarRefreshDue, avatarUpdateFor, AVATAR_REFRESH_MS } = require('./stravaAvatar');

const OLD = 'https://dgalywyr863hv.cloudfront.net/pictures/athletes/70935355/22878065/6/medium.jpg';
const NEW = 'https://dgalywyr863hv.cloudfront.net/pictures/athletes/70935355/31000001/1/large.jpg';

(function readsThePicture() {
  assert.strictEqual(stravaAvatarUrlFrom({ profile: NEW, profile_large: NEW }), NEW);
  assert.strictEqual(stravaAvatarUrlFrom({ profile: 'avatar/athlete/large.png' }), null, 'the stock picture is no picture');
  assert.strictEqual(stravaAvatarUrlFrom({ profile: 'pictures/x.jpg' }), 'https://www.strava.com/pictures/x.jpg');
  assert.strictEqual(stravaAvatarUrlFrom(null), null);
})();

(function knowsWhoseUrlItIs() {
  assert.ok(isStravaAvatar(OLD));
  assert.ok(isStravaAvatar('https://www.strava.com/pictures/x.jpg'));
  assert.ok(!isStravaAvatar('/uploads/avatars/abc.jpg'));
  assert.ok(!isStravaAvatar('https://lh3.googleusercontent.com/a/xyz'));
})();

(function refreshesWeekly() {
  const now = Date.now();
  assert.ok(avatarRefreshDue({ strava: {} }, now));
  assert.ok(!avatarRefreshDue({ strava: { avatarRefreshedAt: new Date(now - 1000) } }, now));
  assert.ok(avatarRefreshDue({ strava: { avatarRefreshedAt: new Date(now - AVATAR_REFRESH_MS - 1) } }, now));
})();

(function replacesOnlyStravasOwn() {
  const now = new Date();
  const athlete = { profile: NEW, profile_large: NEW };
  assert.deepStrictEqual(avatarUpdateFor({ avatar: OLD }, athlete, now), { 'strava.avatarRefreshedAt': now, avatar: NEW });
  assert.deepStrictEqual(avatarUpdateFor({ avatar: '' }, athlete, now), { 'strava.avatarRefreshedAt': now, avatar: NEW });
  // A photo uploaded here is not Strava's to replace.
  assert.deepStrictEqual(avatarUpdateFor({ avatar: '/uploads/avatars/me.jpg' }, athlete, now), { 'strava.avatarRefreshedAt': now });
  // Nothing changed: only the timestamp moves.
  assert.deepStrictEqual(avatarUpdateFor({ avatar: NEW }, athlete, now), { 'strava.avatarRefreshedAt': now });
  // Strava has no picture any more: keep what we have.
  assert.deepStrictEqual(avatarUpdateFor({ avatar: OLD }, { profile: 'avatar/athlete/large.png' }, now), { 'strava.avatarRefreshedAt': now });
})();

console.log('stravaAvatar: ok');
