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
// eslint-disable-next-line import/first
import { COACHING_STYLES } from '../../constants/coachingStyles';

// The day picks one of a voice's lines, so a test asks for any of them.
const voice = (id) => COACHING_STYLES.find((v) => v.id === id);
const containsOneOf = (html, variants) => variants.some((v) => html.includes(v.replace(/'/g, '&#x27;')) || html.includes(v));

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
    expect(containsOneOf(html, voice('supportive').headline.productive)).toBe(true);
    expect(html).toContain('line-clamp-2');
    // The rest of the detail belongs behind the tap, not in the banner.
    expect(html).not.toContain('How did it feel?');
  });

  it('says how ready you are, in colour, on the first line — and nothing more', () => {
    const html = renderCard();
    expect(html).toContain('#B45309'); // productive fatigue
    expect(html).toContain('Productive fatigue');
    expect(html).not.toContain('Fitness 62');
    expect(html).not.toContain('Form -16');
  });

  it('marks the day’s hard session among the sport glyphs, and says Rest day when there is none', () => {
    expect(renderCard()).toContain('bg-orange-500');
    expect(renderCard({ plannedWorkouts: [] })).toContain('Rest day');
  });

  it('adds the body’s verdict when a wearable disagrees with the load model', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: dayKey(offset(i - 6)), restingHeartRate: i === 6 ? 58 : 50, hrvMs: i === 6 ? 40 : 60, sleepMinutes: 420,
    }));
    const html = renderCard({ wellnessDays: days, todayMetrics: { fitness: 62, fatigue: 50, form: 12 } });
    // The body's verdict is the chip, in place of the load model's.
    expect(html).toMatch(/Overreaching|Watch recovery/);
    expect(html).not.toContain('>Fresh<');
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
    expect(containsOneOf(html, voice('dark').headline.productive)).toBe(true);
  });
});

describe('DailyCoachCard opens what it names', () => {
  // The sheet is a portal, so these need a real (jsdom) render.
  const { createRoot } = require('react-dom/client');
  const { act } = require('react-dom/test-utils');
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
  });

  const mount = (props) => {
    root = createRoot(container);
    act(() => {
      root.render(
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
    });
  };
  const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const buttonWithText = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  const openSheet = () => click(container.querySelector('button')); // the collapsed card

  it('a tap on today’s session hands the planned workout back and folds the sheet away', () => {
    const onOpenPlanned = jest.fn();
    mount({ onOpenPlanned });
    openSheet();
    expect(document.body.textContent).toContain('HARD — threshold work or above');
    click(buttonWithText('4x8min VO2max'));
    expect(onOpenPlanned).toHaveBeenCalledWith(PLANNED[0]);
    expect(document.body.textContent).not.toContain('How did it feel?');
  });

  it('a plan already ridden opens the ride, with the plan alongside', () => {
    const onOpenPlanned = jest.fn();
    const onOpenActivity = jest.fn();
    const ride = { id: 'strava-9', date: NOW, sport: 'Ride', title: 'Morning Ride', totalTime: 5400, distance: 60000, tss: 90 };
    mount({ onOpenPlanned, onOpenActivity, activities: [...ACTIVITIES, ride] });
    openSheet();
    expect(document.body.textContent).toContain('Done · 4x8min VO2max');
    click(buttonWithText('4x8min VO2max'));
    expect(onOpenActivity).toHaveBeenCalledWith(ride, PLANNED[0]);
    expect(onOpenPlanned).not.toHaveBeenCalled();
  });

  it('a session nothing planned accounts for is listed as done, and opens', () => {
    const onOpenActivity = jest.fn();
    const swim = { id: 'strava-8', date: NOW, sport: 'Swim', title: 'Lunch Swim', totalTime: 2400, distance: 2000, tss: 40 };
    mount({ onOpenActivity, activities: [...ACTIVITIES, swim] });
    openSheet();
    expect(document.body.textContent).toContain('Done · Lunch Swim');
    click(buttonWithText('Lunch Swim'));
    expect(onOpenActivity).toHaveBeenCalledWith(swim);
  });

  it('yesterday opens the activity itself', () => {
    const onOpenActivity = jest.fn();
    mount({ onOpenActivity });
    openSheet();
    click(buttonWithText('Yesterday, tomorrow & load'));
    click(buttonWithText('Easy run'));
    expect(onOpenActivity).toHaveBeenCalledWith(ACTIVITIES[0]);
  });

  it('without a handler the rows are plain text', () => {
    mount({});
    openSheet();
    expect(buttonWithText('4x8min VO2max')).toBeUndefined();
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
