import {
  buildBlockDraft,
  draftCollisions,
  draftSummary,
  draftToPlannedWorkouts,
  moveDraftSession,
  relabelDraftSession,
  removeDraftSession,
  weekSummary,
} from './planDraft';

// A Wednesday — the block must still start on the Monday of that week.
const START = new Date(2026, 7, 12);

const build = (over = {}) =>
  buildBlockDraft({ startDate: START, weeks: 6, weeklyHours: 8, sessionsPerWeek: 5, recoveryEvery: 4, ...over });

describe('block generation', () => {
  it('anchors the block on a Monday whatever day you start from', () => {
    expect(build().startDate).toBe('2026-08-10'); // the Monday of that week
  });

  it('produces the number of weeks asked for', () => {
    expect(build({ weeks: 6 }).weeks).toHaveLength(6);
    expect(build({ weeks: 12 }).weeks).toHaveLength(12);
  });

  it('clamps absurd inputs rather than generating a five-year block', () => {
    expect(build({ weeks: 500 }).weeks.length).toBeLessThanOrEqual(24);
    expect(build({ weeks: 0 }).weeks.length).toBeGreaterThanOrEqual(1);
    expect(build({ sessionsPerWeek: 99 }).weeks[0].sessions.length).toBeLessThanOrEqual(7);
  });

  it('places a recovery week where asked and cuts its volume', () => {
    const draft = build({ weeks: 8, recoveryEvery: 4 });
    const recovery = draft.weeks.filter((w) => w.isRecovery);
    expect(recovery.length).toBeGreaterThan(0);
    const normal = weekSummary(draft.weeks[2]);
    const rest = weekSummary(recovery[0]);
    expect(rest.tss).toBeLessThan(normal.tss);
  });

  it('never makes the final week a recovery week — that is the taper', () => {
    const draft = build({ weeks: 8, recoveryEvery: 4 });
    expect(draft.weeks[draft.weeks.length - 1].isRecovery).toBe(false);
    expect(draft.weeks[draft.weeks.length - 1].phase).toBe('taper');
  });

  it('skips the taper on a block too short to earn one', () => {
    expect(build({ weeks: 2 }).weeks.some((w) => w.phase === 'taper')).toBe(false);
  });

  it('moves through base into build and peak', () => {
    const phases = build({ weeks: 10, recoveryEvery: 0 }).weeks.map((w) => w.phase);
    expect(phases[0]).toBe('base');
    expect(phases).toContain('build');
    expect(phases).toContain('peak');
  });

  it('ramps volume across the block', () => {
    const draft = build({ weeks: 6, recoveryEvery: 0 });
    expect(weekSummary(draft.weeks[3]).tss).toBeGreaterThan(weekSummary(draft.weeks[0]).tss);
  });

  it('builds in a sawtooth rather than flattening at a ceiling', () => {
    // A global ramp that saturates gives three identical weeks in a row, which
    // is a plateau, not periodisation — and it is obvious in the shape chart.
    const draft = build({ weeks: 12, recoveryEvery: 4 });
    const loads = draft.weeks.map((w) => weekSummary(w).tss);
    const identicalRuns = loads.filter((v, i) => i >= 2 && v === loads[i - 1] && v === loads[i - 2]);
    expect(identicalRuns).toHaveLength(0);
  });

  it('starts each cycle above the one before it', () => {
    const draft = build({ weeks: 12, recoveryEvery: 4 });
    const first = weekSummary(draft.weeks[0]).tss;   // cycle 1, week 1
    const second = weekSummary(draft.weeks[4]).tss;  // cycle 2, week 1
    expect(second).toBeGreaterThan(first);
  });

  it('drops volume sharply in the taper', () => {
    const draft = build({ weeks: 8, recoveryEvery: 4 });
    const taper = draft.weeks[draft.weeks.length - 1];
    expect(taper.phase).toBe('taper');
    // A taper that matches the build weeks is not a taper.
    const buildWeeks = draft.weeks.filter((w) => w.phase === 'build' || w.phase === 'peak');
    const avgBuild = buildWeeks.reduce((s, w) => s + weekSummary(w).tss, 0) / buildWeeks.length;
    expect(weekSummary(taper).tss).toBeLessThan(avgBuild * 0.8);
  });

  it('trims volume in the peak phase to make room for intensity', () => {
    const draft = build({ weeks: 10, recoveryEvery: 0 });
    const peak = draft.weeks.filter((w) => w.phase === 'peak').map(weekSummary);
    expect(peak.length).toBeGreaterThan(0);
    // Intensity share should be higher in peak than in the opening base weeks.
    expect(peak[0].intensityPct).toBeGreaterThan(weekSummary(draft.weeks[0]).intensityPct);
  });

  it('keeps sessions in weekday order', () => {
    for (const week of build().weeks) {
      const offsets = week.sessions.map((s) => s.dayOffset);
      expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    }
  });

  it('returns null for an unusable start date', () => {
    expect(buildBlockDraft({ startDate: 'not-a-date' })).toBeNull();
  });
});

describe('week and block summaries', () => {
  it('splits load into volume and intensity', () => {
    const week = {
      sessions: [
        { title: 'Endurance', hard: false, targetTss: 60, plannedDuration: 3600 },
        { title: 'Threshold 4x8min', hard: true, targetTss: 90, plannedDuration: 3600 },
      ],
    };
    const s = weekSummary(week);
    expect(s.tss).toBe(150);
    expect(s.hours).toBe(2);
    expect(s.hardCount).toBe(1);
    expect(s.intensityPct).toBe(60); // 90 of 150
  });

  it('treats a hard-sounding title as hard even without the flag', () => {
    const s = weekSummary({ sessions: [{ title: 'VO2max 5x4min', targetTss: 90 }] });
    expect(s.hardCount).toBe(1);
  });

  it('survives an empty week', () => {
    expect(weekSummary({ sessions: [] })).toMatchObject({ tss: 0, hours: 0, sessions: 0, intensityPct: 0 });
  });

  it('totals the whole block for the commit bar', () => {
    const summary = draftSummary(build({ weeks: 6 }));
    expect(summary.weeks).toBe(6);
    expect(summary.sessions).toBeGreaterThan(20);
    expect(summary.tss).toBeGreaterThan(0);
    expect(summary.peakWeekTss).toBeGreaterThan(0);
    expect(summary.recoveryWeeks).toBe(1);
  });
});

describe('landing on real dates', () => {
  it('maps every session onto a real calendar day', () => {
    const draft = build({ weeks: 2, sessionsPerWeek: 3, recoveryEvery: 0 });
    const planned = draftToPlannedWorkouts(draft);
    expect(planned).toHaveLength(6);
    expect(planned[0].date).toMatch(/^2026-08-1[0-6]$/);
    expect(planned.every((p) => p.title && p.date)).toBe(true);
  });

  it('returns them in date order', () => {
    const dates = draftToPlannedWorkouts(build()).map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('is empty for a missing draft', () => {
    expect(draftToPlannedWorkouts(null)).toEqual([]);
  });
});

describe('collisions with what is already planned', () => {
  it('lists days that already have a session', () => {
    const draft = build({ weeks: 1, sessionsPerWeek: 3, recoveryEvery: 0 });
    const first = draftToPlannedWorkouts(draft)[0];
    const collisions = draftCollisions(draft, [{ date: first.date, title: 'Club ride', status: 'planned' }]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].existing).toContain('Club ride');
  });

  it('ignores skipped sessions', () => {
    const draft = build({ weeks: 1, sessionsPerWeek: 3, recoveryEvery: 0 });
    const first = draftToPlannedWorkouts(draft)[0];
    expect(draftCollisions(draft, [{ date: first.date, title: 'Old', status: 'skipped' }])).toHaveLength(0);
  });

  it('is empty when the calendar is clear', () => {
    expect(draftCollisions(build(), [])).toHaveLength(0);
  });
});

describe('editing a draft', () => {
  it('moves a session to another weekday without touching the original', () => {
    const draft = build({ weeks: 1, sessionsPerWeek: 3, recoveryEvery: 0 });
    const session = draft.weeks[0].sessions[0];
    const moved = moveDraftSession(draft, 0, session.id, 6);
    expect(moved.weeks[0].sessions.find((s) => s.id === session.id).dayOffset).toBe(6);
    expect(draft.weeks[0].sessions.find((s) => s.id === session.id).dayOffset).toBe(session.dayOffset);
  });

  it('clamps a move to inside the week', () => {
    const draft = build({ weeks: 1, sessionsPerWeek: 3, recoveryEvery: 0 });
    const id = draft.weeks[0].sessions[0].id;
    expect(moveDraftSession(draft, 0, id, 99).weeks[0].sessions.find((s) => s.id === id).dayOffset).toBe(6);
    expect(moveDraftSession(draft, 0, id, -5).weeks[0].sessions.find((s) => s.id === id).dayOffset).toBe(0);
  });

  it('re-reads intensity from a corrected title', () => {
    // "Correct it if it's wrong" — relabelling an easy session as intervals has
    // to change what the shape chart says about that week.
    const draft = build({ weeks: 1, sessionsPerWeek: 3, recoveryEvery: 0 });
    const easy = draft.weeks[0].sessions.find((s) => !s.hard);
    const fixed = relabelDraftSession(draft, 0, easy.id, { title: 'VO2max 5x4min' });
    expect(fixed.weeks[0].sessions.find((s) => s.id === easy.id).hard).toBe(true);
    expect(weekSummary(fixed.weeks[0]).hardCount).toBeGreaterThan(weekSummary(draft.weeks[0]).hardCount);
  });

  it('keeps an explicit hard flag over the title guess', () => {
    const draft = build({ weeks: 1, sessionsPerWeek: 3, recoveryEvery: 0 });
    const id = draft.weeks[0].sessions[0].id;
    const fixed = relabelDraftSession(draft, 0, id, { title: 'Endurance', hard: true });
    expect(fixed.weeks[0].sessions.find((s) => s.id === id).hard).toBe(true);
  });

  it('removes a session', () => {
    const draft = build({ weeks: 1, sessionsPerWeek: 3, recoveryEvery: 0 });
    const id = draft.weeks[0].sessions[0].id;
    expect(removeDraftSession(draft, 0, id).weeks[0].sessions.find((s) => s.id === id)).toBeUndefined();
  });
});

describe('nothing is committed by accident', () => {
  it('starts life uncommitted', () => {
    expect(build().committedAt).toBeNull();
  });
});
