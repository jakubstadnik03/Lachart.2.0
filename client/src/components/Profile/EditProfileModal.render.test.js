/**
 * The profile's zones editor, opened by an athlete who reads miles.
 *
 * It used to put the stored number — seconds per KILOMETRE — straight into the
 * box and caption it "/mile": 460 s read as "7:41 /mile" while the profile
 * page above it said 12:21/mi for the same threshold. And the box showed every
 * digit of a threshold a lactate test had computed: 460.63364406900365.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../Modal', () => ({
  __esModule: true,
  default: ({ isOpen, title, children }) => (isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null),
}));

// eslint-disable-next-line import/first
import EditProfileModal from './EditProfileModal';

// 7:41/km and 6:44/km, as a test left them: 12:21/mi and 10:49/mi.
const ZONES = {
  lt1: 460.63364406900365,
  lt2: 403.553900644143,
  zone1: { min: 658, max: 512 },
  zone2: { min: 512, max: 461 },
  zone3: { min: 461, max: 404 },
  zone4: { min: 404, max: 388 },
  zone5: { min: 388, max: 336 },
};
const athlete = (distance) => ({
  _id: 'u1',
  name: 'Walther',
  _selectedSport: 'running',
  units: { distance },
  powerZones: { running: { ...ZONES } },
  heartRateZones: { running: { maxHeartRate: 203 } },
});

let container; let root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const open = (distance, props = {}) => act(() => {
  root.render(<EditProfileModal isOpen zonesOnly onClose={() => {}} onSubmit={() => {}} userData={athlete(distance)} {...props} />);
});
const field = (label) => container.querySelector(`input[aria-label="${label}"]`);

describe('an athlete on miles', () => {
  it('shows the thresholds in the pace the rest of the app shows', () => {
    open('imperial');
    expect(field('LTP1 pace').value).toBe('12:21');
    expect(field('LTP2 pace').value).toBe('10:49');
  });

  it('labels the fields in the unit they are actually in', () => {
    open('imperial');
    expect(container.textContent).toContain('LTP1 (min/mile)');
    expect(container.textContent).toContain('m:ss/mile — lower is faster.');
  });

  it('shows the zone bounds per mile too', () => {
    open('imperial');
    // 658 s/km and 512 s/km — zone one, from 17:39/mi to 13:44/mi.
    expect(field('Zone 1 min pace').value).toBe('17:39');
    expect(field('Zone 1 max pace').value).toBe('13:44');
  });

  it('stores what was typed back in seconds per kilometre', () => {
    const saved = [];
    open('imperial', { onSubmit: (data) => saved.push(data) });
    const input = field('LTP2 pace');
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '10:00');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('focusout', { bubbles: true }));
    });
    // 10:00/mi is 372.8 s/km, and it has to read back as 10:00 — not 9:59.
    expect(field('LTP2 pace').value).toBe('10:00');
    act(() => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(saved[0].powerZones.running.lt2).toBe(372.8);
  });
});

describe('generating zones for an athlete on miles', () => {
  const type = (input, text) => act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
  });

  it('builds the table around the thresholds as typed', () => {
    open('imperial');
    type(field('LTP1 pace'), '12:00');
    type(field('LTP2 pace'), '10:00');
    act(() => {
      [...container.querySelectorAll('button')].find((b) => b.textContent === 'Generate pace zones').click();
    });
    // Zone three runs from LT1 to LT2, and both are read back per mile.
    expect(field('Zone 3 min pace').value).toBe('12:00');
    expect(field('Zone 3 max pace').value).toBe('10:00');
  });
});

describe('an athlete on kilometres', () => {
  it('shows the thresholds per kilometre, rounded to the second', () => {
    open('metric');
    expect(field('LTP1 pace').value).toBe('7:41');
    expect(field('LTP2 pace').value).toBe('6:44');
  });

  it('keeps a pace the athlete did not touch exactly as the test measured it', () => {
    // Rounding it here would print 12:22/mi under a profile page saying 12:21.
    const saved = [];
    open('metric', { onSubmit: (data) => saved.push(data) });
    act(() => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(saved[0].powerZones.running.lt1).toBe(460.63364406900365);
  });

  it('rounds the watts and beats it shows as plain numbers', () => {
    const saved = [];
    act(() => {
      root.render(<EditProfileModal isOpen zonesOnly onClose={() => {}} onSubmit={(d) => saved.push(d)} userData={{
        _id: 'u2', name: 'W', _selectedSport: 'cycling', units: { distance: 'metric' },
        powerZones: { cycling: { lt1: 219.4, lt2: 280.7, zone1: { min: 0, max: 153.58 } } },
        heartRateZones: { cycling: { maxHeartRate: 190.6 } },
      }} />);
    });
    expect(container.querySelector('input[placeholder="e.g. 200"]').value).toBe('219');
    act(() => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(saved[0].powerZones.cycling.zone1.max).toBe(154);
    expect(saved[0].heartRateZones.cycling.maxHeartRate).toBe(191);
  });
});
