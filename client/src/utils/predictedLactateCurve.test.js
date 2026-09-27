import { predictedFromProjection } from './predictedLactateCurve';

/**
 * The home card led with a lactate test from March and was still leading with
 * it in September. The estimate the athlete actually trains against existed all
 * along, on another page. These guard the conversion from one to the other.
 */
const bikeTest = {
  _id: 't1',
  sport: 'bike',
  date: '2026-03-09',
  results: [
    { power: 230, lactate: 1.2, heartRate: 110 },
    { power: 270, lactate: 1.3, heartRate: 125 },
    { power: 310, lactate: 1.6, heartRate: 135 },
    { power: 350, lactate: 2.3, heartRate: 146 },
    { power: 390, lactate: 3.2, heartRate: 155 },
    { power: 430, lactate: 5.1, heartRate: 166 },
    { power: 470, lactate: 8.0, heartRate: 176 },
  ],
  thresholdOverrides: { LTP1: 327, LTP2: 412, LTP1_hr: 135, LTP2_hr: 158 },
};

const last = {
  raw: bikeTest,
  sport: 'bike',
  isPace: false,
  points: bikeTest.results.map((r) => ({ x: r.power, y: r.lactate, hr: r.heartRate })),
  ltp1: { power: 327, lactate: 1.3, hr: 135 },
  ltp2: { power: 412, lactate: 3.7, hr: 158 },
  stagesCount: 7,
};

// 18 W gained at LT2, 12 W at LT1, as the drift walk reports it.
// The anchor the card sends with the drift request, and answers against.
const anchor = {
  sport: 'bike',
  lt1: 327, lt2: 412, lt1Hr: 135, lt2Hr: 158,
  storageMode: 'pace',
  points: last.points,
};

const projection = {
  sessions: 24,
  minutes: 900,
  lt1: { fromDemand: 327, toDemand: 339, shift: 12 },
  lt2: { fromDemand: 412, toDemand: 430, shift: 18 },
};

describe('predictedFromProjection', () => {
  it('moves the thresholds to where training says they are', () => {
    const p = predictedFromProjection(last, projection, anchor);
    expect(Math.round(p.ltp2.power)).toBe(430);
    expect(Math.round(p.ltp1.power)).toBe(339);
  });

  it('slides the curve without inventing or dropping stages', () => {
    const p = predictedFromProjection(last, projection, anchor);
    expect(p.points).toHaveLength(last.points.length);
    p.points.forEach((pt, i) => {
      expect(pt.x).toBeGreaterThan(last.points[i].x);
      // Lactate rides across untouched — what moves is the power it appears at.
      expect(pt.y).toBe(last.points[i].y);
    });
  });

  it('carries heart rate across unchanged, which is the premise not an omission', () => {
    const p = predictedFromProjection(last, projection, anchor);
    expect(p.points.map((x) => x.hr)).toEqual(last.points.map((x) => x.hr));
    expect(p.ltp2.hr).toBe(158);
  });

  it('hands the zone pipeline a test it can consume unchanged', () => {
    const p = predictedFromProjection(last, projection, anchor);
    // Overrides, so calculateZonesFromTest computes predicted zones by exactly
    // the code that computes measured ones — no second implementation to drift.
    expect(Math.round(p.raw.thresholdOverrides.LTP2)).toBe(430);
    expect(p.raw.results).toBe(bikeTest.results);
  });

  it('leaves the measured test untouched', () => {
    predictedFromProjection(last, projection, anchor);
    expect(bikeTest.thresholdOverrides.LTP2).toBe(412);
  });

  it('declines without an anchor to answer against', () => {
    expect(predictedFromProjection(last, projection, null)).toBeNull();
  });

  // The anchor reaches here as a payload built for the drift request, and that
  // payload nearly shipped without `sport` — which the curve shift needs to
  // know whether the x-axis is watts or pace. Without it this returned null,
  // the toggle never appeared, and the card went on showing the old test with
  // nothing to indicate anything had failed.
  it('needs the sport, and says so by declining rather than guessing watts', () => {
    const { sport, ...noSport } = anchor;
    expect(predictedFromProjection(last, projection, noSport)).toBeNull();
  });

  it('declines rather than guessing when there is nothing behind it', () => {
    expect(predictedFromProjection(last, null, anchor)).toBeNull();
    expect(predictedFromProjection(last, { sessions: 3 }, anchor)).toBeNull();
    expect(predictedFromProjection(null, projection, anchor)).toBeNull();
  });

  it('declines when the projection has no LT2 to stand on', () => {
    expect(predictedFromProjection(last, {
      sessions: 9,
      lt1: { fromDemand: 327, toDemand: 339, shift: 12 },
    }, anchor)).toBeNull();
  });
});
