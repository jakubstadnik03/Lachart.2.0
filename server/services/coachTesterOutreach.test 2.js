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
  listClause,
  subjectFor,
  renderText,
  renderHtml,
} = require('./coachTesterOutreachService');
const { trackedUrl, verifyClick, decodeTarget, isAllowedTarget } = require('../utils/outreachTracking');

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

// --- the opening clause ----------------------------------------------------
// It describes the LIST, never the reader. These rows were scraped by category
// from websites: nothing in them says this person runs lactate tests, or still
// coaches at all. Telling a stranger what they do, wrongly, in sentence one
// ends the email there.
assert.strictEqual(listClause({ type: 'endurance coach', city: 'Birmingham' }), 'endurance coaches in Birmingham');
assert.strictEqual(listClause({ type: 'sports clinic', city: 'Berlin' }), 'sports clinics in Berlin');
assert.strictEqual(listClause({ type: 'cycling club', city: '' }), 'cycling coaches', 'no city, no dangling "in"');

// --- the letter itself -----------------------------------------------------
const lead = { _id: 'abc123', name: 'ATP Performance Coaching', email: 'andy@atpperformance.uk', city: 'Birmingham', type: 'endurance coach' };
const text = renderText(lead);

assert.ok(text.startsWith('Hi Andy,'), 'greets the person, not the limited company');
assert.ok(!text.includes('ATP Performance Coaching'), 'the business name never appears in the greeting');
assert.ok(text.includes('unsubscribe') || text.includes('Unsubscribe'), 'cold mail carries a way out');
// The failure mode being guarded is the opening that TELLS the reader what they
// do — "I'm writing because you coach endurance athletes in Birmingham" — which
// the scraped list cannot actually support. Conditional phrasing ("if that's
// you", "after you run a step test") is the point, not the problem.
assert.ok(!/writing because you\b/.test(text), 'the opening never asserts what this person does');
assert.ok(/If that's you/.test(text), 'it asks rather than assumes');
assert.ok(text.includes('?'), 'the ask is a question answerable from the inbox');
assert.ok(!/<img|<table|<button/i.test(text), 'the text part stays text');
assert.ok(text.split(/\s+/).length < 190, 'a cold first message stays short');

// The subject line must not repeat the one that earned 0 replies from 202
// sends: "Free tool for lactate testing coaches - LaChart".
const subj = subjectFor();
assert.ok(!/free/i.test(subj), 'no "free" in a cold subject line');
assert.ok(subj.length < 78, 'subject survives a phone screen');

// --- the HTML part --------------------------------------------------------
const html = renderHtml(lead);

// Remote images are blocked by default in most clients on a first message from
// a stranger, so every one has to say what it shows, and the letter has to read
// correctly with all of them missing.
const allImgs = html.match(/<img[^>]*>/g) || [];
// The 1×1 beacon is decorative and correctly carries alt="" — a screen reader
// must not announce it. Only real content images are held to the alt rule.
const imgs = allImgs.filter((t) => !/width="1"/.test(t));
assert.ok(imgs.length >= 1, 'the screenshot is in');
imgs.forEach((tag) => {
  assert.ok(/alt="[^"]{20,}"/.test(tag), `image needs real alt text: ${tag.slice(0, 60)}`);
  assert.ok(/max-width:524px/.test(tag) && /width:100%/.test(tag), 'image must not overflow a phone');
});

// JPEG, not the site's WebP: Outlook on Windows renders no WebP, and a broken
// image in a first cold message is worse than no image at all.
assert.ok(!/\.webp/i.test(html), 'no WebP in email');
assert.ok(/screenshots\/email\/[a-z-]+\.jpg/.test(html), 'images come from the email-safe folder');

assert.ok(/Unsubscribe/.test(html), 'the way out is in the HTML too');
assert.ok(/<img[^>]+width="1"[^>]+height="1"/.test(html), 'the open beacon is present');

// --- tracking --------------------------------------------------------------
// Every outbound link goes through the signed redirect, so a click is
// attributable to one lead.
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const outbound = hrefs.filter((h) => !h.includes('/unsubscribe'));
assert.ok(outbound.length >= 2, 'site and app links are both there');
outbound.forEach((h) => assert.ok(h.includes('/api/email/t/c?'), `untracked link: ${h}`));

// The redirect must not be usable as an open redirect from our own domain:
// the signature covers the destination, and the host is allowlisted anyway.
const link = outbound[0];
const params = new URL(link).searchParams;
const target = decodeTarget(params.get('u'));
assert.ok(verifyClick(lead._id, target, params.get('s')), 'a real link verifies');
assert.ok(!verifyClick(lead._id, 'https://evil.example/phish', params.get('s')), 'a swapped destination does not');
assert.strictEqual(isAllowedTarget('https://evil.example/phish'), false, 'and would be refused regardless');
assert.strictEqual(isAllowedTarget('https://lachart.net/x'), true);
assert.strictEqual(
  trackedUrl(lead._id, 'https://evil.example'),
  'https://evil.example',
  'a non-allowlisted target is never wrapped as if it were ours',
);

// Gmail clips an email over ~102 KB of HTML and hides the unsubscribe line
// under a "View entire message" link. Images are URLs, so they cost nothing here.
assert.ok(Buffer.byteLength(html, 'utf8') < 102 * 1024, 'HTML stays under the Gmail clip');

console.log('coachTesterOutreach: all assertions passed');
