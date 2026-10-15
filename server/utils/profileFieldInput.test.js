/**
 * One typo must not make a profile permanently unsavable.
 *
 *   node server/utils/profileFieldInput.test.js
 *
 * An athlete wrote in to say that every attempt to update his LT2 came back as
 * statuscode500. The edit-profile endpoint saves the whole form, and it ran
 * Number() and new Date() over height, weight and date of birth without looking
 * at what came back — so a single unparseable value in a field he was not
 * editing threw a CastError at save() and took every future save with it. The
 * 500 even named that field, which is no help when you are editing thresholds.
 */

'use strict';

const assert = require('assert');
const { parseProfileNumber, parseProfileDate, badInputResponse } = require('./profileFieldInput');

let failures = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  ok  ', name); }
  catch (e) { failures += 1; console.log('  FAIL', name, '\n        ' + e.message); }
};

console.log('a number the way people actually write one');

ok('a plain number goes through', () => {
  assert.deepStrictEqual(parseProfileNumber('72', 'Weight'), { ok: true, value: 72 });
  assert.deepStrictEqual(parseProfileNumber(72.5, 'Weight'), { ok: true, value: 72.5 });
});

ok('a decimal comma is how most of Europe writes it', () => {
  assert.deepStrictEqual(parseProfileNumber('70,5', 'Weight'), { ok: true, value: 70.5 });
  assert.deepStrictEqual(parseProfileNumber(' 1,80 ', 'Height'), { ok: true, value: 1.8 });
});

ok('an ambiguous thousands separator is refused, not guessed', () => {
  // "1,234" could be 1.234 or 1234; storing the wrong weight silently is worse.
  assert.strictEqual(parseProfileNumber('1,234', 'Weight').ok, false);
});

ok('nothing typed is not an error — the field is simply left alone', () => {
  for (const empty of ['', null, undefined]) {
    assert.deepStrictEqual(parseProfileNumber(empty, 'Weight'), { ok: true, value: undefined });
  }
});

ok('what used to reach the database as NaN is refused by name', () => {
  for (const junk of ['abc', '5 11', '70kg', '--', '1.2.3']) {
    const r = parseProfileNumber(junk, 'Weight');
    assert.strictEqual(r.ok, false, `${junk} is not a number`);
    assert.ok(r.error.includes('Weight'), 'the message says which field');
  }
});

ok('an impossible value is refused too', () => {
  assert.strictEqual(parseProfileNumber('0', 'Height', { min: 1, max: 300 }).ok, false);
  assert.strictEqual(parseProfileNumber('-70', 'Weight', { min: 1, max: 500 }).ok, false);
  assert.strictEqual(parseProfileNumber('9000', 'Weight', { min: 1, max: 500 }).ok, false);
});

console.log('and a date');

ok('a real date is read', () => {
  const r = parseProfileDate('1990-04-17', 'Date of birth');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.toISOString().slice(0, 10), '1990-04-17');
});

ok('an unreadable one is refused instead of stored as Invalid Date', () => {
  const r = parseProfileDate('not a date', 'Date of birth');
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('Date of birth'));
});

ok('an empty date leaves the field alone', () => {
  assert.deepStrictEqual(parseProfileDate('', 'Date of birth'), { ok: true, value: undefined });
});

console.log('the next field of this kind should not arrive as a 500 either');

ok('a cast failure becomes a 400 that names the path', () => {
  const r = badInputResponse({ name: 'CastError', path: 'height', value: NaN });
  assert.ok(r, 'it is recognised as the client\'s bad input');
  assert.strictEqual(r.field, 'height');
  assert.ok(r.error.includes('height'));
});

ok('a validation failure does too', () => {
  const r = badInputResponse({
    name: 'ValidationError',
    errors: { 'powerZones.cycling.lt2': { message: 'Cast to Number failed' } },
  });
  assert.strictEqual(r.field, 'powerZones.cycling.lt2');
});

ok('a genuine server fault is still a server fault', () => {
  assert.strictEqual(badInputResponse(new Error('mongo is on fire')), null);
  assert.strictEqual(badInputResponse(null), null);
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
