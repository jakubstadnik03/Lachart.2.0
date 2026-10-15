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

/** The share of the chart's width taken by bars matching `test`. */
const share = (bars, test) => bars.filter(test).reduce((sum, b) => sum + b.w, 0);

describe('a swim thumbnail', () => {
  it('draws it at all', () => {
    // The channel picker counted laps, and half a pool set is rests carrying
    // no speed — so this session failed the threshold and drew nothing. It
    // counts seconds now: a 30s wall against a 69s repeat.
    expect(activityProfileBars(SWIM)).not.toBeNull();
  });

  it('sizes each part by its time, the way the opened lap chart does', () => {
    const bars = activityProfileBars(SWIM);
    // The eight fast hundreds are 69s each. Against a 762s warm-up and a 454s
    // swim-down they are about 30% of the clock — the same share the activity
    // chart gives them. Distance would have made them 38%.
    expect(share(bars, (b) => b.h > 0.9)).toBeGreaterThan(0.25);
    expect(share(bars, (b) => b.h > 0.9)).toBeLessThan(0.36);
  });

  it('does not let one lap flatten the rest', () => {
    // A single freak length twice as fast as anything else used to take the top
    // of the scale and squash every real repeat onto the floor.
    const withOutlier = {
      ...SWIM,
      lapProfile: SWIM.lapProfile.map((l, i) => (i === 3 ? { ...l, s: 2.9 } : l)),
    };
    const bars = activityProfileBars(withOutlier);
    expect(share(bars, (b) => b.h > 0.9)).toBeGreaterThan(0.25);
  });

  it('draws a pool rest as a fraction of its time, not as a full lap', () => {
    // A ride has no rest-shrink, so the same numbers read wider on the walls.
    // The swim must stay narrower there — that is the 0.35 the activity chart uses.
    const asRide = activityProfileBars({ ...SWIM, sport: 'Ride' });
    const swim = activityProfileBars(SWIM);
    const restShare = (bars) => share(bars, (b) => b.h < 0.2);
    expect(restShare(swim)).toBeGreaterThan(0);
    expect(restShare(swim)).toBeLessThan(restShare(asRide));
  });
});
