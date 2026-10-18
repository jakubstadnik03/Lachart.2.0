import {
  shouldOfferTrial,
  markTrialOfferShown,
  resetTrialOfferState,
  MAX_OFFERS,
  MIN_DAYS_BETWEEN,
} from './trialOfferPrompt';

/**
 * The trial converts well and almost nobody reaches it, so this offer exists
 * to put it in front of more people. The rules worth pinning down are the ones
 * about who must never see it: a paying subscriber, and anyone whose premium
 * status has not resolved yet — because until it does, "free" and "we don't
 * know" look identical, and pitching a customer who already pays is the one
 * unacceptable outcome.
 */
const ATHLETE = { _id: 'a1', role: 'athlete' };

const eligible = (over = {}) => ({
  user: ATHLETE,
  isPremium: false,
  premiumResolved: true,
  hasTest: true,
  hasTracker: true,
  everSubscribed: false,
  ...over,
});

beforeEach(() => {
  resetTrialOfferState();
});

describe('who gets offered the trial', () => {
  test('a free athlete whose zones are measuring real training', () => {
    expect(shouldOfferTrial(eligible())).toBe(true);
  });

  test('never a paying subscriber', () => {
    expect(shouldOfferTrial(eligible({ isPremium: true }))).toBe(false);
  });

  test('never before premium status has resolved', () => {
    // The flash this avoids: a payer briefly reading as free on every launch.
    expect(shouldOfferTrial(eligible({ premiumResolved: false }))).toBe(false);
    expect(shouldOfferTrial(eligible({ premiumResolved: false, isPremium: true }))).toBe(false);
  });

  test('never someone who has already held a paid plan', () => {
    // They cancelled. The same pitch again is not the answer; the win-back
    // campaign knows why they left.
    expect(shouldOfferTrial(eligible({ everSubscribed: true }))).toBe(false);
  });

  test('not without a test — there are no zones to sell yet', () => {
    expect(shouldOfferTrial(eligible({ hasTest: false }))).toBe(false);
  });

  test('not without a tracker — that person gets the connect prompt instead', () => {
    // The two asks must never land on the same account at the same time.
    expect(shouldOfferTrial(eligible({ hasTracker: false }))).toBe(false);
  });

  test('not to a signed-out visitor', () => {
    expect(shouldOfferTrial(eligible({ user: null }))).toBe(false);
    expect(shouldOfferTrial()).toBe(false);
  });
});

describe('how often', () => {
  test('a second launch the same day does not ask again', () => {
    expect(shouldOfferTrial(eligible())).toBe(true);
    markTrialOfferShown();
    expect(shouldOfferTrial(eligible())).toBe(false);
  });

  test('it returns after a month, then stops for good', () => {
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;
    try {
      const gap = (MIN_DAYS_BETWEEN + 1) * 24 * 60 * 60 * 1000;
      for (let shown = 0; shown < MAX_OFFERS; shown += 1) {
        expect(shouldOfferTrial(eligible())).toBe(true);
        markTrialOfferShown();
        clock += gap;
      }
      expect(shouldOfferTrial(eligible())).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  test('a day short of the gap is still too soon', () => {
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;
    try {
      markTrialOfferShown();
      clock += (MIN_DAYS_BETWEEN - 1) * 24 * 60 * 60 * 1000;
      expect(shouldOfferTrial(eligible())).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  test('blocked storage degrades to asking, not to crashing', () => {
    const real = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('denied'); },
    });
    try {
      expect(shouldOfferTrial(eligible())).toBe(true);
      expect(() => markTrialOfferShown()).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: real });
    }
  });
});
