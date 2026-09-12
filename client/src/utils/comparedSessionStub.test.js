import { comparedSessionStub } from './comparedSessionStub';

const ride = {
  id: 'strava-19584511803', type: 'strava', sport: 'Ride', date: '2026-08-03T15:12:54.000Z',
  title: 'Bike endurance', category: null, lactate: null,
  distance: 93952.1, duration: 9506, elapsedTime: 9540, avgHr: 137, avgPower: 235.4, normalizedPower: 259,
  laps: [{}, {}],
};

describe('comparedSessionStub', () => {
  test('carries the numbers the list has, under the names the modal reads', () => {
    const s = comparedSessionStub(ride, { sport: 'Ride' });
    expect(s).toMatchObject({
      id: 'strava-19584511803', type: 'strava', title: 'Bike endurance',
      distance: 93952.1, movingTime: 9506, moving_time: 9506, elapsed_time: 9540,
      average_heartrate: 137, average_watts: 235.4, weighted_average_watts: 259,
    });
    expect(s.laps).toHaveLength(2);
  });

  test('a number the list does not have is left out, not written as zero', () => {
    const s = comparedSessionStub({ ...ride, duration: 0, avgHr: 0, avgPower: undefined, normalizedPower: null }, null);
    for (const k of ['movingTime', 'moving_time', 'average_heartrate', 'average_watts', 'weighted_average_watts']) {
      expect(k in s).toBe(false);
    }
    expect(s.elapsed_time).toBe(9540);
  });

  test('falls back to the open session’s sport', () => {
    expect(comparedSessionStub({ ...ride, sport: null }, { sport: 'Run' }).sport).toBe('Run');
  });
});
