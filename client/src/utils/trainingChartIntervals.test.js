import {
  canChartTraining, getChartIntervals,
  needsStravaLapFetch, needsGarminLapFetch, resolveGarminNumericId,
} from './trainingChartIntervals';

/**
 * canChartTraining decides what the Training History picker offers. The rule it
 * encodes: a session the chart would render as an empty panel must not be
 * listed, but a session we simply haven't fetched laps for yet must be.
 */
describe('canChartTraining', () => {
  test('session with real intervals is offered', () => {
    const t = {
      _id: 'a', title: 'Bike TT LT1', sport: 'bike',
      results: [{ power: 250, durationSeconds: 300 }, { power: 260, durationSeconds: 300 }],
    };
    expect(canChartTraining(t, {}, 'bike')).toBe(true);
  });

  test('session with no results and no laps is not offered', () => {
    const t = { _id: 'b', title: 'Swim LT2', sport: 'swim', results: [], laps: [] };
    expect(canChartTraining(t, {}, 'swim')).toBe(false);
  });

  test('session whose only results are empty placeholders is not offered', () => {
    const t = {
      _id: 'c', title: 'Swim LT2', sport: 'swim',
      results: [{ power: '', heartRate: null, durationSeconds: 0 }],
    };
    expect(canChartTraining(t, {}, 'swim')).toBe(false);
  });

  test('lactate-only session is still offered — the chart plots lactate', () => {
    const t = { _id: 'd', title: 'Lactate step test', sport: 'bike', results: [{ power: '', lactate: 2.4 }] };
    expect(canChartTraining(t, {}, 'bike')).toBe(true);
  });

  test('strava-linked session with laps still in flight is kept — unknown, not no', () => {
    const t = {
      _id: 'e', title: 'Morning Run', sport: 'run',
      sourceStravaActivityId: '123', results: [], laps: [{ lactate: null }],
    };
    expect(canChartTraining(t, {}, 'run')).toBe(true);
  });

  test('...and drops out once that fetch comes back empty', () => {
    const t = {
      _id: 'e', title: 'Morning Run', sport: 'run',
      sourceStravaActivityId: '123', results: [], laps: [{ lactate: null }],
    };
    expect(canChartTraining(t, { 123: [] }, 'run')).toBe(false);
  });

  test('strava session with fetched laps is offered', () => {
    const t = {
      _id: 'f', title: 'Morning Run', sport: 'run',
      sourceStravaActivityId: '456', results: [], laps: [{ lactate: null }],
    };
    const cache = { 456: [{ power: 300, durationSeconds: 240 }, { power: 310, durationSeconds: 240 }] };
    expect(canChartTraining(t, cache, 'run')).toBe(true);
  });

  /**
   * The Garmin half. It did not exist: needsStravaLapFetch answered no for a
   * Garmin ride, getChartIntervals had no cache to read it from, so every
   * Garmin session failed this check and never reached the Training History
   * pool. The picker read "No sessions in this category" over a season of
   * Garmin runs, and selecting one in the Field Lactate panel beside it did
   * nothing, because there was nothing in the pool to point at.
   */
  test('garmin session with laps still in flight is kept — unknown, not no', () => {
    const t = {
      _id: 'g1', title: 'Olomouc Běh', sport: 'run',
      source: 'garmin', garminId: '20482044991', results: [], laps: [{ lactate: null }],
    };
    expect(canChartTraining(t, {}, 'run', {})).toBe(true);
  });

  test('...and drops out once THAT fetch comes back empty', () => {
    const t = {
      _id: 'g1', title: 'Olomouc Běh', sport: 'run',
      source: 'garmin', garminId: '20482044991', results: [], laps: [{ lactate: null }],
    };
    expect(canChartTraining(t, {}, 'run', { 20482044991: [] })).toBe(false);
  });

  test('garmin session with fetched laps is offered', () => {
    const t = {
      _id: 'g2', title: 'Run LT2', sport: 'run',
      source: 'garmin', garminId: '555', results: [], laps: [{ lactate: null }],
    };
    const cache = { 555: [{ power: 300, durationSeconds: 240 }, { power: 310, durationSeconds: 240 }] };
    expect(canChartTraining(t, {}, 'run', cache)).toBe(true);
  });

  test('an empty strava cache does not vouch for a garmin session', () => {
    // Both services number their activities. Sharing one map by raw id would
    // let a Strava miss answer for a Garmin ride that happened to match.
    const t = {
      _id: 'g3', title: 'Run LT2', sport: 'run',
      source: 'garmin', garminId: '123', results: [], laps: [{ lactate: null }],
    };
    expect(canChartTraining(t, { 123: [] }, 'run', {})).toBe(true);
    expect(canChartTraining(t, { 123: [] }, 'run', { 123: [] })).toBe(false);
  });

  test('null training is not offered', () => {
    expect(canChartTraining(null, {}, 'bike')).toBe(false);
  });
});

/**
 * A real 4x20min: the ride has 18 laps, the training kept 13 of them, and the
 * blood was drawn after the rep sitting at lap 15. Merging the two lists by
 * position put that reading on lap 11 — a different rep, at 374 W instead of
 * the 370 W actually ridden.
 */
describe('getChartIntervals — a result row lands on its own lap', () => {
  const laps = Array.from({ length: 18 }, (_, i) => ({
    average_watts: i === 10 ? 374.3 : i === 14 ? 369.7 : 200,
    moving_time: 1200,
    distance: 15400,
  }));
  const results = [
    { interval: 11, sourceLapIndex: 14, lactate: '2.2', power: 369.7 },
    { interval: 12, sourceLapIndex: 16, power: 319 },
  ];

  it('puts the reading on the lap the row came from', () => {
    const out = getChartIntervals({ laps, results }, {}, 'bike');
    expect(out).toHaveLength(18);
    expect(out[14].lactate).toBe('2.2');
    expect(out[10].lactate).toBeFalsy();
  });

  it('still merges by position when no row says where it came from', () => {
    const plain = results.map(({ sourceLapIndex, ...r }) => r);
    const out = getChartIntervals({ laps, results: plain }, {}, 'bike');
    expect(out[0].lactate).toBe('2.2');
    expect(out[14].lactate).toBeFalsy();
  });

  it('leaves a session whose results are the laps untouched', () => {
    const sameLength = laps.map((_, i) => ({ interval: i + 1, lactate: i === 3 ? '4.1' : undefined }));
    const out = getChartIntervals({ laps, results: sameLength }, {}, 'bike');
    expect(out[3].lactate).toBe('4.1');
  });
});

describe('which service a row belongs to', () => {
  const garmin = { _id: 'x', source: 'garmin', garminId: '20482044991', laps: [{ lactate: null }] };
  const strava = { _id: 'y', source: 'strava', stravaId: 998877, laps: [{ lactate: null }] };

  test('reads a garmin id off every shape it arrives in', () => {
    expect(resolveGarminNumericId(garmin)).toBe('20482044991');
    expect(resolveGarminNumericId({ id: 'garmin-4242' })).toBe('4242');
    expect(resolveGarminNumericId({ sourceGarminActivityId: 'garmin-77' })).toBe('77');
    expect(resolveGarminNumericId({ source: 'garmin', sourceId: '88' })).toBe('88');
    expect(resolveGarminNumericId(null)).toBe('');
  });

  test('each fetch claims only its own rows', () => {
    expect(needsStravaLapFetch(strava, {})).toBe(true);
    expect(needsStravaLapFetch(garmin, {})).toBe(false);
    expect(needsGarminLapFetch(garmin, {})).toBe(true);
    expect(needsGarminLapFetch(strava, {})).toBe(false);
  });

  test('a row that answers to both is Strava\u2019s, so the two never race', () => {
    const both = { _id: 'z', stravaId: 1, garminId: 2, results: [], laps: [{ lactate: null }] };
    expect(needsStravaLapFetch(both, {})).toBe(true);
    expect(needsGarminLapFetch(both, {})).toBe(false);
  });

  test('getChartIntervals reads the garmin cache for a garmin row', () => {
    const laps = [{ power: 300, durationSeconds: 240 }, { power: 305, durationSeconds: 240 }];
    const out = getChartIntervals(garmin, {}, 'run', { 20482044991: laps });
    expect(out).toHaveLength(2);
    expect(out[0].power).toBe(300);
  });

  test('...and keeps a lactate value the stub lap carried', () => {
    const withLactate = { ...garmin, laps: [{ lactate: 4.2 }, { lactate: null }] };
    const laps = [{ power: 300, durationSeconds: 240 }, { power: 305, durationSeconds: 240 }];
    const out = getChartIntervals(withLactate, {}, 'run', { 20482044991: laps });
    expect(out[0].lactate).toBe(4.2);
  });
});
