import { dedupeTrainingRows, activityKeysOf } from './dedupeTrainingRows';

const idsOf = (rows) => dedupeTrainingRows(rows).map((r) => String(r._id));

/**
 * The pair that started this: one ride from 6 September, listed twice.
 *
 * The athlete renamed the training to "4x20min"; the imported activity kept
 * the name Strava gave it. Different titles, so the title+day pass cannot see
 * they are the same session — only the id link can.
 */
const TRAINING = {
  _id: 'training-1',
  title: '4x20min',
  date: '2026-09-06T08:00:00Z',
  sourceStravaActivityId: '68f186d538a2540fd70d3aed',
  results: [{ power: 372, lactate: 2.2 }, { power: 368 }, { power: 370 }],
};
const ACTIVITY = {
  _id: '68f186d538a2540fd70d3aed',
  stravaId: 19124087286,
  title: 'Bike - 20+ 4x15 LT2 + 20 @368',
  date: '2026-09-06T08:00:00Z',
};

describe('dedupeTrainingRows', () => {
  it('joins a renamed training to the ride it was built from', () => {
    expect(idsOf([TRAINING, ACTIVITY])).toEqual(['training-1']);
    // Order must not decide it — the feeds do not arrive in a fixed order.
    expect(idsOf([ACTIVITY, TRAINING])).toEqual(['training-1']);
  });

  it('keeps whichever copy holds more of the session', () => {
    // An empty training must not beat the ride it was made from, or the log
    // shows a named row with no numbers under it.
    const emptyTraining = { ...TRAINING, results: [] };
    const withLaps = { ...ACTIVITY, lapProfile: [{ d: 600, w: 205 }, { d: 180, w: 372 }, { d: 1500, w: 355 }] };
    expect(idsOf([emptyTraining, withLaps])).toEqual(['68f186d538a2540fd70d3aed']);
  });

  it('gives the training the tie, since that is the copy the athlete owns', () => {
    // Neither holds anything: keep the row that carries the title, category
    // and comments rather than the raw import.
    const emptyTraining = { ...TRAINING, results: [] };
    expect(idsOf([emptyTraining, ACTIVITY])).toEqual(['training-1']);
  });

  it('does not let a long ride outrank a real interval training', () => {
    const manyLaps = { ...ACTIVITY, lapProfile: Array.from({ length: 90 }, () => ({ d: 60, w: 200 })) };
    expect(idsOf([TRAINING, manyLaps])).toEqual(['training-1']);
  });

  it('links a training that stored the numeric id instead of the document id', () => {
    // Both shapes are written today: the client stores Strava's own id, the
    // server stores the activity's _id. Either has to find its pair.
    const byNumericId = { ...TRAINING, sourceStravaActivityId: '19124087286' };
    expect(idsOf([byNumericId, ACTIVITY])).toEqual(['training-1']);
  });

  it('links a Garmin ride the same way', () => {
    const t = { _id: 't', title: 'Intervals', date: '2026-09-06', sourceGarminActivityId: 'g-doc-1', results: [{ power: 300 }] };
    const a = { _id: 'g-doc-1', garminId: '20240817001', title: 'Cycling', date: '2026-09-06' };
    expect(idsOf([t, a])).toEqual(['t']);
  });

  it('still drops the same document arriving from two feeds', () => {
    expect(idsOf([TRAINING, { ...TRAINING }])).toEqual(['training-1']);
  });

  it('still catches a pair that shares a name and a day but no id', () => {
    const a = { _id: 'a', title: 'Morning Ride', date: '2026-09-02T06:00:00Z', results: [{ power: 250 }] };
    const b = { _id: 'b', title: 'Morning Ride', date: '2026-09-02T09:00:00Z' };
    expect(idsOf([a, b])).toEqual(['a']);
  });

  it('leaves two genuinely different sessions on the same day alone', () => {
    const ride = { _id: 'r', stravaId: 111, title: 'Morning Ride', date: '2026-09-02T06:00:00Z' };
    const run = { _id: 'n', stravaId: 222, title: 'Evening Run', date: '2026-09-02T17:00:00Z' };
    expect(idsOf([ride, run])).toEqual(['r', 'n']);
  });

  it('does not bucket a training by its own _id', () => {
    // A training's _id is not an activity id. Were it used as a key, a second
    // training whose source happened to be that string would swallow it.
    expect(activityKeysOf(TRAINING)).toEqual(['68f186d538a2540fd70d3aed']);
    expect(activityKeysOf(ACTIVITY)).toEqual(['19124087286', '68f186d538a2540fd70d3aed']);
  });

  it('survives junk', () => {
    expect(dedupeTrainingRows(null)).toEqual([]);
    expect(dedupeTrainingRows([null, undefined])).toEqual([]);
  });
});
