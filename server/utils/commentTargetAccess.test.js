/**
 * Who may use the comments under a training. Plain Node, no jest — run with:
 *
 *   node server/utils/commentTargetAccess.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Stand-in models, recorded per collection, so owner lookup runs without Mongo.
const calls = [];
function fakeModel(name, rows) {
  const q = (result) => ({ select: () => ({ lean: async () => result, limit: () => ({ lean: async () => result }) }) });
  return {
    findById: (id) => { calls.push([name, 'byId', id]); return q(rows.byId?.[id] || null); },
    find: (query) => { calls.push([name, 'find', query]); return q(rows.find?.(query) || []); },
  };
}
const OWNER = '6aa11b0188d5f41d3ac40001';
const OID = '6aa11b0188d5f41d3ac4aaaa';
const fakes = {
  '../models/training': fakeModel('Training', { byId: { [OID]: { athleteId: OWNER } } }),
  '../models/fitTraining': fakeModel('FitTraining', {}),
  '../models/PlannedWorkout': fakeModel('PlannedWorkout', {}),
  '../models/RaceEvent': fakeModel('RaceEvent', {}),
  '../models/StravaActivity': fakeModel('StravaActivity', { find: (q) => (q.stravaId === 42 ? [{ userId: OWNER }] : []) }),
  '../models/GarminActivity': fakeModel('GarminActivity', { find: (q) => (q.garminId === '987' ? [{ userId: OWNER }] : []) }),
  '../models/AppleHealthActivity': fakeModel('AppleHealthActivity', { find: (q) => (q.healthKitId === 'HK-1' ? [{ userId: OWNER }] : []) }),
  '../models/WatchActivity': fakeModel('WatchActivity', { find: (q) => (q.source === 'polar' && q.watchId === 'p7' ? [{ userId: OWNER }] : []) }),
};
for (const [rel, exp] of Object.entries(fakes)) {
  const file = require.resolve(path.join(__dirname, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: exp };
}

const { mayUseTrainingComments, escapeHtml, ownersOfTrainingTarget } = require('./commentTargetAccess');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const ATHLETE = '6aa11b0188d5f41d3ac40001';
const COACH = '6aa11b0188d5f41d3ac40002';
const STRANGER = '6aa11b0188d5f41d3ac40003';
const ownerDocs = [{ _id: ATHLETE, coachIds: [COACH] }];

test('the owner and their linked coach may', () => {
  assert.strictEqual(mayUseTrainingComments({ _id: ATHLETE, role: 'athlete' }, [ATHLETE], ownerDocs), true);
  assert.strictEqual(mayUseTrainingComments({ _id: COACH, role: 'coach' }, [ATHLETE], ownerDocs), true);
});

test('another coach or athlete may not', () => {
  assert.strictEqual(mayUseTrainingComments({ _id: STRANGER, role: 'coach' }, [ATHLETE], ownerDocs), false);
  assert.strictEqual(mayUseTrainingComments({ _id: STRANGER, role: 'athlete' }, [ATHLETE], ownerDocs), false);
});

test('an activity nobody owns is closed to everyone but admins', () => {
  assert.strictEqual(mayUseTrainingComments({ _id: COACH, role: 'coach' }, [], []), false);
  assert.strictEqual(mayUseTrainingComments({ _id: STRANGER, role: 'athlete', admin: true }, [], []), true);
});

test('comment text is escaped for the e-mail', () => {
  assert.strictEqual(escapeHtml('<a href="x">hi</a> & \'b\''), '&lt;a href=&quot;x&quot;&gt;hi&lt;/a&gt; &amp; &#39;b&#39;');
});

async function asyncTests() {
  const cases = [
    [OID, [OWNER]],
    [`regular-${OID}`, [OWNER]],
    ['strava-42', [OWNER]],
    ['42', [OWNER]],
    ['garmin-987', [OWNER]],
    ['apple-HK-1', [OWNER]],
    ['polar-p7', [OWNER]],
    ['coros-p7', []],
    ['garmin-unknown', []],
  ];
  for (const [id, want] of cases) {
    try {
      assert.deepStrictEqual(await ownersOfTrainingTarget(id), want, id);
      passed += 1;
      console.log(`  ok  owner of ${id}`);
    } catch (err) {
      console.error(`  FAIL owner of ${id}\n       ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`${passed} passed`);
}
asyncTests();
