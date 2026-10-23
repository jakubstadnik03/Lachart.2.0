/**
 * What a coach receives about an athlete. Plain Node, no jest — run with:
 *
 *   node server/utils/coachSafeAthlete.test.js
 */

'use strict';

const assert = require('assert');
const { toCoachSafeAthlete } = require('./coachSafeAthlete');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const stored = {
  _id: 'a1',
  name: 'Eva',
  email: 'eva@example.com',
  password: '$2a$10$hash',
  resetPasswordToken: 'r',
  registrationToken: 'reg',
  invitationToken: 'inv',
  emailVerificationToken: 'ev',
  calendarFeedToken: 'cal',
  expoPushTokens: ['ExponentPushToken[x]'],
  lastLoginLocation: { ip: '1.2.3.4', country: 'CZ' },
  powerZones: { cycling: { lt2: 300 } },
  strava: { athleteId: 42, autoSync: true, accessToken: 'sa', refreshToken: 'sr', expiresAt: 123 },
  garmin: { userId: 'g', accessToken: null, refreshToken: null, tokenSecret: null },
  polar: { accessToken: 'pa' },
};

test('drops the password hash and every one-time token', () => {
  const out = toCoachSafeAthlete(stored);
  for (const k of ['password', 'resetPasswordToken', 'registrationToken', 'invitationToken',
    'emailVerificationToken', 'calendarFeedToken', 'expoPushTokens', 'lastLoginLocation']) {
    assert.strictEqual(out[k], undefined, k);
  }
});

test('keeps what the coach screens use', () => {
  const out = toCoachSafeAthlete(stored);
  assert.strictEqual(out.name, 'Eva');
  assert.strictEqual(out.email, 'eva@example.com');
  assert.deepStrictEqual(out.powerZones, stored.powerZones);
});

test('tracker tokens become a connected flag, ids and settings stay', () => {
  const out = toCoachSafeAthlete(stored);
  assert.deepStrictEqual(out.strava, { athleteId: 42, autoSync: true, expiresAt: 123, connected: true });
  assert.strictEqual(out.polar.connected, true);
  assert.strictEqual(out.polar.accessToken, undefined);
  // No token stored → not reported as connected.
  assert.deepStrictEqual(out.garmin, { userId: 'g' });
});

test('accepts a mongoose document', () => {
  const doc = { toObject: () => ({ ...stored }) };
  assert.strictEqual(toCoachSafeAthlete(doc).password, undefined);
});

test('does not mutate the stored object', () => {
  const copy = JSON.parse(JSON.stringify(stored));
  toCoachSafeAthlete(copy);
  assert.strictEqual(copy.password, stored.password);
  assert.strictEqual(copy.strava.accessToken, 'sa');
});

console.log(`${passed} passed`);
