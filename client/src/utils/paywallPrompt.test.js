import { shouldShowPaywall, markPaywallShown, resetPaywallSessionForTests, EVERY_DAYS } from './paywallPrompt';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1);
const free = (o = {}) => ({ user: { _id: 'u1' }, isPremium: false, premiumResolved: true, canBuy: true, ...o });

beforeEach(() => {
  localStorage.clear();
  resetPaywallSessionForTests();
});

describe('shouldShowPaywall', () => {
  it('shows right after a free user signs in', () => {
    expect(shouldShowPaywall(free({ now: T0 }))).toBe(true);
  });

  it('then asks every few days, and once per session', () => {
    markPaywallShown('u1', T0);
    expect(shouldShowPaywall(free({ now: T0 + EVERY_DAYS * DAY }))).toBe(false); // same session
    resetPaywallSessionForTests();
    expect(shouldShowPaywall(free({ now: T0 + (EVERY_DAYS - 1) * DAY }))).toBe(false);
    expect(shouldShowPaywall(free({ now: T0 + EVERY_DAYS * DAY }))).toBe(true);
  });

  it('shows again at once when a different account signs in', () => {
    markPaywallShown('u1', T0);
    resetPaywallSessionForTests();
    expect(shouldShowPaywall(free({ now: T0 + DAY, user: { _id: 'u2' } }))).toBe(true);
  });

  it('never shows to a payer, before premium is known, while impersonating, or without a store', () => {
    expect(shouldShowPaywall(free({ isPremium: true }))).toBe(false);
    expect(shouldShowPaywall(free({ premiumResolved: false }))).toBe(false);
    expect(shouldShowPaywall(free({ impersonating: true }))).toBe(false);
    expect(shouldShowPaywall(free({ canBuy: false }))).toBe(false);
  });
});
