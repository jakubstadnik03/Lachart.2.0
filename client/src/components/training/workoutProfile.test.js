import { activityProfileBars } from './WorkoutProfile';

/**
 * A real session: 4×~1km hard with floats, then a 3km jog home. The card's
 * thumbnail and the opened workout's lap chart have to agree about its shape,
 * which means agreeing about what a lap's width measures.
 */
const LUNCH_RUN = {
  sport: 'Run',
  lapProfile: [
    { d: 286, m: 1490, s: 5.21 },
    { d: 122, m: 189, s: 1.55 },
    { d: 180, m: 971, s: 5.39 },
    { d: 306, m: 743, s: 2.43 },
    { d: 293, m: 1510, s: 5.15 },
    { d: 125, m: 183, s: 1.46 },
    { d: 177, m: 935, s: 5.28 },
    { d: 183, m: 462, s: 2.52 },
    { d: 862, m: 2990, s: 3.47 },
  ],
};

const countIn = (bars, lo, hi) => bars.filter((v) => v >= lo && v < hi).length;

describe('activityProfileBars', () => {
  it('gives a run lap the width of its distance, not its duration', () => {
    const bars = activityProfileBars(LUNCH_RUN, 100);

    // The two floats are 189m and 183m of a 9.47km run — 3.9% of it together,
    // so about four bars in a hundred. Measured in time they are 9.7%, which
    // is what used to be drawn: every recovery came out twice the width it has
    // on the lap chart directly below the card.
    expect(countIn(bars, 0, 0.1)).toBeLessThanOrEqual(6);
    expect(countIn(bars, 0, 0.1)).toBeGreaterThanOrEqual(2);

    // The four reps are 4.91km of the 9.47km — about half the picture.
    const repBars = countIn(bars, 0.9, 1.01);
    expect(repBars).toBeGreaterThan(44);
    expect(repBars).toBeLessThan(58);

    // The 2.99km jog home sits between the two and takes about a third.
    const jog = countIn(bars, 0.45, 0.6);
    expect(jog).toBeGreaterThan(28);
    expect(jog).toBeLessThan(36);
  });

  it('keeps the reps tall and the floats short', () => {
    const bars = activityProfileBars(LUNCH_RUN, 100);
    expect(Math.max(...bars)).toBeGreaterThan(0.95);
    expect(Math.min(...bars)).toBeLessThan(0.12);
  });

  it('reads a ride in time, the way its lap chart does', () => {
    const ride = {
      sport: 'Ride',
      lapProfile: [
        { d: 600, m: 6200, w: 205 },
        { d: 180, m: 1940, w: 372 },
        { d: 1500, m: 18910, w: 355 },
      ],
    };
    const bars = activityProfileBars(ride, 100);
    // The 25-minute block is two thirds of the ride's time and must dominate,
    // even though the 3-minute effort is the harder one.
    const tall = bars.filter((v) => v > 0.9).length / bars.length;
    expect(tall).toBeGreaterThan(0.6);
  });

  it('falls back to duration when a run has no lap distances', () => {
    const noDist = { sport: 'Run', lapProfile: LUNCH_RUN.lapProfile.map(({ d, s }) => ({ d, s })) };
    expect(activityProfileBars(noDist, 100)).toHaveLength(100);
  });

  it('needs three laps and a channel before it draws anything', () => {
    expect(activityProfileBars(null)).toBeNull();
    expect(activityProfileBars({ sport: 'Run', laps: [{ d: 10, s: 3 }] })).toBeNull();
    expect(activityProfileBars({ sport: 'Run', laps: [{ d: 10 }, { d: 10 }, { d: 10 }] })).toBeNull();
  });
});
