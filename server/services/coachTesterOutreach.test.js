/**
 * Who gets greeted by name, and who gets written to at all. Plain Node:
 *
 *   node server/services/coachTesterOutreach.test.js
 *
 * Both of these decided the last campaign's fate. `lead.name` holds the
 * business ("The Strength Coach Ltd"), never a person, so greeting from it
 * announces a mail merge in the first three words — the name has to come from
 * the address or not at all. And 158 of the 202 letters that got no reply went
 * to shared club inboxes, where nobody decides anything.
 */

'use strict';

const assert = require('assert');
const {
  firstNameFromEmail,
  isGenericAddress,
  contextClause,
  subjectFor,
  renderText,
} = require('./coachTesterOutreachService');

// --- names -----------------------------------------------------------------
assert.strictEqual(firstNameFromEmail('matt@strengthcoach.uk'), 'Matt');
assert.strictEqual(firstNameFromEmail('kam@fitbykam.co.uk'), 'Kam');
assert.strictEqual(firstNameFromEmail('ADRIAN@my-coach.co'), 'Adrian');

assert.strictEqual(firstNameFromEmail('info@club.com'), null, 'a shared inbox has no first name');
assert.strictEqual(firstNameFromEmail('coaching@rununbound.com'), null, 'a role is not a person');
assert.strictEqual(firstNameFromEmail('steve.durham@rochdalecyclingclub.co.uk'), 'Steve', 'first.last is still a person');
assert.strictEqual(firstNameFromEmail('anna-lena@x.de'), 'Anna', 'hyphenated too');
assert.strictEqual(firstNameFromEmail('j.smith@x.com'), null, 'a leading initial is not a greeting');
assert.strictEqual(firstNameFromEmail('team2024@x.com'), null, 'digits mean it is not a name');
assert.strictEqual(firstNameFromEmail('a@x.com'), null, 'one letter is an initial');
assert.strictEqual(firstNameFromEmail('asiakaspalvelu@kuntokompassi.fi'), null, 'customer service, in Finnish');

// --- who is worth writing to ----------------------------------------------
assert.strictEqual(isGenericAddress('pengecc@gmail.com'), false, 'a club gmail still reaches one person');
assert.strictEqual(isGenericAddress('post@pthuboslo.com'), true, 'post@ is the Nordic info@');
assert.strictEqual(isGenericAddress('kontakt@verein.de'), true);
assert.strictEqual(isGenericAddress('andy@atpperformance.uk'), false);

// --- the personal clause ---------------------------------------------------
assert.strictEqual(
  contextClause({ type: 'endurance coach', city: 'Birmingham' }),
  'you coach endurance athletes in Birmingham',
);
assert.strictEqual(
  contextClause({ type: 'sports clinic', city: '' }),
  'you run a sports clinic',
  'no city means no dangling "in"',
);

// --- the letter itself -----------------------------------------------------
const lead = { _id: 'abc123', name: 'ATP Performance Coaching', email: 'andy@atpperformance.uk', city: 'Birmingham', type: 'endurance coach' };
const text = renderText(lead);

assert.ok(text.startsWith('Hi Andy,'), 'greets the person, not the limited company');
assert.ok(!text.includes('ATP Performance Coaching'), 'the business name never appears in the greeting');
assert.ok(text.includes('unsubscribe') || text.includes('Unsubscribe'), 'cold mail carries a way out');
assert.ok(!/<img|<table|<button/i.test(text), 'the text part stays text');
assert.ok(text.split(/\s+/).length < 190, 'a cold first message stays short');

// The subject line must not repeat the one that earned 0 replies from 202
// sends: "Free tool for lactate testing coaches - LaChart".
const subj = subjectFor(lead);
assert.ok(!/free/i.test(subj), 'no "free" in a cold subject line');
assert.ok(subj.length < 78, 'subject survives a phone screen');

console.log('coachTesterOutreach: all assertions passed');
