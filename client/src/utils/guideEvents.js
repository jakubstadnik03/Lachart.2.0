/**
 * What the header icon does, kept out of the header.
 *
 * The constant lives in its own module because the header is always mounted
 * while the guide page is lazily loaded: importing it from the page would pull
 * the whole page — and everything it imports — into the main bundle. The
 * decision lives here too, so both the web header and the native top bar
 * behave identically without a second copy of the rule.
 */
export const GUIDE_SCROLL_TOP_EVENT = 'lachart:guide-scroll-top';

/** Ask the guide page, wherever it is mounted, to scroll back to the top. */
export function requestGuideScrollTop(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.dispatchEvent) return false;
  win.dispatchEvent(new CustomEvent(GUIDE_SCROLL_TOP_EVENT));
  return true;
}

/**
 * Tapping the icon opens the guide — unless you are already on it, in which
 * case it scrolls to the top, the way an active tab bar item does on iOS.
 *
 * @returns {'navigated'|'scrolled'}
 */
export function activateGuide({ active, navigate, path = '/guide', win } = {}) {
  if (active) {
    requestGuideScrollTop(win);
    return 'scrolled';
  }
  if (typeof navigate === 'function') navigate(path);
  return 'navigated';
}

export default GUIDE_SCROLL_TOP_EVENT;
