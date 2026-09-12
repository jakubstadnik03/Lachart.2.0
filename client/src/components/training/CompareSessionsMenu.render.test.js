/**
 * The compared-sessions list lives behind one button. These pin down what
 * the button says, what the list shows, and which callback each tap fires.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CompareSessionsMenu from './CompareSessionsMenu';

const sessions = [
  { id: 'cur', titleManual: 'Bike endurance + heat', date: '2026-09-11T08:00:00Z' },
  { id: 'a', title: '4×8 min sweet spot', date: '2026-09-09T08:00:00Z' },
  { id: 'b', title: 'Threshold repeats', date: '2026-08-31T08:00:00Z' },
];

let container;
let root;

const mount = (extra = {}) => {
  const props = {
    sessions, currentId: 'cur', hidden: new Set(), highlightId: null,
    describe: () => '60 min · 42 km',
    onToggleHidden: jest.fn(), onShowAll: jest.fn(), onHideOthers: jest.fn(), onHighlight: jest.fn(),
    ...extra,
  };
  root = createRoot(container);
  act(() => { root.render(<CompareSessionsMenu {...props} />); });
  return props;
};

const buttonWithText = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const bodyText = () => document.body.textContent;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

describe('CompareSessionsMenu', () => {
  it('one button carries the count; the list opens with titles, dates and numbers', () => {
    mount();
    expect(bodyText()).toContain('2 compared');
    expect(bodyText()).not.toContain('Threshold repeats');
    click(buttonWithText('2 compared'));
    expect(bodyText()).toContain('Compared sessions');
    expect(bodyText()).toContain('Bike endurance + heat');
    expect(bodyText()).toContain('4×8 min sweet spot');
    expect(bodyText()).toContain('Aug 31, 2026 · 60 min · 42 km');
  });

  it('the eye hides a session; this session has no eye', () => {
    const props = mount();
    click(buttonWithText('2 compared'));
    const eyes = document.querySelectorAll('button[aria-label="Hide session"]');
    expect(eyes).toHaveLength(2);
    click(eyes[1]);
    expect(props.onToggleHidden).toHaveBeenCalledWith('b');
  });

  it('tapping a row highlights it and closes the list', () => {
    const props = mount();
    click(buttonWithText('2 compared'));
    click(buttonWithText('Threshold repeats'));
    expect(props.onHighlight).toHaveBeenCalledWith('b');
    expect(bodyText()).not.toContain('Compared sessions');
  });

  it('a hidden count and Show all appear once something is hidden', () => {
    const props = mount({ hidden: new Set(['a']) });
    expect(bodyText()).toContain('1 hidden');
    click(buttonWithText('2 compared'));
    click(buttonWithText('Show all'));
    expect(props.onShowAll).toHaveBeenCalled();
  });

  it('a highlighted session gets a chip that clears it', () => {
    const props = mount({ highlightId: 'a' });
    const chip = buttonWithText('4×8 min sweet spot');
    expect(chip).toBeTruthy();
    click(chip);
    expect(props.onHighlight).toHaveBeenCalledWith(null);
  });
});
