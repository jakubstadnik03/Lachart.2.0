import { resolveTargetWatts, repairGroupMembership } from './WorkoutBuilder';

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

/** Mirrors handleStepMove: the bar is not what moves, its step is. */
const moveStep = (steps, fromId, toId) => {
  const from = steps.findIndex((s) => s.clientId === fromId);
  const to = steps.findIndex((s) => s.clientId === toId);
  if (from < 0 || to < 0 || from === to) return steps;
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return repairGroupMembership(next);
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

  test('reordering inside a repeat block keeps the block whole', () => {
    const block = [
      step('w', { groupId: 'g1', isGroupHeader: true, groupRepeat: 4 }),
      step('r', { groupId: 'g1', stepType: 'recovery' }),
    ];
    const out = moveStep(block, 'r', 'w');
    expect(out.every((s) => s.groupId === 'g1')).toBe(true);
    expect(out.filter((s) => s.isGroupHeader)).toHaveLength(1);
    expect(out.find((s) => s.isGroupHeader).groupRepeat).toBe(4);
  });

  test('a step dragged clear of a repeat block leaves it', () => {
    const steps = [
      step('w', { groupId: 'g1', isGroupHeader: true, groupRepeat: 4 }),
      step('r', { groupId: 'g1', stepType: 'recovery' }),
      step('loose'),
      step('tail'),
    ];
    expect(moveStep(steps, 'r', 'tail').find((s) => s.clientId === 'r').groupId).toBeUndefined();
  });
});
