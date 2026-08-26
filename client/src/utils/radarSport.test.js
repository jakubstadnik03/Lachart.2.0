/**
 * The radar has bike and run axes and nothing else. Showing the bike radar
 * above a list of swims is worse than showing no radar at all.
 */
import { RADAR_SPORTS, dominantRadarSport, hasRadar, resolveRadarSport } from './radarSport';

describe('hasRadar', () => {
  it('knows the two sports it can plot', () => {
    expect(hasRadar('bike')).toBe(true);
    expect(hasRadar('run')).toBe(true);
    expect(RADAR_SPORTS).toEqual(['bike', 'run']);
  });

  it('says no to everything else', () => {
    for (const sport of ['swim', 'all', 'strength', 'other', '', null, undefined]) {
      expect(hasRadar(sport)).toBe(false);
    }
  });

  it('does not care about case', () => {
    expect(hasRadar('Bike')).toBe(true);
    expect(hasRadar('RUN')).toBe(true);
  });
});

describe('resolveRadarSport', () => {
  it('follows the page when the page is filtering by a sport it can draw', () => {
    expect(resolveRadarSport('run', 'bike')).toBe('run');
    expect(resolveRadarSport('bike', 'run')).toBe('bike');
  });

  it('keeps the chart\'s own choice when the page says "all"', () => {
    expect(resolveRadarSport('all', 'run')).toBe('run');
    expect(resolveRadarSport(undefined, 'run')).toBe('run');
  });

  it('ignores a stored value that is no longer a radar sport', () => {
    // Someone's localStorage could hold anything from an older build.
    expect(resolveRadarSport(null, 'swim')).toBe('bike');
    expect(resolveRadarSport(null, 'nonsense')).toBe('bike');
  });

  it('always ends up on a sport it can actually draw', () => {
    for (const [c, s] of [[null, null], ['swim', 'swim'], ['', ''], [undefined, undefined]]) {
      expect(RADAR_SPORTS).toContain(resolveRadarSport(c, s));
    }
  });
});

describe('dominantRadarSport', () => {
  const s = (sport, n) => Array.from({ length: n }, () => ({ sport }));

  it('picks the sport most of the listed sessions are', () => {
    expect(dominantRadarSport([...s('run', 5), ...s('bike', 2)])).toBe('run');
    expect(dominantRadarSport([...s('run', 1), ...s('bike', 4)])).toBe('bike');
  });

  it('ignores sports the radar cannot draw', () => {
    // Ten swims and one run still means the run radar, not no radar.
    expect(dominantRadarSport([...s('swim', 10), ...s('run', 1)])).toBe('run');
  });

  it('falls back when the list has neither', () => {
    expect(dominantRadarSport([...s('swim', 3)], 'run')).toBe('run');
    expect(dominantRadarSport([])).toBe('bike');
    expect(dominantRadarSport(null)).toBe('bike');
  });

  it('breaks a tie towards the bike', () => {
    expect(dominantRadarSport([...s('run', 3), ...s('bike', 3)])).toBe('bike');
  });
});
