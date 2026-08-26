import { repairGroupMembership, expandSteps } from './WorkoutBuilder';

/**
 * Steps inside a repeat block can now be dragged, which means one can also be
 * dragged out. Membership is a groupId on the step, not nesting, so position
 * and membership can disagree — and a step that kept the id after leaving
 * would still be repeated by expandSteps in a block it had visibly left.
 */
const step = (id, extra = {}) => ({
  clientId: id, stepType: 'work', durationSeconds: 300, powerTarget: { type: 'zone', value: 3 }, ...extra,
});

const block = (gid, reps = 4) => [
  step('a', { groupId: gid, isGroupHeader: true, groupRepeat: reps }),
  step('b', { groupId: gid }),
];

describe('repairGroupMembership', () => {
  test('a block left alone is left alone', () => {
    const before = block('g1');
    const after = repairGroupMembership(before);
    expect(after.map((s) => s.groupId)).toEqual(['g1', 'g1']);
    expect(after.filter((s) => s.isGroupHeader)).toHaveLength(1);
    expect(after[0].groupRepeat).toBe(4);
  });

  test('reordering within a block keeps every step in it', () => {
    const [a, b] = block('g1');
    const after = repairGroupMembership([b, a]);
    expect(after.every((s) => s.groupId === 'g1')).toBe(true);
    expect(after.filter((s) => s.isGroupHeader)).toHaveLength(1);
  });

  test('the repeat count survives the header being reordered away from first', () => {
    const [a, b] = block('g1', 6);
    const after = repairGroupMembership([b, a]);
    expect(after[0].isGroupHeader).toBe(true);
    expect(after[0].groupRepeat).toBe(6);
    expect(after[1].groupRepeat).toBeUndefined();
  });

  test('a step dragged out of the block leaves it', () => {
    const [a, b] = block('g1');
    // b dropped below a loose step, so it no longer touches the block
    const after = repairGroupMembership([a, step('loose'), b]);
    expect(after[2].groupId).toBeUndefined();
    expect(after[2].isGroupHeader).toBeUndefined();
    expect(after[2].groupRepeat).toBeUndefined();
  });

  test('a block reduced to one step stays a block, and keeps its count', () => {
    const [a, b] = block('g1', 3);
    const after = repairGroupMembership([a, step('loose'), b]);
    // `a` is alone now: neighbours are not in g1, so it leaves too
    expect(after[0].groupId).toBeUndefined();
    expect(expandSteps(after)).toHaveLength(3);
  });

  test('two blocks side by side do not merge', () => {
    const after = repairGroupMembership([...block('g1'), ...block('g2')]);
    expect(after.map((s) => s.groupId)).toEqual(['g1', 'g1', 'g2', 'g2']);
    expect(after.filter((s) => s.isGroupHeader)).toHaveLength(2);
  });

  test('loose steps are untouched', () => {
    const after = repairGroupMembership([step('x'), step('y')]);
    expect(after.every((s) => s.groupId === undefined)).toBe(true);
  });

  test('does not mutate the array it was given', () => {
    const before = block('g1');
    const copy = JSON.parse(JSON.stringify(before));
    repairGroupMembership([before[1], before[0]]);
    expect(before).toEqual(copy);
  });

  test('a repaired block still expands to the right number of steps', () => {
    const after = repairGroupMembership(block('g1', 5));
    expect(expandSteps(after)).toHaveLength(10);
  });
});
