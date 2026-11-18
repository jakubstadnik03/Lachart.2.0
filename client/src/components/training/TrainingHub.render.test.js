/**
 * iOS Training: a card's work power read 247 W from the session average and
 * changed to 257 W a few seconds later when the laps arrived. A group whose
 * laps are still on their way shows a placeholder until its number is final.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../Calendar/CalendarView', () => ({ LapChart: () => null }));

// eslint-disable-next-line import/first
import TrainingHub from './TrainingHub';

const day = (n) => new Date(Date.now() - n * 86400000);
const session = (id, n, value, extra = {}) => ({
  id, sport: 'bike', title: '4x10 LT2', date: day(n), laps: [], summary: { value, hr: 150 }, raw: {}, ...extra,
});
const group = (key, label, sessions) => ({ key, label, shape: '4×10 min', sport: 'bike', sessions });
const fmt = (v) => `${Math.round(v)} W`;

const toHtml = (groups) => renderToStaticMarkup(
  <TrainingHub groups={groups} sessions={groups.flatMap((g) => g.sessions)} fmt={fmt} fmtDur={() => ''} fmtDist={() => ''} />,
);

describe('TrainingHub', () => {
  it('holds a group\'s number while its laps are still loading', () => {
    const view = toHtml([group('g1', '4x10 LT2', [
      session('a', 40, 240), session('b', 20, 245), session('c', 2, 247, { lapsPending: true, lapsLoading: true }),
    ])]);
    expect(view).toContain('Reading laps');
    expect(view).not.toContain('247 W');
    expect(view).not.toContain('245 W');
  });

  it('after a few seconds shows the number it has, marked provisional', () => {
    jest.useFakeTimers();
    const container = document.createElement('div');
    const root = createRoot(container);
    const groups = [group('g1', '4x10 LT2', [
      session('a', 40, 240), session('b', 20, 245), session('c', 2, 247, { lapsPending: true, lapsLoading: true }),
    ])];
    act(() => { root.render(<TrainingHub groups={groups} sessions={groups[0].sessions} fmt={fmt} fmtDur={() => ''} fmtDist={() => ''} />); });
    expect(container.textContent).toContain('Reading laps');
    expect(container.textContent).not.toContain('Provisional');
    act(() => { jest.advanceTimersByTime(6500); });
    expect(container.textContent).toContain('Provisional');
    act(() => { root.unmount(); });
    jest.useRealTimers();
  });

  it('shows the latest session\'s number while older laps load, but not the trend yet', () => {
    const view = toHtml([group('g1', '4x10 LT2', [
      session('a', 40, 200, { lapsPending: true, lapsLoading: true }), session('b', 20, 245), session('c', 2, 257),
    ])]);
    expect(view).not.toContain('Reading laps');
    expect(view).toContain('257 W');
    // +57 W against the still-loading first session would be provisional.
    expect(view).not.toMatch(/\+\d+ W/);
  });

  it('shows the number once every lap has arrived', () => {
    const view = toHtml([group('g1', '4x10 LT2', [session('a', 40, 240), session('b', 20, 245), session('c', 2, 257)])]);
    expect(view).not.toContain('Reading laps');
    expect(view).toContain('257 W');
  });

  it('does not wait forever on old sessions nobody is fetching', () => {
    const view = toHtml([group('g1', '4x10 LT2', [
      session('old', 300, 230, { lapsPending: true, lapsLoading: false }), session('b', 20, 245), session('c', 2, 257),
    ])]);
    expect(view).not.toContain('Reading laps');
    expect(view).toContain('257 W');
  });

  it('names what the headline counts when only one group qualifies', () => {
    const view = toHtml([
      group('g1', '4x10 LT2', [session('a', 40, 240), session('b', 20, 250), session('c', 2, 260)]),
      group('g2', 'Long ride', [session('d', 30, 200), session('e', 5, 205)]),
    ]);
    expect(view).not.toContain('1 of 1');
    expect(view).toContain('the one session you have repeated three times or more lately');
  });
});
