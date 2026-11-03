/**
 * The coach's wellness view must colour a change by what it means, not by its
 * sign: stress or soreness going DOWN is good news and has to read green. The
 * server decides the trend (server/utils/wellnessScore.js, tested there); this
 * pins that the tiles show it, and that a tapped tile opens its own chart.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import WellnessTrendView, { relativeDay } from './WellnessTrendView';

const row = (date, over = {}) => ({
  date, wellbeing: 3, sleep: 3, energy: 3, stress: 3, sorenessUpper: 3, sorenessLower: 3, score: 50, ...over,
});

const latest = row('2026-11-02', { stress: 2, sleep: 2, score: 55, pain: true });
const summary = {
  today: '2026-11-02',
  trendFrom: '2026-10-20',
  band: 'watch',
  latest,
  previous: row('2026-10-31', { stress: 4, sleep: 4, score: 55 }),
  deltas: {
    score: { value: 55, delta: 0, trend: 'same' },
    areas: {
      wellbeing: { value: 3, delta: 0, trend: 'same' },
      sleep: { value: 2, delta: -2, trend: 'worse' },
      energy: { value: 3, delta: 0, trend: 'same' },
      stress: { value: 2, delta: -2, trend: 'better' },
      sorenessUpper: { value: 3, delta: 0, trend: 'same' },
      sorenessLower: { value: 3, delta: 0, trend: 'same' },
    },
  },
  rows: [row('2026-10-31', { stress: 4, sleep: 4, score: 55 }), latest],
};

let container;
let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = (props) => {
  // root.render is React's, not Testing Library's; the rule only sees the name.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  act(() => {
    root.render(<WellnessTrendView {...props} />);
  });
};

function tile(label) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent.startsWith(label));
}

test('a fall in stress reads green, a fall in sleep reads red', () => {
  show({ summary });
  const stressDelta = [...tile('Stress').querySelectorAll('span')].find((s) => s.textContent === '−2');
  const sleepDelta = [...tile('Sleep').querySelectorAll('span')].find((s) => s.textContent === '−2');
  expect(stressDelta.className).toContain('text-emerald-600');
  expect(sleepDelta.className).toContain('text-rose-600');
});

test('pain shows as its own flag beside the score', () => {
  show({ summary });
  expect(container.textContent).toContain('Pain reported');
  expect(container.textContent).toContain('55');
});

test('tapping a tile opens that area’s 14-day chart, tapping again closes it', () => {
  show({ summary });
  expect(container.textContent).not.toContain('Stress · 14 days');
  act(() => tile('Stress').click());
  expect(container.textContent).toContain('Stress · 14 days');
  expect(container.textContent).toContain('lower is better');
  act(() => tile('Stress').click());
  expect(container.textContent).not.toContain('Stress · 14 days');
});

test('the app variant renders the same tiles and deltas', () => {
  show({ summary, variant: 'native' });
  expect(tile('Stress').textContent).toContain('−2');
  expect(container.textContent).toContain('since last');
});

test('renders nothing before the first check-in', () => {
  show({ summary: { ...summary, latest: null } });
  expect(container.innerHTML).toBe('');
});

test('relativeDay', () => {
  expect(relativeDay('2026-11-02', '2026-11-02')).toBe('Today');
  expect(relativeDay('2026-11-01', '2026-11-02')).toBe('Yesterday');
  expect(relativeDay('2026-10-30', '2026-11-02')).toBe('3 days ago');
});
