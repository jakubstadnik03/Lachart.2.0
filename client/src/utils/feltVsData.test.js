import {
  assessFeltTrend,
  assessFeltVsData,
  borgToRpe,
  expectedRpe,
  intensityFactorFor,
  rpeToBorg,
} from './feltVsData';

const PROFILE = {
  ftp: 280,
  powerZones: { cycling: { ftp: 280, lt2: 280 } },
  heartRateZones: { cycling: { lt2: 165, zone4: { min: 165 } } },
};

const ride = (over = {}) => ({
  id: 'r1',
  sport: 'bike',
  avgPower: 200,
  totalTime: 3600,
  ...over,
});

describe('scale conversion', () => {
  it('round-trips the ends of the Borg scale', () => {
    expect(rpeToBorg(1)).toBe(6);
    expect(rpeToBorg(10)).toBe(20);
    expect(borgToRpe(6)).toBe(1);
    expect(borgToRpe(20)).toBe(10);
  });

  it('lands mid-scale where a coach would expect', () => {
    expect(rpeToBorg(5)).toBe(12); // "somewhat hard" on Borg
    expect(borgToRpe(13)).toBe(6);
  });
});

describe('intensity factor', () => {
  it('prefers power against threshold', () => {
    expect(intensityFactorFor(ride({ avgPower: 280 }), PROFILE)).toBeCloseTo(1, 5);
    expect(intensityFactorFor(ride({ avgPower: 196 }), PROFILE)).toBeCloseTo(0.7, 5);
  });

  it('uses normalized power when it is there', () => {
    expect(intensityFactorFor(ride({ avgPower: 200, normalizedPower: 252 }), PROFILE)).toBeCloseTo(0.9, 5);
  });

  it('rescales heart rate, which sits in a much narrower band than power', () => {
    // 165 bpm is threshold → IF 1.0. A 70%-of-threshold HR must not read as IF 0.7.
    expect(intensityFactorFor({ avgHeartRate: 165 }, PROFILE)).toBeCloseTo(1, 2);
    const easy = intensityFactorFor({ avgHeartRate: 125 }, PROFILE);
    expect(easy).toBeGreaterThan(0.4);
    expect(easy).toBeLessThan(0.7);
  });

  it('is null with nothing to divide by', () => {
    expect(intensityFactorFor(ride({ avgPower: 0 }), {})).toBeNull();
    expect(intensityFactorFor(null, PROFILE)).toBeNull();
  });
});

describe('expected RPE', () => {
  it('places the anchors where an athlete would recognise them', () => {
    const recovery = expectedRpe(ride({ avgPower: 140 }), PROFILE);   // IF 0.50
    const endurance = expectedRpe(ride({ avgPower: 196 }), PROFILE);  // IF 0.70
    const threshold = expectedRpe(ride({ avgPower: 280 }), PROFILE);  // IF 1.00
    expect(recovery).toBeGreaterThan(1);
    expect(recovery).toBeLessThan(4);
    expect(endurance).toBeGreaterThan(recovery);
    expect(endurance).toBeLessThan(6);
    expect(threshold).toBeGreaterThan(7);
  });

  it('rises more steeply above threshold than below it', () => {
    const belowStep = expectedRpe(ride({ avgPower: 224 }), PROFILE) - expectedRpe(ride({ avgPower: 196 }), PROFILE);
    const aboveStep = expectedRpe(ride({ avgPower: 308 }), PROFILE) - expectedRpe(ride({ avgPower: 280 }), PROFILE);
    expect(aboveStep).toBeGreaterThan(belowStep);
  });

  it('drifts up with duration — three hours easy is not one hour easy', () => {
    const oneHour = expectedRpe(ride({ avgPower: 196, totalTime: 3600 }), PROFILE);
    const threeHours = expectedRpe(ride({ avgPower: 196, totalTime: 3 * 3600 }), PROFILE);
    expect(threeHours).toBeGreaterThan(oneHour);
    expect(threeHours - oneHour).toBeLessThanOrEqual(2);
  });

  it('never leaves the 1–10 scale', () => {
    expect(expectedRpe(ride({ avgPower: 20 }), PROFILE)).toBeGreaterThanOrEqual(1);
    expect(expectedRpe(ride({ avgPower: 600, totalTime: 6 * 3600 }), PROFILE)).toBeLessThanOrEqual(10);
  });
});

describe('felt vs data', () => {
  it('is null without an RPE — the whole point is the comparison', () => {
    expect(assessFeltVsData(ride(), PROFILE)).toBeNull();
    expect(assessFeltVsData(ride({ rpe: 0 }), PROFILE)).toBeNull();
  });

  it('flags an easy session that felt brutal', () => {
    const r = assessFeltVsData(ride({ avgPower: 150, rpe: 8 }), PROFILE);
    expect(r.direction).toBe('harder');
    expect(r.gap).toBeGreaterThan(1.5);
    expect(r.verdict).toBe('Felt harder than it was');
  });

  it('celebrates a hard session that felt manageable', () => {
    const r = assessFeltVsData(ride({ avgPower: 280, rpe: 5 }), PROFILE);
    expect(r.direction).toBe('easier');
    expect(r.note).toMatch(/costing you less/);
  });

  it('says nothing dramatic when perception matches the numbers', () => {
    const expected = expectedRpe(ride({ avgPower: 250 }), PROFILE);
    const r = assessFeltVsData(ride({ avgPower: 250, rpe: Math.round(expected) }), PROFILE);
    expect(r.direction).toBe('matched');
    expect(r.verdict).toBe('As expected');
  });

  it('still records the RPE when there is nothing to compare against', () => {
    const r = assessFeltVsData({ rpe: 7 }, {});
    expect(r.rpe).toBe(7);
    expect(r.expected).toBeNull();
    expect(r.direction).toBe('unknown');
  });

  it('reads the RPE under either field name', () => {
    expect(assessFeltVsData(ride({ RPE: 6 }), PROFILE).rpe).toBe(6);
  });
});

describe('felt trend', () => {
  const hardFeeling = (n) =>
    Array.from({ length: n }, (_, i) => ride({ id: `h${i}`, avgPower: 150, rpe: 8 }));

  it('waits for enough sessions before calling anything a pattern', () => {
    const t = assessFeltTrend(hardFeeling(2), PROFILE);
    expect(t.enough).toBe(false);
    expect(t.needed).toBe(4);
  });

  it('flags a run of sessions feeling harder than the numbers', () => {
    const t = assessFeltTrend(hardFeeling(5), PROFILE);
    expect(t.enough).toBe(true);
    expect(t.drifting).toBe(true);
    expect(t.message).toMatch(/before resting heart rate/);
  });

  it('does not call one bad day a pattern', () => {
    const sessions = [
      ...Array.from({ length: 4 }, (_, i) => ride({ id: `ok${i}`, avgPower: 250, rpe: 6 })),
      ride({ id: 'bad', avgPower: 150, rpe: 9 }),
    ];
    expect(assessFeltTrend(sessions, PROFILE).drifting).toBe(false);
  });

  it('recognises fitness arriving', () => {
    const easy = Array.from({ length: 5 }, (_, i) => ride({ id: `e${i}`, avgPower: 280, rpe: 5 }));
    const t = assessFeltTrend(easy, PROFILE);
    expect(t.drifting).toBe(false);
    expect(t.message).toMatch(/fitness arriving/);
  });

  it('ignores sessions with no RPE rather than counting them as zero', () => {
    const mixed = [...hardFeeling(4), ride({ id: 'x' }), ride({ id: 'y' })];
    expect(assessFeltTrend(mixed, PROFILE).n).toBe(4);
  });
});
