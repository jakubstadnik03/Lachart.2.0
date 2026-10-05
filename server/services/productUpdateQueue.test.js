/**
 * The newsletter queue has to be able to move.
 *
 *   node server/services/productUpdateQueue.test.js
 *
 * The scheduler drains the oldest still-pending issue first, and "pending" used
 * to mean every account without a sent-marker — so each new registration
 * re-opened the oldest issue. In production that left the September letter
 * permanently next in line, owed to 26 accounts that had all been created after
 * it went out, with five finished issues stacked behind it that could never
 * start. Nobody on the list had heard about planning, or anything else, for a
 * week and would not have again.
 *
 * Only the pure parts are exercised — the Mongo filter and the queue order —
 * so this needs no connection and no fixtures.
 */

'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test';
const assert = require('assert');
const {
  pendingFilter, releaseCutoff, queueKey, listIssues,
} = require('./productUpdateCampaignService');

let failures = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  ok ', name); }
  catch (e) { failures += 1; console.log('  FAIL', name, '\n       ' + e.message); }
};

console.log('an issue is owed to the readers it was written for');

ok('the cutoff is the end of the release day, so same-day signups still get it', () => {
  assert.strictEqual(
    releaseCutoff({ releaseDate: '2026-09-29' }).toISOString(),
    '2026-09-29T23:59:59.999Z',
  );
});

ok('releaseDate wins over the date printed in the letter', () => {
  assert.strictEqual(
    releaseCutoff({ date: '2027-01-01', releaseDate: '2026-12-01' }).toISOString(),
    '2026-12-01T23:59:59.999Z',
  );
});

ok('an issue with no date goes to everybody, as it always did', () => {
  assert.strictEqual(releaseCutoff({}), null);
  assert.strictEqual(releaseCutoff({ releaseDate: 'whenever' }), null);
});

ok('a real issue carries its cohort cut into the filter', () => {
  const f = pendingFilter('2026-09');
  assert.ok(f.createdAt && f.createdAt.$lte instanceof Date,
    'an account created after the release is not owed this issue');
  assert.ok(f.createdAt.$lte < new Date('2026-09-30T00:00:00Z'));
});

ok('an unknown issue id still produces a usable filter', () => {
  const f = pendingFilter('no-such-issue');
  assert.strictEqual(f.createdAt, undefined);
  assert.deepStrictEqual(f.$or, [
    { 'retentionEmails.productUpdates.no-such-issue': { $exists: false } },
    { 'retentionEmails.productUpdates.no-such-issue': null },
  ]);
});

ok('a null email is not a sendable address', () => {
  // Two $ne keys in one literal: the second replaced the first, so the null
  // guard was never applied.
  const { email } = pendingFilter('2026-09');
  assert.deepStrictEqual(email.$nin, [null, '']);
  assert.strictEqual(email.$exists, true);
});

ok('an address that can never be delivered to is not kept in the queue', () => {
  // "s" and "x00199700" are real rows, created in February, and the queue takes
  // the oldest first — so they sat at its head failing on every tick.
  const re = pendingFilter('2026-09').email.$regex;
  assert.ok(re, 'the filter checks the shape of the address');
  for (const bad of ['s', 'x00199700', 'nobody', 'two@parts', 'a b@c.com', '@x.com']) {
    assert.ok(!re.test(bad), `${bad} is not an address`);
  }
  for (const good of ['a@b.com', 'first.last+tag@sub.example.co.uk']) {
    assert.ok(re.test(good), `${good} is an address`);
  }
});

console.log('the queue drains in the order issues were released');

ok('order follows releaseDate, not the date on the letter', () => {
  const sorted = [
    { id: 'b', date: '2026-10-01', releaseDate: '2026-11-01' },
    { id: 'a', date: '2026-12-01', releaseDate: '2026-10-01' },
  ].sort((x, y) => queueKey(x).localeCompare(queueKey(y))).map((m) => m.id);
  assert.deepStrictEqual(sorted, ['a', 'b']);
});

ok('every issue on disk has a release date and a unique place in the queue', () => {
  const issues = listIssues();
  assert.ok(issues.length > 0, 'there is at least one issue to send');
  const keys = issues.map(queueKey);
  assert.strictEqual(new Set(keys).size, keys.length, 'no two issues share a slot');
  for (const m of issues) {
    assert.ok(releaseCutoff(m), `issue ${m.id} has no usable release date`);
  }
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
