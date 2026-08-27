import {
  expandSteps, moveGroup, moveStepOrGroup, unitsOf,
} from './WorkoutBuilder';

/**
 * The arrows on a step card and on a repeat header. Before this, both nudged a
 * single array entry: moving a 5x8min block meant ten presses, every one of
 * which put half a block inside its neighbour, and none of which repaired
 * membership afterwards — so a step could keep the groupId of a block it had
 * been nudged out of and go on being repeated inside it.
 */
const step = (id, extra = {}) => ({
  clientId: id, stepType: 'work', durationSeconds: 300, powerTarget: { type: 'zone', value: 3 }, ...extra,
});

/** A repeat block of `n` steps, ids prefixed by the group id. */
const block = (gid, n = 2, reps = 4) =>
  Array.from({ length: n }, (_, i) => step(`${gid}${i}`, {
    groupId: gid,
    ...(i === 0 ? { isGroupHeader: true, groupRepeat: reps } : {}),
  }));

const ids = (list) => list.map((s) => s.clientId);

describe('unitsOf', () => {
  it('reads a repeat block as one unit and loose steps as one each', () => {
    const list = [step('x'), ...block('g1', 3), step('y')];
    expect(unitsOf(list)).toEqual([
      { from: 0, to: 0, groupId: null },
      { from: 1, to: 3, groupId: 'g1' },
      { from: 4, to: 4, groupId: null },
    ]);
  });

  it('does not merge two blocks that sit next to each other', () => {
    expect(unitsOf([...block('g1', 2), ...block('g2', 2)]).map((u) => u.groupId))
      .toEqual(['g1', 'g2']);
  });

  it('copes with an empty list', () => {
    expect(unitsOf([])).toEqual([]);
  });
});

describe('moveGroup', () => {
  it('moves the whole block past a loose step in one press', () => {
    const list = [step('x'), ...block('g1', 3)];
    expect(ids(moveGroup(list, 'g1', -1))).toEqual(['g10', 'g11', 'g12', 'x']);
  });

  it('hops a whole neighbouring block rather than landing inside it', () => {
    const list = [...block('g1', 2), ...block('g2', 3)];
    const after = moveGroup(list, 'g1', 1);
    expect(ids(after)).toEqual(['g20', 'g21', 'g22', 'g10', 'g11']);
    // Both blocks survive intact, with one header each.
    expect(after.filter((s) => s.isGroupHeader).map((s) => s.groupId)).toEqual(['g2', 'g1']);
  });

  it('keeps the repeat count with the block it belongs to', () => {
    const list = [step('x'), ...block('g1', 2, 6)];
    const after = moveGroup(list, 'g1', -1);
    expect(after[0].groupRepeat).toBe(6);
    expect(expandSteps(after)).toHaveLength(2 * 6 + 1);
  });

  it('refuses to move off either end', () => {
    const list = [...block('g1', 2), step('x')];
    expect(ids(moveGroup(list, 'g1', -1))).toEqual(ids(list));
    expect(ids(moveGroup(list, 'g1', 1))).toEqual(['x', 'g10', 'g11']);
  });

  it('ignores a group that is not there', () => {
    const list = [step('x'), step('y')];
    expect(moveGroup(list, 'nope', 1)).toBe(list);
  });
});

describe('moveStepOrGroup', () => {
  it('reorders a step inside its own block', () => {
    const list = block('g1', 3);
    expect(ids(moveStepOrGroup(list, 2, -1))).toEqual(['g10', 'g12', 'g11']);
  });

  it('keeps exactly one header when the first step is pushed down', () => {
    const after = moveStepOrGroup(block('g1', 3), 0, 1);
    expect(after.filter((s) => s.isGroupHeader)).toHaveLength(1);
    expect(after[0].isGroupHeader).toBe(true);
    expect(after[0].groupRepeat).toBe(4);
  });

  it('moves the block, not the step, when the arrow would leave the block', () => {
    const list = [...block('g1', 2), step('x')];
    // Last step of g1 pushed down: the athlete means "after x", not "out of g1".
    const after = moveStepOrGroup(list, 1, 1);
    expect(ids(after)).toEqual(['x', 'g10', 'g11']);
    expect(after.filter((s) => s.groupId === 'g1')).toHaveLength(2);
  });

  it('never lets an arrow strand a step inside somebody else’s block', () => {
    const list = [step('x'), ...block('g1', 3)];
    const after = moveStepOrGroup(list, 0, 1);
    // x jumps the whole block rather than landing in the middle of it.
    expect(ids(after)).toEqual(['g10', 'g11', 'g12', 'x']);
    expect(after.find((s) => s.clientId === 'x').groupId).toBeUndefined();
  });

  it('leaves a one-step block coherent when it moves', () => {
    const list = [step('x'), ...block('g1', 1, 3)];
    const after = moveStepOrGroup(list, 1, -1);
    // A lone member has no neighbour in its block, so membership lapses —
    // the same rule dragging already applied.
    expect(after[0].groupId).toBeUndefined();
    expect(expandSteps(after)).toHaveLength(2);
  });

  it('refuses to move off either end', () => {
    const list = [step('x'), step('y')];
    expect(moveStepOrGroup(list, 0, -1)).toBe(list);
    expect(moveStepOrGroup(list, 1, 1)).toBe(list);
  });

  it('does not mutate the list it was given', () => {
    const list = [step('x'), ...block('g1', 2)];
    const copy = JSON.parse(JSON.stringify(list));
    moveStepOrGroup(list, 0, 1);
    expect(list).toEqual(copy);
  });

  it('survives a no-op direction or a missing index', () => {
    const list = [step('x')];
    expect(moveStepOrGroup(list, 0, 0)).toBe(list);
    expect(moveStepOrGroup(list, 9, 1)).toBe(list);
  });
});
