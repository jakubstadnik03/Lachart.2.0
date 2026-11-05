/**
 * What the form hands to onSave, on the paths the app really uses.
 *
 * Editing a saved test is the trap: its parent ignores onTestDataChange, so a
 * value that only travels that way never reaches the database. The stage length
 * did exactly that, and without it a last level stopped early cannot count.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// lucide-react ships as ES modules, which jest does not transform here.
jest.mock('lucide-react', () => new Proxy({}, { get: () => () => null }));
jest.mock('../../context/NotificationContext', () => ({ useNotification: () => ({ addNotification: jest.fn() }) }));
jest.mock('../../context/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'u1', role: 'athlete' } }) }));
jest.mock('../../hooks/usePremium', () => ({ usePremium: () => ({ isPremium: true, gate: jest.fn(), UpgradeModalProps: {} }) }));
jest.mock('../../services/api', () => ({ getUserTests: jest.fn(() => Promise.resolve({ data: [] })) }));
jest.mock('../../utils/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../UpgradeModal', () => () => null);
jest.mock('./TrackerConnectPrompt', () => () => null);
jest.mock('../DashboardPage/TrainingGlossary', () => () => null);

// eslint-disable-next-line import/first
import TestingForm from './TestingForm';

global.IS_REACT_ACT_ENVIRONMENT = true;

const savedTreadmillTest = (extra = {}) => ({
  _id: 'test1',
  title: 'Treadmill',
  sport: 'run',
  inputMode: 'speed',
  unitSystem: 'metric',
  baseLactate: 1,
  date: '2026-11-05T00:00:00.000Z',
  results: [[13, 1.4], [14, 1.9], [15, 3.0], [16, 5.0], [17, 8.1]].map(([speed, lactate], i) => ({
    interval: i + 1, power: 3600 / speed, lactate, heartRate: 150 + i, intervalType: 'work',
  })),
  ...extra,
});

let container;
let root;

const setValue = (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
// document, not container: the step wizard opens in a portal.
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const stageDuration = () => container.querySelector('input[placeholder="e.g. 300 (5 min)"]');
const lastDur = () => [...container.querySelectorAll('input[placeholder="MM:SS"], input[placeholder="03:00"]')].pop();

async function open(testData, onSave, onTestDataChange = () => {}) {
  // react-dom's root.render, which does need act; this lint rule takes it for Testing Library's.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    root.render(<TestingForm testData={testData} onSave={onSave} onTestDataChange={onTestDataChange} />);
  });
}

beforeEach(() => {
  localStorage.setItem('testingForm_showStageCol', '1');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
});

describe('editing a saved test', () => {
  it('saves the stage length and the time reached on the last level', async () => {
    const onSave = jest.fn(() => Promise.resolve());
    await open(savedTreadmillTest(), onSave);
    await click(button('Edit'));

    await setValue(lastDur(), '1:40');
    expect(container.textContent).toContain('To count the last level proportionally');

    await setValue(stageDuration(), '180');
    expect(container.textContent).toContain('Last level stopped at 1:40 of 3:00: counted at 16.6 km/h instead of 17.0 km/h');
    expect(container.textContent).not.toContain('To count the last level proportionally');

    await click(button('Save Changes'));
    const saved = onSave.mock.calls[0][0];
    expect(saved.stageDurationSec).toBe(180);
    expect(saved.stageMeasureMode).toBe('duration');
    expect(saved.results[4].duration).toBe(100);
    // The stored row keeps what was typed; the proportional speed is only ever worked out.
    expect(3600 / saved.results[4].power).toBeCloseTo(17, 1);
  });

  it('keeps protocol values it did not touch, and clears one that was emptied', async () => {
    const onSave = jest.fn(() => Promise.resolve());
    await open(savedTreadmillTest({ stageDurationSec: 180, maxLactate: 12.5, restingHR: 48 }), onSave);
    await click(button('Edit'));
    await setValue(stageDuration(), '');
    await click(button('Save Changes'));
    const saved = onSave.mock.calls[0][0];
    expect(saved.maxLactate).toBe(12.5);
    expect(saved.restingHR).toBe(48);
    expect(saved.stageDurationSec).toBeNull();
  });

  it('shows the next saved test\'s stage length, not the last one\'s', async () => {
    const onSave = jest.fn(() => Promise.resolve());
    await open(savedTreadmillTest({ stageDurationSec: 180 }), onSave);
    await click(button('Edit'));
    expect(stageDuration().value).toBe('180');
    await open(savedTreadmillTest({ _id: 'test2', stageDurationSec: 300 }), onSave);
    expect(stageDuration().value).toBe('300');
  });
});

describe('a new test', () => {
  it('saves the stage length the step wizard set', async () => {
    const onSave = jest.fn(() => Promise.resolve());
    await open({ title: 'Ladder', sport: 'bike', date: '2026-11-05', results: [] }, onSave);
    await click([...container.querySelectorAll('button')].find((b) => /Step wizard/.test(b.textContent)));
    expect(button('Generate')).toBeTruthy();
    const [start, step] = [...document.querySelectorAll('.fixed input')];
    await setValue(start, '200');
    await setValue(step, '20');
    await click(button('Generate'));

    expect(stageDuration().value).toBe('180');
    const lactates = [...container.querySelectorAll('input[placeholder="mmol/L"]')].slice(-6);
    for (let i = 0; i < lactates.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await setValue(lactates[i], String(1 + i));
    }
    await click(button('Save Test'));
    const saved = onSave.mock.calls[0][0];
    expect(saved.stageDurationSec).toBe(180);
    expect(saved.results).toHaveLength(6);
    expect(saved.results[5].duration).toBe(180);
  });
});
