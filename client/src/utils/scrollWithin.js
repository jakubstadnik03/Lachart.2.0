/**
 * Scrolling a page that is not the window.
 *
 * In the browser the guide scrolls the document; inside the native shell the
 * document never moves — the content sits in a div with its own overflow, and
 * window.scrollTo(0, 0) there does nothing at all. So instead of guessing,
 * walk up from the element that wants to be seen and move whichever ancestor
 * is actually doing the scrolling.
 */

/** The nearest ancestor that scrolls, or null when the window is the scroller. */
export function findScrollParent(el, win = typeof window !== 'undefined' ? window : null) {
  let node = el?.parentElement || null;
  while (node) {
    const style = win?.getComputedStyle ? win.getComputedStyle(node) : null;
    const overflowY = style ? style.overflowY : '';
    const scrolls = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null;
}

/** Put `el`'s scroller back at the top, wherever that scroller happens to be. */
export function scrollToTopWithin(el, win = typeof window !== 'undefined' ? window : null) {
  const parent = findScrollParent(el, win);
  if (parent) {
    if (typeof parent.scrollTo === 'function') parent.scrollTo({ top: 0, behavior: 'smooth' });
    else parent.scrollTop = 0;
    return parent;
  }
  if (win?.scrollTo) win.scrollTo({ top: 0, behavior: 'smooth' });
  return null;
}

/**
 * Bring `el` near the top of whatever scrolls it.
 *
 * Not element.scrollIntoView(): inside the native shell that scrolls the
 * document itself, and the shell is a position:fixed root — the top bar slid
 * under the status bar and the tab bar lifted off the bottom. Moving the
 * container instead leaves the chrome where it belongs.
 *
 * @param {number} [margin] gap to leave above the element, in px
 */
export function scrollIntoViewWithin(el, margin = 12, win = typeof window !== 'undefined' ? window : null) {
  if (!el) return false;
  const parent = findScrollParent(el, win);
  if (parent && el.getBoundingClientRect && parent.getBoundingClientRect) {
    const top = parent.scrollTop + (el.getBoundingClientRect().top - parent.getBoundingClientRect().top) - margin;
    if (typeof parent.scrollTo === 'function') parent.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    else parent.scrollTop = Math.max(0, top);
    return true;
  }
  if (!el.scrollIntoView) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

/**
 * Undo the scroll WKWebView performs on the document when a text field takes
 * focus under the keyboard. The shell is fixed, so that scroll only ever moves
 * the chrome out of place.
 */
export function keepShellPinned(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.scrollTo) return false;
  win.scrollTo(0, 0);
  return true;
}

/**
 * Hold the document at the top while the keyboard animates in.
 *
 * One reset is not enough: WKWebView scrolls the document *after* the keyboard
 * finishes moving, so a single call on the next frame is overwritten and the
 * top bar ends up under the status bar. Watch for a few hundred milliseconds
 * instead, then stop — a permanent listener would fight legitimate scrolling.
 *
 * @returns {() => void} stop early
 */
export function pinShellDuringKeyboard(win = typeof window !== 'undefined' ? window : null, ms = 900) {
  if (!win?.addEventListener) return () => {};
  const pin = () => { if (win.scrollY !== 0) win.scrollTo(0, 0); };
  win.addEventListener('scroll', pin, { passive: true });
  const interval = win.setInterval(pin, 100);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    win.removeEventListener('scroll', pin);
    win.clearInterval(interval);
  };
  win.setTimeout(stop, ms);
  return stop;
}

export default scrollToTopWithin;
