/**
 * A coach switching athlete in the bar at the top must not get the previous
 * athlete's test reopened under the new athlete's name.
 *
 * The page kept the previous athlete's list in state until the next one
 * arrived. The test list remounts per athlete and reopens the test it last
 * remembers, which it found in that leftover list. So the property pinned here
 * is simple: whatever athlete the list is drawn for, it only ever gets that
 * athlete's tests.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockListCalls = [];
jest.mock('../components/Testing-page/PreviousTestingComponent', () => (props) => {
  mockListCalls.push({ athleteId: props.athleteId, tests: props.tests });
  return null;
});

let mockSelection = 'vivien';
let mockParams = { athleteId: 'vivien' };
const mockSearchParams = new URLSearchParams('');
const mockSetSearchParams = jest.fn();
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));
jest.mock('../context/AthleteSelectionContext', () => ({
  useAthleteSelection: () => ({ selectedAthleteId: mockSelection, setSelectedAthleteId: jest.fn() }),
}));
const mockCoach = { _id: 'coach', role: 'coach' };
jest.mock('../context/AuthProvider', () => ({ useAuth: () => ({ user: mockCoach, isAuthenticated: true }) }));
const mockAddNotification = jest.fn();
jest.mock('../context/NotificationContext', () => ({ useNotification: () => ({ addNotification: mockAddNotification }) }));
jest.mock('../hooks/usePremium', () => ({
  usePremium: () => ({ isPremium: true, canViewAnalytics: true, gate: jest.fn(), UpgradeModalProps: {} }),
}));
jest.mock('../utils/isNativeApp', () => ({ isCapacitorNative: () => false }));
jest.mock('../utils/eventLogger', () => ({ logTestCreated: jest.fn() }));

// Plain functions, not jest.fn(impl): CRA runs jest with resetMocks, which wipes
// mock implementations before each test.
const mockLists = {};
jest.mock('../services/api', () => {
  const get = (url) => {
    const m = String(url).match(/^\/test\/list\/(.+)$/);
    if (m) return mockLists[m[1]];
    if (url === '/user/coach/athletes') return Promise.resolve({ data: [{ _id: 'vivien' }, { _id: 'gio' }] });
    return Promise.resolve({ data: {} });
  };
  return {
    __esModule: true,
    default: { get, post: () => Promise.resolve({ data: {} }), defaults: { headers: { common: {} } } },
    invalidateCache: () => {},
    addTest: () => Promise.resolve({ data: {} }),
    listExternalActivities: () => Promise.resolve([]),
    getStravaActivityDetail: () => Promise.resolve({}),
    getIntegrationStatus: () => Promise.resolve({}),
  };
});

jest.mock('../components/Header/SportsSelector', () => () => null);
jest.mock('../components/common/ErrorBoundary', () => ({ children }) => children);
jest.mock('../components/Testing-page/NewTestingComponent', () => () => null);
jest.mock('../components/Testing-page/CPTestPanel', () => () => null);
jest.mock('../components/Testing-page/VLamaxPanel', () => () => null);
jest.mock('./NativeTestingPage', () => () => null);
jest.mock('../components/DashboardPage/TrainingGlossary', () => () => null);
jest.mock('../components/Testing-page/AddAthleteAndTestModal', () => () => null);
jest.mock('../components/Testing-page/StravaIntegrationModal', () => () => null);
jest.mock('../components/UpgradeModal', () => () => null);
jest.mock('../components/Testing-page/PopulationInsights', () => () => null);
jest.mock('../components/PremiumLock', () => () => null);
jest.mock('../components/Testing-page/ThresholdHistory', () => () => null);
jest.mock('../components/Testing-page/TrainingSinceTestPanel', () => () => null);
jest.mock('../components/Testing-page/TestRecommendationCard', () => () => null);
jest.mock('../components/Testing-page/PredictedCurveCard', () => () => null);
jest.mock('framer-motion', () => {
  const R = require('react');
  const cache = {};
  const motion = new Proxy({}, {
    get: (_, tag) => {
      cache[tag] = cache[tag] || R.forwardRef(({ initial, animate, exit, transition, layout, ...rest }, ref) => R.createElement(tag, { ...rest, ref }));
      return cache[tag];
    },
  });
  return { motion, AnimatePresence: ({ children }) => R.createElement(R.Fragment, null, children) };
});

// eslint-disable-next-line import/first
import TestingPage from './TestingPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const run = (id, athleteId, date) => ({
  _id: id, athleteId, date, sport: 'run', title: id,
  results: [{ interval: 1, power: 300, lactate: 1.2 }, { interval: 2, power: 270, lactate: 2.1 }],
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let container;
let root;

beforeEach(() => {
  mockListCalls.length = 0;
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("never hands the list another athlete's tests while the next athlete's load", async () => {
  mockLists.vivien = Promise.resolve({ data: [run('v1', 'vivien', '2026-11-05')] });
  const gioList = deferred();
  mockLists.gio = gioList.promise;

  mockSelection = 'vivien';
  mockParams = { athleteId: 'vivien' };
  act(() => root.render(<TestingPage />));
  await flush();
  await flush();
  expect(mockListCalls.at(-1)).toMatchObject({ athleteId: 'vivien' });
  expect(mockListCalls.at(-1).tests.map((t) => t._id)).toEqual(['v1']);

  // The coach taps Gio in the bar; Gio's list is still on its way.
  mockSelection = 'gio';
  mockParams = { athleteId: 'gio' };
  act(() => root.render(<TestingPage />));
  await flush();
  expect(mockListCalls.at(-1)).toMatchObject({ athleteId: 'gio' });
  expect(mockListCalls.at(-1).tests).toEqual([]);

  await act(async () => {
    gioList.resolve({ data: [run('g1', 'gio', '2026-11-10')] });
    await gioList.promise;
  });
  await flush();
  expect(mockListCalls.at(-1).tests.map((t) => t._id)).toEqual(['g1']);

  const mixed = mockListCalls.filter(({ athleteId, tests }) => tests.some((t) => t.athleteId !== athleteId));
  expect(mixed).toEqual([]);
});
