/**
 * The prompt earns its place by showing the athlete their own thresholds —
 * "connect Strava" means nothing in the abstract and a lot next to LT2 3:45.
 * So the thing worth pinning down is that the numbers from the saved test
 * actually reach the markup, and that a test too sparse to fit a curve still
 * produces a usable prompt instead of a box full of dashes.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Modal portals into the DOM, which has no equivalent on the server; the title
// is kept so the test can still assert the heading.
jest.mock('../Modal', () => ({ isOpen, title, children }) => (
  isOpen ? <div><h2>{title}</h2>{children}</div> : null
));
jest.mock('../../utils/connectStrava', () => ({ connectStrava: jest.fn() }));
jest.mock('../../services/api', () => ({ startGarminAuth: jest.fn() }));
jest.mock('../../utils/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../context/NotificationContext', () => ({
  useNotification: () => ({ addNotification: jest.fn() }),
}));

// eslint-disable-next-line import/first
import TrackerConnectPrompt from './TrackerConnectPrompt';

/** A six-stage run test, pace stored as seconds per km, lactate turning up. */
const RUN_TEST = {
  sport: 'run',
  inputMode: 'pace',
  unitSystem: 'metric',
  baseLactate: 0.9,
  results: [
    { interval: 1, power: 300, heartRate: 132, lactate: 1.0 },
    { interval: 2, power: 280, heartRate: 144, lactate: 1.3 },
    { interval: 3, power: 260, heartRate: 154, lactate: 1.8 },
    { interval: 4, power: 240, heartRate: 163, lactate: 2.6 },
    { interval: 5, power: 225, heartRate: 172, lactate: 4.2 },
    { interval: 6, power: 210, heartRate: 180, lactate: 6.5 },
  ],
};

const BIKE_TEST = {
  sport: 'bike',
  inputMode: 'power',
  unitSystem: 'metric',
  baseLactate: 1.1,
  results: [
    { interval: 1, power: 150, heartRate: 118, lactate: 1.2 },
    { interval: 2, power: 190, heartRate: 132, lactate: 1.5 },
    { interval: 3, power: 230, heartRate: 147, lactate: 2.1 },
    { interval: 4, power: 270, heartRate: 160, lactate: 3.2 },
    { interval: 5, power: 300, heartRate: 171, lactate: 5.0 },
  ],
};

const render = (test) => renderToStaticMarkup(
  <TrackerConnectPrompt isOpen test={test} onClose={() => {}} />,
);

describe('TrackerConnectPrompt', () => {
  it('leads with the zones, not with the integration', () => {
    const html = render(RUN_TEST);
    expect(html).toContain('Your zones are ready');
    expect(html).toContain('From the test you just saved');
    expect(html).toContain('Right now nothing is being compared against these');
  });

  it('shows both thresholds from the test that was just saved', () => {
    const html = render(RUN_TEST);
    expect(html).toContain('LT1');
    expect(html).toContain('LT2');
    // A run test prints pace per km, so a m:ss value has to be in there.
    expect(html).toMatch(/\d:\d{2}/);
    // Heart rate comes off the same stages.
    expect(html).toMatch(/1\d\d bpm/);
  });

  it('prints a bike test in watts rather than pace', () => {
    const html = render(BIKE_TEST);
    expect(html).toMatch(/\d{3} W/);
  });

  it('offers both trackers and a way out', () => {
    const html = render(RUN_TEST);
    expect(html).toContain('Connect Strava');
    expect(html).toContain('Connect Garmin');
    expect(html).toContain('Not now');
    expect(html).toContain('Settings → Integrations');
  });

  it('a test too sparse for a curve still prompts, without an empty box', () => {
    const html = render({ sport: 'run', inputMode: 'pace', results: [{ interval: 1, power: 300, lactate: 1.1 }] });
    expect(html).toContain('Your zones are ready');
    expect(html).toContain('Connect Strava');
    expect(html).not.toContain('From the test you just saved');
    // No threshold labels, so no row of placeholder dashes where numbers go.
    expect(html).not.toContain('LT1');
    expect(html).not.toContain('LT2');
  });

  it('renders nothing when closed', () => {
    expect(renderToStaticMarkup(
      <TrackerConnectPrompt isOpen={false} test={RUN_TEST} onClose={() => {}} />,
    )).toBe('');
  });
});
