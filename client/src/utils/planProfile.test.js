/**
 * The calendar thumbnail must draw the session the builder shows.
 */
import { planProfileBars } from './planProfile';

const zone = (value) => ({ type: 'zone', value });
const step = (id, stepType, durationSeconds, powerTarget, extra = {}) => ({ clientId: id, stepType, durationSeconds, powerTarget, ...extra });

describe('planProfileBars', () => {
  it('sets height by the target, not the step type — Z2 to Z5 climbs, Z1 drops', () => {
    // Bike heat, as built: all typed "work", intensities Z2 Z3 Z4 Z5 Z1 Z2.
    const steps = [
      step('a', 'work', 600, zone(2)), step('b', 'work', 300, zone(3)), step('c', 'work', 300, zone(4)),
      step('d', 'work', 300, zone(5)), step('e', 'work', 600, zone(1)), step('f', 'work', 1800, zone(2)),
    ];
    const bars = planProfileBars(steps, { width: 120 });
    const hs = bars.map((b) => b.h);
    expect(hs[0]).toBeLessThan(hs[1]);
    expect(hs[1]).toBeLessThan(hs[2]);
    expect(hs[2]).toBeLessThan(hs[3]);
    expect(hs[3]).toBe(1);
    expect(hs[4]).toBeLessThan(hs[0]);
    expect(hs[5]).toBe(hs[0]);
    // Widths follow duration: the 30-minute block is three times the ten-minute one.
    expect(bars[5].w / bars[0].w).toBeCloseTo(3, 5);
    expect(bars[bars.length - 1].x + bars[bars.length - 1].w).toBeCloseTo(120, 5);
  });

  it('expands a repeat block and keeps its total width', () => {
    const steps = [
      step('w', 'warmup', 600, zone(1)),
      step('h', 'work', 300, zone(4), { groupId: 'g', isGroupHeader: true, groupRepeat: 4 }),
      step('r', 'recovery', 120, zone(1), { groupId: 'g' }),
      step('c', 'cooldown', 600, zone(1)),
    ];
    const bars = planProfileBars(steps, { width: 200 });
    // 4 × (work + recovery) = 8 bars inside the block, plus warm-up and cool-down.
    expect(bars).toHaveLength(10);
    const block = bars.slice(1, 9);
    const blockW = block.reduce((a, b) => a + b.w, 0);
    expect(blockW / 200).toBeCloseTo((4 * 420) / (600 + 4 * 420 + 600), 5);
    expect(block[0].h).toBe(1);
    expect(block[1].h).toBeLessThan(0.7);
  });

  it('shows as many cycles as fit when the thumbnail is too narrow for every rep', () => {
    const steps = [
      step('h', 'work', 30, zone(5), { groupId: 'g', isGroupHeader: true, groupRepeat: 30 }),
      step('r', 'recovery', 30, zone(1), { groupId: 'g' }),
    ];
    const bars = planProfileBars(steps, { width: 60 });
    expect(bars.length).toBeLessThan(60);
    expect(bars.length % 2).toBe(0);
    expect(bars[bars.length - 1].x + bars[bars.length - 1].w).toBeCloseTo(60, 5);
  });

  it('draws nothing for no steps', () => {
    expect(planProfileBars([])).toEqual([]);
    expect(planProfileBars(null)).toEqual([]);
  });
});
