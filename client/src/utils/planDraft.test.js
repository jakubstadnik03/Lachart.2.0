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

// ── Multi-sport ──────────────────────────────────────────────────────────────
// A triathlete's week is not one sport with the titles changed: three sports
// compete for seven days, and the plan is only useful if it keeps the hard
// days apart and never asks for two of the same sport on one day.

const tri = (over = {}) => buildBlockDraft({
  startDate: '2026-08-17',
  weeks: 4,
  recoveryEvery: 0,
  sports: [
    { sport: 'bike', hoursPerWeek: 6, sessionsPerWeek: 3 },
    { sport: 'run', hoursPerWeek: 3, sessionsPerWeek: 3 },
    { sport: 'swim', hoursPerWeek: 2, sessionsPerWeek: 2 },
  ],
  ...over,
});

describe('planning three sports', () => {
  it('plans every sport it was given', () => {
    const week = tri().weeks[0];
    expect(new Set(week.sessions.map((s) => s.sport))).toEqual(new Set(['bike', 'run', 'swim']));
  });

  it('gives each sport the number of sessions asked for', () => {
    const week = tri().weeks[0];
    const count = (sport) => week.sessions.filter((s) => s.sport === sport).length;
    expect(count('bike')).toBe(3);
    expect(count('run')).toBe(3);
    expect(count('swim')).toBe(2);
  });

  it('splits the week by the hours each sport was given', () => {
    const week = tri().weeks[0];
    const hours = (sport) => week.sessions
      .filter((s) => s.sport === sport)
      .reduce((n, s) => n + s.plannedDuration, 0) / 3600;
    // Ratios hold even though the ramp scales the whole week.
    expect(hours('bike') / hours('run')).toBeCloseTo(2, 1);
    expect(hours('bike') / hours('swim')).toBeCloseTo(3, 1);
  });

  it('titles sessions in the language of each sport', () => {
    const titles = tri().weeks[0].sessions.map((s) => `${s.sport}:${s.title}`);
    expect(titles.some((t) => t.startsWith('swim:') && /CSS|x\d+|Technique/.test(t))).toBe(true);
    expect(titles.some((t) => t.startsWith('run:') && /run|min/i.test(t))).toBe(true);
    expect(titles.every((t) => !(t.startsWith('run:') && /ride|spin/i.test(t)))).toBe(true);
  });

  it('never puts two sessions of the same sport on one day', () => {
    for (const week of tri().weeks) {
      const seen = new Set();
      for (const s of week.sessions) {
        const key = `${s.dayOffset}:${s.sport}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('keeps hard days apart', () => {
    for (const week of tri().weeks) {
      const hardDays = [...new Set(week.sessions.filter((s) => s.hard).map((s) => s.dayOffset))]
        .sort((a, b) => a - b);
      for (let i = 1; i < hardDays.length; i += 1) {
        expect(hardDays[i] - hardDays[i - 1]).toBeGreaterThan(1);
      }
    }
  });

  it('never stacks two hard sessions on the same day', () => {
    for (const week of tri().weeks) {
      const byDay = new Map();
      week.sessions.filter((s) => s.hard).forEach((s) => {
        byDay.set(s.dayOffset, (byDay.get(s.dayOffset) || 0) + 1);
      });
      for (const n of byDay.values()) expect(n).toBe(1);
    }
  });

  it('leaves at least one day clear in a normal week', () => {
    const week = tri().weeks[0];
    expect(new Set(week.sessions.map((s) => s.dayOffset)).size).toBeLessThan(7);
  });

  it('puts the long session at the weekend', () => {
    const week = tri().weeks[0];
    const long = week.sessions.filter((s) => s.isLong);
    expect(long.length).toBeGreaterThan(0);
    long.forEach((s) => expect(s.dayOffset).toBeGreaterThanOrEqual(4));
  });

  it('records the sport plan on the draft', () => {
    const d = tri();
    expect(d.sports.map((s) => s.sport)).toEqual(['bike', 'run', 'swim']);
    expect(d.weeklyHours).toBe(11);
    expect(d.sessionsPerWeek).toBe(8);
  });

  it('still honours the old single-sport call', () => {
    const d = buildBlockDraft({ startDate: '2026-08-17', weeks: 2, sport: 'run', weeklyHours: 5, sessionsPerWeek: 4 });
    expect(d.weeks[0].sessions.every((s) => s.sport === 'run')).toBe(true);
    expect(d.weeks[0].sessions).toHaveLength(4);
  });

  it('drops a sport with no hours rather than planning empty sessions', () => {
    const d = buildBlockDraft({
      startDate: '2026-08-17',
      weeks: 1,
      sports: [
        { sport: 'bike', hoursPerWeek: 5, sessionsPerWeek: 3 },
        { sport: 'swim', hoursPerWeek: 0, sessionsPerWeek: 2 },
      ],
    });
    expect(d.weeks[0].sessions.every((s) => s.sport === 'bike')).toBe(true);
  });

  it('thins every sport in a recovery week', () => {
    const d = tri({ weeks: 4, recoveryEvery: 2 });
    const normal = d.weeks[0].sessions.length;
    const recovery = d.weeks.find((w) => w.isRecovery).sessions.length;
    expect(recovery).toBeLessThan(normal);
  });

  it('carries each session onto the calendar with its own sport', () => {
    const planned = draftToPlannedWorkouts(tri());
    expect(new Set(planned.map((p) => p.sport))).toEqual(new Set(['bike', 'run', 'swim']));
  });
});
