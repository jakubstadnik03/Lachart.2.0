/**
 * A planned session is a title, a duration and a target load. This is what
 * turns it into a workout someone can actually follow.
 */

import {
  attachStepsToPlannedWorkouts,
  buildSessionSteps,
  fitStepsToDuration,
  stepsTotalSeconds,
} from './planSessionSteps';

describe('stepsTotalSeconds', () => {
  it('adds up plain steps', () => {
    expect(stepsTotalSeconds([
      { durationSeconds: 600 },
      { durationSeconds: 1800 },
    ])).toBe(2400);
  });

  it('repeats a group with its header, not just the header', () => {
    // 5 × (8min work + 3min recovery) = 55 min, not 40 + 3.
    const steps = [
      { groupId: 'g', isGroupHeader: true, groupRepeat: 5, durationSeconds: 480 },
      { groupId: 'g', durationSeconds: 180 },
    ];
    expect(stepsTotalSeconds(steps)).toBe(5 * (480 + 180));
  });

  it('is zero for nothing', () => {
    expect(stepsTotalSeconds(null)).toBe(0);
    expect(stepsTotalSeconds([])).toBe(0);
  });
});

describe('fitStepsToDuration', () => {
  const withSteady = () => ([
    { stepType: 'warmup', durationSeconds: 600 },
    { stepType: 'work', durationSeconds: 1800 },
    { stepType: 'cooldown', durationSeconds: 600 },
  ]);

  it('stretches the steady block to reach the planned duration', () => {
    const { steps, seconds } = fitStepsToDuration(withSteady(), 5400);
    expect(seconds).toBe(5400);
    // 600 warm-up + 4200 steady + 600 cool-down = 5400.
    expect(steps[1].durationSeconds).toBe(4200);
    // Warm-up and cool-down are untouched.
    expect(steps[0].durationSeconds).toBe(600);
    expect(steps[2].durationSeconds).toBe(600);
  });

  it('shrinks it when the session is shorter', () => {
    const { seconds } = fitStepsToDuration(withSteady(), 2400);
    expect(seconds).toBe(2400);
  });

  it('never trims a steady block below ten minutes', () => {
    const { steps } = fitStepsToDuration(withSteady(), 300);
    expect(steps[1].durationSeconds).toBe(600);
  });

  it('leaves an interval set alone rather than rewriting the session', () => {
    // 5×8min at threshold is the workout; fitting it to a round number by
    // shortening the reps would be planning something else.
    const intervals = [
      { stepType: 'warmup', durationSeconds: 900 },
      { groupId: 'g', isGroupHeader: true, groupRepeat: 5, stepType: 'work', durationSeconds: 480 },
      { groupId: 'g', stepType: 'recovery', durationSeconds: 180 },
      { stepType: 'cooldown', durationSeconds: 600 },
    ];
    const { steps, seconds } = fitStepsToDuration(intervals, 7200);
    expect(steps[1].durationSeconds).toBe(480);
    expect(steps[1].groupRepeat).toBe(5);
    // No steady block to absorb the difference, so the structure keeps its own
    // length and the caller is told what that is.
    expect(seconds).toBe(900 + 5 * (480 + 180) + 600);
  });

  it('does not touch the original steps', () => {
    const original = withSteady();
    fitStepsToDuration(original, 7200);
    expect(original[1].durationSeconds).toBe(1800);
  });
});

describe('buildSessionSteps', () => {
  it('builds a bike threshold session as intervals', () => {
    const out = buildSessionSteps({ sport: 'bike', key: 'threshold', plannedDuration: 4500, targetTss: 90 });
    expect(out).not.toBeNull();
    expect(out.steps.some((s) => s.isGroupHeader)).toBe(true);
    expect(out.steps[0].stepType).toBe('warmup');
    expect(out.steps[out.steps.length - 1].stepType).toBe('cooldown');
  });

  it('builds a run session with run steps, not bike ones', () => {
    const run = buildSessionSteps({ sport: 'run', key: 'vo2', plannedDuration: 3600, targetTss: 80 });
    const bike = buildSessionSteps({ sport: 'bike', key: 'vo2', plannedDuration: 3600, targetTss: 80 });
    expect(run.steps.length).toBeGreaterThan(0);
    // Different presets: the run VO2 set is 6×3min, the bike one 6×4min.
    const workOf = (o) => o.steps.find((s) => s.isGroupHeader)?.durationSeconds;
    expect(workOf(run)).not.toBe(workOf(bike));
  });

  it('builds swim sessions too', () => {
    const out = buildSessionSteps({ sport: 'swim', key: 'threshold', plannedDuration: 3600, targetTss: 60 });
    expect(out).not.toBeNull();
    expect(out.steps.length).toBeGreaterThan(0);
  });

  it('re-derives duration and load from the structure it built', () => {
    // The week's hours must describe the session on the calendar, not the
    // estimate that produced it.
    const out = buildSessionSteps({ sport: 'bike', key: 'threshold', plannedDuration: 1800, targetTss: 50 });
    expect(out.plannedDuration).toBe(stepsTotalSeconds(out.steps));
    expect(out.targetTss).toBeGreaterThan(50); // structure is longer than the estimate
  });

  it('says nothing rather than inventing structure it has no preset for', () => {
    expect(buildSessionSteps({ sport: 'skiing', key: 'threshold', plannedDuration: 3600 })).toBeNull();
    expect(buildSessionSteps({ sport: 'bike', key: 'made-up', plannedDuration: 3600 })).toBeNull();
    expect(buildSessionSteps(null)).toBeNull();
  });
});

describe('attachStepsToPlannedWorkouts', () => {
  const rows = [
    { date: '2026-08-18', sport: 'bike', key: 'threshold', title: 'Threshold 4x8min', plannedDuration: 5400, targetTss: 110 },
    { date: '2026-08-19', sport: 'run', key: 'easy', title: 'Easy run', plannedDuration: 2700, targetTss: 45 },
    { date: '2026-08-20', sport: 'strength', key: 'easy', title: 'Gym', plannedDuration: 3600, targetTss: 30 },
  ];

  it('gives every session it can a structure', () => {
    const out = attachStepsToPlannedWorkouts(rows);
    expect(out[0].steps.length).toBeGreaterThan(0);
    expect(out[1].steps.length).toBeGreaterThan(0);
  });

  it('leaves a session it has no preset for exactly as it was', () => {
    const out = attachStepsToPlannedWorkouts(rows);
    expect(out[2]).toEqual(rows[2]);
  });

  it('keeps the date and sport it was given', () => {
    const out = attachStepsToPlannedWorkouts(rows);
    expect(out[0].date).toBe('2026-08-18');
    expect(out[1].sport).toBe('run');
  });

  it('survives junk', () => {
    expect(attachStepsToPlannedWorkouts(null)).toEqual([]);
    expect(attachStepsToPlannedWorkouts([])).toEqual([]);
  });
});
