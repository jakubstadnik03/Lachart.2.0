/**
 * What the wearable markers are allowed to say.
 *
 * The morning that prompted this: resting HR 45 against a usual 42.5 (+6%),
 * HRV 67 against a usual 86 (−22%), and the card said "Overreaching — time
 * to back off". Neither number is outside a normal night's swing.
 */
import { assessReadiness, baselineStats, markerScore, MARKER_RULES, dayRecoveryStatus } from './recovery';

const day = (i, restingHeartRate, hrvMs, sleepMinutes = 430) => ({
  date: `2026-09-${String(i).padStart(2, '0')}`, restingHeartRate, hrvMs, sleepMinutes,
});

/** Twenty-seven quiet nights, then this morning. */
const quietMonth = (rhrToday, hrvToday, sleepToday = 430) => [
  ...Array.from({ length: 27 }, (_, i) => day(i + 1, 42 + (i % 2), 84 + (i % 3) * 2)),
  day(28, rhrToday, hrvToday, sleepToday),
];

describe('assessReadiness', () => {
  it('a +6% resting HR and a −20% HRV are worth a look, not a day off', () => {
    const r = assessReadiness(quietMonth(45, 67), { tsb: -12 });
    expect(r.level).toBe('watch');
    expect(r.reasons).toEqual(['HRV 22% below your usual']);
    expect(r.metrics.rhrPct).toBe(6);
    expect(r.metrics.hrvPct).toBe(-22);
  });

  it('an ordinary morning is recovered', () => {
    const r = assessReadiness(quietMonth(43, 80), { tsb: -12 });
    expect(r.level).toBe('ok');
    expect(r.reasons).toEqual([]);
  });

  it('both markers clearly out is overreaching', () => {
    const r = assessReadiness(quietMonth(48, 56), { tsb: -12 }); // +13%, −35%
    expect(r.level).toBe('high');
    expect(r.reasons).toEqual(['resting HR 13% above your usual', 'HRV 35% below your usual']);
  });

  it('two mild flags only become overreaching on deep fatigue', () => {
    const mild = quietMonth(46, 68); // +8%, −21%
    expect(assessReadiness(mild, { tsb: -12 }).level).toBe('watch');
    expect(assessReadiness(mild, { tsb: -30 }).level).toBe('high');
  });

  it('a noisy athlete gets wider lines', () => {
    // HRV swinging between 60 and 110 every other night: −20% is nothing here.
    const noisy = [
      ...Array.from({ length: 27 }, (_, i) => day(i + 1, 42, i % 2 ? 110 : 60)),
      day(28, 42, 68),
    ];
    const stats = baselineStats(noisy, 'hrvMs');
    expect(stats.cv).toBeGreaterThan(0.25);
    expect(markerScore(68, stats, MARKER_RULES.hrvMs).score).toBe(0);
    expect(assessReadiness(noisy, { tsb: 0 }).level).toBe('ok');
  });

  it('short sleep alone is a watch, and says so', () => {
    const r = assessReadiness(quietMonth(43, 82, 300), { tsb: 0 });
    expect(r.level).toBe('watch');
    expect(r.reasons).toEqual(['short sleep']);
  });

  it('the calendar badge reads the same lines', () => {
    expect(dayRecoveryStatus(day(1, 45, 67), 42.5, 84).level).toBe('watch');
    expect(dayRecoveryStatus(day(1, 43, 80), 42.5, 84).level).toBe('ok');
    expect(dayRecoveryStatus(day(1, 48, 56), 42.5, 84).level).toBe('high');
  });
});
