/**
 * A hundred ticked checkboxes is not a selection, it is a default nobody
 * chose. These cover the range that replaced it.
 */
import { defaultMonthRange, monthKeysBetween, rangeEnds, sortMonthKeysDesc } from './monthRange';

const MONTHS = ['2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2025-12'];

describe('sortMonthKeysDesc', () => {
  it('puts the newest first and drops duplicates', () => {
    expect(sortMonthKeysDesc(['2025-01', '2026-03', '2025-01'])).toEqual(['2026-03', '2025-01']);
  });

  it('survives junk', () => {
    expect(sortMonthKeysDesc(null)).toEqual([]);
    expect(sortMonthKeysDesc([null, '', '2026-01'])).toEqual(['2026-01']);
  });
});

describe('monthKeysBetween', () => {
  it('takes the months inside the range, ends included', () => {
    expect(monthKeysBetween(MONTHS, '2026-05', '2026-07'))
      .toEqual(['2026-07', '2026-06', '2026-05']);
  });

  it('does not mind the ends being the wrong way round', () => {
    expect(monthKeysBetween(MONTHS, '2026-07', '2026-05'))
      .toEqual(['2026-07', '2026-06', '2026-05']);
  });

  it('returns one month when both ends are the same', () => {
    expect(monthKeysBetween(MONTHS, '2026-06', '2026-06')).toEqual(['2026-06']);
  });

  it('skips months with no data inside the span', () => {
    // Jan–Feb 2026 never happened; asking for them changes nothing.
    expect(monthKeysBetween(MONTHS, '2025-12', '2026-03'))
      .toEqual(['2026-03', '2025-12']);
  });

  it('accepts the {key,label} objects the chart already has', () => {
    const objs = MONTHS.map((key) => ({ key, label: key }));
    expect(monthKeysBetween(objs, '2026-06', '2026-08')).toEqual(['2026-08', '2026-07', '2026-06']);
  });

  it('is empty only when there is nothing to pick from', () => {
    expect(monthKeysBetween([], '2026-01', '2026-06')).toEqual([]);
  });
});

describe('defaultMonthRange', () => {
  it('opens on the last six months rather than all nine years', () => {
    expect(defaultMonthRange(MONTHS)).toHaveLength(6);
    expect(defaultMonthRange(MONTHS)[0]).toBe('2026-08');
  });

  it('takes what there is when there are fewer', () => {
    expect(defaultMonthRange(['2026-08', '2026-07'])).toEqual(['2026-08', '2026-07']);
    expect(defaultMonthRange([])).toEqual([]);
  });

  it('never asks for zero months', () => {
    expect(defaultMonthRange(MONTHS, 0)).toHaveLength(1);
  });
});

describe('rangeEnds', () => {
  it('reads the two ends back out of a selection', () => {
    expect(rangeEnds(['2026-06', '2026-08', '2026-07'])).toEqual({ from: '2026-06', to: '2026-08' });
  });

  it('is empty for an empty selection', () => {
    expect(rangeEnds([])).toEqual({ from: null, to: null });
  });
});
