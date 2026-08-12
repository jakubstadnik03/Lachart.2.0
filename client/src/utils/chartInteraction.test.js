import {
  FULL_WINDOW,
  MIN_WINDOW,
  downsample,
  isFullWindow,
  lapBands,
  nearestIndex,
  niceTicks,
  normaliseWindow,
  panWindow,
  visibleRange,
  windowToDomain,
  zoomWindow,
} from './chartInteraction';

describe('window normalisation', () => {
  it('keeps a window inside the data', () => {
    expect(normaliseWindow({ start: -0.5, end: 0.5 })).toEqual({ start: 0, end: 1 });
    expect(normaliseWindow({ start: 0.8, end: 1.6 })).toMatchObject({ end: 1 });
  });

  it('swaps a backwards window rather than collapsing it', () => {
    expect(normaliseWindow({ start: 0.8, end: 0.2 })).toEqual({ start: 0.2, end: 0.8 });
  });

  it('refuses to zoom past the minimum width', () => {
    const w = normaliseWindow({ start: 0.5, end: 0.5 });
    expect(w.end - w.start).toBeCloseTo(MIN_WINDOW, 10);
  });

  it('falls back to the full view for nonsense', () => {
    expect(normaliseWindow(null)).toEqual(FULL_WINDOW);
    expect(normaliseWindow({ start: NaN, end: 1 })).toEqual(FULL_WINDOW);
  });

  it('recognises the full view', () => {
    expect(isFullWindow({ start: 0, end: 1 })).toBe(true);
    expect(isFullWindow({ start: 0.1, end: 0.9 })).toBe(false);
  });
});

describe('zoom', () => {
  it('keeps whatever is under the pointer under the pointer', () => {
    // Zooming with the pointer at the right edge must not drag the data left.
    const win = { start: 0.2, end: 0.8 };
    const zoomed = zoomWindow(win, 0.5, 1);
    expect(zoomed.end).toBeCloseTo(0.8, 6);

    const atLeft = zoomWindow(win, 0.5, 0);
    expect(atLeft.start).toBeCloseTo(0.2, 6);
  });

  it('zooms about the centre by default', () => {
    const z = zoomWindow({ start: 0.2, end: 0.8 }, 0.5);
    expect(z.start).toBeCloseTo(0.35, 6);
    expect(z.end).toBeCloseTo(0.65, 6);
  });

  it('never zooms out past the full range', () => {
    expect(zoomWindow({ start: 0.4, end: 0.6 }, 100)).toEqual(FULL_WINDOW);
  });

  it('never zooms in past the minimum', () => {
    const z = zoomWindow({ start: 0.4, end: 0.6 }, 0.00001);
    expect(z.end - z.start).toBeCloseTo(MIN_WINDOW, 10);
  });

  it('does not drift after many gestures', () => {
    // Repeated zoom in and out has to land back where it started, or the chart
    // slowly wanders while the user thinks they are standing still.
    let w = { start: 0, end: 1 };
    for (let i = 0; i < 50; i += 1) w = zoomWindow(w, 0.9, 0.5);
    for (let i = 0; i < 50; i += 1) w = zoomWindow(w, 1 / 0.9, 0.5);
    expect(w.start).toBeCloseTo(0, 6);
    expect(w.end).toBeCloseTo(1, 6);
  });
});

describe('pan', () => {
  it('moves by a fraction of the visible width, not of the data', () => {
    const w = panWindow({ start: 0.2, end: 0.4 }, 0.5); // half of a 0.2-wide view
    expect(w.start).toBeCloseTo(0.3, 6);
    expect(w.end).toBeCloseTo(0.5, 6);
  });

  it('stops at the edge instead of squashing the window', () => {
    const w = panWindow({ start: 0.9, end: 1 }, 5);
    expect(w).toEqual({ start: 0.9, end: 1 });
    const back = panWindow({ start: 0, end: 0.1 }, -5);
    expect(back).toEqual({ start: 0, end: 0.1 });
  });

  it('keeps the window width exactly', () => {
    const w = panWindow({ start: 0.3, end: 0.5 }, 0.37);
    expect(w.end - w.start).toBeCloseTo(0.2, 10);
  });
});

describe('reading values off the chart', () => {
  const xs = [0, 10, 20, 30, 40, 50];

  it('finds the nearest sample, not the one before', () => {
    expect(nearestIndex(xs, 21)).toBe(2);
    expect(nearestIndex(xs, 26)).toBe(3);
    expect(nearestIndex(xs, 25)).toBe(2); // ties go to the earlier sample
  });

  it('clamps outside the data', () => {
    expect(nearestIndex(xs, -100)).toBe(0);
    expect(nearestIndex(xs, 1e6)).toBe(5);
  });

  it('handles an empty series', () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it('agrees with a linear scan on a large series', () => {
    // Binary search is only worth it if it gives the same answer.
    const big = Array.from({ length: 5000 }, (_, i) => i * 3);
    for (const probe of [7, 1234, 4999, 14996]) {
      const linear = big.reduce((best, v, i) => (
        Math.abs(v - probe) < Math.abs(big[best] - probe) ? i : best), 0);
      expect(nearestIndex(big, probe)).toBe(linear);
    }
  });

  it('maps a viewport fraction back to data space', () => {
    expect(windowToDomain({ start: 0, end: 1 }, 0.5, [0, 100])).toBe(50);
    expect(windowToDomain({ start: 0.5, end: 1 }, 0, [0, 100])).toBe(50);
    expect(windowToDomain({ start: 0.5, end: 1 }, 1, [0, 100])).toBe(100);
  });

  it('includes the samples just off each edge so lines reach them', () => {
    const [lo, hi] = visibleRange(xs, { start: 0.3, end: 0.5 }, [0, 50]);
    expect(xs[lo]).toBeLessThanOrEqual(15);
    expect(xs[hi]).toBeGreaterThanOrEqual(25);
  });
});

describe('downsampling', () => {
  const series = Array.from({ length: 4000 }, (_, i) => ({ x: i, y: Math.sin(i / 50) * 100 }));

  it('leaves a small series alone', () => {
    const small = series.slice(0, 50);
    expect(downsample(small, 400)).toBe(small);
  });

  it('keeps the peaks a plain sample would drop', () => {
    // A single spike must survive — the spikes are the intervals.
    const spiky = Array.from({ length: 4000 }, (_, i) => ({ x: i, y: i === 1234 ? 999 : 10 }));
    const thinned = downsample(spiky, 200);
    expect(thinned.some((p) => p.y === 999)).toBe(true);
  });

  it('preserves the overall range', () => {
    const thinned = downsample(series, 200);
    expect(Math.max(...thinned.map((p) => p.y))).toBeCloseTo(Math.max(...series.map((p) => p.y)), 0);
    expect(Math.min(...thinned.map((p) => p.y))).toBeCloseTo(Math.min(...series.map((p) => p.y)), 0);
  });

  it('stays in chronological order', () => {
    const xsOut = downsample(series, 200).map((p) => p.x);
    expect([...xsOut].sort((a, b) => a - b)).toEqual(xsOut);
  });
});

describe('axis ticks', () => {
  it('picks round numbers', () => {
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('covers the range without spilling out of it', () => {
    const ticks = niceTicks(37, 214, 4);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(37);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(214);
  });

  it('returns nothing for a degenerate range', () => {
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(NaN, 10)).toEqual([]);
  });
});

describe('lap bands', () => {
  const laps = [
    { start: 0, end: 300, label: 'Warm-up' },
    { start: 300, end: 780, hard: true },
    { start: 780, end: 1200 },
  ];

  it('numbers laps by position, not by whatever the device said', () => {
    // Devices restart lap numbering after a pause; the athlete counts from one.
    const bands = lapBands(laps, [0, 1200]);
    expect(bands.map((b) => b.number)).toEqual([1, 2, 3]);
    expect(bands[1].label).toBe('Lap 2');
    expect(bands[0].label).toBe('Warm-up');
  });

  it('places bands as viewport fractions', () => {
    const bands = lapBands(laps, [0, 1200]);
    expect(bands[0].from).toBeCloseTo(0, 6);
    expect(bands[0].to).toBeCloseTo(0.25, 6);
    expect(bands[2].to).toBeCloseTo(1, 6);
  });

  it('drops malformed laps rather than drawing nonsense', () => {
    const bands = lapBands([{ start: 5, end: 5 }, { start: 'x', end: 10 }, ...laps], [0, 1200]);
    expect(bands).toHaveLength(3);
  });

  it('is empty without laps', () => {
    expect(lapBands(null, [0, 100])).toEqual([]);
    expect(lapBands(laps, [0, 0])).toEqual([]);
  });
});
