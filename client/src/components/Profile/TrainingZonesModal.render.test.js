/**
 * The zones editor reads and writes pace in the viewer's units while the
 * profile keeps seconds per kilometre.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { setViewerUnitSystem } from '../../utils/viewerUnits';

jest.mock('../Modal', () => ({ __esModule: true, default: ({ isOpen, title, children }) => (isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null) }));

// eslint-disable-next-line import/first
import TrainingZonesModal from './TrainingZonesModal';

const USER = {
  _id: 'u1',
  powerZones: { running: { lt1: 275, lt2: 240, zone3: { min: 275, max: 240 } } },
  heartRateZones: {},
};

let container; let root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); setViewerUnitSystem('metric'); });

const render = (props) => act(() => { root.render(<TrainingZonesModal isOpen onClose={() => {}} onSubmit={() => {}} userData={USER} {...props} />); });
const clickTab = (label) => act(() => {
  [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent === label).click();
});

test('metric: a run threshold reads per kilometre', () => {
  render();
  clickTab('Run');
  expect(container.querySelector('input[aria-label="LT1"]').value).toBe('4:35');
  expect(container.innerHTML).toContain('/km');
  expect(container.innerHTML).not.toContain('/mi');
});

test('imperial: the same profile reads per mile, and saves per kilometre', () => {
  setViewerUnitSystem('imperial');
  const onSubmit = jest.fn();
  render({ onSubmit });
  clickTab('Run');
  expect(container.querySelector('input[aria-label="LT1"]').value).toBe('7:23');
  expect(container.querySelector('input[aria-label="LT2"]').value).toBe('6:26');
  expect(container.innerHTML).toContain('/mi');
  act(() => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  const saved = onSubmit.mock.calls[0][0];
  expect(saved.powerZones.running.lt1).toBe(275);
  expect(saved.powerZones.running.lt2).toBe(240);
});

test('names the athlete when a coach is setting someone else’s zones', () => {
  render({ forAthlete: 'Vojtěch Jarolím' });
  expect(container.querySelector('h3').textContent).toBe('Training zones · Vojtěch Jarolím');
  expect(container.innerHTML).toContain('saved to Vojtěch Jarolím');
});

test('an estimate handed in for review fills the thresholds and draws its zones, in the viewer’s units', () => {
  setViewerUnitSystem('imperial');
  const onSubmit = jest.fn();
  // LT2 estimated at 5:27/km (327 s), LT1 at 6:00/km — the profile had 4:00/km.
  render({ onSubmit, userData: { ...USER, _selectedSport: 'running', _prefill: { lt1: 360, lt2: 327, note: 'Estimated from 47 sessions.' } } });
  expect(container.querySelector('input[aria-label="LT2"]').value).toBe('8:46');
  expect(container.querySelector('input[aria-label="LT1"]').value).toBe('9:39');
  expect(container.innerHTML).toContain('Estimated from 47 sessions.');
  // Zones were derived from the estimate, not left at the profile's.
  expect(container.querySelector('input[aria-label="Zone 3 pace min"]').value).toBe('9:39');
  expect(container.querySelector('input[aria-label="Zone 3 pace max"]').value).toBe('8:46');
  act(() => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  const saved = onSubmit.mock.calls[0][0];
  expect(saved.powerZones.running.lt2).toBe(327);
  expect(saved.powerZones.running.zone3).toMatchObject({ min: 360, max: 327 });
});
