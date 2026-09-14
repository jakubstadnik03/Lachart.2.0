/**
 * Give Garmin rows stored as sport "other" the sport their raw type says.
 *
 * Until the gym family was mapped, every STRENGTH_TRAINING / YOGA / cardio
 * session Garmin sent was stored as "other" — and "other" pairs with no plan,
 * so a planned strength session never ticked off. New syncs are mapped, and
 * the activity list re-reads old rows through raw.activityType, so nothing
 * depends on this — it just makes the stored value true for every other
 * reader (detail, similar sessions, exports).
 *
 *   node server/scripts/backfillGarminSport.js            # report, change nothing
 *   node server/scripts/backfillGarminSport.js --apply    # write the sports
 *
 * Run it from anywhere in the repo; it reads server/.env regardless. Only the
 * `sport` field is touched; raw stays, so it can be run again or undone.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { garminSportOf } = require('../utils/garminSport');

const APPLY = process.argv.includes('--apply');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing — is server/.env in place?');
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection('garminactivities');

  const cursor = col.find({ sport: 'other' }, { projection: { sport: 1, raw: { activityType: 1 }, name: 1, userId: 1 } });
  const byTarget = new Map();
  const writes = [];
  let seen = 0;
  for await (const doc of cursor) {
    seen += 1;
    const next = garminSportOf(doc);
    if (next === 'other') continue;
    byTarget.set(next, (byTarget.get(next) || 0) + 1);
    writes.push({ updateOne: { filter: { _id: doc._id, sport: 'other' }, update: { $set: { sport: next } } } });
  }

  console.log(`${seen} rows stored as "other"; ${writes.length} have a better answer in raw:`);
  for (const [sport, n] of [...byTarget.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${sport.padEnd(12)} ${n}`);

  if (!APPLY) {
    console.log('Dry run — nothing written. Re-run with --apply to write.');
  } else if (writes.length) {
    let modified = 0;
    for (let i = 0; i < writes.length; i += 200) {
      const r = await col.bulkWrite(writes.slice(i, i + 200), { ordered: false });
      modified += r.modifiedCount;
    }
    console.log(`Updated ${modified} rows.`);
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
