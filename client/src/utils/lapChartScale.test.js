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

describe('paceAxisBounds — laps that matter keep a readable bar', () => {
  // The reported swim: three kilometre blocks at 1:24–1:29/100m, then fifties
  // at about 1:06. The blocks are half an hour of swimming and drew as stubs.
  const BLOCKS = [89, 84, 88];
  const FIFTIES = [66, 67, 65, 68, 66, 63];
  const share = (b, v) => (b.max - v) / (b.max - b.min);

  it('gives the long blocks a third of the height instead of a stub', () => {
    // The old rule put the bottom edge five seconds under the slowest work lap
    // — 1:29 on an axis ending at 1:34, three percent of the frame.
    const b = paceAxisBounds({
      work: [...BLOCKS, ...FIFTIES], plausible: [...BLOCKS, ...FIFTIES], isSwim: true,
    });
    expect(share(b, 89)).toBeGreaterThan(0.25);
    expect(b.max).toBeGreaterThan(89 + 5);
  });

  it('lifts a block the interval classifier did not call work', () => {
    // Smart detect reads a steady kilometre as recovery often enough that the
    // axis cannot be left to the work set alone.
    const withBlocks = paceAxisBounds({
      work: FIFTIES, plausible: [...BLOCKS, ...FIFTIES], significant: BLOCKS, isSwim: true,
    });
    const without = paceAxisBounds({
      work: FIFTIES, plausible: [...BLOCKS, ...FIFTIES], isSwim: true,
    });
    expect(withBlocks.max).toBeGreaterThan(without.max);
    expect(share(withBlocks, 89)).toBeGreaterThan(0.15);
  });

  it('still leaves the fast reps most of the chart', () => {
    const b = paceAxisBounds({
      work: [...BLOCKS, ...FIFTIES], plausible: [...BLOCKS, ...FIFTIES],
      significant: BLOCKS, isSwim: true,
    });
    expect(share(b, 66)).toBeGreaterThan(0.6);
  });

  it('ignores a slow lap that is over in seconds', () => {
    const withFloat = paceAxisBounds({ work: FIFTIES, plausible: [...FIFTIES, 160], isSwim: true });
    const without = paceAxisBounds({ work: FIFTIES, plausible: FIFTIES, isSwim: true });
    expect(withFloat.max).toBe(without.max);
  });

  it('will not let one long slow lap pull the axis apart', () => {
    // A twenty-minute walk home is significant by time and still has no
    // business setting the scale of a session of reps.
    const b = paceAxisBounds({ work: FIFTIES, plausible: [...FIFTIES, 300], significant: [300], isSwim: true });
    expect(share(b, 66)).toBeGreaterThan(0.5);
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

  it('gives an easy endurance block a readable bar too', () => {
    // The mirror of the swim case: watts grow upward, so it is the EASIEST lap
    // that collapses against the frame.
    const work = [300, 305, 295, 180, 182];
    const b = powerAxisBounds({ work, plausible: work, significant: [180, 182] });
    const share = (v) => (v - b.min) / (b.max - b.min);
    expect(share(180)).toBeGreaterThan(0.25);
    expect(share(300)).toBeGreaterThan(0.6);
  });

  it('never starts below zero watts', () => {
    expect(powerAxisBounds({ work: [40, 60], plausible: [40, 60] }).min).toBeGreaterThanOrEqual(0);
  });
});
