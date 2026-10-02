/**
 * Who gets which of the two mails.
 *
 *   node server/services/cancelFeedbackSegment.test.js
 *
 * "Not churned" is not "never started", and reading it that way queued a
 * hundred paying subscribers for a mail that opens by telling the reader they
 * have never paid, with a 100%-off code under it. The scheduler was live when
 * this was found, with about three hours of churned backlog left to drain
 * before it would have reached them.
 *
 * Only the classifier is exercised: the audience is passed in rather than read
 * from a database, so this needs no connection and no fixtures.
 */

'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';
const assert = require('assert');
const { segmentFor } = require('./cancelFeedbackCampaignService');

const user = (id, extra = {}) => ({
  _id: id, email: `${id}@example.com`, isActive: true, notifications: {}, retentionEmails: {}, ...extra,
});
const AUDIENCE = { churned: ['gone'], anySub: ['gone', 'paying'] };

(async () => {
  assert.strictEqual(await segmentFor(user('gone'), AUDIENCE), 'churned',
    'someone who cancelled is asked what was missing');

  assert.strictEqual(await segmentFor(user('paying'), AUDIENCE), null,
    'a live subscriber gets neither mail');

  assert.strictEqual(await segmentFor(user('fresh'), AUDIENCE), 'never-started',
    'someone who never began a plan is offered the two months');

  assert.strictEqual(
    await segmentFor(user('fresh', { retentionEmails: { winBackSent: new Date() } }), AUDIENCE), null,
    'nobody gets a second offer within the fortnight',
  );

  assert.strictEqual(
    await segmentFor(user('gone', { retentionEmails: { cancelFeedbackSent: new Date() } }), AUDIENCE), null,
    'nobody is sent this twice',
  );

  assert.strictEqual(
    await segmentFor(user('fresh', { notifications: { marketingEmails: false } }), AUDIENCE), null,
    'an opt-out is honoured',
  );

  console.log('cancelFeedbackSegment: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
