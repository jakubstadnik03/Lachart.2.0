import { paceAxisBounds, powerAxisBounds } from './lapChartScale';

// The reported case: a 17-lap smart-detected run. The axis drew 4:45–6:55 while
// lap 2 ran 4:34/km, so that bar — the quickest of the session — was clamped
// flat against the top of the frame and read as if it were the 4:45 edge.
const WORK = [293, 288, 291, 279, 295, 300, 305];   // what k-means called work
const REPS_CALLED_RECOVERY = [274];                  // a genuine rep it missed
const RECOVERIES = [330, 399];                       // real float/rest laps
const PLAUSIBLE = [...WORK, ...REPS_CALLED_RECOVERY, ...RECOVERIES];

describe('paceAxisBounds', () => {
  it('clears the quickest drawn lap, even one the work set excluded', () => {
    const { min } = paceAxisBounds({ work: WORK, plausible: PLAUSIBLE });
    expect(min).toBeLessThan(274);
  });

  it('leaves visible headroom rather than a token few seconds', () => {
    const { min, max } = paceAxisBounds({ work: WORK, plausible: PLAUSIBLE });
    const headroom = (274 - min) / (max - min);
    expect(headroom).toBeGreaterThan(0.04);
  });

  it('does not let a slow recovery lap define the bottom edge', () => {
    // A 12 min/km walk between reps is plausible, drawn, and must NOT stretch
    // the axis — that was the regression the work/plausible split exists for.
    const withWalk = paceAxisBounds({ work: WORK, plausible: [...PLAUSIBLE, 720] });
    const without = paceAxisBounds({ work: WORK, plausible: PLAUSIBLE });
    expect(withWalk.max).toBe(without.max);
  });

  it('keeps every drawn lap inside the axis at the fast end', () => {
    const { min } = paceAxisBounds({ work: WORK, plausible: PLAUSIBLE });
    PLAUSIBLE.forEach((v) => expect(v).toBeGreaterThan(min));
  });

  it('holds a floor no runner passes', () => {
    const { min } = paceAxisBounds({ work: [130], plausible: [125] });
    expect(min).toBeGreaterThanOrEqual(60);
  });

  it('uses the tighter swim pads and cap', () => {
    const { min, max } = paceAxisBounds({ work: [74, 78, 80], plausible: [72, 74, 78, 80], isSwim: true });
    expect(min).toBeLessThan(72);
    expect(max).toBeLessThanOrEqual(600);
  });

  it('survives a single-lap activity', () => {
    const b = paceAxisBounds({ work: [300], plausible: [300] });
    expect(b.max - b.min).toBeGreaterThanOrEqual(30);
  });

  it('returns null when there is nothing to scale', () => {
    expect(paceAxisBounds({ work: [] })).toBeNull();
    expect(paceAxisBounds({ work: [0, NaN] })).toBeNull();
  });
});

describe('powerAxisBounds', () => {
  it('clears the hardest drawn lap', () => {
    const { max } = powerAxisBounds({ work: [240, 250, 245, 255], plausible: [240, 250, 245, 255, 410] });
    expect(max).toBeGreaterThan(410);
  });

  it('leaves the axis alone when everything already fits', () => {
    const work = [240, 250, 245, 255];
    const a = powerAxisBounds({ work, plausible: work });
    const b = powerAxisBounds({ work, plausible: [] });
    expect(a.max).toBeCloseTo(b.max, 6);
  });

  it('never starts below zero watts', () => {
    expect(powerAxisBounds({ work: [40, 60], plausible: [40, 60] }).min).toBeGreaterThanOrEqual(0);
  });
});
