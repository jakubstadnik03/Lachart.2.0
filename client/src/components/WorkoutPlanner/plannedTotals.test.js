/**
 * What the planner shows and what it saves have to be the same two numbers.
 *
 * They were computed separately and disagreed in opposite directions: the TSS
 * box printed the figure derived from the steps while the save sent the stored
 * one, and the duration box printed the stored figure while the save sent the
 * computed one. A 3h / 120 TSS session edited down to a 1:25 / 102 structure
 * went back to the calendar as 1:25 / 120 — so its card went on quoting a
 * number the builder had already contradicted on the other half of the screen.
 */
import { plannedTotals } from './plannedTotals';

// 2×20 at threshold with easy either side — about an hour and a half.
const CONTEXT = { ftp: 400, lt1Power: 318, lt2Power: 402, cyclingZones: null };
const STEPS = [
  { clientId: 'a', stepType: 'warmup', durationSeconds: 900, powerTarget: { type: 'zone', value: 1 } },
  { clientId: 'b', stepType: 'work', durationSeconds: 1200, powerTarget: { type: 'lt2' } },
  { clientId: 'c', stepType: 'recovery', durationSeconds: 600, powerTarget: { type: 'zone', value: 1 } },
  { clientId: 'd', stepType: 'work', durationSeconds: 1200, powerTarget: { type: 'lt2' } },
  { clientId: 'e', stepType: 'cooldown', durationSeconds: 600, powerTarget: { type: 'zone', value: 1 } },
];

describe('with a structure', () => {
  const totals = plannedTotals({
    steps: STEPS, context: CONTEXT, sport: 'bike',
    typedTss: '120', typedDurationSecs: 10800, // the stale 3h / 120 TSS
  });

  it('takes the duration from the steps, not the stored figure', () => {
    expect(totals.durationSecs).toBe(4500);
  });

  it('takes the TSS from the steps too, which is the half that was wrong', () => {
    expect(totals.tss).toBeGreaterThan(0);
    expect(totals.tss).not.toBe(120);
  });

  it('says where the numbers came from', () => {
    expect(totals.fromSteps).toBe(true);
  });
});

describe('without a structure', () => {
  const totals = plannedTotals({
    steps: [], context: CONTEXT, sport: 'bike', typedTss: '85', typedDurationSecs: 3600,
  });

  it('keeps what the athlete typed', () => {
    expect(totals).toMatchObject({ fromSteps: false, durationSecs: 3600, tss: 85 });
  });

  it('leaves a blank blank rather than sending a zero', () => {
    const empty = plannedTotals({ steps: [], context: CONTEXT, sport: 'bike', typedTss: '', typedDurationSecs: 0 });
    expect(empty.durationSecs).toBeUndefined();
    expect(empty.tss).toBeUndefined();
  });
});
