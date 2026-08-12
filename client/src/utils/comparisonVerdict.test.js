import {
  PACE_NOISE,
  assessDifference,
  buildComparisonVerdict,
  efficiencyFor,
  formatMetric,
  noiseFor,
  summarizeSession,
} from './comparisonVerdict';

const session = (dateStr, results) => ({
  _id: `t-${dateStr}`,
  title: '5x5min threshold',
  date: dateStr,
  results,
});

/** Five work intervals with the given per-interval values. */
const intervals = (values, key = 'power') =>
  values.map((v, i) => ({ type: 'work', label: `Interval ${i + 1}`, [key]: v }));

describe('summarizeSession', () => {
  it('ignores warm-up and recovery intervals by default', () => {
    const t = session('2026-08-01', [
      { type: 'warmup', power: 120 },
      { type: 'work', power: 300 },
      { type: 'work', power: 302 },
      { type: 'cooldown', power: 110 },
    ]);
    const s = summarizeSession(t, 'power');
    expect(s.n).toBe(2);
    expect(s.mean).toBe(301);
  });

  it('falls back to every interval when nothing is labelled as work', () => {
    const t = session('2026-08-01', [{ power: 250 }, { power: 260 }]);
    expect(summarizeSession(t, 'power').n).toBe(2);
  });

  it('parses pace strings into seconds', () => {
    const t = session('2026-08-01', [{ type: 'work', power: '4:00' }, { type: 'work', power: '4:10' }]);
    const s = summarizeSession(t, 'power');
    expect(s.values).toEqual([240, 250]);
  });

  it('drops blanks and zeroes rather than counting them as readings', () => {
    const t = session('2026-08-01', [
      { type: 'work', lactate: 2.1 },
      { type: 'work', lactate: null },
      { type: 'work', lactate: '' },
      { type: 'work', lactate: 0 },
    ]);
    expect(summarizeSession(t, 'lactate').n).toBe(1);
  });
});

describe('assessDifference — the confidence line', () => {
  it('calls a sub-instrument lactate difference noise, not progress', () => {
    const a = summarizeSession(session('2026-08-01', intervals([3.0, 3.1, 3.0, 3.1, 3.0], 'lactate')), 'lactate');
    const b = summarizeSession(session('2026-08-08', intervals([2.8, 2.9, 2.8, 2.9, 2.8], 'lactate')), 'lactate');
    const r = assessDifference(a, b, 'lactate');
    // 0.2 mmol lower — below the 0.4 analyser floor.
    expect(r.significant).toBe(false);
    expect(r.limitedBy).toBe('instrument');
    expect(r.confidenceLine).toMatch(/Within measurement error/);
  });

  it('accepts a lactate difference that clears the analyser floor', () => {
    const a = summarizeSession(session('2026-08-01', intervals([4.0, 4.1, 4.0, 4.1, 4.0], 'lactate')), 'lactate');
    const b = summarizeSession(session('2026-08-08', intervals([2.9, 3.0, 2.9, 3.0, 2.9], 'lactate')), 'lactate');
    const r = assessDifference(a, b, 'lactate');
    expect(r.significant).toBe(true);
    expect(r.better).toBe(true); // lower lactate at the same work is better
    expect(r.confidenceLine).toMatch(/Real change/);
  });

  it('refuses to call a difference real when the intervals themselves are all over the place', () => {
    const a = summarizeSession(session('2026-08-01', intervals([200, 320, 240, 300, 260])), 'power');
    const b = summarizeSession(session('2026-08-08', intervals([220, 330, 250, 310, 270])), 'power');
    const r = assessDifference(a, b, 'power');
    // ~+10 W on average, but each session's spread is far wider than that.
    expect(r.significant).toBe(false);
    expect(r.limitedBy).toBe('spread');
    expect(r.confidenceLine).toMatch(/Not distinguishable from noise/);
  });

  it('accepts the same delta when the intervals are consistent', () => {
    const a = summarizeSession(session('2026-08-01', intervals([280, 281, 280, 279, 280])), 'power');
    const b = summarizeSession(session('2026-08-08', intervals([300, 301, 300, 299, 300])), 'power');
    const r = assessDifference(a, b, 'power');
    expect(r.significant).toBe(true);
    expect(r.better).toBe(true);
  });

  it('knows which direction is good for each metric', () => {
    expect(noiseFor('power').higherIsBetter).toBe(true);
    expect(noiseFor('lactate').higherIsBetter).toBe(false);
    expect(noiseFor('heartRate').higherIsBetter).toBe(false);
  });

  it('reports incomparable sessions instead of inventing a delta', () => {
    const a = summarizeSession(session('2026-08-01', []), 'power');
    const b = summarizeSession(session('2026-08-08', intervals([300, 300])), 'power');
    expect(assessDifference(a, b, 'power').comparable).toBe(false);
  });
});

describe('efficiency', () => {
  it('is output per heartbeat', () => {
    const t = session('2026-08-01', [
      { type: 'work', power: 300, heartRate: 150 },
      { type: 'work', power: 300, heartRate: 150 },
    ]);
    expect(efficiencyFor(t)).toBeCloseTo(2, 5);
  });

  it('is null without both numbers', () => {
    expect(efficiencyFor(session('2026-08-01', [{ type: 'work', power: 300 }]))).toBeNull();
  });
});

describe('buildComparisonVerdict', () => {
  const improving = [
    session('2026-07-01', intervals([270, 271, 269, 270, 270])),
    session('2026-07-08', intervals([280, 281, 279, 280, 280])),
    session('2026-07-15', intervals([290, 291, 289, 290, 290])),
    session('2026-07-22', intervals([300, 301, 299, 300, 300])),
  ];

  it('needs at least two sessions', () => {
    expect(buildComparisonVerdict([improving[0]], 'power')).toBeNull();
  });

  it('leads with the change against last time', () => {
    const v = buildComparisonVerdict(improving, 'power');
    expect(v.vsPrevious.significant).toBe(true);
    expect(v.headline.tone).toBe('good');
    expect(v.headline.verdict).toMatch(/Best yet/);
  });

  it('compares the best against everything except the latest session', () => {
    const v = buildComparisonVerdict(improving, 'power');
    expect(v.best.mean).toBeCloseTo(290, 5);
    expect(v.latest.mean).toBeCloseTo(300, 5);
  });

  it('says "no measurable change" rather than reporting a tiny delta', () => {
    const flat = [
      session('2026-07-01', intervals([280, 280, 280, 280, 280])),
      session('2026-07-08', intervals([281, 281, 281, 281, 281])),
    ];
    const v = buildComparisonVerdict(flat, 'power');
    expect(v.vsPrevious.significant).toBe(false);
    expect(v.headline.verdict).toBe('No measurable change');
    expect(v.headline.tone).toBe('neutral');
  });

  it('projects one session forward, no further', () => {
    const v = buildComparisonVerdict(improving, 'power');
    expect(v.projection.direction).toBe('improving');
    expect(v.projection.next).toBeCloseTo(310, 0);
    expect(v.projection.basedOn).toBe(4);
  });

  it('tracks efficiency when both power and heart rate are present', () => {
    const withHr = [
      session('2026-07-01', [{ type: 'work', power: 280, heartRate: 155 }, { type: 'work', power: 280, heartRate: 155 }]),
      session('2026-07-08', [{ type: 'work', power: 285, heartRate: 153 }, { type: 'work', power: 285, heartRate: 153 }]),
      session('2026-07-15', [{ type: 'work', power: 290, heartRate: 151 }, { type: 'work', power: 290, heartRate: 151 }]),
    ];
    const v = buildComparisonVerdict(withHr, 'power');
    expect(v.efficiency).not.toBeNull();
    expect(v.efficiency.direction).toBe('improving');
    expect(v.efficiency.n).toBe(3);
  });

  it('leaves efficiency out when heart rate is missing', () => {
    expect(buildComparisonVerdict(improving, 'power').efficiency).toBeNull();
  });
});

describe('Strava laps and other interval shapes', () => {
  const lapSession = (date, watts) => ({
    _id: `s-${date}`,
    date,
    laps: watts.map((w) => ({ name: 'Lap 1', average_watts: w, average_heartrate: 150 })),
  });

  it('reads intervals from laps when there are no results', () => {
    const s = summarizeSession(lapSession('2026-07-01', [280, 282, 281]), 'power');
    expect(s.n).toBe(3);
    expect(s.mean).toBeCloseTo(281, 5);
  });

  it('accepts intervals supplied by the caller', () => {
    // The native page merges Strava laps from its own cache; the training
    // document itself has nothing usable on it.
    const bare = { _id: 'x', date: '2026-07-01' };
    const s = summarizeSession(bare, 'power', {
      intervals: [{ average_watts: 300 }, { average_watts: 302 }],
    });
    expect(s.n).toBe(2);
    expect(s.mean).toBe(301);
  });

  it('builds a verdict from lap-shaped sessions', () => {
    const v = buildComparisonVerdict(
      [lapSession('2026-07-01', [270, 271, 269]), lapSession('2026-07-08', [300, 301, 299])],
      'power',
    );
    expect(v).not.toBeNull();
    expect(v.vsPrevious.significant).toBe(true);
    expect(v.headline.tone).toBe('good');
  });
});

describe('pace — where lower is better', () => {
  // Run/swim store pace (seconds) in the `power` slot. Treating it as watts
  // would congratulate a runner for slowing down.
  const paceSession = (date, secs) => ({
    _id: `p-${date}`,
    date,
    results: secs.map((s) => ({ type: 'work', power: s })),
  });

  const faster = [
    paceSession('2026-07-01', [255, 256, 254]),
    paceSession('2026-07-08', [240, 241, 239]),
  ];

  it('calls getting faster an improvement', () => {
    const v = buildComparisonVerdict(faster, 'power', { noise: PACE_NOISE });
    expect(v.vsPrevious.significant).toBe(true);
    expect(v.vsPrevious.better).toBe(true);
    expect(v.headline.tone).toBe('good');
  });

  it('would call the same sessions a decline without the override', () => {
    // Guards the regression this override exists to prevent.
    const v = buildComparisonVerdict(faster, 'power');
    expect(v.vsPrevious.better).toBe(false);
    expect(v.headline.tone).toBe('bad');
  });

  it('calls it pace, not power, in the headline', () => {
    const v = buildComparisonVerdict(faster, 'power', { noise: PACE_NOISE });
    expect(v.headline.verdict).toMatch(/pace/i);
    expect(v.headline.verdict).not.toMatch(/power/i);
  });

  it('formats pace as m:ss rather than a raw second count', () => {
    expect(formatMetric(255, 'power', PACE_NOISE)).toBe('4:15');
    expect(formatMetric(15, 'power', PACE_NOISE)).toBe('0:15');
    expect(formatMetric(255, 'power')).toBe('255 W');
  });

  it('ignores a pace difference smaller than GPS error', () => {
    const v = buildComparisonVerdict(
      [paceSession('2026-07-01', [240, 240, 240]), paceSession('2026-07-08', [239, 239, 239])],
      'power',
      { noise: PACE_NOISE },
    );
    expect(v.vsPrevious.significant).toBe(false);
    expect(v.headline.verdict).toBe('No measurable change');
  });

  it('still knows watts are watts', () => {
    expect(noiseFor('power').higherIsBetter).toBe(true);
    expect(noiseFor('power', PACE_NOISE).higherIsBetter).toBe(false);
  });
});
