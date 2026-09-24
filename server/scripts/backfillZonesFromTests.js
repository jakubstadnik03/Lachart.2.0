#!/usr/bin/env node
/**
 * One-off: give every athlete who already has a lactate test the zones it implies.
 *
 * WHY
 * Saving a test and adopting its zones used to be two separate acts, and the
 * second one was a trip into the profile that almost nobody made — 530 athletes
 * had a test on file and 90 had zones. utils/applyZonesFromTest.js closes that
 * for tests saved from now on; this closes it for the ones already there.
 *
 * Zones are what make the rest of the product mean anything: the calendar
 * colours, TSS, planned-versus-actual and the daily card all read them. The
 * billing data says the same thing from the other end — 54 % of subscribers who
 * stayed had zones against 27 % of those who cancelled.
 *
 * WHAT IT WILL AND WILL NOT DO
 *   · Uses the athlete's most recent test per sport.
 *   · Writes ONLY where that sport has no zones yet. Nothing is overwritten —
 *     a threshold somebody set by hand, or that their coach set, stays.
 *   · Skips a test whose curve gives no usable LT1/LT2 pair.
 *   · Shares utils/applyZonesFromTest.js with the live save path, so a profile
 *     filled here is identical to one filled by saving the test today.
 *
 * SAFETY
 *   · Dry run by default. Nothing is written without --apply.
 *   · Every write is logged to a JSON file (--log, default ./zones-backfill-<ts>.json)
 *     recording the user, sport and previous value, so it can be undone.
 *   · Idempotent: a second run finds the zones present and skips them.
 *
 *   node server/scripts/backfillZonesFromTests.js            # dry run
 *   node server/scripts/backfillZonesFromTests.js --apply    # write
 *   node server/scripts/backfillZonesFromTests.js --apply --limit 20
 */

'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Test = require('../models/test');
const User = require('../models/UserModel');
const { applyZonesFromTest, hasZonesFor, plausiblePair, PROFILE_KEY } = require('../utils/applyZonesFromTest');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? Number(args[i + 1]) || Infinity : Infinity;
})();
/**
 * --refresh-from <log.json>: recompute for exactly the user+sport pairs an
 * earlier run wrote, replacing what it left. Used when the zone maths itself
 * changes — those zones are ours, derived from the test, so replacing them is
 * a correction rather than an overwrite. Zones anybody set by hand are not in
 * the log and are never touched.
 */
const REFRESH_FROM = (() => {
  const i = args.indexOf('--refresh-from');
  return i >= 0 ? args[i + 1] : null;
})();
const LOG_PATH = (() => {
  const i = args.indexOf('--log');
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return path.join(process.cwd(), `zones-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
})();

function fmt(v, sport) {
  if (!Number.isFinite(v)) return '—';
  if (sport === 'bike') return `${Math.round(v)} W`;
  return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'test' });
  console.log(`[zones-backfill] ${APPLY ? 'APPLYING' : 'DRY RUN'} against ${mongoose.connection.name}\n`);

  // Newest test per athlete+sport — the one the athlete would expect to define
  // their current zones.
  const tests = await Test.find({}).select('athleteId sport title date results baseLactate unitSystem inputMode').lean();
  const latest = new Map();
  for (const t of tests) {
    if (!PROFILE_KEY[t.sport]) continue;
    const key = `${t.athleteId}|${t.sport}`;
    const prev = latest.get(key);
    if (!prev || new Date(t.date) > new Date(prev.date)) latest.set(key, t);
  }

  // Pairs an earlier run wrote, when refreshing.
  const REFRESH_SET = REFRESH_FROM
    ? new Set(JSON.parse(fs.readFileSync(REFRESH_FROM, 'utf8')).map((r) => `${r.userId}|${r.sport}`))
    : null;
  if (REFRESH_SET) console.log(`  refreshing ${REFRESH_SET.size} pairs from ${REFRESH_FROM}\n`);

  const stats = { candidates: latest.size, applied: 0, hasZones: 0, noThresholds: 0, implausible: 0, notInLog: 0, noAthlete: 0, failed: 0 };
  const log = [];

  let n = 0;
  for (const test of latest.values()) {
    if (n >= LIMIT) break;
    n += 1;
    const key = PROFILE_KEY[test.sport];

    const before = await User.findById(test.athleteId).select('powerZones email name').lean();
    if (!before) { stats.noAthlete += 1; continue; }
    const refreshing = REFRESH_SET
      ? REFRESH_SET.has(`${test.athleteId}|${key}`)
      : false;
    if (REFRESH_SET && !refreshing) { stats.notInLog += 1; continue; }
    if (!refreshing && hasZonesFor(before, key)) { stats.hasZones += 1; continue; }

    if (!APPLY) {
      // Same code path, but stop before the write: ask it to compute only.
      const { calculateZonesFromTest } = require('../utils/lactateZones');
      const z = calculateZonesFromTest(test);
      if (!z) { stats.noThresholds += 1; continue; }
      if (!plausiblePair(test.sport, Number(z.lt1), Number(z.lt2))) { stats.implausible += 1; continue; }
      stats.applied += 1;
      if (stats.applied <= 8) {
        console.log(`  would set ${key.padEnd(9)} LT1 ${fmt(z.lt1, test.sport)}  LT2 ${fmt(z.lt2, test.sport)}   ${(before.email || before.name || '').slice(0, 28)}`);
      }
      continue;
    }

    try {
      const res = await applyZonesFromTest(test, { force: refreshing });
      if (res.applied) {
        stats.applied += 1;
        log.push({
          userId: String(test.athleteId),
          sport: key,
          testId: String(test._id),
          lt1: res.zones?.lt1 ?? null,
          lt2: res.zones?.lt2 ?? null,
          // What was there before, so this run can be reversed.
          previousPowerZones: before.powerZones?.[key] ?? null,
          at: new Date().toISOString(),
        });
      } else if (res.reason === 'has_zones') stats.hasZones += 1;
      else if (res.reason === 'no_thresholds') stats.noThresholds += 1;
      else if (res.reason === 'implausible_thresholds') stats.implausible += 1;
      else stats.failed += 1;
    } catch (e) {
      stats.failed += 1;
      console.warn(`  ! ${test.athleteId} ${test.sport}: ${e.message}`);
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`  athlete+sport pairs with a test : ${stats.candidates}`);
  console.log(`  zones ${APPLY ? 'written' : 'that would be written'} : ${stats.applied}`);
  console.log(`  already had zones, untouched    : ${stats.hasZones}`);
  console.log(`  no usable threshold, skipped    : ${stats.noThresholds}`);
  console.log(`  threshold outside sane range    : ${stats.implausible}`);
  console.log(`  athlete no longer exists        : ${stats.noAthlete}`);
  console.log(`  failed                          : ${stats.failed}`);

  if (APPLY && log.length) {
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
    console.log(`\n  undo log: ${LOG_PATH}`);
  }
  if (!APPLY) console.log('\n  Dry run — nothing was written. Re-run with --apply.');

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
