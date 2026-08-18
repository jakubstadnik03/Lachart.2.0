/**
 * The planner has to start from what the athlete has been doing, not from a
 * number typed into a form. These pin down what "has been doing" means.
 */

import { buildTrainingHistoryProfile } from './trainingHistoryProfile';

jest.mock('../components/shared/SportIcon', () => ({
  resolveSportKey: (s) => {
    const v = String(s || '').toLowerCase();
    if (/ride|bike|cycl/.test(v)) return 'bike';
    if (/run/.test(v)) return 'run';
    if (/swim/.test(v)) return 'swim';
    return 'other';
  },
}));

const NOW = new Date('2026-08-18T12:00:00');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

/** One session, described the way the activity feed describes them. */
const session = (sport, hours, km, days, extra = {}) => ({
  sport,
  date: daysAgo(days),
  totalTime: Math.round(hours * 3600),
  distance: km * 1000,
  tss: Math.round(hours * 60),
  ...extra,
});

describe('buildTrainingHistoryProfile', () => {
  it('has nothing to say without history', () => {
    expect(buildTrainingHistoryProfile([], { now: NOW })).toBeNull();
    expect(buildTrainingHistoryProfile(null, { now: NOW })).toBeNull();
  });

  it('averages over the weeks actually trained', () => {
    // Two weeks, 4h each — a third week of nothing must not halve the answer.
    const acts = [
      session('bike', 2, 60, 2), session('bike', 2, 60, 4),
      session('bike', 2, 60, 9), session('bike', 2, 60, 11),
    ];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    expect(p.weeksTrained).toBe(2);
    expect(p.perWeek.hours).toBe(4);
    expect(p.perWeek.sessions).toBe(2);
  });

  it('splits volume by sport, with kilometres where they matter', () => {
    const acts = [
      session('Ride', 3, 90, 2),
      session('Run', 1, 12, 3),
      session('Swim', 1, 3, 4),
    ];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    const bike = p.sports.find((s) => s.sport === 'bike');
    const run = p.sports.find((s) => s.sport === 'run');
    const swim = p.sports.find((s) => s.sport === 'swim');

    expect(bike.hoursPerWeek).toBe(3);
    expect(run.kmPerWeek).toBe(12);
    expect(swim.kmPerWeek).toBe(3);
    // Ordered by volume, so the plan leads with the sport they actually do.
    expect(p.sports[0].sport).toBe('bike');
    expect(bike.share).toBe(60);
  });

  it('suggests the three sports the athlete actually trains', () => {
    const acts = [
      session('Ride', 3, 90, 2),
      session('Run', 1, 12, 3),
      session('Swim', 1, 3, 4),
      session('Yoga', 0.5, 0, 5),
    ];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    expect(p.suggestion.sports).toEqual(expect.arrayContaining(['bike', 'run', 'swim']));
    expect(p.suggestion.sports).not.toContain('other');
  });

  it('drops a sport that barely appears', () => {
    const acts = [
      session('Ride', 10, 300, 2),
      session('Run', 0.2, 2, 3), // 2% of the week — noise, not a discipline
    ];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    expect(p.suggestion.sports).toEqual(['bike']);
  });

  it('ignores weeks that are not training', () => {
    const acts = [
      session('bike', 4, 120, 2),
      session('bike', 0.1, 1, 9), // six minutes, eight days ago
    ];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    expect(p.weeksTrained).toBe(1);
    expect(p.perWeek.hours).toBe(4);
  });

  it('ignores what has not happened yet', () => {
    const acts = [
      session('bike', 4, 120, 2),
      { sport: 'bike', date: daysAgo(-3), totalTime: 7200, status: 'planned' },
      { sport: 'run', date: daysAgo(1), totalTime: 3600, status: 'skipped' },
    ];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    expect(p.totals.sessions).toBe(1);
  });

  it('reads a hand-entered duration like everything else does', () => {
    const acts = [{ sport: 'bike', date: daysAgo(2), duration: '2:30:00', distance: 60000 }];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    expect(p.perWeek.hours).toBe(2.5);
  });

  it('reports the biggest week and longest session for the ramp to respect', () => {
    const acts = [
      session('bike', 5, 150, 2), session('bike', 2, 60, 3),  // this week: 7h
      session('bike', 3, 90, 9),                              // last week: 3h
    ];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    expect(p.biggestWeekHours).toBe(7);
    expect(p.suggestion.longestSessionHours).toBe(5);
  });

  it('counts hard sessions so the plan knows how much intensity they carry', () => {
    const acts = [
      session('bike', 1, 30, 2, { title: 'Threshold 4x8min' }),
      session('bike', 1, 30, 3, { title: 'VO2max 5x4min' }),
      session('bike', 2, 60, 4, { title: 'Endurance' }),
    ];
    const p = buildTrainingHistoryProfile(acts, { now: NOW, weeks: 4 });
    expect(p.perWeek.hardSessions).toBe(2);
  });
});
