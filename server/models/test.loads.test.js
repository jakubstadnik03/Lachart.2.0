/**
 * A saved run test holding km/h reaches every reader as pace seconds, through
 * the real Mongoose query hooks. There is no database here: the collection hands
 * back raw documents as stored, and nothing connects or writes.
 */
const assert = require('assert');
const mongoose = require('mongoose');
const Test = require('./test');
const { calculateThresholds } = require('../utils/lactateThresholds');

const raw = (fields) => ({
  _id: new mongoose.Types.ObjectId(),
  athleteId: 'a1',
  title: 'Run',
  description: '',
  baseLactate: 1,
  date: new Date('2026-05-15'),
  ...fields,
});
const rows = (ladder) => ladder.map(([power, lactate]) => ({
  _id: new mongoose.Types.ObjectId(), interval: 1, power, lactate, heartRate: 150,
}));

const savedKmh = () => raw({
  sport: 'run',
  inputMode: 'pace',
  results: rows([[8, 1.1], [10, 1.2], [11, 1.5], [12, 1.8], [13, 2.4], [14, 3.8], [15, 5.2], [16, 8.1], [17, 10.5]]),
});
const lostSeconds = () => raw({
  sport: 'run',
  results: rows([[5, 2.5], [5, 1.5], [4, 2.6], [4, 3], [4, 4.5], [4, 6.7]]),
});
const paced = () => raw({
  sport: 'run',
  inputMode: 'speed',
  results: rows([[300, 1.1], [270, 1.8], [240, 3.8], [225, 8.1]]),
});

let stored = [];
Test.collection.find = (filter, options, callback) => callback(null, {
  toArray: (done) => done(null, stored.map((d) => JSON.parse(JSON.stringify(d)))),
});
Test.collection.findOne = (filter, options, callback) => callback(null, JSON.parse(JSON.stringify(stored[0])));

const loads = (test) => test.results.map((r) => r.power);

(async () => {
  for (const [label, read] of [
    ['lean find', async () => (await Test.find({}).lean())[0]],
    ['hydrated find', async () => (await Test.find({}))[0]],
    ['lean findById', () => Test.findById(stored[0]._id).lean()],
    ['hydrated findOne', () => Test.findOne({})],
  ]) {
    stored = [savedKmh()];
    const test = await read();
    assert.deepStrictEqual([...loads(test)], [450, 360, 3600 / 11, 300, 3600 / 13, 3600 / 14, 240, 225, 3600 / 17], label);
    assert.strictEqual(test.inputMode, 'speed', label);
    const thresholds = calculateThresholds(test);
    assert.ok(thresholds.LTP1 > thresholds.LTP2 && thresholds.LTP2 >= 225, `${label}: ${thresholds.LTP1} ${thresholds.LTP2}`);

    stored = [lostSeconds()];
    assert.deepStrictEqual([...loads(await read())], [5, 5, 4, 4, 4, 4], `${label}: whole minutes are not km/h`);

    stored = [paced()];
    assert.deepStrictEqual([...loads(await read())], [300, 270, 240, 225], `${label}: seconds stay seconds`);
  }

  // A projection without the results, and a test that is not there.
  stored = [{ _id: new mongoose.Types.ObjectId(), sport: 'run', title: 'Run' }];
  await Test.findOne({}).select('sport title');
  Test.collection.findOne = (filter, options, callback) => callback(null, null);
  assert.strictEqual(await Test.findById(new mongoose.Types.ObjectId()), null);

  console.log('test loads: all passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
