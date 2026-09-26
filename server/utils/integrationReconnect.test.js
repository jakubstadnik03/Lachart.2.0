/**
 * Which failures are worth waking an athlete up for? Plain Node, no jest:
 *
 *   node server/utils/integrationReconnect.test.js
 *
 * The distinction this file guards is the whole point of the alert. Telling
 * someone to reconnect Garmin is a real cost — they open Settings, run the
 * OAuth dance, and wait — so it has to be reserved for failures they can
 * actually fix. A missing GARMIN_PULL_TOKEN is the trap: it fails every direct
 * pull, looks exactly like an auth error, and no amount of reconnecting will
 * change it, because the token belongs to the server, not to the user.
 */

'use strict';

const assert = require('assert');
const { isReconnectableAuthError } = require('./integrationReconnect');

const httpErr = (status, data = '') => ({ response: { status, data }, message: `Request failed with status code ${status}` });

// --- the user has to act ---------------------------------------------------
assert.strictEqual(isReconnectableAuthError(httpErr(401)), true, '401 is the athlete revoking us');
assert.strictEqual(isReconnectableAuthError(httpErr(403)), true, '403 too');
assert.strictEqual(
  isReconnectableAuthError(httpErr(400, { error: 'invalid_grant' })),
  true,
  'invalid_grant is a dead refresh token — reconnect is the only fix',
);
assert.strictEqual(
  isReconnectableAuthError(new Error('Garmin returned InvalidOAuthTokenException')),
  true,
  'Garmin spells a dead token this way',
);

// --- the server has to act, so stay quiet ---------------------------------
assert.strictEqual(
  isReconnectableAuthError(httpErr(400, { errorMessage: 'InvalidPullTokenException' })),
  false,
  'a missing pull token is a server config gap; reconnecting cannot fix it',
);
assert.strictEqual(isReconnectableAuthError(httpErr(429)), false, 'rate limiting passes on its own');
assert.strictEqual(isReconnectableAuthError(httpErr(500)), false, 'a provider outage is not the user’s doing');
assert.strictEqual(isReconnectableAuthError(new Error('socket hang up')), false, 'nor is a network blip');
assert.strictEqual(isReconnectableAuthError(null), false, 'no error, no alert');

// A 401 whose body happens to mention the pull token is still a 401: the status
// is the stronger signal, and ordering in the implementation must keep it so.
assert.strictEqual(
  isReconnectableAuthError(httpErr(401, { errorMessage: 'InvalidPullTokenException' })),
  true,
  'status wins over body text',
);

console.log('integrationReconnect: all assertions passed');
