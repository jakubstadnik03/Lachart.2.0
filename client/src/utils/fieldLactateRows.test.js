import { sortPendingRows, sportLabel, pendingTier } from './fieldLactateRows';
import { LIKELY_TEST_SCORE, LIKELY_INTERVALS_SCORE } from './intervalSessionScore';

const row = (id, startDate, score) => ({ _id: id, startDate, score });

describe('sortPendingRows', () => {
  it('puts likely tests first, then intervals, then the rest', () => {
    const out = sortPendingRows([
      row('easy', '2026-11-07T08:00:00Z', 0),
      row('test', '2026-10-20T08:00:00Z', LIKELY_TEST_SCORE),
      row('ints', '2026-11-01T08:00:00Z', LIKELY_INTERVALS_SCORE),
    ]);
    expect(out.map((r) => r._id)).toEqual(['test', 'ints', 'easy']);
  });

  it('orders newest first inside a group, whatever the raw score says', () => {
    const out = sortPendingRows([
      row('older-higher', '2026-10-20T08:00:00Z', 3),
      row('newer-lower', '2026-11-07T08:00:00Z', 1),
      row('middle', '2026-11-01T08:00:00Z', 2),
    ]);
    expect(out.map((r) => r._id)).toEqual(['newer-lower', 'middle', 'older-higher']);
  });

  it('keeps rows without a date at the end of their group and does not mutate', () => {
    const input = [row('nodate', null, 0), row('dated', '2026-11-01T08:00:00Z', 0)];
    const out = sortPendingRows(input);
    expect(out.map((r) => r._id)).toEqual(['dated', 'nodate']);
    expect(input[0]._id).toBe('nodate');
  });

  it('tiers by the same thresholds as the badges', () => {
    expect(pendingTier(LIKELY_TEST_SCORE)).toBe(2);
    expect(pendingTier(LIKELY_INTERVALS_SCORE)).toBe(1);
    expect(pendingTier(LIKELY_INTERVALS_SCORE - 1)).toBe(0);
  });
});

describe('sportLabel', () => {
  it('says one word per sport across Strava and Garmin', () => {
    expect(sportLabel('Ride')).toBe('Ride');
    expect(sportLabel('cycling')).toBe('Ride');
    expect(sportLabel('VirtualRide')).toBe('Indoor ride');
    expect(sportLabel('running')).toBe('Run');
    expect(sportLabel('Swim')).toBe('Swim');
    expect(sportLabel('rowing')).toBe('Rowing');
    expect(sportLabel(null)).toBe('');
  });
});
