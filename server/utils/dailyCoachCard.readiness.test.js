/**
 * The server's readiness mirror. Plain Node, no jest — run with:
 *
 *   NODE_PATH=server/node_modules EMAIL_USER=x@example.com EMAIL_APP_PASSWORD=x APP_PASSWORD=x JWT_SECRET=x \
 *     node server/utils/dailyCoachCard.readiness.test.js
 *
 * Same fixture as client/src/utils/recovery.test.js: the morning the card
 * called +6% resting HR and −22% HRV "Overreaching". Both copies must agree.
 */

'use strict';

const assert = require('assert');
const { assessReadiness, voiceForDay, voiceSeed, STYLES } = require('./dailyCoachCard');

const day = (i, restingHeartRate, hrvMs, sleepMinutes = 430) => ({
  date: `2026-09-${String(i).padStart(2, '0')}`, restingHeartRate, hrvMs, sleepMinutes,
});
const quietMonth = (rhrToday, hrvToday, sleepToday = 430) => [
  ...Array.from({ length: 27 }, (_, i) => day(i + 1, 42 + (i % 2), 84 + (i % 3) * 2)),
  day(28, rhrToday, hrvToday, sleepToday),
];

(function mildMorningIsAWatch() {
  const r = assessReadiness(quietMonth(45, 67), -12);
  assert.strictEqual(r.level, 'watch');
  assert.deepStrictEqual(r.reasons, ['HRV 22% below your usual']);
  assert.strictEqual(r.restingHeartRateDeltaPct, 6);
  assert.strictEqual(r.hrvDeltaPct, -22);
})();

(function ordinaryMorningIsOk() {
  assert.strictEqual(assessReadiness(quietMonth(43, 80), -12).level, 'ok');
})();

(function bothClearlyOutIsHigh() {
  const r = assessReadiness(quietMonth(48, 56), -12);
  assert.strictEqual(r.level, 'high');
  assert.deepStrictEqual(r.reasons, ['resting HR 13% above your usual', 'HRV 35% below your usual']);
})();

(function twoMildFlagsNeedDeepFatigue() {
  assert.strictEqual(assessReadiness(quietMonth(46, 68), -12).level, 'watch');
  assert.strictEqual(assessReadiness(quietMonth(46, 68), -30).level, 'high');
})();

(function theDayPicksALine() {
  const a = voiceForDay(STYLES.supportive, 0);
  const b = voiceForDay(STYLES.supportive, 1);
  assert.strictEqual(typeof a.headline.productive, 'string');
  assert.notStrictEqual(a.headline.productive, b.headline.productive);
  assert.ok(STYLES.supportive.headline.productive.includes(a.headline.productive));
  assert.strictEqual(typeof a.restLine, 'string');
  // Same day, same athlete → same line; another athlete may differ.
  const d = new Date(2026, 8, 12);
  assert.strictEqual(voiceSeed(d, 'abc'), voiceSeed(d, 'abc'));
  assert.notStrictEqual(voiceSeed(d, 'abc'), voiceSeed(new Date(2026, 8, 13), 'abc'));
})();

console.log('dailyCoachCard readiness + voice: ok');
