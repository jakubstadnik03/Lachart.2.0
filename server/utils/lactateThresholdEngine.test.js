/**
 * The server's engine is the client's, rewritten as CommonJS. If someone
 * edits one side, this says so before the e-mails and the calculator disagree.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { toCommonJs, SRC, DEST } = require('../scripts/syncLactateEngine');

if (fs.existsSync(SRC)) {
  assert.strictEqual(fs.readFileSync(DEST, 'utf8'), toCommonJs(fs.readFileSync(SRC, 'utf8')),
    'server/utils/lactateThresholdEngine.js is out of date — run node server/scripts/syncLactateEngine.js');
}

const { analyzeLactateTest } = require('./lactateThresholdEngine');
// A runner whose lactate jumped 1.2 → 2.9 in one stage (pace in s/mile).
const r = analyzeLactateTest({
  sport: 'run', baseLactate: 1.3,
  stages: [
    { power: 800, lactate: 1.7, heartRate: 112 }, { power: 720, lactate: 1.0, heartRate: 114 },
    { power: 654.5, lactate: 1.3, heartRate: 120 }, { power: 600, lactate: 1.4, heartRate: 127 },
    { power: 553.8, lactate: 1.2, heartRate: 134 }, { power: 514.3, lactate: 2.9, heartRate: 145 },
    { power: 480, lactate: 3.2, heartRate: 149 }, { power: 450, lactate: 4.8, heartRate: 155 },
    { power: 423.5, lactate: 6.3, heartRate: 159 },
  ],
});
const mph = (s) => 3600 / s;
assert.ok(mph(r.lt1.value) > 6.5 && mph(r.lt1.value) < 6.8, `LT1 ${mph(r.lt1.value)}`);
assert.ok(mph(r.lt2.value) > 7.4 && mph(r.lt2.value) < 7.8, `LT2 ${mph(r.lt2.value)}`);
assert.ok(r.lt2.lactate >= 3 && r.lt2.lactate <= 3.6, `LT2 La ${r.lt2.lactate}`);

// A last level stopped early: the reports must read the speed the calculator does.
const { calculateThresholds } = require('./lactateThresholds');
const treadmill = (lastSpeed, lastDuration) => ({
  sport: 'run', baseLactate: 1.0, stageDurationSec: 180,
  results: [[12, 1.2], [13, 1.4], [14, 1.9], [15, 3.0], [16, 5.0]]
    .map(([speed, lactate]) => ({ power: 3600 / speed, lactate, duration: 180 }))
    .concat({ power: 3600 / lastSpeed, lactate: 8.1, duration: lastDuration }),
});
const stopped = calculateThresholds(treadmill(17, 100));
const proportional = calculateThresholds(treadmill(16 + 100 / 180, 180));
assert.ok(Math.abs(stopped.LTP1 - proportional.LTP1) < 0.5, `LT1 ${stopped.LTP1} vs ${proportional.LTP1}`);
assert.ok(Math.abs(stopped.LTP2 - proportional.LTP2) < 0.5, `LT2 ${stopped.LTP2} vs ${proportional.LTP2}`);

// What the form sends survives the schema, and a real Mongoose test reads the same.
const Test = require('../models/test');
const saved = new Test({ ...treadmill(17, 100), athleteId: 'athlete', title: 'Treadmill', date: '2026-11-05', stageDurationSec: '180', stageMeasureMode: 'duration' });
assert.strictEqual(saved.validateSync(), undefined, 'test should validate');
assert.strictEqual(saved.stageDurationSec, 180);
assert.strictEqual(saved.stageMeasureMode, 'duration');
assert.strictEqual(saved.results[5].duration, 100);
const fromDoc = calculateThresholds(saved);
assert.ok(Math.abs(fromDoc.LTP2 - proportional.LTP2) < 0.5, `doc LT2 ${fromDoc.LTP2} vs ${proportional.LTP2}`);
console.log('lactateThresholdEngine.test.js passed');
