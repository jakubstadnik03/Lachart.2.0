/**
 * Rewrite already-stored activity streams into their packed binary form.
 *
 * New writes pack themselves — models/streamStoragePlugin sees to that. This is
 * only for the documents that were written before it existed. Readers handle
 * both forms, so the two can coexist indefinitely and this can be stopped and
 * restarted at any point.
 *
 *   node server/scripts/packStoredStreams.js              # report, change nothing
 *   node server/scripts/packStoredStreams.js --apply      # do it
 *   node server/scripts/packStoredStreams.js --apply --batch=50 --pause=500
 *
 * RUN THIS AFTER TURNING OFF CONTINUOUS CLOUD BACKUP. Rewriting every stream is
 * on the order of a gigabyte of oplog, and point-in-time recovery bills for the
 * oplog it retains — leaving PITR on means paying for the privilege of shrinking
 * the database.
 *
 * Requires MONGODB_URI in the environment / .env, same as the server.
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { packStreams } = require('../utils/streamCodec');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const num = (flag, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${flag}=`));
  return hit ? Number(hit.split('=')[1]) : dflt;
};
const BATCH = num('batch', 100);
const PAUSE_MS = num('pause', 250);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (b) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = b || 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${u[i]}`;
};

async function convert(collName) {
  const coll = mongoose.connection.db.collection(collName);
  const filter = { streams: { $exists: true }, packed: { $exists: false } };
  const total = await coll.countDocuments(filter);
  console.log(`\n${collName}: ${total.toLocaleString()} document(s) still unpacked`);
  if (!total) return { before: 0, after: 0, done: 0 };

  const bson = require('bson');
  let before = 0; let after = 0; let done = 0; let failed = 0;

  // _id order with a moving cursor, so a document rewritten mid-run is simply
  // no longer matched rather than shifting the window under us.
  let lastId = null;
  for (;;) {
    const q = lastId ? { ...filter, _id: { $gt: lastId } } : filter;
    const batch = await coll.find(q).sort({ _id: 1 }).limit(BATCH).toArray();
    if (!batch.length) break;
    lastId = batch[batch.length - 1]._id;

    const ops = [];
    for (const doc of batch) {
      try {
        const packed = packStreams(doc.streams);
        if (!packed) { failed += 1; continue; }
        before += bson.calculateObjectSize({ streams: doc.streams });
        after += bson.calculateObjectSize({ packed });
        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { packed }, $unset: { streams: '' } },
          },
        });
      } catch (err) {
        failed += 1;
        console.warn(`  ${doc._id}: ${err.message}`);
      }
    }

    if (APPLY && ops.length) await coll.bulkWrite(ops, { ordered: false });
    done += ops.length;
    process.stdout.write(`\r  ${done.toLocaleString()}/${total.toLocaleString()}  ${fmt(before)} -> ${fmt(after)}   `);

    // The cluster serving this is a 0.5 vCPU burstable instance also serving
    // the app. Rewriting a gigabyte is not worth a latency spike.
    if (PAUSE_MS) await sleep(PAUSE_MS);
    if (!APPLY && done >= total) break;
    if (!APPLY) break; // a dry run only needs one batch to estimate
  }

  console.log();
  if (failed) console.log(`  ${failed} document(s) could not be packed and were left alone`);
  return { before, after, done, total };
}

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Run from server/ with the same env as the app.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(APPLY ? 'APPLYING changes' : 'DRY RUN — nothing is written (pass --apply to convert)');

  let before = 0; let after = 0;
  for (const c of ['stravastreams', 'garminstreams']) {
    const r = await convert(c);
    before += r.before; after += r.after;
    if (!APPLY && r.done) {
      const ratio = r.before / r.after;
      console.log(`  sampled ${r.done} of ${r.total.toLocaleString()}: ${ratio.toFixed(2)}x smaller`
        + ` — projecting ${fmt(r.before / r.done * r.total)} -> ${fmt(r.after / r.done * r.total)}`);
    }
  }
  if (APPLY && before) {
    console.log(`\ntotal: ${fmt(before)} -> ${fmt(after)}  (${(before / after).toFixed(2)}x smaller)`);
    console.log('Run `db.stravastreams.stats()` or compact to see the space actually returned to disk.');
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
