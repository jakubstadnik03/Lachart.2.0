/**
 * node server/utils/emailLinkBase.test.js
 *
 * Why this variable exists, separately from SERVER_PUBLIC_URL:
 *
 * centrum.cz soft-bounced a campaign letter on 2026-09-30 with
 *   554 ... rejected due to poor reputation of a domain used in message
 * — a domain used IN the message, not the sender. Every campaign email carries
 * an unsubscribe link, and the outreach ones a click redirect, all built from
 * lachart.onrender.com. That is shared hosting whose reputation is pooled
 * across everything anyone has ever run there.
 *
 * SERVER_PUBLIC_URL cannot simply be repointed: it also registers the Strava
 * webhook callback and the Garmin push URL, which must reach the backend
 * directly rather than through a CDN rewrite.
 */

'use strict';

const assert = require('assert');

const clean = () => {
  delete process.env.EMAIL_LINK_BASE_URL;
  delete process.env.SERVER_PUBLIC_URL;
  delete require.cache[require.resolve('./emailLinkBase')];
  return require('./emailLinkBase').emailLinkBase;
};

// Unset: the old behaviour, so nothing changes until the rewrite is live.
assert.strictEqual(clean()(), 'https://lachart.onrender.com');

process.env.SERVER_PUBLIC_URL = 'https://lachart.onrender.com';
assert.strictEqual(clean.call(null) && require('./emailLinkBase').emailLinkBase(), 'https://lachart.onrender.com');

// Set: links move to the trusted domain, webhooks are untouched because they
// read SERVER_PUBLIC_URL, which this does not change.
delete require.cache[require.resolve('./emailLinkBase')];
process.env.SERVER_PUBLIC_URL = 'https://lachart.onrender.com';
process.env.EMAIL_LINK_BASE_URL = 'https://lachart.net';
assert.strictEqual(require('./emailLinkBase').emailLinkBase(), 'https://lachart.net');
assert.strictEqual(process.env.SERVER_PUBLIC_URL, 'https://lachart.onrender.com', 'webhooks keep their own host');

// A trailing slash would produce lachart.net//api/... — ugly, and some filters
// score doubled slashes as obfuscation.
delete require.cache[require.resolve('./emailLinkBase')];
process.env.EMAIL_LINK_BASE_URL = 'https://lachart.net///';
assert.strictEqual(require('./emailLinkBase').emailLinkBase(), 'https://lachart.net');

console.log('emailLinkBase: email links are configurable without moving the webhooks');
