import { plannedWorkoutDurationSecs } from './plannedDuration';

const step = (durationSeconds, extra = {}) => ({ durationSeconds, ...extra });

describe('plannedWorkoutDurationSecs', () => {
  // The regression: a typed 2:30 lost to a 2:57:57 step total, so the editor
  // and the summary disagreed and no amount of re-saving could reconcile them.
  it('prefers the typed duration over a longer step total', () => {
    const pw = {
      plannedDuration: 9000,                       // 2:30
      steps: [step(5400), step(5277)],             // 2:57:57
    };
    expect(plannedWorkoutDurationSecs(pw)).toBe(9000);
  });

  it('prefers the typed duration over a shorter step total too', () => {
    expect(plannedWorkoutDurationSecs({ plannedDuration: 9000, steps: [step(600)] })).toBe(9000);
  });

  it('falls back to the step total when nothing was typed', () => {
    expect(plannedWorkoutDurationSecs({ steps: [step(600), step(1200)] })).toBe(1800);
  });

  it('counts a repeated group once per repeat', () => {
    const pw = {
      steps: [
        step(60, { groupId: 'g1', isGroupHeader: true, groupRepeat: 3 }),
        step(120, { groupId: 'g1' }),
      ],
    };
    expect(plannedWorkoutDurationSecs(pw)).toBe((60 + 120) * 3);
  });

  it('returns zero for a plan with neither', () => {
    expect(plannedWorkoutDurationSecs({})).toBe(0);
    expect(plannedWorkoutDurationSecs(null)).toBe(0);
  });

  // The legacy heal stays: old rows stored "2:30" as 150 seconds, and only a
  // completed session several times longer identifies one.
  it('heals a legacy h:mm-as-m:ss value when the session dwarfs it', () => {
    expect(plannedWorkoutDurationSecs({ plannedDuration: 150 }, 8600)).toBe(2 * 3600 + 30 * 60);
  });

  it('leaves a short plan alone when the session matches it', () => {
    expect(plannedWorkoutDurationSecs({ plannedDuration: 150 }, 160)).toBe(150);
  });
});
