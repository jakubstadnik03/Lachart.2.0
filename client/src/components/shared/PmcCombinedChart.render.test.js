/**
 * The Form & Fitness chart's chrome.
 *
 * On a phone this sat under two rows of buttons, a three-card headline and
 * two lines of instructions, on a plot that kept a third of the width for
 * its axes. These pin the shape it has now: one title row, three numbers
 * that follow the finger, a full-width plot the page can scroll over, and
 * the span picked underneath.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let lastChartProps = null;
jest.mock('echarts-for-react', () => {
  const ReactLib = require('react');
  // A class, like the real one: the component only mounts a chart whose
  // export is a function, and takes a ref to reach getEchartsInstance.
  class FakeECharts extends ReactLib.Component {
    getEchartsInstance() { return { dispatchAction: () => {} }; }
    render() {
      lastChartProps = this.props;
      return ReactLib.createElement('div', { 'data-testid': 'chart' });
    }
  }
  return { __esModule: true, default: FakeECharts };
});

const mockGetTodayMetrics = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: () => Promise.resolve({ data: [] }) },
  getTodayMetrics: (...a) => mockGetTodayMetrics(...a),
}));
jest.mock('../../services/workoutPlannerApi', () => ({ getPlannedWorkouts: () => Promise.resolve([]) }));
jest.mock('../../utils/calendarActivitiesForPmc', () => ({
  readCalendarActivitiesCache: () => [],
  fetchCalendarActivitiesForPmc: () => Promise.resolve([]),
  CALENDAR_DATA_EVENT: 'calendarData',
}));
jest.mock('../../utils/inferThresholdsFromActivities', () => ({ mergeProfileZones: (p) => p }));
jest.mock('./FormFitnessHelpSheet', () => () => null);
// Something down the import chain reaches lucide-react, which ships ESM
// jest will not transform; nothing here draws an icon.
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }), { virtual: true });

const SERIES = [
  { date: '2026-09-08', Fitness: 60, Fatigue: 50, Form: 10, TSS: 80 },
  { date: '2026-09-09', Fitness: 61, Fatigue: 55, Form: 6, TSS: 90 },
  { date: '2026-09-10', Fitness: 62, Fatigue: 61, Form: 1, TSS: 100 },
  { date: '2026-09-11', Fitness: 63, Fatigue: 64, Form: -1, TSS: 70 },
];
jest.mock('../../utils/formFitnessFromActivities', () => ({
  computePmcFromActivities: () => ({
    series: SERIES,
    todayMetrics: { fitness: 63, fatigue: 64, form: -1, fitnessChange: 1, fatigueChange: 3, formChange: -2 },
  }),
  computePmcProjection: () => [],
  buildPlannedTssByDate: () => ({}),
}));

// eslint-disable-next-line import/first
import PmcCombinedChart from './PmcCombinedChart';

const USER = { _id: 'u1', role: 'athlete', powerZones: {} };
const ACTIVITIES = [{ _id: 'a1', date: '2026-09-11', sport: 'bike', tss: 70 }];

let container;
let root;
beforeEach(() => {
  lastChartProps = null;
  mockGetTodayMetrics.mockResolvedValue({ data: { fitness: 73, fatigue: 71, form: 7, fitnessChange: 1, fatigueChange: 5, formChange: 0 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = async (props = {}) => {
  await act(async () => {
    root.render(<PmcCombinedChart athleteId="u1" user={USER} userProfile={USER} activities={ACTIVITIES} isMobile {...props} />);
  });
  await act(async () => { await Promise.resolve(); });
};

describe('PmcCombinedChart · chrome', () => {
  it('headlines the server numbers under one title row, with the span picker below the plot', async () => {
    await render();
    const html = container.innerHTML;
    expect(html).toContain('Form &amp; Fitness');
    // Server numbers, not the local series' last point.
    expect(html).toContain('>73<');
    expect(html).toContain('>+7<');
    expect(html).toContain('>71<');
    expect(html).toContain('↑ 1 vs yesterday');
    // The controls that are left.
    expect(container.querySelector('[role="tablist"][aria-label="Sport"]')).not.toBeNull();
    expect(container.querySelector('[role="tablist"][aria-label="Range"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="What Fitness, Fatigue and Form mean"]')).not.toBeNull();
    // The ones that are gone.
    expect(html).not.toContain('Projection');
    expect(html).not.toContain('Scroll or drag');
    expect(html).not.toContain('Reset zoom');
    expect(html).not.toContain('Solid = actual');
  });

  it('gives a phone the whole width and no zoom to fight the page scroll', async () => {
    await render({ isMobile: true });
    expect(lastChartProps.option.dataZoom).toEqual([]);
    expect(lastChartProps.option.grid.left).toBeLessThan(10);
    expect(lastChartProps.option.yAxis[0].axisLabel.inside).toBe(true);
    expect(container.querySelector('.-mx-3')).not.toBeNull();
    expect(lastChartProps.option.tooltip.showContent).toBe(false);
  });

  it('keeps the slider and the tooltip for a pointer', async () => {
    await render({ isMobile: false });
    expect(lastChartProps.option.dataZoom.map((z) => z.type)).toEqual(['inside', 'slider']);
    expect(lastChartProps.option.tooltip.showContent).toBe(true);
    expect(container.querySelector('.-mx-3')).toBeNull();
  });

  it('follows the finger: the numbers become the day under it, and come back on release', async () => {
    await render();
    await act(async () => {
      lastChartProps.onEvents.updateAxisPointer({ axesInfo: [{ axisDim: 'x', value: 1 }] });
    });
    let html = container.innerHTML;
    expect(html).toContain('>61<');
    expect(html).toContain('>+6<');
    expect(html).toContain('>55<');
    expect(html).toContain('Daily TSS 90');
    expect(html).not.toContain('vs yesterday');
    expect(html).not.toContain('Today');

    await act(async () => { lastChartProps.onEvents.globalout(); });
    html = container.innerHTML;
    expect(html).toContain('>73<');
    expect(html).toContain('Today');
    expect(html).toContain('↑ 1 vs yesterday');
  });
});
