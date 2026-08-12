import { buildDailyCard } from './dailyCoachCard';
import { readinessStateFrom, formGaugePosition } from '../constants/coachingStyles';
import { getDailyLesson, DAILY_LESSONS } from '../content/dailyLessons';

const NOW = new Date(2026, 7, 12, 7, 30); // 12 Aug 2026, 07:30 local

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const offsetDays = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d;
};

const PROFILE = { ftp: 280, maxHr: 190, powerZones: { cycling: { ftp: 280, lt2: 270 } } };
const USER = { _id: 'u1', name: 'Jakub Stadnik' };

const activities = [
  { id: 'a1', date: offsetDays(-1), sport: 'run', title: 'Easy run', totalTime: 2700, distance: 8200, tss: 38 },
  { id: 'a2', date: offsetDays(-1), sport: 'bike', title: 'Commute', totalTime: 1200, distance: 9000, tss: 12 },
  { id: 'a3', date: offsetDays(-3), sport: 'bike', title: 'Endurance', totalTime: 7200, distance: 60000, tss: 95 },
  { id: 'a4', date: offsetDays(-9), sport: 'bike', title: 'Older ride', totalTime: 5400, distance: 45000, tss: 70 },
];

const hardPlan = {
  _id: 'p1', date: dayKey(NOW), sport: 'bike', title: '4x8min VO2max',
  status: 'planned', targetTss: 95, plannedDuration: 5400,
};
const tomorrowPlan = {
  _id: 'p2', date: dayKey(offsetDays(1)), sport: 'run', title: 'Recovery jog',
  status: 'planned', plannedDuration: 1800,
};

const build = (overrides = {}) =>
  buildDailyCard({
    todayMetrics: { fitness: 62, fatigue: 78, form: -16 },
    plannedWorkouts: [hardPlan, tomorrowPlan],
    activities,
    userProfile: PROFILE,
    user: USER,
    now: NOW,
    ...overrides,
  });

describe('readiness bands', () => {
  it('maps TSB onto the five states', () => {
    expect(readinessStateFrom(25, 60)).toBe('veryFresh');
    expect(readinessStateFrom(8, 60)).toBe('fresh');
    expect(readinessStateFrom(-4, 60)).toBe('neutral');
    expect(readinessStateFrom(-16, 60)).toBe('productive');
    expect(readinessStateFrom(-40, 60)).toBe('strained');
  });

  it('scales the strained threshold with fitness', () => {
    // Same TSB, different athletes: -25 is overreaching on a CTL 30 base but
    // still productive on a CTL 90 one. A fixed threshold would flag both.
    expect(readinessStateFrom(-25, 30)).toBe('strained');
    expect(readinessStateFrom(-25, 90)).toBe('productive');
  });

  it('keeps the gauge inside 0..1 at the extremes', () => {
    expect(formGaugePosition(-200)).toBe(0);
    expect(formGaugePosition(200)).toBe(1);
    expect(formGaugePosition(-40)).toBe(0);
    expect(formGaugePosition(NaN)).toBe(0.5);
  });
});

describe('daily lesson rotation', () => {
  it('is stable within a day and advances the next day', () => {
    const a = getDailyLesson(new Date(2026, 7, 12, 6, 0), 'u1');
    const b = getDailyLesson(new Date(2026, 7, 12, 23, 0), 'u1');
    const c = getDailyLesson(new Date(2026, 7, 13, 6, 0), 'u1');
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });

  it('cycles through the whole catalogue', () => {
    const seen = new Set();
    for (let i = 0; i < DAILY_LESSONS.length; i += 1) {
      seen.add(getDailyLesson(new Date(2026, 0, 1 + i), '').title);
    }
    expect(seen.size).toBe(DAILY_LESSONS.length);
  });
});

describe('buildDailyCard', () => {
  it('picks up today and tomorrow separately', () => {
    const card = build();
    expect(card.todayPlanned).toHaveLength(1);
    expect(card.todayPlanned[0].title).toBe('4x8min VO2max');
    expect(card.todayPlanned[0].hard).toBe(true);
    expect(card.tomorrowPlanned).toHaveLength(1);
    expect(card.tomorrowPlanned[0].title).toBe('Recovery jog');
  });

  it('reports the biggest of yesterday’s sessions, not the last one', () => {
    const card = build();
    expect(card.yesterday.title).toBe('Easy run');
  });

  it('rolls 7 days rather than resetting on Monday', () => {
    // 12 Aug 2026 is a Wednesday. A Monday-reset week would see only Mon–Wed
    // and miss the 95 TSS ride from 9 Aug (Sunday).
    const card = build();
    expect(card.load.sessions7).toBe(3);
    expect(card.load.last7).toBeGreaterThan(100);
    expect(card.load.prev7).toBeGreaterThan(0);
  });

  it('warns when a hard session lands on tired legs', () => {
    const card = build({ todayMetrics: { fitness: 62, fatigue: 105, form: -43 } });
    expect(card.readiness.state).toBe('strained');
    expect(card.directiveKind).toBe('hard-on-tired');
    // Names the session and steers away from it. The exact wording belongs to
    // the voice, so this asserts the substance rather than the phrasing.
    expect(card.directive).toMatch(/4x8min VO2max/);
    expect(card.directive).toMatch(/move it/i);
  });

  it('lets a lactate test override everything else', () => {
    const card = build({
      plannedWorkouts: [{ ...hardPlan, title: 'Step test', isLactateTest: true }],
    });
    expect(card.directiveKind).toBe('test');
    expect(card.directive).toMatch(/Same warm-up, same steps/);
  });

  it('gives every voice its own words for a hard session on tired legs', () => {
    // The most common interesting case. It once bypassed the voice entirely and
    // produced one fixed sentence, which made the tone slider look broken.
    const tired = { fitness: 62, fatigue: 105, form: -43 };
    const lines = ['gentle', 'supportive', 'straight', 'direct', 'dark', 'nerd'].map(
      (styleId) => build({ styleId, todayMetrics: tired }).directive,
    );
    expect(new Set(lines).size).toBe(lines.length);
    lines.forEach((line) => expect(line).toMatch(/4x8min VO2max/));
  });

  it('changes wording with the voice but never the facts', () => {
    const gentle = build({ styleId: 'gentle' });
    const dark = build({ styleId: 'dark' });
    expect(gentle.headline).not.toBe(dark.headline);
    expect(gentle.readiness).toEqual(dark.readiness);
    expect(gentle.load).toEqual(dark.load);
    expect(gentle.todayPlanned).toEqual(dark.todayPlanned);
  });

  it('gives the nerd voice a numeric readout', () => {
    const card = build({ styleId: 'nerd' });
    expect(card.readiness.readout).toBe('CTL 62 · ATL 78 · TSB -16');
  });

  it('falls back to a rest line when nothing is planned', () => {
    const card = build({ plannedWorkouts: [] });
    expect(card.todayPlanned).toHaveLength(0);
    expect(card.directiveKind).toBe('rest');
  });

  it('names the session when a rest day follows a big one', () => {
    const card = build({
      plannedWorkouts: [],
      activities: [
        { id: 'b1', date: offsetDays(-1), sport: 'bike', title: 'Long ride', totalTime: 14400, distance: 120000, tss: 210 },
      ],
    });
    expect(card.directiveKind).toBe('rest-after-hard');
    expect(card.directive).toMatch(/Long ride/);
  });

  it('flags a week with no sessions at all', () => {
    const card = build({ plannedWorkouts: [], activities: [] });
    expect(card.directiveKind).toBe('idle');
    expect(card.load.sessions7).toBe(0);
  });

  it('builds a push body that names the session and the form', () => {
    expect(build().pushBody).toBe('4x8min VO2max · Form -16');
  });

  it('offers to rate yesterday when the session has no RPE', () => {
    const card = build();
    expect(card.needsRpe).toBe(true);
    expect(card.yesterdayActivity.title).toBe('Easy run');
  });

  it('stops asking once the session is rated', () => {
    const rated = activities.map((a) => (a.id === 'a1' ? { ...a, rpe: 6 } : a));
    expect(build({ activities: rated }).needsRpe).toBe(false);
  });

  it('asks for nothing when there was no session yesterday', () => {
    const card = build({ activities: [] });
    expect(card.needsRpe).toBe(false);
    expect(card.yesterdayActivity).toBeNull();
  });
});

describe('wellness — what the body says', () => {
  /** Six flat baseline days, then today. */
  const wellnessDays = (today) => {
    const days = [];
    for (let i = 6; i >= 1; i -= 1) {
      const d = offsetDays(-i);
      days.push({ date: dayKey(d), restingHeartRate: 48, hrvMs: 90, sleepMinutes: 460 });
    }
    days.push({ date: dayKey(NOW), ...today });
    return days;
  };

  it('is ignored entirely when there is no wearable data', () => {
    const card = build({ wellness: [] });
    expect(card.recovery).toBeNull();
    expect(card.directiveKind).toBe('hard-on-tired');
  });

  it('overrules the load model when RHR and HRV are both off', () => {
    const card = build({
      todayMetrics: { fitness: 62, fatigue: 50, form: 12 }, // load model says "fresh"
      wellness: wellnessDays({ restingHeartRate: 55, hrvMs: 70, sleepMinutes: 400 }),
    });
    expect(card.readiness.state).toBe('fresh');
    expect(card.recovery.level).toBe('high');
    expect(card.directiveKind).toBe('body-override');
    expect(card.directive).toMatch(/resting HR/i);
    expect(card.directive).toMatch(/HRV/);
  });

  it('flags the disagreement between the numbers and the body', () => {
    const card = build({
      todayMetrics: { fitness: 62, fatigue: 50, form: 12 },
      wellness: wellnessDays({ restingHeartRate: 55, hrvMs: 70, sleepMinutes: 400 }),
    });
    expect(card.recovery.disagreesWithLoad).toBe(true);
  });

  it('mentions a softer signal only when something hard is planned', () => {
    const short = wellnessDays({ restingHeartRate: 48, hrvMs: 90, sleepMinutes: 300 });
    const withHard = build({ todayMetrics: { fitness: 62, fatigue: 50, form: 12 }, wellness: short });
    expect(withHard.recovery.level).toBe('watch');
    expect(withHard.directiveKind).toBe('body-watch');
    expect(withHard.directive).toMatch(/short sleep/i);

    // Nothing hard on the plan — a watch-level signal isn't worth the headline.
    const noHard = build({
      todayMetrics: { fitness: 62, fatigue: 50, form: 12 },
      plannedWorkouts: [],
      wellness: short,
    });
    expect(noHard.directiveKind).not.toBe('body-watch');
  });

  it('still lets a lactate test outrank the body', () => {
    const card = build({
      plannedWorkouts: [{ ...hardPlan, title: 'Step test', isLactateTest: true }],
      wellness: wellnessDays({ restingHeartRate: 55, hrvMs: 70, sleepMinutes: 400 }),
    });
    expect(card.directiveKind).toBe('test');
  });

  it('reports the deltas against the athlete’s own baseline', () => {
    const card = build({
      wellness: wellnessDays({ restingHeartRate: 54, hrvMs: 72, sleepMinutes: 420 }),
    });
    expect(card.recovery.restingHeartRate).toBe(54);
    expect(card.recovery.restingHeartRateDeltaPct).toBe(13); // 54 vs 48
    expect(card.recovery.hrvDeltaPct).toBe(-20);             // 72 vs 90
    expect(card.recovery.sleepMinutes).toBe(420);
  });

  it('makes the headline follow the body, not the load model', () => {
    // "Green light" above "your recovery markers are asking for a day back" is
    // the contradiction that makes an athlete stop trusting the card.
    const fresh = { fitness: 62, fatigue: 50, form: 12 };
    const plain = build({ todayMetrics: fresh });
    expect(plain.headline).toBe('Green light');

    const overridden = build({
      todayMetrics: fresh,
      wellness: wellnessDays({ restingHeartRate: 55, hrvMs: 70, sleepMinutes: 400 }),
    });
    expect(overridden.headline).toBe('Time to back off');
    // The gauge still reports the load model honestly — only the wording moved.
    expect(overridden.readiness.state).toBe('fresh');
    expect(overridden.readiness.form).toBe(12);
  });

  it('gives every voice its own words for the body override', () => {
    const wellness = wellnessDays({ restingHeartRate: 55, hrvMs: 70, sleepMinutes: 400 });
    const lines = ['gentle', 'supportive', 'straight', 'direct', 'dark', 'nerd'].map(
      (styleId) => build({ styleId, todayMetrics: { fitness: 62, fatigue: 50, form: 12 }, wellness }).directive,
    );
    expect(new Set(lines).size).toBe(lines.length);
  });
});
