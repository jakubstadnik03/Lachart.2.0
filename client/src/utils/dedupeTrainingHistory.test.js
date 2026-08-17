/**
 * One ride, two Training documents.
 *
 * The fixtures below are the real pair from production (30 June 2026): adding
 * lactate to a Strava ride wrote the link back to the activity twice, once as
 * the StravaActivity's Mongo _id and once as Strava's numeric id, so the
 * dashboard's Training History offered the same session twice — with different
 * interval sets, and dates two hours apart because one side stored the wall
 * clock and the other the instant.
 */

import { dedupeTrainingHistory } from './dedupeTrainingHistory';

const STRAVA_MONGO_ID = '6a43cb9737145e74699288cd';
const STRAVA_NUMERIC_ID = '19124087286';

/** The activity feed is what proves the two link forms are one activity. */
const ACTIVITIES = [
  { _id: STRAVA_MONGO_ID, stravaId: STRAVA_NUMERIC_ID, name: '1/2 s repre na silnici a pak 4x tunel TT' },
];

/** Linked by the activity's Mongo _id: five work intervals. */
const linkedByMongoId = {
  _id: 'a',
  title: 'Bike TT LT1',
  sport: 'bike',
  date: '2026-06-30T10:48:41.000Z',
  sourceStravaActivityId: STRAVA_MONGO_ID,
  results: [
    { power: 280.5, heartRate: 137.9, duration: 1503 },
    { power: 297.1, heartRate: 142.8, duration: 1472 },
    { power: 308, heartRate: 140.9, duration: 1449 },
    { power: 308.4, heartRate: 139.3, duration: 1445 },
    { power: 309, heartRate: 139.4, lactate: 1.7, duration: 1422 },
  ],
};

/** The same ride linked by the numeric id, clock two hours off, recoveries included. */
const linkedByNumericId = {
  _id: 'b',
  title: 'Bike TT LT1',
  sport: 'bike',
  date: '2026-06-30T08:48:00.000Z',
  type: 'interval',
  sourceStravaActivityId: STRAVA_NUMERIC_ID,
  results: [
    { power: 178, heartRate: 118, duration: 3868 },
    { power: 281, heartRate: 138, duration: 1503 },
    { power: 140, heartRate: 119, duration: 1530 },
    { power: 297, heartRate: 143, duration: 1472 },
    { power: 122, heartRate: 125, duration: 162 },
    { power: 308, heartRate: 141, duration: 1449 },
    { power: 151, heartRate: 126, duration: 183 },
    { power: 308, heartRate: 139, duration: 1445 },
    { power: 150, heartRate: 126, duration: 215 },
    { power: 309, heartRate: 139, lactate: 1.7, duration: 1422 },
    { power: 94, heartRate: 118, duration: 288 },
    { power: 189, heartRate: 123, duration: 548 },
  ],
};

const otherSession = {
  _id: 'c',
  title: '9x6min @400w lt2 ride',
  sport: 'bike',
  date: '2026-07-02T09:00:00.000Z',
  results: [{ power: 400, lactate: 2.4 }],
};

describe('dedupeTrainingHistory', () => {
  it('collapses the same ride linked two different ways', () => {
    expect(dedupeTrainingHistory([linkedByMongoId, linkedByNumericId], ACTIVITIES)).toHaveLength(1);
  });

  it('still collapses them without the activity feed to translate the ids', () => {
    // Then only the title and the two-hour-apart clocks are left to go on.
    expect(dedupeTrainingHistory([linkedByMongoId, linkedByNumericId], [])).toHaveLength(1);
  });

  it('leaves a genuinely different session alone', () => {
    const out = dedupeTrainingHistory([linkedByMongoId, linkedByNumericId, otherSession], ACTIVITIES);
    expect(out).toHaveLength(2);
    expect(out.map((t) => t._id)).toContain('c');
  });

  it('picks the same winner whichever order they arrive in', () => {
    const forwards = dedupeTrainingHistory([linkedByMongoId, linkedByNumericId], ACTIVITIES);
    const backwards = dedupeTrainingHistory([linkedByNumericId, linkedByMongoId], ACTIVITIES);
    expect(forwards[0]._id).toBe(backwards[0]._id);
  });

  it('prefers the record with more lactate readings over the bigger one', () => {
    const twoReadings = {
      ...linkedByMongoId,
      _id: 'la2',
      results: [{ power: 280, lactate: 1.2 }, { power: 309, lactate: 1.7 }],
    };
    const out = dedupeTrainingHistory([linkedByNumericId, twoReadings], ACTIVITIES);
    expect(out).toHaveLength(1);
    expect(out[0]._id).toBe('la2');
  });

  it('falls back to the fuller record when the readings tie', () => {
    const out = dedupeTrainingHistory([linkedByMongoId, linkedByNumericId], ACTIVITIES);
    expect(out[0]._id).toBe('b');
  });

  it('treats the same title hours apart as one session', () => {
    const out = dedupeTrainingHistory([
      { _id: 'x', title: 'Bike TT LT1', sport: 'bike', date: '2026-06-30T08:00:00.000Z', results: [] },
      { _id: 'y', title: 'Bike TT LT1', sport: 'bike', date: '2026-06-30T10:30:00.000Z', results: [{ lactate: 2 }] },
    ], []);
    expect(out).toHaveLength(1);
    expect(out[0]._id).toBe('y');
  });

  it('keeps the same title on different days as two sessions', () => {
    const out = dedupeTrainingHistory([
      { _id: 'x', title: 'Bike TT LT1', sport: 'bike', date: '2026-06-30T09:00:00.000Z', results: [] },
      { _id: 'y', title: 'Bike TT LT1', sport: 'bike', date: '2026-07-07T09:00:00.000Z', results: [] },
    ], []);
    expect(out).toHaveLength(2);
  });

  it('does not merge across sports', () => {
    const out = dedupeTrainingHistory([
      { _id: 'x', title: 'TT LT1', sport: 'bike', date: '2026-06-30T09:00:00.000Z', results: [] },
      { _id: 'y', title: 'TT LT1', sport: 'run', date: '2026-06-30T10:00:00.000Z', results: [] },
    ], []);
    expect(out).toHaveLength(2);
  });

  it('never merges untitled records with no link — there is no evidence', () => {
    const out = dedupeTrainingHistory([
      { _id: 'x', sport: 'bike', date: '2026-06-30T09:00:00.000Z', results: [] },
      { _id: 'y', sport: 'bike', date: '2026-06-30T09:30:00.000Z', results: [] },
    ], []);
    expect(out).toHaveLength(2);
  });

  it('returns empty and single-item inputs untouched', () => {
    expect(dedupeTrainingHistory([], [])).toEqual([]);
    expect(dedupeTrainingHistory(null, [])).toEqual([]);
    const one = [linkedByMongoId];
    expect(dedupeTrainingHistory(one, [])).toBe(one);
  });
});
