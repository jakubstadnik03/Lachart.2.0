/**
 * "Duplicate interval" puts the copy right under the step it was pressed on
 * — the way a 5×5 gets typed — and inside a repeat the copy is a member,
 * never a second header carrying the count.
 */
import { duplicateStepAt } from './WorkoutBuilder';

const ids = () => { let n = 0; return () => `new-${++n}`; };

describe('duplicateStepAt', () => {
  const steps = [
    { clientId: 'a', stepType: 'warmup', durationSeconds: 600 },
    { clientId: 'b', stepType: 'work', durationSeconds: 300, powerTarget: { type: 'zone', value: 4 }, notes: 'hard' },
    { clientId: 'c', stepType: 'cooldown', durationSeconds: 600 },
  ];

  it('inserts the copy right after the step, as a new step', () => {
    const next = duplicateStepAt(steps, 1, ids());
    expect(next.map((s) => s.clientId)).toEqual(['a', 'b', 'new-1', 'c']);
    expect(next[2]).toMatchObject({ stepType: 'work', durationSeconds: 300, powerTarget: { type: 'zone', value: 4 }, notes: 'hard' });
    expect(steps).toHaveLength(3);
  });

  it('a copy of a repeat header joins the block as a plain member', () => {
    const block = [
      { clientId: 'h', stepType: 'work', durationSeconds: 300, groupId: 'g', isGroupHeader: true, groupRepeat: 4 },
      { clientId: 'r', stepType: 'recovery', durationSeconds: 120, groupId: 'g' },
    ];
    const next = duplicateStepAt(block, 0, ids());
    expect(next.map((s) => s.clientId)).toEqual(['h', 'new-1', 'r']);
    expect(next[1].groupId).toBe('g');
    expect(next[1].isGroupHeader).toBeUndefined();
    expect(next[1].groupRepeat).toBeUndefined();
    expect(next[0].isGroupHeader).toBe(true);
  });

  it('does nothing for an index that is not a step', () => {
    expect(duplicateStepAt(steps, 7, ids())).toBe(steps);
  });
});
