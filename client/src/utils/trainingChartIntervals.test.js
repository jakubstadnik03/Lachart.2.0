import { canChartTraining } from './trainingChartIntervals';

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

  test('null training is not offered', () => {
    expect(canChartTraining(null, {}, 'bike')).toBe(false);
  });
});
