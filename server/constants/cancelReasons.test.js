/**
 * The cancel dialog asks why someone is leaving, and the answer is optional.
 * The rule that matters most is the one that is easy to break later: nothing
 * about this question may ever stand between a subscriber and cancelling. So
 * an unrecognised reason has to come back as "no answer", not as an error the
 * controller could be tempted to reject the request over.
 */
const assert = require('assert');
const {
  CANCEL_REASONS,
  CANCEL_NOTE_MAX,
  normalizeCancelReason,
  normalizeCancelNote,
} = require('./cancelReasons');

let passed = 0;
const test = (name, fn) => {
  try { fn(); console.log('  ok ', name); passed += 1; }
  catch (e) { console.log('  FAIL', name); console.log('      ', e.message); process.exitCode = 1; }
};

console.log('\nCancellation reasons');

test('the listed reasons are accepted as they are', () => {
  for (const r of CANCEL_REASONS) assert.strictEqual(normalizeCancelReason(r), r);
});

test('separates the three fixes that look alike in the numbers', () => {
  // Price, roadmap and activation are different problems with different
  // answers; collapsing them is what made the churn unreadable.
  for (const r of ['too_expensive', 'missing_feature', 'never_set_up']) {
    assert.ok(CANCEL_REASONS.includes(r), `${r} missing`);
  }
});

test('an athlete pausing between seasons can say so', () => {
  assert.ok(CANCEL_REASONS.includes('off_season'));
});

test('case and padding do not lose an answer', () => {
  assert.strictEqual(normalizeCancelReason('  Too_Expensive '), 'too_expensive');
});

test('anything unrecognised reads as no answer, never as an error', () => {
  for (const bad of ['', null, undefined, 'nonsense', 0, {}, [], true]) {
    assert.strictEqual(normalizeCancelReason(bad), null, `${JSON.stringify(bad)} should be null`);
  }
});

test('a blank note is no note', () => {
  for (const blank of ['', '   ', null, undefined]) {
    assert.strictEqual(normalizeCancelNote(blank), null);
  }
});

test('a note is trimmed and capped rather than rejected', () => {
  assert.strictEqual(normalizeCancelNote('  too pricey  '), 'too pricey');
  const long = 'x'.repeat(CANCEL_NOTE_MAX + 250);
  assert.strictEqual(normalizeCancelNote(long).length, CANCEL_NOTE_MAX);
});

test('a note survives on its own, with no reason picked', () => {
  // Someone who skips the buttons and types a sentence is the most useful
  // answer there is — it must not be discarded for lacking a category.
  assert.strictEqual(normalizeCancelReason(undefined), null);
  assert.strictEqual(normalizeCancelNote('garmin push kept failing'), 'garmin push kept failing');
});

console.log(`  ${passed} passed`);
