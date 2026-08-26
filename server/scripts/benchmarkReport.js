/**
 * Prints the population benchmark distributions built from the real lactate
 * tests in the database — sample sizes per sport/gender after dedup and
 * quality filtering, plus the key percentiles. Run this before enabling the
 * benchmark UI to see which buckets actually clear MIN_SAMPLE_SIZE.
 *
 *   cd server && node scripts/benchmarkReport.js
 *
 * Requires MONGODB_URI in the environment / .env (same as the server).
 */

require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'benchmark-report';

const mongoose = require('mongoose');
const {
  buildSnapshot,
  calcStats,
  MIN_SAMPLE_SIZE,
} = require('../services/lactateBenchmarkService');

function fmtPace(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtVal(sport, metric, v) {
  if (v == null) return '—';
  if (metric === 'ratio') return `${(v * 100).toFixed(1)}%`;
  if (metric.endsWith('Wkg')) return `${v.toFixed(2)} W/kg`;
  if (sport === 'bike') return `${Math.round(v)} W`;
  return sport === 'swim' ? `${fmtPace(v)}/100m` : `${fmtPace(v)}/km`;
}

function printBucket(sport, label, entries) {
  const n = entries.length;
  const flag = n >= MIN_SAMPLE_SIZE ? 'OK ' : `LOW (min ${MIN_SAMPLE_SIZE})`;
  console.log(`\n  ${label}: n=${n}  ${flag}`);
  if (!n) return;

  const metrics = [
    ['lt1', entries.map((e) => e.lt1)],
    ['lt2', entries.map((e) => e.lt2)],
    ['ratio', entries.map((e) => e.ratio)],
  ];
  if (sport === 'bike') {
    metrics.push(['lt1Wkg', entries.map((e) => e.lt1Wkg).filter((v) => v != null)]);
    metrics.push(['lt2Wkg', entries.map((e) => e.lt2Wkg).filter((v) => v != null)]);
  }

  for (const [name, values] of metrics) {
    const s = calcStats(values);
    if (!s) { console.log(`    ${name.padEnd(7)} no data`); continue; }
    const f = (v) => fmtVal(sport, name, v);
    console.log(
      `    ${name.padEnd(7)} n=${String(s.count).padEnd(4)} ` +
      `p25=${f(s.p25)}  med=${f(s.median)}  p75=${f(s.p75)}  ` +
      `range ${f(s.min)}–${f(s.max)}`
    );
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Run from server/ with the same env as the app.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const snap = await buildSnapshot();
  console.log(`Benchmark snapshot — built ${snap.builtAt}`);
  console.log(`Total tests in DB: ${snap.totalTests}`);

  for (const sport of ['bike', 'run', 'swim']) {
    const entries = snap.sports[sport];
    console.log(`\n━━ ${sport.toUpperCase()} ━━ ${entries.length} athletes after dedup + quality filter`);
    printBucket(sport, 'all    ', entries);
    printBucket(sport, 'male   ', entries.filter((e) => e.gender === 'male'));
    printBucket(sport, 'female ', entries.filter((e) => e.gender === 'female'));
    const unknown = entries.filter((e) => e.gender == null).length;
    if (unknown) console.log(`  (${unknown} athletes with no linked user profile — counted in "all" only)`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
