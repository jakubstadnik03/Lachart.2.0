import { lapDetailStats } from './lapDetailStats';

const map = (lap, opts) => Object.fromEntries(lapDetailStats(lap, opts));

describe('lapDetailStats', () => {
  const stravaBikeLap = {
    moving_time: 1501, distance: 18910,
    average_watts: 355, max_watts: 776,
    average_heartrate: 150, max_heartrate: 161,
    average_cadence: 80, average_speed: 12.6,
    total_elevation_gain: 88,
  };

  it('reads a Strava ride lap', () => {
    const s = map(stravaBikeLap, { movingSecs: 1501, sport: 'Ride', isStravaActivity: true });
    expect(s.speed).toBe('45.4 km/h');
    expect(s.max).toBe('776 W');
    expect(s.HR).toBe('150 / 161 bpm');
    expect(s.cad).toBe('80 rpm');
    expect(s.elev).toBe('88 m');
  });

  it('omits normalized power when the file has none', () => {
    expect(map(stravaBikeLap, { movingSecs: 1501, sport: 'Ride' }).NP).toBeUndefined();
  });

  it('reads NP, IF and lap TSS off a FIT lap', () => {
    const s = map({
      totalDistance: 18910, avgPower: 355, normalizedPower: 372,
      intensityFactor: 0.87, trainingStressScore: 41, avgSpeed: 12.6,
    }, { movingSecs: 1501, sport: 'cycling' });
    expect(s.NP).toBe('372 W');
    expect(s.IF).toBe('0.87');
    expect(s.TSS).toBe('41');
  });

  it('falls back to distance over moving time when speed is absent', () => {
    const s = map({ distance: 10000 }, { movingSecs: 1000, sport: 'Ride' });
    expect(s.speed).toBe('36.0 km/h');
  });

  it('doubles Strava run cadence and labels it spm', () => {
    const lap = { distance: 1000, moving_time: 300, average_cadence: 86, average_speed: 3.33 };
    expect(map(lap, { movingSecs: 300, sport: 'Run', isStravaActivity: true, isRun: true }).cad)
      .toBe('172 spm');
    expect(map(lap, { movingSecs: 300, sport: 'Run', isRun: true }).cad).toBe('86 spm');
  });

  it('leaves speed off a run and a swim — the headline already reads as pace', () => {
    expect(map(stravaBikeLap, { movingSecs: 1501, isRun: true }).speed).toBeUndefined();
    expect(map(stravaBikeLap, { movingSecs: 1501, isSwim: true }).speed).toBeUndefined();
  });

  it('shows a single heart rate when there is no max', () => {
    expect(map({ average_heartrate: 142 }, { movingSecs: 60, isRun: true }).HR).toBe('142 bpm');
  });

  it('shows lactate when the lap carries it', () => {
    expect(map({ lactate: 3.4 }, { movingSecs: 60, isRun: true }).La).toBe('3.4 mmol');
    expect(map({ lactate: 0 }, { movingSecs: 60, isRun: true }).La).toBeUndefined();
  });

  it('converts for imperial', () => {
    const s = map(stravaBikeLap, { movingSecs: 1501, sport: 'Ride', unitSystem: 'imperial' });
    expect(s.speed).toBe('28.2 mph');
    expect(s.elev).toBe('289 ft');
  });

  it('returns nothing for a lap with no data, and for no lap at all', () => {
    expect(lapDetailStats(null, {})).toEqual([]);
    expect(lapDetailStats({}, { isRun: true })).toEqual([]);
  });
});
