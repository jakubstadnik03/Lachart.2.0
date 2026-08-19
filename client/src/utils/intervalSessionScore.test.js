import {
  scoreIntervalSession,
  looksLikeIntervalSession,
  intervalSignalsFromActivity,
  LIKELY_TEST_SCORE,
  LIKELY_INTERVALS_SCORE,
} from './intervalSessionScore';

describe('scoreIntervalSession', () => {
  test('a named lactate test with structured laps scores as a likely test', () => {
    const { score } = scoreIntervalSession({
      name: 'Lactate test bike', lapCount: 8, lapDurationCv: 0.05, avgHr: 168, avgWatts: 240,
    });
    expect(score).toBeGreaterThanOrEqual(LIKELY_TEST_SCORE);
  });

  test('a plain steady ride scores below the intervals threshold', () => {
    const { score } = scoreIntervalSession({
      name: 'Morning Ride', lapCount: 1, lapDurationCv: null, avgHr: 128, avgWatts: 150,
    });
    expect(score).toBeLessThan(LIKELY_INTERVALS_SCORE);
  });

  test('regular lap durations are what separate intervals from an easy spin', () => {
    const base = { name: 'Afternoon Ride', lapCount: 6, avgHr: 140, avgWatts: 170 };
    const structured = scoreIntervalSession({ ...base, lapDurationCv: 0.05 }).score;
    const ragged = scoreIntervalSession({ ...base, lapDurationCv: 0.9 }).score;
    expect(structured).toBeGreaterThan(ragged);
  });

  test('reports the signals it used', () => {
    const { signals } = scoreIntervalSession({
      name: '4x8min intervals', lapCount: 9, lapDurationCv: 0.04, avgHr: 170,
    });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.length).toBeLessThanOrEqual(3);
  });

  test('missing fields do not throw', () => {
    expect(() => scoreIntervalSession({})).not.toThrow();
    expect(scoreIntervalSession({}).score).toBe(0);
  });
});

describe('intervalSignalsFromActivity', () => {
  test('reads the integrations-list shape', () => {
    const s = intervalSignalsFromActivity({
      name: 'Intervals', lapCount: 6, lapDurationCv: 0.1, averageHeartRate: 160, averagePower: 250,
    });
    expect(s).toMatchObject({ lapCount: 6, avgHr: 160, avgWatts: 250 });
  });

  test('falls back to counting laps when lapCount is absent', () => {
    expect(intervalSignalsFromActivity({ laps: [{}, {}, {}] }).lapCount).toBe(3);
  });

  test('handles a null activity', () => {
    expect(intervalSignalsFromActivity(null).lapCount).toBe(0);
  });
});

describe('looksLikeIntervalSession', () => {
  test('admits a structured interval session', () => {
    expect(looksLikeIntervalSession({
      name: '5x5min LT2', lapCount: 11, lapDurationCv: 0.06, averageHeartRate: 165,
    })).toBe(true);
  });

  test('rejects a long steady ride', () => {
    expect(looksLikeIntervalSession({
      name: 'Morning Ride', lapCount: 2, lapDurationCv: 0.8, averageHeartRate: 120,
    })).toBe(false);
  });

  test('rejects a single-lap activity however it is named', () => {
    expect(looksLikeIntervalSession({
      name: 'Lactate intervals test', lapCount: 1, avgHr: 175, avgWatts: 300,
    })).toBe(false);
  });
});
