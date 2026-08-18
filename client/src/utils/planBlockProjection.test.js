jest.mock('../components/shared/SportIcon', () => ({
  resolveSportKey: (x) => String(x || '').toLowerCase(),
  SPORT_ICON_COLORS: {},
  __esModule: true,
  default: () => null,
}));

// eslint-disable-next-line import/first
import { buildBlockDraft } from './planDraft';
// eslint-disable-next-line import/first
import { projectBlock, weeklyTotals } from './planBlockProjection';

// A settled athlete: CTL 60, ATL 60, form flat.
const series = [];
for (let i = 90; i >= 0; i -= 1) {
  const d = new Date('2026-08-17T12:00:00');
  d.setDate(d.getDate() - i);
  series.push({ date: d.toISOString().slice(0, 10), Fitness: 60, Fatigue: 60, Form: 0 });
}

const draft = buildBlockDraft({
  startDate: '2026-08-17', weeks: 6, recoveryEvery: 4,
  sports: [
    { sport: 'bike', hoursPerWeek: 6, sessionsPerWeek: 3 },
    { sport: 'run', hoursPerWeek: 3, sessionsPerWeek: 3 },
    { sport: 'swim', hoursPerWeek: 2, sessionsPerWeek: 2 },
  ],
});

describe('block projection', () => {
  it('projects a day for every day of the block', () => {
    const p = projectBlock(draft, series);
    expect(p.days.length).toBeGreaterThan(35);
  });

  it('builds fitness over a block that loads more than the athlete carries', () => {
    const p = projectBlock(draft, series);
    expect(p.end.fitness).toBeGreaterThan(p.start.fitness);
    expect(p.fitnessGain).toBeGreaterThan(0);
  });

  it('digs form into a hole before the recovery week lifts it', () => {
    const p = projectBlock(draft, series);
    expect(p.lowestForm).toBeLessThan(0);
  });

  it('says nothing without a series to continue from', () => {
    expect(projectBlock(draft, [])).toBeNull();
    expect(projectBlock(draft, null)).toBeNull();
    expect(projectBlock(null, series)).toBeNull();
  });

  it('reports hours and load per week, and the sport mix', () => {
    const totals = weeklyTotals(draft);
    expect(totals).toHaveLength(6);
    expect(totals[0].hours).toBeGreaterThan(0);
    expect(totals[0].tss).toBeGreaterThan(0);
    expect(Object.keys(totals[0].bySport).sort()).toEqual(['bike', 'run', 'swim']);
  });

  it('shows the recovery week as the lighter one', () => {
    const totals = weeklyTotals(draft);
    const rec = totals.find((w) => w.isRecovery);
    const before = totals[rec.index - 1];
    expect(rec.hours).toBeLessThan(before.hours);
  });
});
