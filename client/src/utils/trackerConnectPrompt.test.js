import {
  hasTrackerConnected,
  shouldPromptTrackerConnect,
  markTrackerPromptShown,
  resetTrackerPromptState,
  MAX_PROMPTS,
  MIN_DAYS_BETWEEN,
} from './trackerConnectPrompt';

/**
 * The prompt asks someone to connect a watch right after they save a lactate
 * test. It is the one nudge that fires on a success, so the rules that keep it
 * from nagging — and from reaching a coach about a client's test — matter more
 * than the copy.
 */
const ATHLETE = { _id: 'a1', role: 'athlete' };
const COACH = { _id: 'c1', role: 'coach' };

beforeEach(() => {
  resetTrackerPromptState();
});

describe('hasTrackerConnected', () => {
  test('any of the four workout trackers counts', () => {
    expect(hasTrackerConnected({ strava: { athleteId: 7 } })).toBe(true);
    expect(hasTrackerConnected({ garmin: { athleteId: 'g' } })).toBe(true);
    expect(hasTrackerConnected({ coros: { athleteId: 'c' } })).toBe(true);
    expect(hasTrackerConnected({ polar: { athleteId: 'p' } })).toBe(true);
  });

  test('Apple Health does not count — it carries recovery, not workouts', () => {
    // Connected for sleep / resting HR / HRV only, so the zones still have
    // nothing to be measured against.
    expect(hasTrackerConnected({ appleHealth: { connectedAt: '2026-10-01' } })).toBe(false);
  });

  test('an access token without an athlete id is a half-finished connect', () => {
    expect(hasTrackerConnected({ strava: { accessToken: 'tok' } })).toBe(false);
  });
});

describe('shouldPromptTrackerConnect', () => {
  test('asks an athlete with no tracker who just saved their own test', () => {
    expect(shouldPromptTrackerConnect({ user: ATHLETE, testAthleteId: 'a1' })).toBe(true);
  });

  test('stays quiet once a tracker is connected', () => {
    const connected = { ...ATHLETE, garmin: { athleteId: 'g' } };
    expect(shouldPromptTrackerConnect({ user: connected, testAthleteId: 'a1' })).toBe(false);
  });

  test('never asks on a demo page or without a signed-in user', () => {
    expect(shouldPromptTrackerConnect({ user: ATHLETE, demoMode: true, testAthleteId: 'a1' })).toBe(false);
    expect(shouldPromptTrackerConnect({ user: null, testAthleteId: 'a1' })).toBe(false);
  });

  test("does not ask a coach about a client's test — their own watch would not help", () => {
    expect(shouldPromptTrackerConnect({ user: COACH, testAthleteId: 'someone-else' })).toBe(false);
  });

  test('asks a coach about a test that is their own', () => {
    expect(shouldPromptTrackerConnect({ user: COACH, testAthleteId: 'c1' })).toBe(true);
  });

  test('an unattributed test is assumed to be a client\'s for anyone but an athlete', () => {
    expect(shouldPromptTrackerConnect({ user: COACH })).toBe(false);
    expect(shouldPromptTrackerConnect({ user: ATHLETE })).toBe(true);
  });

  test('tester accounts are never asked — they test on others by definition', () => {
    expect(shouldPromptTrackerConnect({ user: { _id: 't1', role: 'tester' }, testAthleteId: 't1' })).toBe(false);
  });
});

describe('throttling', () => {
  test('a second test the same day does not raise a second prompt', () => {
    expect(shouldPromptTrackerConnect({ user: ATHLETE, testAthleteId: 'a1' })).toBe(true);
    markTrackerPromptShown();
    expect(shouldPromptTrackerConnect({ user: ATHLETE, testAthleteId: 'a1' })).toBe(false);
  });

  test('it comes back after the gap, then stops for good', () => {
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;
    try {
      const gap = (MIN_DAYS_BETWEEN + 1) * 24 * 60 * 60 * 1000;
      for (let shown = 0; shown < MAX_PROMPTS; shown += 1) {
        expect(shouldPromptTrackerConnect({ user: ATHLETE, testAthleteId: 'a1' })).toBe(true);
        markTrackerPromptShown();
        clock += gap;
      }
      // The cap holds even though the gap has passed again.
      expect(shouldPromptTrackerConnect({ user: ATHLETE, testAthleteId: 'a1' })).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  test('a blocked localStorage degrades to asking, not to crashing', () => {
    const real = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('denied'); },
    });
    try {
      expect(shouldPromptTrackerConnect({ user: ATHLETE, testAthleteId: 'a1' })).toBe(true);
      expect(() => markTrackerPromptShown()).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: real });
    }
  });
});
