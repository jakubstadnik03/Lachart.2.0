import { buildTrainingTimeline, matchesSport, plannedTssFor, formatHours } from './trainingTimeline';

// A Wednesday, so the Monday-reset trap is visible in the fixtures.
const NOW = new Date(2026, 7, 12, 18, 0);

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const offset = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d;
};

const PROFILE = { ftp: 280, maxHr: 190, powerZones: { cycling: { ftp: 280, lt2: 270 } } };

const act = (n, tss, sport = 'bike') => ({
  id: `a${n}-${sport}`,
  date: offset(n),
  sport,
  title: `Session ${n}`,
  totalTime: 3600,
  tss,
});

const plan = (n, tss, sport = 'bike') => ({
  _id: `p${n}`,
  date: dayKey(offset(n)),
  sport,
  title: `Planned ${n}`,
  status: 'planned',
  targetTss: tss,
});

const build = (over = {}) =>
  buildTrainingTimeline({
    activities: [],
    plannedWorkouts: [],
    userProfile: PROFILE,
    days: 14,
    now: NOW,
    ...over,
  });

describe('sport filter', () => {
  it('matches the aliases each source actually uses', () => {
    expect(matchesSport('VirtualRide', 'bike')).toBe(true);
    expect(matchesSport('Ride', 'bike')).toBe(true);
    expect(matchesSport('mtbike', 'bike')).toBe(true);
    expect(matchesSport('TrailRun', 'run')).toBe(true);
    expect(matchesSport('Walk', 'run')).toBe(true);
    expect(matchesSport('Swim', 'bike')).toBe(false);
    expect(matchesSport('anything', 'all')).toBe(true);
  });

  it('splits a multi-sport week into separate pictures', () => {
    const activities = [act(-1, 80, 'bike'), act(-2, 50, 'run'), act(-3, 30, 'swim')];
    expect(build({ activities }).points.reduce((s, p) => s + p.actual, 0)).toBe(160);
    expect(build({ activities, sportFilter: 'bike' }).points.reduce((s, p) => s + p.actual, 0)).toBe(80);
    expect(build({ activities, sportFilter: 'run' }).points.reduce((s, p) => s + p.actual, 0)).toBe(50);
  });
});

describe('rolling 7 days', () => {
  it('is a true window, not a total since Monday', () => {
    // 12 Aug 2026 is a Wednesday. A Monday-reset week would count only Mon-Wed
    // and miss the 100 TSS ride from the Sunday before.
    const activities = [act(-1, 60), act(-3, 100), act(-5, 40)];
    const t = build({ activities });
    expect(t.rolling7).toBe(200);
  });

  it('drops a session once it falls out of the back of the window', () => {
    const inWindow = build({ activities: [act(-6, 90)] });
    const justOutside = build({ activities: [act(-7, 90)] });
    expect(inWindow.rolling7).toBe(90);
    expect(justOutside.rolling7).toBe(0);
  });

  it('marks the first six days as an incomplete window', () => {
    const t = build({ activities: [act(-1, 50)] });
    expect(t.points[0].rolling7Complete).toBe(false);
    expect(t.points[5].rolling7Complete).toBe(false);
    expect(t.points[6].rolling7Complete).toBe(true);
    expect(t.points[t.points.length - 1].rolling7Complete).toBe(true);
  });

  it('reports the ramp against the same window a week earlier', () => {
    const activities = [act(-1, 100), act(-2, 100), act(-9, 100)];
    const t = build({ activities });
    expect(t.rolling7).toBe(200);
    expect(t.rolling7Change).toBe(100); // 200 now vs 100 a week ago
  });

  it('leaves the ramp null when there is nothing to compare against', () => {
    expect(build({ activities: [act(-1, 100)] }).rolling7Change).toBeNull();
  });
});

describe('days in the window', () => {
  it('includes rest days so gaps are visible', () => {
    const t = build({ activities: [act(-1, 60)] });
    expect(t.points).toHaveLength(14);
    expect(t.points.filter((p) => p.actual === 0).length).toBe(13);
  });

  it('marks today and does not count the future as a shortfall', () => {
    const t = build({ plannedWorkouts: [plan(2, 90)] });
    const future = t.points.find((p) => p.date === dayKey(offset(2)));
    expect(future).toBeUndefined(); // window ends today
    const today = t.points[t.points.length - 1];
    expect(today.isToday).toBe(true);
    expect(today.delta).toBe(0);
  });
});

describe('plan overlay', () => {
  it('compares planned against actual without counting skipped sessions', () => {
    const t = build({
      activities: [act(-1, 70)],
      plannedWorkouts: [plan(-1, 100), { ...plan(-2, 100), status: 'skipped' }],
    });
    expect(t.compliance.plannedTss).toBe(100);
    expect(t.compliance.actualTss).toBe(70);
    expect(t.compliance.pct).toBe(70);
  });

  it('counts missed and unplanned days separately', () => {
    const t = build({
      activities: [act(-1, 60)],
      plannedWorkouts: [plan(-3, 80)],
    });
    expect(t.compliance.missedDays).toBe(1);
    expect(t.compliance.extraDays).toBe(1);
  });

  it('is absent entirely when nothing was planned', () => {
    expect(build({ activities: [act(-1, 60)] }).compliance).toBeNull();
  });

  it('estimates planned load from duration when no target is set', () => {
    expect(plannedTssFor({ targetTss: 95 })).toBe(95);
    expect(plannedTssFor({ plannedDuration: 3600 })).toBe(50);
    expect(plannedTssFor({})).toBe(0);
  });

  it('honours interval-group repeats in the estimate', () => {
    const pw = {
      steps: [
        { groupId: 'g1', isGroupHeader: true, groupRepeat: 4, durationSeconds: 480 },
        { groupId: 'g1', durationSeconds: 240 },
        { durationSeconds: 600 },
      ],
    };
    // (480 + 240) x 4 + 600 = 3480s
    expect(Math.round(plannedTssFor(pw))).toBe(Math.round((3480 / 3600) * 50));
  });
});

describe('zone balance', () => {
  const zoneDay = (n, z) => ({
    date: dayKey(offset(n)),
    zones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, ...z },
    totalSec: Object.values({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, ...z }).reduce((a, b) => a + b, 0),
    unmeasuredSec: 0,
  });

  it('totals time in zone across the window', () => {
    const t = build({
      zoneDays: [zoneDay(-1, { z2: 3600, z4: 900 }), zoneDay(-3, { z2: 5400 })],
    });
    expect(t.zoneTotals.z2).toBe(9000);
    expect(t.zoneTotals.z4).toBe(900);
  });

  it('reports easy / grey / hard rather than one polarisation score', () => {
    const t = build({
      zoneDays: [zoneDay(-1, { z1: 1000, z2: 7000, z3: 1000, z4: 800, z5: 200 })],
    });
    expect(t.split.easyPct).toBe(80);
    expect(t.split.greyPct).toBe(10);
    expect(t.split.hardPct).toBe(10);
  });

  it('tracks how much recorded time could not be placed in a zone', () => {
    const t = build({
      zoneDays: [
        { date: dayKey(offset(-1)), zones: { z1: 0, z2: 1800, z3: 0, z4: 0, z5: 0 }, totalSec: 1800, unmeasuredSec: 1800 },
      ],
    });
    expect(t.coverage.pct).toBe(50);
  });

  it('has no split at all without heart-rate data', () => {
    const t = build({ activities: [act(-1, 60)] });
    expect(t.split).toBeNull();
    expect(t.coverage.pct).toBe(0);
  });
});

describe('formatHours', () => {
  it('reads as hours and minutes', () => {
    expect(formatHours(0)).toBe('0h');
    expect(formatHours(1800)).toBe('30m');
    expect(formatHours(3600)).toBe('1h');
    expect(formatHours(5400)).toBe('1h 30m');
  });
});
