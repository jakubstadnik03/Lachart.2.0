import { resolveTargetWatts, repairGroupMembership, unitIndicesAt } from './WorkoutBuilder';

const ctx = { ftp: 400, lt1Power: 332, lt2Power: 384 };

/**
 * Pulling a bar's top edge writes watts onto the step. Where they land depends
 * on how the step was aimed — a zone must stay a zone, or its label would stop
 * matching what goes to the watch. Mirrors handleStepPower.
 */
const applyPower = (step, watts) => {
  const w = Math.max(1, Math.round(watts));
  const t = step.powerTarget || { type: 'open' };
  if (t.type === 'watts') return { ...step, powerTarget: { ...t, value: w, useRange: false } };
  if (t.type === 'open') return { ...step, powerTarget: { type: 'watts', value: w } };
  return { ...step, powerTarget: { ...t, override: w } };
};

/** Mirrors handleStepMove: whole components move, not single bars. */
const moveStep = (steps, fromId, toId) => {
  const from = steps.findIndex((s) => s.clientId === fromId);
  const to = steps.findIndex((s) => s.clientId === toId);
  if (from < 0 || to < 0) return steps;
  const src = unitIndicesAt(steps, from);
  const dst = unitIndicesAt(steps, to);
  if (!src.length || !dst.length || src[0] === dst[0]) return steps;
  const moving = new Set(src);
  const moved = src.map((i) => steps[i]);
  const remaining = steps.filter((_, i) => !moving.has(i));
  const anchor = src[0] < dst[0] ? dst[dst.length - 1] + 1 : dst[0];
  const removedBefore = src.filter((i) => i < anchor).length;
  remaining.splice(anchor - removedBefore, 0, ...moved);
  return repairGroupMembership(remaining);
};

const step = (id, extra = {}) => ({
  clientId: id, stepType: 'work', durationSeconds: 300,
  powerTarget: { type: 'zone', value: 3 }, ...extra,
});

describe('dragging a lap to a new power', () => {
  test('a watts step takes the number directly', () => {
    expect(applyPower({ powerTarget: { type: 'watts', value: 300 } }, 355).powerTarget)
      .toEqual({ type: 'watts', value: 355, useRange: false });
  });

  test('a zone step stays a zone and pins the watts', () => {
    const out = applyPower({ powerTarget: { type: 'zone', value: 3 } }, 355);
    expect(out.powerTarget.type).toBe('zone');
    expect(out.powerTarget.value).toBe(3);
    expect(out.powerTarget.override).toBe(355);
  });

  test('...and the pinned watts are what the target resolves to', () => {
    const out = applyPower({ powerTarget: { type: 'zone', value: 3 } }, 355);
    expect(resolveTargetWatts({ type: 'zone', value: 3 }, ctx)).not.toBe(355);
    expect(resolveTargetWatts(out.powerTarget, ctx)).toBe(355);
  });

  test('an LT target keeps its meaning', () => {
    const out = applyPower({ powerTarget: { type: 'lt2' } }, 390);
    expect(out.powerTarget.type).toBe('lt2');
    expect(resolveTargetWatts(out.powerTarget, ctx)).toBe(390);
  });

  test('a percentage keeps its meaning', () => {
    const out = applyPower({ powerTarget: { type: 'percent_ftp', value: 80 } }, 300);
    expect(out.powerTarget.type).toBe('percent_ftp');
    expect(out.powerTarget.value).toBe(80);
    expect(resolveTargetWatts(out.powerTarget, ctx)).toBe(300);
  });

  test('an open step becomes a watts step — it had nothing to keep', () => {
    expect(applyPower({ powerTarget: { type: 'open' } }, 200).powerTarget)
      .toEqual({ type: 'watts', value: 200 });
  });

  test('a step with no target at all does not throw', () => {
    expect(() => applyPower({}, 200)).not.toThrow();
    expect(applyPower({}, 200).powerTarget.type).toBe('watts');
  });

  test('dragging below zero floors at one watt', () => {
    expect(applyPower({ powerTarget: { type: 'watts', value: 100 } }, -50).powerTarget.value).toBe(1);
  });

  test('a range target loses the range once a single value is dragged', () => {
    const out = applyPower({ powerTarget: { type: 'watts', useRange: true, rangeMin: 200, rangeMax: 260 } }, 300);
    expect(out.powerTarget.useRange).toBe(false);
    expect(out.powerTarget.value).toBe(300);
  });
});

describe('dragging a bar to another position', () => {
  test('moves the step it was drawn from', () => {
    expect(moveStep([step('a'), step('b'), step('c')], 'c', 'a').map((s) => s.clientId))
      .toEqual(['c', 'a', 'b']);
  });

  test('dropping a step on itself changes nothing', () => {
    expect(moveStep([step('a'), step('b')], 'a', 'a').map((s) => s.clientId)).toEqual(['a', 'b']);
  });

  test('an unknown id is ignored rather than throwing', () => {
    const before = [step('a'), step('b')];
    expect(() => moveStep(before, 'ghost', 'a')).not.toThrow();
    expect(moveStep(before, 'ghost', 'a').map((s) => s.clientId)).toEqual(['a', 'b']);
  });

  test('dragging within one component does nothing — it is one thing', () => {
    const block = [
      step('w', { groupId: 'g1', isGroupHeader: true, groupRepeat: 4 }),
      step('r', { groupId: 'g1', stepType: 'recovery' }),
    ];
    expect(moveStep(block, 'r', 'w').map((s) => s.clientId)).toEqual(['w', 'r']);
  });

  test('a repeat block travels whole — you cannot pull one lap out of it', () => {
    const steps = [
      step('w', { groupId: 'g1', isGroupHeader: true, groupRepeat: 4 }),
      step('r', { groupId: 'g1', stepType: 'recovery' }),
      step('loose'),
      step('tail'),
    ];
    // Dropped on the last step, so it lands after it — a forward drag goes
    // where you aimed rather than in front of it.
    const out = moveStep(steps, 'r', 'tail');
    expect(out.map((s) => s.clientId)).toEqual(['loose', 'tail', 'w', 'r']);
    expect(out.filter((s) => s.groupId === 'g1')).toHaveLength(2);
    expect(out.find((s) => s.isGroupHeader).groupRepeat).toBe(4);
  });

  test('a palette block travels whole too — a warm-up is one component', () => {
    const steps = [
      step('w1', { blockId: 'b1', blockKind: 'warmup', stepType: 'warmup' }),
      step('w2', { blockId: 'b1', blockKind: 'warmup', stepType: 'warmup' }),
      step('w3', { blockId: 'b1', blockKind: 'warmup', stepType: 'warmup' }),
      step('main'),
    ];
    expect(moveStep(steps, 'w2', 'main').map((s) => s.clientId))
      .toEqual(['main', 'w1', 'w2', 'w3']);

    // ...and backwards, the block lands in front of what it was dropped on.
    const back = [step('main'), step('w1', { blockId: 'b1' }), step('w2', { blockId: 'b1' })];
    expect(moveStep(back, 'w2', 'main').map((s) => s.clientId)).toEqual(['w1', 'w2', 'main']);
  });

  test('unitIndicesAt only takes the adjacent run, not strays elsewhere', () => {
    const steps = [
      step('a', { blockId: 'b1' }),
      step('b', { blockId: 'b1' }),
      step('gap'),
      step('c', { blockId: 'b1' }),
    ];
    expect(unitIndicesAt(steps, 0)).toEqual([0, 1]);
    expect(unitIndicesAt(steps, 3)).toEqual([3]);
  });

  test('a loose step is its own component', () => {
    expect(unitIndicesAt([step('a'), step('b')], 1)).toEqual([1]);
  });
});
