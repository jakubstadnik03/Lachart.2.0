/**
 * The radar has bike and run axes and nothing else. Showing the bike radar
 * above a list of swims is worse than showing no radar at all.
 */
import { RADAR_SPORTS, hasRadar, resolveRadarSport } from './radarSport';

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
