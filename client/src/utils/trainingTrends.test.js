import { workLaps, summariseSession, groupTrend, isAutoLapped } from './trainingTrends';

const lap = (secs, num, extra = {}) => ({ secs, num, ...extra });

describe('workLaps', () => {
  it('keeps the reps of a raw interval run and drops warm-up, jogs and cool-down', () => {
    const laps = [lap(900, 300), lap(200, 200), lap(90, 380), lap(200, 198), lap(90, 390), lap(200, 202), lap(600, 310)];
    expect(workLaps(laps, 'run').map((l) => l.num)).toEqual([200, 198, 202]);
  });

  it('trusts intervalType when the session was marked up', () => {
    const laps = [lap(600, 300, { type: 'warmup' }), lap(720, 290, { type: 'work' }), lap(120, 150, { type: 'recovery' }), lap(720, 295, { type: 'work' })];
    expect(workLaps(laps, 'bike').map((l) => l.num)).toEqual([290, 295]);
  });

  it('treats a ride the watch cut every 5 km as one steady effort', () => {
    const laps = [lap(600, 180, { dist: 5000 }), lap(560, 230, { dist: 5000 }), lap(590, 205, { dist: 5000 }), lap(300, 150, { dist: 2400 })];
    expect(isAutoLapped(laps)).toBe(true);
    expect(workLaps(laps, 'bike')).toHaveLength(4);
  });

  it('does not mistake reps with jogs between them for auto-laps', () => {
    const laps = [lap(900, 300, { dist: 3000 }), lap(200, 200, { dist: 1000 }), lap(90, 380, { dist: 240 }), lap(200, 198, { dist: 1000 })];
    expect(isAutoLapped(laps)).toBe(false);
  });

  it('does not count unlabelled laps between labelled reps as work', () => {
    const laps = [lap(900, 330), lap(240, 200, { type: 'work' }), lap(90, 400), lap(240, 202, { type: 'work' }), lap(600, 340)];
    expect(workLaps(laps, 'run').map((l) => l.num)).toEqual([200, 202]);
  });

  it('reads a session with every lap marked work as unmarked', () => {
    const laps = [lap(330, 330, { type: 'work' }), lap(240, 200, { type: 'work' }), lap(90, 400, { type: 'work' }), lap(240, 202, { type: 'work' }), lap(340, 340, { type: 'work' })];
    expect(workLaps(laps, 'run').map((l) => l.num)).toEqual([200, 202]);
  });

  it('does not let a sprint set the work power of a threshold ride', () => {
    const laps = [lap(900, 200), lap(30, 600), lap(600, 300), lap(120, 150), lap(600, 305), lap(600, 190)];
    expect(workLaps(laps, 'bike').map((l) => l.num)).toEqual([300, 305]);
  });

  it('treats one steady lap as all work', () => {
    expect(workLaps([lap(3600, 280)], 'run')).toHaveLength(1);
  });
});

describe('summariseSession', () => {
  it('weights work pace by lap duration and takes the highest lactate', () => {
    const laps = [lap(900, 300), lap(150, 200, { hr: 160 }), lap(90, 380, { la: 2.1 }), lap(450, 204, { hr: 166, la: 3.4 }), lap(600, 310)];
    const s = summariseSession(laps, 'run');
    expect(Math.round(s.value)).toBe(203);
    expect(Math.round(s.hr)).toBe(165);
    expect(s.lactate).toBe(3.4);
  });
});

describe('groupTrend', () => {
  it('calls a run faster when work pace drops by 2 s/km or more', () => {
    const t = groupTrend([{ value: 204, hr: 168 }, { value: 203 }, { value: 199 }, { value: 197, hr: 165 }], 'run');
    expect(t.trend).toBe('better');
    expect(t.delta).toBeCloseTo(-5.5);
  });

  it('calls a ride worse when it loses 4 W or more', () => {
    expect(groupTrend([{ value: 208 }, { value: 207 }, { value: 199 }, { value: 197 }], 'bike').trend).toBe('worse');
  });

  it('counts the same pace at clearly lower heart rate as progress', () => {
    expect(groupTrend([{ value: 280, hr: 150 }, { value: 280, hr: 145 }], 'run').trend).toBe('better');
  });

  it('does not call a slightly slower swim at much lower heart rate a decline', () => {
    expect(groupTrend([{ value: 71, hr: 137 }, { value: 73, hr: 129 }], 'swim').trend).toBe('holding');
  });

  it('has nothing to say about a single session', () => {
    expect(groupTrend([{ value: 200 }], 'run')).toBeNull();
  });
});
