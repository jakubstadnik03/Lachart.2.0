/**
 * Plain Node, no jest — run with: node server/utils/recentDuplicateAthlete.test.js
 */
const assert = require('assert');
const { isSameRecentAthlete, WINDOW_MS } = require('./recentDuplicateAthlete');

let passed = 0;
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`); };
const now = Date.UTC(2026, 9, 26, 23, 20, 40);
const first = { coachId: 'c1', name: 'Son', surname: 'S', isRegistrationComplete: false, createdAt: new Date(now - 18e3) };

t('a repeat seconds later is the same athlete', () => {
  assert.strictEqual(isSameRecentAthlete(first, { coachId: 'c1', name: ' son ', surname: 's' }, now), true);
});
t('another coach, another name or another e-mail is not', () => {
  assert.strictEqual(isSameRecentAthlete(first, { coachId: 'c2', name: 'Son', surname: 'S' }, now), false);
  assert.strictEqual(isSameRecentAthlete(first, { coachId: 'c1', name: 'Son', surname: 'T' }, now), false);
  assert.strictEqual(isSameRecentAthlete(first, { coachId: 'c1', name: 'Son', surname: 'S', email: 'x@y.z' }, now), false);
});
t('an old record or a finished account is not', () => {
  assert.strictEqual(isSameRecentAthlete({ ...first, createdAt: new Date(now - WINDOW_MS - 1) }, { coachId: 'c1', name: 'Son', surname: 'S' }, now), false);
  assert.strictEqual(isSameRecentAthlete({ ...first, isRegistrationComplete: true }, { coachId: 'c1', name: 'Son', surname: 'S' }, now), false);
});
console.log(`\n${passed} passed`);
