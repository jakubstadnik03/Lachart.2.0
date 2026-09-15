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
console.log('lactateThresholdEngine.test.js passed');
