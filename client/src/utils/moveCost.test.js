import { assessMoveCost, isHardSession, plannedLoad, summariseMoveCost } from './moveCost';

// A Monday, so weekday arithmetic in the fixtures is easy to follow.
const NOW = new Date(2026, 7, 10, 9, 0);

const pw = (id, date, over = {}) => ({
  _id: id,
  date,
  title: 'Endurance',
  sport: 'bike',
  status: 'planned',
  targetTss: 55,
  ...over,
});

const hard = (id, date, over = {}) =>
  pw(id, date, { title: '4x8min VO2max', targetTss: 95, ...over });

const assess = (workout, toDate, plans, over = {}) =>
  assessMoveCost({ workout, toDate, plannedWorkouts: plans, now: NOW, ...over });

describe('classification', () => {
  it('reads hard sessions from the title, the category or the load', () => {
    expect(isHardSession({ title: '4x8min VO2max' })).toBe(true);
    expect(isHardSession({ title: 'Steady', category: 'threshold' })).toBe(true);
    expect(isHardSession({ title: 'Long ride', targetTss: 180 })).toBe(true);
    expect(isHardSession({ title: 'Recovery spin', targetTss: 30 })).toBe(false);
  });

  it('estimates load from duration when no target is set', () => {
    expect(plannedLoad({ targetTss: 95 })).toBe(95);
    expect(plannedLoad({ plannedDuration: 3600 })).toBe(50);
    expect(plannedLoad({})).toBe(0);
  });
});

describe('no-op moves', () => {
  it('says nothing when the date has not changed', () => {
    const w = pw('a', '2026-08-12');
    expect(assess(w, '2026-08-12', [w])).toBeNull();
  });

  it('says nothing without a workout or a target', () => {
    expect(assess(null, '2026-08-12', [])).toBeNull();
    expect(assess(pw('a', '2026-08-12'), '', [])).toBeNull();
  });
});

describe('hard-day spacing', () => {
  it('flags back-to-back hard days', () => {
    const moving = hard('m', '2026-08-14');
    const plans = [moving, hard('x', '2026-08-13')];
    const r = assess(moving, '2026-08-12', plans);
    expect(r.costs.find((c) => c.id === 'hard-spacing')).toBeTruthy();
    expect(r.costs.find((c) => c.id === 'hard-spacing').text).toMatch(/Back-to-back/);
  });

  it('treats three in a row as worse than two', () => {
    const moving = hard('m', '2026-08-17');
    const plans = [moving, hard('x', '2026-08-11'), hard('y', '2026-08-13')];
    const r = assess(moving, '2026-08-12', plans);
    const spacing = r.costs.find((c) => c.id === 'hard-spacing');
    expect(spacing.severity).toBe('high');
    expect(spacing.text).toMatch(/three hard days in a row/);
    expect(r.severity).toBe('high');
  });

  it('says so when the spacing is fine', () => {
    const moving = hard('m', '2026-08-14');
    const r = assess(moving, '2026-08-12', [moving, hard('x', '2026-08-16')]);
    expect(r.costs.find((c) => c.id === 'hard-spacing')).toBeUndefined();
    expect(r.neutral.find((n) => n.id === 'spacing-ok')).toBeTruthy();
  });

  it('does not apply the rule to easy sessions', () => {
    const moving = pw('m', '2026-08-14', { title: 'Recovery spin', targetTss: 30 });
    const r = assess(moving, '2026-08-12', [moving, hard('x', '2026-08-13')]);
    expect(r.costs.find((c) => c.id === 'hard-spacing')).toBeUndefined();
  });
});

describe('collisions', () => {
  it('warns that both sessions would happen', () => {
    const moving = pw('m', '2026-08-14');
    const r = assess(moving, '2026-08-12', [moving, pw('x', '2026-08-12', { title: 'Swim', targetTss: 40 })]);
    const c = r.costs.find((x) => x.id === 'collision');
    expect(c.text).toMatch(/Swim is already on that day/);
    expect(c.text).toMatch(/95 TSS total/);
  });

  it('treats two hard sessions on one day as serious', () => {
    const moving = hard('m', '2026-08-14');
    const r = assess(moving, '2026-08-12', [moving, hard('x', '2026-08-12')]);
    expect(r.costs.find((c) => c.id === 'collision').severity).toBe('high');
  });
});

describe('rest days', () => {
  it('flags eating the only rest day of the week', () => {
    // Mon 10 → Sun 16. Everything booked except Wednesday 12.
    const moving = pw('m', '2026-08-17');
    const plans = [
      moving,
      pw('a', '2026-08-10'), pw('b', '2026-08-11'), pw('d', '2026-08-13'),
      pw('e', '2026-08-14'), pw('f', '2026-08-15'), pw('g', '2026-08-16'),
    ];
    const r = assess(moving, '2026-08-12', plans);
    const rest = r.costs.find((c) => c.id === 'last-rest-day');
    expect(rest).toBeTruthy();
    expect(rest.severity).toBe('high');
  });

  it('says nothing when the week has other rest days', () => {
    const moving = pw('m', '2026-08-17');
    const r = assess(moving, '2026-08-12', [moving, pw('a', '2026-08-10')]);
    expect(r.costs.find((c) => c.id === 'last-rest-day')).toBeUndefined();
  });
});

describe('load moving between weeks', () => {
  it('reports both weeks so the athlete can see the swap', () => {
    const moving = pw('m', '2026-08-14', { targetTss: 80 });
    const r = assess(moving, '2026-08-18', [moving]);
    const shift = r.costs.find((c) => c.id === 'week-shift');
    expect(shift).toBeTruthy();
    expect(shift.severity).toBe('low');
    expect(shift.text).toMatch(/80 TSS/);
  });

  it('is silent for a move inside the same week', () => {
    const moving = pw('m', '2026-08-12');
    expect(assess(moving, '2026-08-14', [moving]).costs.find((c) => c.id === 'week-shift')).toBeUndefined();
  });

  it('gets the direction right when the session is dragged backwards', () => {
    // Sessions get pulled earlier as often as pushed later; "into the following
    // week" was wrong half the time.
    const moving = pw('m', '2026-08-18', { targetTss: 80 });
    const back = assess(moving, '2026-08-14', [moving]).costs.find((c) => c.id === 'week-shift');
    expect(back.text).toMatch(/back into the earlier week/);
    expect(back.text).not.toMatch(/following week/);

    const forwardMove = pw('m2', '2026-08-14', { targetTss: 80 });
    const fwd = assess(forwardMove, '2026-08-18', [forwardMove]).costs.find((c) => c.id === 'week-shift');
    expect(fwd.text).toMatch(/into the following week/);
  });
});

describe('naming the neighbours', () => {
  it('names a repeated workout once rather than twice', () => {
    // Real plans repeat titles; "Intervals and Intervals" reads like a bug.
    const moving = hard('m', '2026-08-17');
    const plans = [moving, hard('x', '2026-08-11'), hard('y', '2026-08-13')];
    const r = assess(moving, '2026-08-12', plans);
    const text = r.costs.find((c) => c.id === 'hard-spacing').text;
    expect(text).toMatch(/two 4x8min VO2max sessions/);
    expect(text).not.toMatch(/VO2max and 4x8min VO2max/);
  });

  it('still lists genuinely different neighbours', () => {
    const moving = hard('m', '2026-08-17');
    const plans = [
      moving,
      hard('x', '2026-08-11', { title: 'Hill repeats' }),
      hard('y', '2026-08-13', { title: 'Threshold set' }),
    ];
    const text = assess(moving, '2026-08-12', plans).costs.find((c) => c.id === 'hard-spacing').text;
    expect(text).toMatch(/Hill repeats and Threshold set/);
  });
});

describe('races', () => {
  const races = [{ date: '2026-08-16', name: 'Regional TT' }];

  it('protects the taper from a hard session', () => {
    const moving = hard('m', '2026-08-10');
    const r = assess(moving, '2026-08-14', [moving], { races });
    const race = r.costs.find((c) => c.id === 'race-proximity');
    expect(race).toBeTruthy();
    expect(race.text).toMatch(/Regional TT is 2 days later/);
    expect(race.severity).toBe('high');
  });

  it('mentions race week without calling an easy session a problem', () => {
    const moving = pw('m', '2026-08-10', { title: 'Recovery spin', targetTss: 30 });
    const r = assess(moving, '2026-08-14', [moving], { races });
    expect(r.costs.find((c) => c.id === 'race-proximity')).toBeUndefined();
    expect(r.neutral.find((n) => n.id === 'race-week')).toBeTruthy();
  });

  it('ignores races further out than a week', () => {
    const moving = hard('m', '2026-08-10');
    const r = assess(moving, '2026-08-12', [moving], { races: [{ date: '2026-09-20', name: 'Nationals' }] });
    expect(r.costs.find((c) => c.id === 'race-proximity')).toBeUndefined();
  });
});

describe('moving into the past', () => {
  it('explains what will happen', () => {
    const moving = pw('m', '2026-08-14');
    const r = assess(moving, '2026-08-05', [moving]);
    expect(r.costs.find((c) => c.id === 'past')).toBeTruthy();
  });
});

describe('overall verdict', () => {
  it('reports a free move as free', () => {
    const moving = pw('m', '2026-08-12');
    const r = assess(moving, '2026-08-13', [moving]);
    expect(r.severity).toBe('none');
    expect(r.headline).toMatch(/No cost/);
  });

  it('ranks the worst cost first', () => {
    const moving = hard('m', '2026-08-17', { targetTss: 95 });
    const plans = [moving, hard('x', '2026-08-11'), hard('y', '2026-08-13')];
    const r = assess(moving, '2026-08-12', plans);
    expect(r.costs[0].severity).toBe('high');
  });

  it('summarises to one line for a drag tooltip', () => {
    const moving = hard('m', '2026-08-14');
    const r = assess(moving, '2026-08-12', [moving, hard('x', '2026-08-13')]);
    expect(summariseMoveCost(r)).toMatch(/Back-to-back/);
    expect(summariseMoveCost(null)).toBeNull();
  });

  it('reports how far the session moved', () => {
    const moving = pw('m', '2026-08-12');
    expect(assess(moving, '2026-08-15', [moving]).daysMoved).toBe(3);
    expect(assess(moving, '2026-08-09', [moving]).daysMoved).toBe(-3);
  });
});
