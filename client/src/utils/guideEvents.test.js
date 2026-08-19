/**
 * Tapping the icon twice should not reload the page you are standing on.
 */
import { GUIDE_SCROLL_TOP_EVENT, activateGuide, requestGuideScrollTop } from './guideEvents';

describe('activateGuide', () => {
  it('opens the guide from anywhere else', () => {
    const navigate = jest.fn();
    const win = { dispatchEvent: jest.fn() };
    expect(activateGuide({ active: false, navigate, win })).toBe('navigated');
    expect(navigate).toHaveBeenCalledWith('/guide');
    expect(win.dispatchEvent).not.toHaveBeenCalled();
  });

  it('scrolls to the top instead of re-navigating when already there', () => {
    const navigate = jest.fn();
    const win = { dispatchEvent: jest.fn() };
    expect(activateGuide({ active: true, navigate, win })).toBe('scrolled');
    expect(navigate).not.toHaveBeenCalled();
    expect(win.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(win.dispatchEvent.mock.calls[0][0].type).toBe(GUIDE_SCROLL_TOP_EVENT);
  });

  it('does not throw when there is nothing to navigate with', () => {
    expect(() => activateGuide({ active: false, win: { dispatchEvent: jest.fn() } })).not.toThrow();
  });
});

describe('requestGuideScrollTop', () => {
  it('reaches a listener on the real window', () => {
    const heard = jest.fn();
    window.addEventListener(GUIDE_SCROLL_TOP_EVENT, heard);
    requestGuideScrollTop(window);
    window.removeEventListener(GUIDE_SCROLL_TOP_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('says so when there is no window to dispatch on', () => {
    expect(requestGuideScrollTop(null)).toBe(false);
  });
});
