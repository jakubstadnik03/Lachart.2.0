import { resolveAvgPace, avgSpeedFrom } from './activityAvgPace';
import { activityPaceOrPowerDisplay } from './unitsConverter';

/**
 * The card shows duration, distance and pace together, so the three have to
 * agree. They stopped agreeing whenever someone corrected a distance by hand:
 * the pace kept being read off the `avgSpeed` the watch recorded against the
 * old distance.
 */
describe('resolveAvgPace', () => {
  test('a corrected distance moves the pace with it', () => {
    // The real case: a 16 km run in 1:02:18 that was showing 4:33/km, which is
    // the pace for the 13.7 km the activity held before the edit.
    const stale = 13700 / 3738; // m/s as the watch left it
    expect(resolveAvgPace({
      sport: 'run', avgSpeed: stale, distance: 16000, durationSec: 3738, unitSystem: 'metric',
    })).toBe('3:54/km');
  });

  test('an untouched activity reads the same either way', () => {
    // avgSpeed is a moving average and the duration here is moving time, so
    // deriving the pace costs nothing when nobody has edited anything.
    const d = 10000, t = 2400;
    expect(resolveAvgPace({ sport: 'run', avgSpeed: d / t, distance: d, durationSec: t }))
      .toBe(resolveAvgPace({ sport: 'run', avgSpeed: d / t, distance: 0, durationSec: 0 }));
  });

  test('falls back to recorded speed when a distance is missing', () => {
    expect(resolveAvgPace({ sport: 'run', avgSpeed: 10000 / 2400, distance: 0, durationSec: 2400 }))
      .toBe('4:00/km');
  });

  test('falls back to recorded speed when a duration is missing', () => {
    expect(resolveAvgPace({ sport: 'run', avgSpeed: 10000 / 2400, distance: 10000, durationSec: 0 }))
      .toBe('4:00/km');
  });

  test('swims are paced per 100 m, not per km', () => {
    const pace = resolveAvgPace({ sport: 'swim', distance: 2000, durationSec: 2400 });
    expect(pace).toContain('100m');
    expect(pace).toContain('2:00');
  });

  test('says nothing for a sport that is not paced', () => {
    expect(resolveAvgPace({ sport: 'bike', avgSpeed: 9, distance: 40000, durationSec: 4444 })).toBeNull();
    expect(resolveAvgPace({ sport: 'strength', distance: 0, durationSec: 3600 })).toBeNull();
  });

  test('nothing to go on means no pace, not a zero', () => {
    expect(resolveAvgPace({ sport: 'run', avgSpeed: 0, distance: 0, durationSec: 0 })).toBeNull();
    expect(resolveAvgPace({})).toBeNull();
  });

  test('imperial reads per mile', () => {
    const pace = resolveAvgPace({
      sport: 'run', distance: 1609.344, durationSec: 420, unitSystem: 'imperial',
    });
    expect(pace).toBe('7:00/mi');
  });
});

describe('avgSpeedFrom', () => {
  test('gives back the speed the edited numbers imply', () => {
    expect(avgSpeedFrom(16000, 3738)).toBeCloseTo(16000 / 3738, 6);
  });

  test('refuses to invent one from a missing value', () => {
    // Writing a zero or an Infinity back onto the activity would be worse than
    // leaving the field alone.
    expect(avgSpeedFrom(0, 3738)).toBeNull();
    expect(avgSpeedFrom(16000, 0)).toBeNull();
    expect(avgSpeedFrom(null, undefined)).toBeNull();
  });

  test('round-trips: the stored speed reproduces the shown pace', () => {
    const speed = avgSpeedFrom(16000, 3738);
    expect(resolveAvgPace({ sport: 'run', avgSpeed: speed, distance: 0, durationSec: 0 }))
      .toBe(resolveAvgPace({ sport: 'run', distance: 16000, durationSec: 3738 }));
  });
});

describe('activityPaceOrPowerDisplay', () => {
  // The native home screen's session line goes through this one, not the
  // resolver, because unitsConverter cannot import it without a cycle. It has
  // to reach the same answer.
  test('an edited distance moves the pace here too', () => {
    const act = {
      sport: 'Run', distance: 16000, movingTime: 3738,
      avgSpeed: 13700 / 3738, // left behind by the watch, from before the edit
    };
    expect(activityPaceOrPowerDisplay(act, { units: { distance: 'km' } })).toBe('3:54/km');
  });

  test('still reads power for a ride', () => {
    expect(activityPaceOrPowerDisplay(
      { sport: 'Ride', distance: 152950, movingTime: 14580, normalizedPower: 317 },
      { units: { distance: 'km' } },
    )).toBe('317 W');
  });

  test('falls back to recorded speed with no distance', () => {
    expect(activityPaceOrPowerDisplay(
      { sport: 'Run', distance: 0, movingTime: 2400, avgSpeed: 10000 / 2400 },
      { units: { distance: 'km' } },
    )).toBe('4:00/km');
  });
});
