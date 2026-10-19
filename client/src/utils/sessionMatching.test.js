import {
  isGenericTitle, normalizeTitle, describeStructure, sessionGroup,
} from './sessionMatching';

/**
 * The Training history card charts "the same workout" over time. It decided
 * sameness by comparing raw title strings, which split one session across two
 * groups whenever it was retyped, and merged every provider-named activity
 * into one — of 82 interval sessions on the account that reported this, 73
 * carried a name nobody chose.
 */

const km = (n, count, type = 'work') =>
  Array.from({ length: count }, () => ({ distance: n, intervalType: type }));

describe('titles nobody chose', () => {
  test('Strava time-of-day names, English and Czech', () => {
    ['Evening Run', 'Morning Ride', 'Lunch Swim', 'Afternoon Walk',
     'Ranní běh', 'Večerní jízda'].forEach((t) => {
      expect(isGenericTitle(t)).toBe(true);
    });
  });

  test('bare sport names and empty titles', () => {
    ['Running', 'Cycling', 'Pool Swim', 'Untitled', '', '   ', null]
      .forEach((t) => expect(isGenericTitle(t)).toBe(true));
  });

  test('a name the athlete wrote is not generic, even if it contains one', () => {
    ['10x1km LT2', 'Evening Run 10x1km', 'Run RP', 'LT2 test', 'Long run 30k']
      .forEach((t) => expect(isGenericTitle(t)).toBe(false));
  });
});

describe('normalizeTitle', () => {
  test('the multiplication sign and plain x are the same session', () => {
    expect(normalizeTitle('10×1km LT2')).toBe(normalizeTitle('10x1km LT2'));
  });

  test('case, spacing and trailing punctuation do not split a group', () => {
    const want = normalizeTitle('10x1km LT2');
    ['10X1KM LT2', '  10x1km   LT2  ', '10x1km LT2.', '10x1km-LT2']
      .forEach((t) => expect(normalizeTitle(t)).toBe(want));
  });

  test('diacritics survive being typed either way', () => {
    expect(normalizeTitle('Tempo běh')).toBe(normalizeTitle('Tempo beh'));
  });

  test('different workouts stay different', () => {
    expect(normalizeTitle('10x1km LT2')).not.toBe(normalizeTitle('5x2km LT2'));
    expect(normalizeTitle('10x1km LT1')).not.toBe(normalizeTitle('10x1km LT2'));
  });
});

describe('describeStructure', () => {
  test('measures by distance when every work interval has one', () => {
    expect(describeStructure('run', km(1000, 10))).toEqual({
      key: 'run|10|d1000', label: '10×1km',
    });
  });

  test('two runnings of the same session land in the same bucket', () => {
    // 1000 m and 1040 m are the same kilometre repeat, not two workouts.
    const a = describeStructure('run', km(1000, 10));
    const b = describeStructure('run', km(1040, 10));
    expect(b.key).toBe(a.key);
  });

  test('a different session does not', () => {
    expect(describeStructure('run', km(2000, 5)).key)
      .not.toBe(describeStructure('run', km(1000, 10)).key);
  });

  test('warm-up and recovery laps are not the workout', () => {
    const session = [
      { distance: 3000, intervalType: 'warmup' },
      ...km(1000, 10),
      { distance: 2000, intervalType: 'cooldown' },
    ];
    expect(describeStructure('run', session).label).toBe('10×1km');
  });

  test('one mis-split lap does not move the median', () => {
    const laps = [...km(1000, 9), { distance: 60, intervalType: 'work' }];
    expect(describeStructure('run', laps).key).toBe('run|10|d1000');
  });

  test('falls back to time when distances are missing', () => {
    const laps = Array.from({ length: 5 }, () => ({ durationSec: 300, intervalType: 'work' }));
    expect(describeStructure('bike', laps)).toEqual({ key: 'bike|5|t300', label: '5×5min' });
  });

  test('nothing to measure, nothing to claim', () => {
    expect(describeStructure('run', [])).toBeNull();
    expect(describeStructure('run', null)).toBeNull();
  });
});

describe('sessionGroup', () => {
  const run10x1 = { intervals: km(1000, 10), sport: 'run' };

  test('a chosen name groups two spellings of one workout', () => {
    const a = sessionGroup({ title: '10x1km LT2' }, run10x1);
    const b = sessionGroup({ title: '10×1km LT2' }, run10x1);
    expect(b.key).toBe(a.key);
  });

  test('and keeps the name readable', () => {
    expect(sessionGroup({ title: '10x1km LT2' }, run10x1).label).toBe('10x1km LT2');
  });

  test('two Evening Runs of the same shape are the same training', () => {
    const a = sessionGroup({ title: 'Evening Run', _id: 'a' }, run10x1);
    const b = sessionGroup({ title: 'Evening Run', _id: 'b' }, run10x1);
    expect(b.key).toBe(a.key);
    expect(a.label).toBe('Evening Run (10×1km)');
  });

  test('an Evening Run of a different shape is not', () => {
    // The bug this card was built to avoid: an easy jog charted against a
    // tempo because Strava named them both.
    const tempo = sessionGroup({ title: 'Evening Run', _id: 'a' }, run10x1);
    const jog = sessionGroup(
      { title: 'Evening Run', _id: 'b' },
      { sport: 'run', intervals: [{ distance: 12000, intervalType: 'work' }] },
    );
    expect(jog.key).not.toBe(tempo.key);
  });

  test('a chosen name beats a matching shape', () => {
    // Someone who names their sessions means it; two different names are two
    // different workouts even when they happen to be cut the same way.
    const lt2 = sessionGroup({ title: '10x1km LT2' }, run10x1);
    const lt1 = sessionGroup({ title: '10x1km LT1' }, run10x1);
    expect(lt1.key).not.toBe(lt2.key);
  });

  test('a provider-named session with nothing to measure stands alone', () => {
    const a = sessionGroup({ title: 'Evening Run', _id: 'a' }, { sport: 'run', intervals: [] });
    const b = sessionGroup({ title: 'Evening Run', _id: 'b' }, { sport: 'run', intervals: [] });
    expect(b.key).not.toBe(a.key);
    expect(a.label).toBe('Evening Run');
  });
});
