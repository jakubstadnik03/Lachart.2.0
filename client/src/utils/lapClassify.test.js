import { classifyLaps } from './lapClassify';

// 10 min warm-up, n × (10 min effort, 2 min jog), 8 min cool-down — the
// bread-and-butter run session.
function threeByTen(workPaceSecPerKm, n = 3) {
  const laps = [{ elapsed_time: 600, distance: 1500 }];
  for (let i = 0; i < n; i++) {
    const p = workPaceSecPerKm + i * 4;
    laps.push({ elapsed_time: 600, distance: Math.round((600 / p) * 1000) });
    if (i < n - 1) laps.push({ elapsed_time: 120, distance: 250 });
  }
  laps.push({ elapsed_time: 480, distance: 1200 });
  return laps;
}

describe('classifyLaps', () => {
  test('two-minute jogs between long efforts are recovery, whatever the effort pace', () => {
    for (const pace of [300, 316, 328, 340]) {
      expect(classifyLaps(threeByTen(pace), 'run')).toEqual([
        'warmup', 'work', 'recovery', 'work', 'recovery', 'work', 'cooldown',
      ]);
    }
  });

  test('a steady ride stays steady; its one soft-pedal is a recovery, not work', () => {
    const laps = [
      { elapsed_time: 900, average_watts: 198 },
      { elapsed_time: 900, average_watts: 202 },
      { elapsed_time: 47, average_watts: 60 },
      { elapsed_time: 900, average_watts: 199 },
      { elapsed_time: 900, average_watts: 201 },
    ];
    expect(classifyLaps(laps, 'bike')).toEqual(['warmup', 'work', 'recovery', 'work', 'cooldown']);
  });

  test('a steady ride without any easy lap is all work between warm-up and cool-down', () => {
    const laps = [198, 202, 199, 201, 200].map((w) => ({ elapsed_time: 900, average_watts: w }));
    expect(classifyLaps(laps, 'bike')).toEqual(['warmup', 'work', 'work', 'work', 'cooldown']);
  });

  test('explicit tags still win', () => {
    const laps = threeByTen(316);
    laps[2].intervalType = 'work';
    expect(classifyLaps(laps, 'run')[2]).toBe('work');
  });
});
