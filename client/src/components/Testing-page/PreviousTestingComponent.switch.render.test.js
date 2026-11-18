/**
 * Which test opens when a coach switches athlete. The list remounts per athlete
 * and starts empty until that athlete's tests arrive (TestingPage holds back the
 * previous athlete's list). The test it remembers, `lachart:lastTestId`, is one
 * key for every athlete, so after a switch it names somebody else's test.
 *
 * Before the fix the list waited for that test to turn up, which it never did,
 * so the new athlete's page stayed empty; fed the previous athlete's list, it
 * reopened the previous athlete's test instead.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// The open test is what this is about; the curve stands in for it.
jest.mock('./LactateCurve', () => ({ mockData }) => <div data-testid="open-test">{mockData.title}</div>);
jest.mock('./TestingForm', () => () => null);
jest.mock('./LactateCurveCalculator', () => () => null);
jest.mock('./TrainingZonesGenerator', () => () => null);
jest.mock('./TestComparison', () => () => null);
jest.mock('./TestSelector', () => () => null);
jest.mock('./TrainFromTestCard', () => () => null);
jest.mock('./TestSection', () => () => null);
jest.mock('../DateSelector', () => () => null);
jest.mock('../UpgradeModal', () => () => null);
jest.mock('../RacePacePredictor/RacePacePredictorCard.tsx', () => () => null);
jest.mock('./resolveLtAnchorsFromTest', () => ({ resolveLtAnchorsFromTest: () => null }));
jest.mock('../../services/api', () => ({ updateTest: jest.fn(), deleteTest: jest.fn() }));
jest.mock('../../utils/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../context/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'coach', role: 'coach' } }) }));
jest.mock('../../hooks/usePremium', () => ({
  usePremium: () => ({ isPremium: true, canViewAnalytics: true, gate: jest.fn(), UpgradeModalProps: {} }),
}));
// Exit animations would keep the previous test in the DOM for a while.
jest.mock('framer-motion', () => {
  const R = require('react');
  const cache = {};
  const motion = new Proxy({}, {
    get: (_, tag) => {
      cache[tag] = cache[tag] || R.forwardRef(({ initial, animate, exit, transition, ...rest }, ref) => R.createElement(tag, { ...rest, ref }));
      return cache[tag];
    },
  });
  return { motion, AnimatePresence: ({ children }) => R.createElement(R.Fragment, null, children) };
});

// eslint-disable-next-line import/first
import PreviousTestingComponent from './PreviousTestingComponent';

const run = (id, title, date) => ({
  _id: id, title, date, sport: 'run',
  results: [{ interval: 1, power: 300, lactate: 1.2 }, { interval: 2, power: 270, lactate: 2.1 }],
});
const PREVIOUS_ATHLETES_TEST = run('a2', 'Vivien run', '2026-11-05');
const OLDER = run('b1', 'Gio run, October', '2026-10-01');
const NEWER = run('b2', 'Gio run, November', '2026-11-10');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

const show = (props) => act(() => {
  root.render(
    <PreviousTestingComponent
      key={props.athleteId}
      selectedSport="run"
      setTests={jest.fn()}
      onSelectTestId={jest.fn()}
      selectedTestId={null}
      {...props}
    />,
  );
});
const openTest = () => container.querySelector('[data-testid="open-test"]')?.textContent ?? null;

beforeEach(() => {
  localStorage.clear();
  // The previous athlete's test was open.
  localStorage.setItem('lachart:lastTestId', PREVIOUS_ATHLETES_TEST._id);
  localStorage.setItem('lachart:lastTestId:run', PREVIOUS_ATHLETES_TEST._id);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('switching athlete', () => {
  it("opens the new athlete's latest test once their list arrives", () => {
    show({ athleteId: 'vivien', tests: [PREVIOUS_ATHLETES_TEST] });
    expect(openTest()).toBe('Vivien run');

    show({ athleteId: 'gio', tests: [] });
    expect(openTest()).toBeNull();

    show({ athleteId: 'gio', tests: [OLDER, NEWER] });
    expect(openTest()).toBe('Gio run, November');
  });

  it('opens nothing for an athlete with no test in the chosen sport', () => {
    show({ athleteId: 'vivien', tests: [PREVIOUS_ATHLETES_TEST] });
    show({ athleteId: 'gio', tests: [] });
    show({ athleteId: 'gio', tests: [{ ...NEWER, sport: 'bike', title: 'Gio ride' }] });
    expect(openTest()).toBeNull();
    expect(container.textContent).toContain('No tests available for run');
  });

  it('still opens the test the URL names', () => {
    show({ athleteId: 'gio', tests: [] });
    show({ athleteId: 'gio', tests: [OLDER, NEWER], selectedTestId: 'b1' });
    expect(openTest()).toBe('Gio run, October');
  });
});

describe('the open test leaving the list', () => {
  it('opens the latest one left instead of an empty page', () => {
    show({ athleteId: 'gio', tests: [OLDER, NEWER] });
    expect(openTest()).toBe('Gio run, November');

    show({ athleteId: 'gio', tests: [OLDER] });
    expect(openTest()).toBe('Gio run, October');
  });
});
