import { activityProfileBars, activityLactateMarks } from './WorkoutProfile';

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

/** How much of the chart's width is taken by bars in a height band. */
const widthIn = (bars, lo, hi) =>
  bars.filter((b) => b.h >= lo && b.h < hi).reduce((s, b) => s + b.w, 0);

describe('activityProfileBars', () => {
  it('draws one bar per lap, not a fixed number of samples', () => {
    const bars = activityProfileBars(LUNCH_RUN);
    expect(bars).toHaveLength(LUNCH_RUN.lapProfile.length);
    // The widths are shares of the session and add up to it.
    expect(bars.reduce((s, b) => s + b.w, 0)).toBeCloseTo(1, 6);
  });

  it('gives a run lap the width of its distance, not its duration', () => {
    const bars = activityProfileBars(LUNCH_RUN);

    // The two floats are 189m and 183m of a 9.47km run — 3.9% of it together.
    // Measured in time they are 9.7%, which is what used to be drawn: every
    // recovery came out twice the width it has on the lap chart below the card.
    expect(widthIn(bars, 0, 0.1)).toBeGreaterThan(0.02);
    expect(widthIn(bars, 0, 0.1)).toBeLessThan(0.06);

    // The four reps are 4.91km of the 9.47km — about half the picture.
    const reps = widthIn(bars, 0.9, 1.01);
    expect(reps).toBeGreaterThan(0.44);
    expect(reps).toBeLessThan(0.58);

    // The 2.99km jog home sits between the two and takes about a third.
    const jog = widthIn(bars, 0.45, 0.6);
    expect(jog).toBeGreaterThan(0.28);
    expect(jog).toBeLessThan(0.36);
  });

  it('keeps the reps tall and the floats short', () => {
    const bars = activityProfileBars(LUNCH_RUN);
    expect(Math.max(...bars.map((b) => b.h))).toBeGreaterThan(0.95);
    expect(Math.min(...bars.map((b) => b.h))).toBeLessThan(0.12);
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
    const bars = activityProfileBars(ride);
    // The 25-minute block is two thirds of the ride's time and must dominate,
    // even though the 3-minute effort is the harder one.
    expect(widthIn(bars, 0.9, 1.01)).toBeGreaterThan(0.6);
  });

  it('opens the scale for a set and leaves a steady ride flat', () => {
    // Watts measured from zero drew a 4x20min between 0.52 and 1.00 — half the
    // height spent on power nobody rode, and the set unreadable at card size.
    const intervals = { sport: 'Ride', lapProfile: [] };
    intervals.lapProfile.push({ d: 1200, m: 11000, w: 210 });
    [374, 374, 370, 319].forEach((w, i) => {
      intervals.lapProfile.push({ d: 1200, m: 15400, w });
      intervals.lapProfile.push({ d: 120, m: 1240, w: [192, 179, 277, 150][i] });
    });
    const set = activityProfileBars(intervals).map((b) => b.h);
    expect(Math.min(...set)).toBeLessThan(0.15);

    // ...and lifting that floor unconditionally turned a steady four-hour ride
    // into intervals it never rode. A ride that holds one wattage stays flat.
    const steady = {
      sport: 'Ride',
      lapProfile: Array.from({ length: 24 }, (_, i) => ({ d: 600, m: 5000, w: 205 + Math.round(12 * Math.sin(i)) })),
    };
    const flat = activityProfileBars(steady).map((b) => b.h);
    expect(Math.min(...flat)).toBeGreaterThan(0.7);
  });

  it('falls back to duration when a run has no lap distances', () => {
    const noDist = { sport: 'Run', lapProfile: LUNCH_RUN.lapProfile.map(({ d, s }) => ({ d, s })) };
    expect(activityProfileBars(noDist)).toHaveLength(LUNCH_RUN.lapProfile.length);
  });

  it('needs three laps and a channel before it draws anything', () => {
    expect(activityProfileBars(null)).toBeNull();
    expect(activityProfileBars({ sport: 'Run', laps: [{ d: 10, s: 3 }] })).toBeNull();
    expect(activityProfileBars({ sport: 'Run', laps: [{ d: 10 }, { d: 10 }, { d: 10 }] })).toBeNull();
  });
});

/**
 * A ride the athlete pricked twice: once after the opening block, once after
 * the 25-minute effort. The calendar has to be able to say so on hover, and to
 * say it over the right rep.
 */
const MEASURED_RIDE = {
  sport: 'Ride',
  lapProfile: [
    { d: 600, m: 6200, w: 205 },
    { d: 180, m: 1940, w: 372, l: 4.1 },
    { d: 1500, m: 18910, w: 355, l: 2.8 },
  ],
};

describe('activityLactateMarks', () => {
  it('puts each reading over the lap it was taken against', () => {
    const marks = activityLactateMarks(MEASURED_RIDE);
    expect(marks.map((m) => m.value)).toEqual([4.1, 2.8]);

    // The ride is 2280s of time. The 3-minute effort spans 600–780s, so its
    // midpoint is 690/2280; the 25-minute block spans 780–2280, midpoint
    // 1530/2280. Positions are fractions of the same axis the bars are drawn
    // on, so a badge lands over its own rep whatever the bar count.
    expect(marks[0].pos).toBeCloseTo(690 / 2280, 3);
    expect(marks[1].pos).toBeCloseTo(1530 / 2280, 3);
  });

  it('measures a run in distance, the way its bars are', () => {
    const run = {
      sport: 'Run',
      lapProfile: [
        { d: 300, m: 1000, s: 3.33, l: 2.1 },
        { d: 120, m: 200, s: 1.67 },
        { d: 300, m: 1000, s: 3.33, l: 5.4 },
      ],
    };
    const marks = activityLactateMarks(run);
    // 2200m in total: the first km's midpoint is 500m in, the last km's 1700m.
    expect(marks[0].pos).toBeCloseTo(500 / 2200, 3);
    expect(marks[1].pos).toBeCloseTo(1700 / 2200, 3);
  });

  it('reads the full lap shapes too, not only the list projection', () => {
    const fromLaps = {
      sport: 'Ride',
      laps: [
        { moving_time: 600, average_watts: 205 },
        { moving_time: 180, average_watts: 372, lactate: 4.1 },
        { moving_time: 1500, average_watts: 355 },
      ],
    };
    expect(activityLactateMarks(fromLaps)).toHaveLength(1);
    expect(activityLactateMarks(fromLaps)[0].value).toBe(4.1);
  });

  it('says nothing about a session nobody measured', () => {
    expect(activityLactateMarks(null)).toEqual([]);
    expect(activityLactateMarks({ sport: 'Ride', lapProfile: MEASURED_RIDE.lapProfile.map(({ l, ...rest }) => rest) }))
      .toEqual([]);
    // A zero is the absence of a reading everywhere else in the app, and the
    // list projection only ever sends `l` when it is above zero.
    expect(activityLactateMarks({ sport: 'Ride', lapProfile: [{ d: 60, w: 200, l: 0 }, { d: 60, w: 200 }, { d: 60, w: 200 }] }))
      .toEqual([]);
  });
});
