/**
 * Render smoke tests — the card and the verdict block have a lot of conditional
 * branches (minimised, nerd voice, no plan, no efficiency data) and a broken one
 * only shows up when an athlete happens to land in that state. Rendering each
 * branch to static markup catches it here instead.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The card fetches wellness on mount. A static render has no business making a
// request, and pulling in services/api drags axios (ESM) through a transform
// jest doesn't apply to node_modules. Wellness is passed as a prop instead.
jest.mock('../../services/wellnessData', () => ({
  fetchWellness: () => Promise.resolve({ connected: false, days: [] }),
}));
// The RPE capture saves through services/api, which imports axios (ESM).
// SportGlyph pulls in lucide-react, which ships ESM that jest won't transform.
jest.mock('../shared/SportIcon', () => ({ SportGlyph: () => null }));
jest.mock('../../services/api', () => ({
  updateFitTraining: jest.fn(),
  updateStravaActivity: jest.fn(),
  updateTraining: jest.fn(),
  getTimelineZones: jest.fn(),
}));

// eslint-disable-next-line import/first
import DailyCoachCard from './DailyCoachCard';
// eslint-disable-next-line import/first
import ComparisonVerdict from '../Training-log/ComparisonVerdict';

const NOW = new Date();
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const offset = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d;
};

const USER = { _id: 'u1', name: 'Jakub', notifications: {} };
const PROFILE = { ftp: 280, maxHr: 190, powerZones: { cycling: { ftp: 280, lt2: 270 } } };
const ACTIVITIES = [
  { id: 'a1', date: offset(-1), sport: 'run', title: 'Easy run', totalTime: 2700, distance: 8200, tss: 38 },
  { id: 'a2', date: offset(-3), sport: 'bike', title: 'Endurance', totalTime: 7200, distance: 60000, tss: 95 },
];
const PLANNED = [
  { _id: 'p1', date: dayKey(NOW), sport: 'bike', title: '4x8min VO2max', status: 'planned', targetTss: 95, plannedDuration: 5400 },
];

const renderCard = (props = {}) =>
  renderToStaticMarkup(
    <DailyCoachCard
      athleteId="u1"
      user={USER}
      todayMetrics={{ fitness: 62, fatigue: 78, form: -16 }}
      plannedWorkouts={PLANNED}
      activities={ACTIVITIES}
      userProfile={PROFILE}
      {...props}
    />,
  );

describe('DailyCoachCard renders', () => {
  // The card is collapsed by default and opens into a bottom sheet, which is a
  // portal and cannot be server-rendered — so these cover the banner, which is
  // what an athlete actually sees on load. buildDailyCard's own tests cover the
  // contents behind the tap.

  it('leads with the headline and two lines of the directive', () => {
    const html = renderCard();
    expect(html).toContain('Deep in the work');
    expect(html).toContain('line-clamp-2');
    // Detail belongs behind the tap, not in the banner.
    expect(html).not.toContain('Productive fatigue');
    expect(html).not.toContain('How did it feel?');
  });

  it('carries the readiness colour so the state reads at a glance', () => {
    expect(renderCard()).toContain('#B45309'); // productive fatigue
  });

  it('shows a skeleton while loading rather than a banner of zeroes', () => {
    const html = renderCard({ loading: true });
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('Deep in the work');
  });

  it('renders nothing at all with no data to stand on', () => {
    const html = renderToStaticMarkup(
      <DailyCoachCard athleteId="u1" user={USER} todayMetrics={{}} plannedWorkouts={[]} activities={[]} />,
    );
    expect(html).toBe('');
  });

  it('still speaks the chosen voice in the banner', () => {
    const html = renderCard({ user: { ...USER, notifications: { dailyCardStyle: 'dark' } } });
    expect(html).toContain('This is the part that counts');
  });
});

describe('ComparisonVerdict renders', () => {
  const s = (date, values) => ({
    _id: `t-${date}`,
    title: '5x5min',
    date,
    results: values.map((v) => ({ type: 'work', power: v, heartRate: 150 })),
  });

  it('leads with the verdict and the confidence line', () => {
    const html = renderToStaticMarkup(
      <ComparisonVerdict
        trainings={[s('2026-07-01', [280, 281, 280]), s('2026-07-08', [300, 301, 300])]}
        metric="power"
      />,
    );
    expect(html).toContain('Verdict');
    expect(html).toContain('Real change');
    expect(html).toContain('Best ever');
  });

  it('says so plainly when a difference is inside measurement error', () => {
    const html = renderToStaticMarkup(
      <ComparisonVerdict
        trainings={[
          { _id: 'l1', date: '2026-07-01', results: [{ type: 'work', lactate: 3.0 }, { type: 'work', lactate: 3.1 }] },
          { _id: 'l2', date: '2026-07-08', results: [{ type: 'work', lactate: 2.9 }, { type: 'work', lactate: 3.0 }] },
        ]}
        metric="lactate"
      />,
    );
    expect(html).toContain('No measurable change');
    expect(html).toContain('Within measurement error');
  });

  it('renders nothing with a single session', () => {
    const html = renderToStaticMarkup(
      <ComparisonVerdict trainings={[s('2026-07-01', [280, 281])]} metric="power" />,
    );
    expect(html).toBe('');
  });
});
