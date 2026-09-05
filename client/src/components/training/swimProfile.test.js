import { activityProfileBars } from './WorkoutProfile';

/**
 * A pool session: 800m warm-up, 8x100 fast off the wall, 500m down. The rests
 * cover no distance at all, which is what a rest in a pool is.
 */
const SWIM = {
  sport: 'Swim',
  lapProfile: [
    { d: 762, m: 800, s: 1.05 },
    ...Array.from({ length: 8 }, () => ([
      { d: 69, m: 100, s: 1.45 },
      { d: 30, m: 0 },
    ])).flat(),
    { d: 454, m: 500, s: 1.10 },
  ],
};

const share = (bars, test) => bars.filter(test).length / bars.length;

describe('a swim thumbnail', () => {
  it('draws it at all', () => {
    // The channel picker counted laps, and half a pool set is rests carrying
    // no speed — so this session failed the threshold and drew nothing. It
    // counts seconds now: a 30s wall against a 69s repeat.
    expect(activityProfileBars(SWIM, 100)).not.toBeNull();
  });

  it('sizes each part by its distance, the way the lap chart does', () => {
    const bars = activityProfileBars(SWIM, 100);
    // 800m warm-up, 800m of repeats, 500m down — 38% / 38% / 24% of 2100m.
    // Read in time instead, the rests alone would take a sixth of the width.
    expect(share(bars, (v) => v > 0.9)).toBeGreaterThan(0.3);
    expect(share(bars, (v) => v > 0.9)).toBeLessThan(0.45);
  });

  it('does not let one lap flatten the rest', () => {
    // A single freak length twice as fast as anything else used to take the top
    // of the scale and squash every real repeat onto the floor.
    const withOutlier = {
      ...SWIM,
      lapProfile: SWIM.lapProfile.map((l, i) => (i === 3 ? { ...l, s: 2.9 } : l)),
    };
    const bars = activityProfileBars(withOutlier, 100);
    expect(share(bars, (v) => v > 0.9)).toBeGreaterThan(0.25);
  });

  it('keeps a rest to a hairline rather than dropping the whole session to time', () => {
    // Requiring every lap to carry distance sent the session back to being read
    // in time. Half its laps have none; it must still be read in distance.
    const byTime = activityProfileBars({ ...SWIM, sport: 'Ride' }, 100);
    expect(JSON.stringify(activityProfileBars(SWIM, 100))).not.toBe(JSON.stringify(byTime));
  });
});
