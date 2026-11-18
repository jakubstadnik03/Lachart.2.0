/**
 * Addresses that always fail must not be able to stop the newsletter.
 *
 *   node server/services/productUpdateFailures.test.js
 *
 * A failed send leaves no sent-marker and a tick takes the oldest pending
 * accounts, so three such addresses at the head of the queue stop it for everyone
 * behind them. In production that happened on 28 September and again on 11 October.
 * An outage must not count against anybody, or expired credentials would work
 * their way down the list.
 *
 * The transport and the database write are replaced, so this needs no connection.
 */

'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';
const assert = require('assert');

// The service takes these at require time, so they are replaced first.
const transport = require('../utils/createEmailTransporter');
let sendMail = async () => { throw new Error('no send configured'); };
transport.createCampaignTransporter = () => ({ sendMail: (message) => sendMail(message) });
transport.campaignSender = () => ({ name: 'LaChart', address: 'hello@example.test' });

const User = require('../models/UserModel');
const writes = [];
User.updateOne = async (filter, update) => { writes.push(update); return {}; };

const {
  sendOne, pendingFilter, blamesRecipient, listIssues, MAX_SEND_ATTEMPTS,
} = require('./productUpdateCampaignService');
const { lastMarketingSend } = require('../utils/marketingThrottle');

const realConsoleError = console.error;
console.error = () => {};

const ISSUE = listIssues()[0].id;
const FAILED_KEY = `retentionEmails.productUpdateFailures.${ISSUE}`;
const SENT_KEY = `retentionEmails.productUpdates.${ISSUE}`;
// premium skips the subscription lookup, which is not what is being tested here.
const reader = { _id: 'u1', email: 'reader@example.com', premium: true };
const failure = (over, message = 'refused') => Object.assign(new Error(message), over);

let failures = 0;
const ok = async (name, fn) => {
  writes.length = 0;
  try { await fn(); console.log('  ok ', name); }
  catch (e) { failures += 1; console.log('  FAIL', name, '\n       ' + e.message); }
};

(async () => {
  console.log('whose fault a failure is');

  const aboutTheRecipient = {
    'refused by our own transporter guard': failure({ permanent: true, skipped: true }),
    'a hard refusal at RCPT': failure({ code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 }),
    'a soft refusal at RCPT': failure({ code: 'EENVELOPE', command: 'RCPT TO', responseCode: 450 }),
    'an address nodemailer cannot use': failure({ code: 'EENVELOPE', command: 'API' }, 'No recipients defined'),
    'something nobody has seen before': failure({}, 'boom'),
  };
  for (const [name, err] of Object.entries(aboutTheRecipient)) {
    await ok(`counts: ${name}`, () => assert.strictEqual(blamesRecipient(err), true));
  }

  const aboutUs = {
    'expired credentials': failure({ code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 }),
    'the relay being unreachable': failure({ code: 'ECONNECTION', command: 'CONN' }),
    'a timeout': failure({ code: 'ETIMEDOUT' }),
    'a dropped socket': failure({ code: 'ESOCKET' }),
    'a bad greeting': failure({ code: 'EPROTOCOL', command: 'CONN', responseCode: 421 }),
    'our sender being refused': failure({ code: 'EENVELOPE', command: 'MAIL FROM', responseCode: 550 }),
    'the message being refused': failure({ code: 'EMESSAGE', command: 'DATA', responseCode: 554 }),
    'a rate limit': failure({ responseCode: 421 }),
    'a misconfigured sender': failure({ code: 'EENVELOPE', command: 'API' }, 'Invalid sender "x"'),
  };
  for (const [name, err] of Object.entries(aboutUs)) {
    await ok(`does not count: ${name}`, () => assert.strictEqual(blamesRecipient(err), false));
  }

  console.log('what a send leaves behind');

  await ok('a refusal is counted, and is not recorded as sent', async () => {
    sendMail = async () => { throw failure({ code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 }); };
    const result = await sendOne(reader, ISSUE);
    assert.strictEqual(result.sent, false);
    assert.deepStrictEqual(writes, [{ $inc: { [FAILED_KEY]: 1 } }]);
  });

  await ok('so is a relay that answers without accepting the recipient', async () => {
    sendMail = async () => ({ accepted: [], rejected: [reader.email], response: '550 no' });
    assert.strictEqual((await sendOne(reader, ISSUE)).sent, false);
    assert.deepStrictEqual(writes, [{ $inc: { [FAILED_KEY]: 1 } }]);
  });

  await ok('an outage leaves nothing on the recipient', async () => {
    sendMail = async () => { throw failure({ code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 }); };
    assert.strictEqual((await sendOne(reader, ISSUE)).sent, false);
    assert.deepStrictEqual(writes, []);
  });

  await ok('a delivered issue is marked sent and counts nothing', async () => {
    sendMail = async () => ({ accepted: [reader.email], rejected: [], response: '250 OK' });
    assert.strictEqual((await sendOne(reader, ISSUE)).sent, true);
    assert.strictEqual(writes.length, 1);
    assert.ok(writes[0].$set[SENT_KEY] instanceof Date);
    assert.strictEqual(writes[0].$inc, undefined);
  });

  console.log('and what that does to the queue');

  await ok('enough failures take a recipient out of that issue, and only that one', () => {
    assert.deepStrictEqual(pendingFilter(ISSUE)[FAILED_KEY], { $not: { $gte: MAX_SEND_ATTEMPTS } });
    assert.ok(MAX_SEND_ATTEMPTS > 1, 'a greylisted address gets another try');
  });

  await ok('the count is in the schema, since strict mode would silently drop it', () => {
    assert.strictEqual(User.schema.path('retentionEmails.productUpdateFailures').instance, 'Map');
  });

  await ok('a failure does not read as a marketing send to the shared throttle', () => {
    const user = { retentionEmails: { productUpdateFailures: { [ISSUE]: MAX_SEND_ATTEMPTS } } };
    assert.strictEqual(lastMarketingSend(user), null);
  });

  console.error = realConsoleError;
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
