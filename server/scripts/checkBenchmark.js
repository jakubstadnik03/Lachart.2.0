/**
 * Scenario checks for services/lactateBenchmarkService.js — same style as
 * checkHealthGate.js (no test runner on the server):
 *
 *   node scripts/checkBenchmark.js
 *
 * Exits non-zero on the first mismatch, so it can be dropped into CI as-is.
 * No database needed — only the pure extraction/stats logic is exercised.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'check-script';

const { calcStats, _internals } = require('../services/lactateBenchmarkService');
const { extractEntry, normalizeLoadsToPace, normSport } = _internals;

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ─── fixtures ────────────────────────────────────────────────────────────────

// Clean incremental bike test: base ~1.0, LT2 in the low 300s
const bikeTest = {
  _id: 'bike1',
  sport: 'bike',
  date: new Date('2026-01-01'),
  baseLactate: 1.0,
  weight: 72,
  results: [
    { power: 150, heartRate: 118, lactate: 1.0, intervalType: 'work' },
    { power: 190, heartRate: 130, lactate: 1.1, intervalType: 'work' },
    { power: 230, heartRate: 143, lactate: 1.5, intervalType: 'work' },
    { power: 270, heartRate: 155, lactate: 2.2, intervalType: 'work' },
    { power: 310, heartRate: 166, lactate: 3.4, intervalType: 'work' },
    { power: 350, heartRate: 175, lactate: 5.9, intervalType: 'work' },
    { power: 250, heartRate: 150, lactate: 7.0, intervalType: 'recovery' },
  ],
};

// Run test stored as pace seconds (5:30 → 3:50 /km)
const runPaceTest = {
  _id: 'run1',
  sport: 'run',
  date: new Date('2026-01-01'),
  baseLactate: 1.2,
  results: [
    { power: 330, heartRate: 130, lactate: 1.2 },
    { power: 305, heartRate: 141, lactate: 1.5 },
    { power: 280, heartRate: 152, lactate: 2.1 },
    { power: 255, heartRate: 163, lactate: 3.2 },
    { power: 230, heartRate: 172, lactate: 5.5 },
  ],
};

// Same run test but stored as speed km/h (legacy speed-mode)
const runSpeedTest = {
  ...runPaceTest,
  _id: 'run2',
  inputMode: 'speed',
  results: runPaceTest.results.map((r) => ({ ...r, power: 3600 / r.power })),
};

console.log('normSport');
check('cycling → bike', normSport('Cycling') === 'bike');
check('Running → run', normSport('Running') === 'run');
check('unknown → null', normSport('rowing') === null);

console.log('normalizeLoadsToPace');
{
  const norm = normalizeLoadsToPace(runSpeedTest, 'run');
  const first = norm.results[0].power;
  check('speed km/h converted to pace sec', Math.abs(first - 330) < 0.5, `got ${first}`);
  const untouched = normalizeLoadsToPace(runPaceTest, 'run');
  check('pace test left as-is', untouched.results[0].power === 330);
  const bike = normalizeLoadsToPace(bikeTest, 'bike');
  check('bike untouched', bike === bikeTest);
}

console.log('extractEntry — bike');
{
  const e = extractEntry(bikeTest, 'bike');
  check('valid entry returned', !!e, 'entry was null');
  if (e) {
    check('LT1 < LT2', e.lt1 < e.lt2, `${e.lt1} vs ${e.lt2}`);
    check('LT2 plausible (200–400 W)', e.lt2 > 200 && e.lt2 < 400, `${e.lt2}`);
    check('ratio in (0.5, 0.99)', e.ratio > 0.5 && e.ratio < 0.99, `${e.ratio}`);
    check('test weight picked up', e.testWeight === 72);
  }
}

console.log('extractEntry — guards');
{
  const short = { ...bikeTest, results: bikeTest.results.slice(0, 3) };
  check('<4 work stages rejected', extractEntry(short, 'bike') === null);

  const allRecovery = {
    ...bikeTest,
    results: bikeTest.results.map((r) => ({ ...r, intervalType: 'recovery' })),
  };
  check('recovery-only test rejected', extractEntry(allRecovery, 'bike') === null);

  // 6 work rows, one of them recovery — recovery must not enter the curve
  const withRecovery = extractEntry(bikeTest, 'bike');
  const noRecovery = extractEntry(
    { ...bikeTest, results: bikeTest.results.filter((r) => r.intervalType !== 'recovery') },
    'bike'
  );
  check(
    'recovery row excluded from thresholds',
    withRecovery && noRecovery && withRecovery.lt2 === noRecovery.lt2,
    `${withRecovery?.lt2} vs ${noRecovery?.lt2}`
  );

  const implausible = {
    ...bikeTest,
    results: bikeTest.results.map((r) => ({ ...r, power: r.power * 10 })),
  };
  check('implausible watts rejected', extractEntry(implausible, 'bike') === null);
}

console.log('extractEntry — run pace & speed give the same thresholds');
{
  const a = extractEntry(runPaceTest, 'run');
  const b = extractEntry(runSpeedTest, 'run');
  check('pace entry valid', !!a);
  check('speed entry valid', !!b);
  if (a && b) {
    check('LT2 matches across storage modes', Math.abs(a.lt2 - b.lt2) < 1, `${a.lt2} vs ${b.lt2}`);
    check('pace LT1 slower than LT2 (bigger sec)', a.lt1 > a.lt2, `${a.lt1} vs ${a.lt2}`);
    check('ratio < 1 for pace sports', a.ratio > 0.5 && a.ratio < 0.99, `${a.ratio}`);
  }
}

console.log('extractEntry — thresholdOverrides win');
{
  const overridden = { ...bikeTest, thresholdOverrides: { LTP1: 222, LTP2: 333 } };
  const e = extractEntry(overridden, 'bike');
  check('override LT1 applied', e && e.lt1 === 222, `${e?.lt1}`);
  check('override LT2 applied', e && e.lt2 === 333, `${e?.lt2}`);
}

console.log('calcStats');
{
  const s = calcStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  check('count', s.count === 10);
  check('median', s.median === 5.5, `${s.median}`);
  check('p25/p75', s.p25 === 3.25 && s.p75 === 7.75, `${s.p25}/${s.p75}`);
  check('histogram sums to ~100%', Math.abs(s.distribution.reduce((a, b) => a + b, 0) - 100) < 1);
  check('empty input → null', calcStats([]) === null);
  check('non-finite filtered', calcStats([NaN, null, 4]).count === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
