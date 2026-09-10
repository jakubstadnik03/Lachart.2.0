/**
 * Render smoke tests for the two-segment panel.
 *
 * The panel has more conditional branches than anything else in the session
 * view — no test, no heart rate, no blood, no drift history — and each of them
 * is a state a real athlete lands in without anyone noticing it broke. It now
 * also decides whether to draw a segmented control at all, and picking the
 * wrong branch there hides half the analysis behind a control that never
 * appears. Rendering each state to static markup catches that here.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// extractLactateThresholds reaches DataTable, which reaches AuthProvider, which
// imports react-router-dom. The installed 7.10.1 declares main: ./dist/main.js
// and ships no such file — webpack resolves it through the exports map, jest
// falls back to main and cannot. Nothing here routes.
jest.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null }),
}), { virtual: true });

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(() => Promise.resolve({ data: [] })) },
  clearApiCache: jest.fn(),
  getActivityWeather: jest.fn(() => Promise.resolve({ tempC: 21 })),
  getThresholdDrift: jest.fn(() => Promise.resolve({ data: null })),
  updateUserProfile: jest.fn(),
}));

// eslint-disable-next-line import/first
import SessionVsTestPanel from './SessionVsTestPanel';

/** A 60-minute ride: 20 min steady at 210 W, 4×5 min at 280 W, easy between. */
function buildRide() {
  const start = new Date('2026-09-08T15:00:00Z').getTime();
  const rows = [];
  const push = (sec, watts, hr) => {
    for (let i = 0; i < sec; i += 1) {
      rows.push({
        timestamp: new Date(start + (rows.length) * 1000).toISOString(),
        power: watts + ((i % 7) - 3),
        heartRate: hr + ((i % 5) - 2),
      });
    }
  };
  push(1200, 210, 138);
  for (let r = 0; r < 4; r += 1) { push(300, 280, 168); push(180, 140, 122); }
  return rows;
}

/** A five-stage ramp, the shape the threshold pipeline is built to read. */
const TEST = {
  _id: 't1',
  sport: 'bike',
  date: '2026-07-02',
  title: 'Ramp test',
  results: [
    { power: 150, lactate: 1.1, heartRate: 112 },
    { power: 180, lactate: 1.3, heartRate: 126 },
    { power: 210, lactate: 1.9, heartRate: 140 },
    { power: 240, lactate: 2.8, heartRate: 153 },
    { power: 270, lactate: 4.6, heartRate: 166 },
    { power: 300, lactate: 7.4, heartRate: 177 },
  ],
};

const LAPS = [
  { lapNumber: 1, average_watts: 210, lactate: 1.8 },
  { lapNumber: 2, average_watts: 280, lactate: 4.9 },
];

const RIDE = buildRide();

const render = (props) => renderToStaticMarkup(
  <SessionVsTestPanel records={RIDE} sport="bike" tests={[TEST]}
    activityDate="2026-09-08" tempC={21} {...props} />,
);

describe('SessionVsTestPanel', () => {
  it('says so plainly when the athlete has no test for the sport', () => {
    const html = renderToStaticMarkup(
      <SessionVsTestPanel records={RIDE} sport="bike" tests={[]} />,
    );
    expect(html).toContain('Against your test');
    expect(html).toContain('No lactate test on file');
  });

  it('reads the session against the test', () => {
    const html = render({ laps: LAPS });
    expect(html).toContain('Against your test');
    expect(html).toContain('At the same intensity');
    expect(html).toContain('Time at your thresholds');
  });

  it('places the blood samples against the curve', () => {
    const html = render({ laps: LAPS });
    expect(html).toContain('Measured lactate');
    expect(html).toContain('Lap 2');
  });

  it('leaves out the lactate section when no lap carries a value', () => {
    const html = render({ laps: [{ lapNumber: 1, average_watts: 210 }] });
    expect(html).not.toContain('Measured lactate');
  });

  it('draws no segmented control while there is no zone history to show', () => {
    // getThresholdDrift resolves to null in this file, and a control that
    // reveals an empty page is worse than no control.
    const html = render({});
    expect(html).not.toContain('Your zones');
  });

  it('survives a session with no heart rate at all', () => {
    const noHr = RIDE.map(({ timestamp, power }) => ({ timestamp, power }));
    const html = renderToStaticMarkup(
      <SessionVsTestPanel records={noHr} sport="bike" tests={[TEST]} activityDate="2026-09-08" />,
    );
    expect(html).toContain('Against your test');
    expect(html).toMatch(/nothing to compare|no second-by-second/);
  });

  it('renders nothing for a sport the test model does not cover', () => {
    const html = renderToStaticMarkup(
      <SessionVsTestPanel records={RIDE} sport="swim" tests={[TEST]} />,
    );
    expect(html).toBe('');
  });
});

/**
 * The zones segment, which only exists once the drift fetch has answered.
 *
 * Static markup cannot reach it — effects never run, so the control is never
 * drawn — and that is exactly the branch worth guarding: the segment holds six
 * sections that used to render unconditionally, and losing them would look
 * like a design decision rather than a bug.
 */
describe('SessionVsTestPanel · the zones segment', () => {
  const DRIFT = {
    sport: 'bike',
    projection: {
      sessions: 24,
      minutes: 1_140,
      lt1: {
        fromDemand: 210, toDemand: 222, shift: 12, shiftPct: 5.7,
        minutes: 480, confidence: 'high',
      },
      lt2: {
        fromDemand: 263, toDemand: 271, shift: 8, shiftPct: 3.0,
        minutes: 190, confidence: 'medium',
      },
    },
    timeline: [
      { date: '2026-07-14', lt1: 211, lt2: 264 },
      { date: '2026-07-28', lt1: 214, lt2: 266 },
      { date: '2026-08-11', lt1: 218, lt2: 268 },
      { date: '2026-08-25', lt1: 222, lt2: 271 },
    ],
    series: [
      { date: '2026-08-04', id: 'a1', title: 'Endurance', deltaDemand: 6, trendDelta: 4, confidence: 'medium' },
      { date: '2026-08-18', id: 'a2', title: 'Threshold 4×8', deltaDemand: 11, trendDelta: 7, confidence: 'high' },
    ],
    contributors: [
      { id: 'a2', title: 'Threshold 4×8', date: '2026-08-18', minutes: 34, blocks: 4, meanDeltaHr: -4 },
      { id: 'a1', title: 'Endurance', date: '2026-08-04', minutes: 62, blocks: 2, meanDeltaHr: -1 },
    ],
    coverage: { considered: 31, read: 24, compared: 24 },
    retest: { sessions: 24, trendPct: 3.0, direction: 'up', testAgeDays: 68 },
  };

  let React2; let createRoot; let act; let container; let root;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('react-router-dom', () => ({
      useNavigate: () => () => {},
      useLocation: () => ({ pathname: '/', search: '', hash: '', state: null }),
    }), { virtual: true });
    jest.doMock('../../services/api', () => ({
      __esModule: true,
      default: { get: jest.fn(() => Promise.resolve({ data: [] })) },
      clearApiCache: jest.fn(),
      getActivityWeather: jest.fn(() => Promise.resolve({ tempC: 21 })),
      getThresholdDrift: jest.fn(() => Promise.resolve({ data: DRIFT })),
      updateUserProfile: jest.fn(),
    }));
    // eslint-disable-next-line global-require
    React2 = require('react');
    // eslint-disable-next-line global-require
    ({ createRoot } = require('react-dom/client'));
    // eslint-disable-next-line global-require
    ({ act } = require('react-dom/test-utils'));
    container = document.createElement('div');
    document.body.appendChild(container);
    // recharts' ResponsiveContainer observes its parent; jsdom ships no
    // ResizeObserver, and without one every chart in the tree throws on mount.
    window.ResizeObserver = class {
      observe() {}

      unobserve() {}

      disconnect() {}
    };
    // ResponsiveContainer measures its parent; jsdom reports 0 and recharts
    // then renders nothing at all, which would make every assertion below
    // about chart-free text only.
    Object.defineProperties(window.HTMLElement.prototype, {
      offsetWidth: { get: () => 600, configurable: true },
      offsetHeight: { get: () => 300, configurable: true },
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
  });

  const mount = async () => {
    // eslint-disable-next-line global-require
    const Panel = require('./SessionVsTestPanel').default;
    root = createRoot(container);
    await act(async () => {
      root.render(React2.createElement(Panel, {
        records: RIDE, sport: 'bike', tests: [TEST], laps: LAPS,
        activityDate: '2026-09-08', tempC: 21,
      }));
    });
  };

  const clickText = async (text) => {
    const el = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
    expect(el).toBeTruthy();
    await act(async () => { el.click(); });
  };

  it('draws the segmented control once the drift fetch answers', async () => {
    await mount();
    expect(container.textContent).toContain('This session');
    expect(container.textContent).toContain('Your zones');
    // The session reading is what it opens on.
    expect(container.textContent).toContain('Against your test');
    expect(container.textContent).toContain('At the same intensity');
  });

  it('switches to the zones reading and renames the panel', async () => {
    await mount();
    await clickText('Your zones');
    expect(container.textContent).toContain('Against your zones');
    expect(container.textContent).toContain('Where your thresholds sit now');
    expect(container.textContent).toContain('How the curve has moved');
    expect(container.textContent).toContain('Across the season');
    expect(container.textContent).toContain('Session by session');
    expect(container.textContent).toContain('Worth retesting');
    // The session sections are not also on screen — that stacking is the thing
    // this change removed.
    expect(container.textContent).not.toContain('At the same intensity');
  });

  it('shows both thresholds moving, separately', async () => {
    await mount();
    await clickText('Your zones');
    expect(container.textContent).toContain('LT1 · Aerobic threshold');
    expect(container.textContent).toContain('LT2 · Anaerobic threshold');
    expect(container.textContent).toContain('222 W');
    expect(container.textContent).toContain('271 W');
  });

  it('opens the sessions the estimate was built from', async () => {
    await mount();
    await clickText('Your zones');
    expect(container.textContent).toContain('Show the 2 sessions this came from');
    await clickText('Show the 2 sessions this came from');
    expect(container.textContent).toContain('Threshold 4×8');
    expect(container.querySelector('a[href*="/training-calendar/a2"]')).toBeTruthy();
  });

  it('comes back to the session reading', async () => {
    await mount();
    await clickText('Your zones');
    await clickText('This session');
    expect(container.textContent).toContain('Against your test');
    expect(container.textContent).not.toContain('Where your thresholds sit now');
  });
});
