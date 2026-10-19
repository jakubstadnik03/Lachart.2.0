import { avgPaceSecOf, sessionWidthWeights } from './trainingCardSummary';

/**
 * Both of these come from one screenshot of the native Training page: a run
 * whose summary line read "382 W", and a progress chart where one session was
 * twenty hairlines with three dates stacked on top of each other while the
 * rest were drawn at full width.
 */

describe('avgPaceSecOf', () => {
  const pace = (iv) => iv.pace;
  const dur  = (iv) => iv.dur;

  test('weights by time, not by interval count', () => {
    // 10x1km at 3:20 (200s) with ten 60s jogs at 6:00 (360s). By count the
    // mean is 280s — 4:40/km, a pace nobody ran. By time it is far closer to
    // the work, which is what the session was.
    const work = Array.from({ length: 10 }, () => ({ pace: 200, dur: 200 }));
    const rest = Array.from({ length: 10 }, () => ({ pace: 360, dur: 60 }));
    const got = avgPaceSecOf([...work, ...rest], pace, dur);
    expect(got).toBeCloseTo((200 * 200 * 10 + 360 * 60 * 10) / (200 * 10 + 60 * 10), 6);
    expect(got).toBeLessThan(280);
  });

  test('a single interval is its own average', () => {
    expect(avgPaceSecOf([{ pace: 239, dur: 3720 }], pace, dur)).toBe(239);
  });

  test('intervals without a pace are skipped, not counted as zero', () => {
    // Counting them as zero would drag a 3:20 session towards 1:40.
    expect(avgPaceSecOf(
      [{ pace: 200, dur: 100 }, { pace: null, dur: 100 }, { pace: 200, dur: 100 }],
      pace, dur,
    )).toBe(200);
  });

  test('an interval with no duration still counts', () => {
    const got = avgPaceSecOf([{ pace: 200, dur: 0 }, { pace: 400, dur: 0 }], pace, dur);
    expect(got).toBe(300);
  });

  test('nothing to average means nothing to show', () => {
    expect(avgPaceSecOf([], pace, dur)).toBeNull();
    expect(avgPaceSecOf(null, pace, dur)).toBeNull();
    expect(avgPaceSecOf([{ pace: null, dur: 60 }], pace, dur)).toBeNull();
  });
});

describe('sessionWidthWeights', () => {
  const timed = (n, each) => ({ laps: Array.from({ length: n }, () => ({ durationSec: each })) });
  const untimed = (n) => ({ laps: Array.from({ length: n }, () => ({})) });

  test('uses duration when every session has one', () => {
    expect(sessionWidthWeights([timed(10, 300), timed(5, 60)])).toEqual([3000, 300]);
  });

  test('one untimed session makes every session count laps instead', () => {
    // The bug: 10 (laps) summed against 3000 (seconds) gave that session
    // 0.3% of the chart. Weights must never mix the two units.
    const weights = sessionWidthWeights([timed(10, 300), untimed(20)]);
    expect(weights).toEqual([10, 20]);
    const share = weights[1] / (weights[0] + weights[1]);
    expect(share).toBeGreaterThan(0.6);
  });

  test('no session is ever given zero width', () => {
    // A zero weight collapses a cluster to nothing and stacks its date label
    // on its neighbour's.
    expect(sessionWidthWeights([untimed(0), untimed(3)]).every((w) => w > 0)).toBe(true);
  });

  test('empty in, empty out', () => {
    expect(sessionWidthWeights([])).toEqual([]);
    expect(sessionWidthWeights(null)).toEqual([]);
  });
});
