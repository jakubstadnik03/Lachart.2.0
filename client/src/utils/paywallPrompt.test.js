import { shouldShowPaywall, markPaywallShown, resetPaywallSessionForTests, FIRST_AFTER_DAYS, EVERY_DAYS } from './paywallPrompt';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1);
const free = (o = {}) => ({ user: { _id: 'u1' }, isPremium: false, premiumResolved: true, canBuy: true, ...o });

beforeEach(() => {
  localStorage.clear();
  resetPaywallSessionForTests();
});

describe('shouldShowPaywall', () => {
  it('waits a couple of days after the app is first opened', () => {
    expect(shouldShowPaywall(free({ now: T0 }))).toBe(false);
    expect(shouldShowPaywall(free({ now: T0 + (FIRST_AFTER_DAYS - 1) * DAY }))).toBe(false);
    expect(shouldShowPaywall(free({ now: T0 + FIRST_AFTER_DAYS * DAY }))).toBe(true);
  });

  it('then asks every few days, and once per session', () => {
    shouldShowPaywall(free({ now: T0 }));
    const first = T0 + FIRST_AFTER_DAYS * DAY;
    markPaywallShown(first);
    expect(shouldShowPaywall(free({ now: first + EVERY_DAYS * DAY }))).toBe(false); // same session
    resetPaywallSessionForTests();
    expect(shouldShowPaywall(free({ now: first + (EVERY_DAYS - 1) * DAY }))).toBe(false);
    expect(shouldShowPaywall(free({ now: first + EVERY_DAYS * DAY }))).toBe(true);
  });

  it('never shows to a payer, before premium is known, while impersonating, or without a store', () => {
    shouldShowPaywall(free({ now: T0 }));
    const later = T0 + 10 * DAY;
    expect(shouldShowPaywall(free({ now: later, isPremium: true }))).toBe(false);
    expect(shouldShowPaywall(free({ now: later, premiumResolved: false }))).toBe(false);
    expect(shouldShowPaywall(free({ now: later, impersonating: true }))).toBe(false);
    expect(shouldShowPaywall(free({ now: later, canBuy: false }))).toBe(false);
    expect(shouldShowPaywall(free({ now: later }))).toBe(true);
  });
});
