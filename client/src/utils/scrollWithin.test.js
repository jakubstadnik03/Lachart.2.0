/**
 * The native shell scrolls a div, the browser scrolls the window, and the
 * header icon has to work in both. Getting this wrong is silent: the tap
 * lands, nothing moves, and it reads as a dead button.
 */
import { findScrollParent, keepShellPinned, pinShellDuringKeyboard, scrollIntoViewWithin, scrollToTopWithin } from './scrollWithin';

/** A DOM-ish node good enough for walking parents. */
const node = ({ overflowY = 'visible', scrollHeight = 100, clientHeight = 100, parent = null } = {}) => {
  const n = { overflowY, scrollHeight, clientHeight, scrollTop: 0, parentElement: parent };
  n.scrollTo = jest.fn(({ top }) => { n.scrollTop = top; });
  return n;
};

const winWith = (map) => ({
  getComputedStyle: (n) => ({ overflowY: n.overflowY }),
  scrollTo: jest.fn(),
  ...map,
});

describe('findScrollParent', () => {
  it('finds the div that actually scrolls', () => {
    const scroller = node({ overflowY: 'auto', scrollHeight: 2000, clientHeight: 800 });
    const inner = node({ parent: scroller });
    const el = node({ parent: inner });
    expect(findScrollParent(el, winWith())).toBe(scroller);
  });

  it('ignores an overflow container that has nothing to scroll', () => {
    // overflow-y: auto on a box the content fits inside is not the scroller.
    const notScrolling = node({ overflowY: 'auto', scrollHeight: 800, clientHeight: 800 });
    const el = node({ parent: notScrolling });
    expect(findScrollParent(el, winWith())).toBeNull();
  });

  it('returns null when nothing above it scrolls — the window does', () => {
    const el = node({ parent: node({ parent: node() }) });
    expect(findScrollParent(el, winWith())).toBeNull();
  });

  it('survives a detached or missing element', () => {
    expect(findScrollParent(null, winWith())).toBeNull();
    expect(findScrollParent(node(), winWith())).toBeNull();
  });
});

describe('scrollToTopWithin', () => {
  it('moves the scrolling ancestor, not the window', () => {
    const scroller = node({ overflowY: 'scroll', scrollHeight: 3000, clientHeight: 700 });
    scroller.scrollTop = 1800;
    const el = node({ parent: scroller });
    const win = winWith();

    expect(scrollToTopWithin(el, win)).toBe(scroller);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(win.scrollTo).not.toHaveBeenCalled();
  });

  it('falls back to the window when the document is the scroller', () => {
    const el = node({ parent: node() });
    const win = winWith();
    expect(scrollToTopWithin(el, win)).toBeNull();
    expect(win.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('still works on an old container without scrollTo', () => {
    const scroller = node({ overflowY: 'auto', scrollHeight: 3000, clientHeight: 700 });
    scroller.scrollTo = undefined;
    scroller.scrollTop = 900;
    scrollToTopWithin(node({ parent: scroller }), winWith());
    expect(scroller.scrollTop).toBe(0);
  });
});

describe('scrollIntoViewWithin', () => {
  it('moves the container, not the document, when one is scrolling', () => {
    // scrollIntoView() inside the fixed native shell scrolls the document and
    // drags the top bar under the status bar with it.
    const scroller = node({ overflowY: 'auto', scrollHeight: 4000, clientHeight: 700 });
    scroller.scrollTop = 100;
    scroller.getBoundingClientRect = () => ({ top: 50 });
    const el = node({ parent: scroller });
    el.getBoundingClientRect = () => ({ top: 900 });
    el.scrollIntoView = jest.fn();

    expect(scrollIntoViewWithin(el, 12, winWith())).toBe(true);
    // 100 + (900 - 50) - 12
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 938, behavior: 'smooth' });
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it('never scrolls to a negative offset', () => {
    const scroller = node({ overflowY: 'auto', scrollHeight: 4000, clientHeight: 700 });
    scroller.getBoundingClientRect = () => ({ top: 50 });
    const el = node({ parent: scroller });
    el.getBoundingClientRect = () => ({ top: 20 });
    scrollIntoViewWithin(el, 12, winWith());
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('falls back to the element on a plain page', () => {
    const el = node({ parent: node() });
    el.scrollIntoView = jest.fn();
    expect(scrollIntoViewWithin(el, 12, winWith())).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('says so when it cannot', () => {
    expect(scrollIntoViewWithin(null, 12, winWith())).toBe(false);
    expect(scrollIntoViewWithin(node({ parent: node() }), 12, winWith())).toBe(false);
  });
});

describe('keepShellPinned', () => {
  it('puts the document back after the keyboard scrolled it', () => {
    const win = winWith();
    expect(keepShellPinned(win)).toBe(true);
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does nothing without a window', () => {
    expect(keepShellPinned(null)).toBe(false);
  });
});

describe('pinShellDuringKeyboard', () => {
  const fakeWin = () => {
    const w = {
      scrollY: 0,
      listeners: {},
      scrollTo: jest.fn((x, y) => { w.scrollY = y; }),
      addEventListener: jest.fn((type, fn) => { w.listeners[type] = fn; }),
      removeEventListener: jest.fn((type) => { delete w.listeners[type]; }),
      setInterval: jest.fn(() => 7),
      clearInterval: jest.fn(),
      setTimeout: jest.fn(),
    };
    return w;
  };

  it('puts the document back each time the keyboard scrolls it', () => {
    // One reset on the next frame loses the race with the keyboard animation.
    const win = fakeWin();
    pinShellDuringKeyboard(win);
    win.scrollY = 220;
    win.listeners.scroll();
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('stops watching so it cannot fight real scrolling later', () => {
    const win = fakeWin();
    const stop = pinShellDuringKeyboard(win);
    stop();
    expect(win.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(win.clearInterval).toHaveBeenCalledWith(7);
  });

  it('is safe to stop twice', () => {
    const win = fakeWin();
    const stop = pinShellDuringKeyboard(win);
    stop();
    stop();
    expect(win.clearInterval).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a window', () => {
    expect(() => pinShellDuringKeyboard(null)()).not.toThrow();
  });
});
