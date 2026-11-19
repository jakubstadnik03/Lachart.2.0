/**
 * Two samples from one session have no time between them and no slope; the
 * panel called that "stable, R² 0.00".
 */
jest.mock('../../services/api', () => ({}));

// eslint-disable-next-line import/first
import { regress } from './LactateTrendPanel';

describe('regress', () => {
  it('reports too little data for two readings on one day', () => {
    const r = regress([{ date: '2026-11-03T09:00:00Z', lactate: 1.8 }, { date: '2026-11-03T09:40:00Z', lactate: 2.1 }]);
    expect(r.label).toBe('insufficient_data');
    expect(r.r2).toBeNull();
  });

  it('reports too little data for three readings on one day', () => {
    const r = regress([1.8, 2.0, 2.2].map((lactate, i) => ({ date: `2026-11-03T09:${10 + i}:00Z`, lactate })));
    expect(r.label).toBe('insufficient_data');
  });

  it('fits a trend once readings span several days', () => {
    const r = regress([
      { date: '2026-10-01T09:00:00Z', lactate: 3.0 },
      { date: '2026-10-15T09:00:00Z', lactate: 2.6 },
      { date: '2026-11-01T09:00:00Z', lactate: 2.2 },
    ]);
    expect(r.label).toBe('improving');
    expect(r.r2).toBeGreaterThan(0.9);
  });
});
