import { resolveNotificationTarget } from './notificationNavigation';

/**
 * The "your LT2 has moved" notification is the one that has to land precisely.
 * It is about one sport's threshold on one test, and the screen it opens is the
 * only place the athlete can act on it — so losing either the test or the sport
 * on the way turns a specific prompt into "here is your testing page".
 */
describe('threshold_shift deep link', () => {
  const notif = {
    type: 'threshold_shift',
    resourceType: 'test',
    resourceId: 'test123',
    sport: 'run',
    pushData: { screen: 'testing', sport: 'run', testId: 'test123' },
  };

  it('opens the test it is about', () => {
    expect(resolveNotificationTarget(notif).path).toContain('testId=test123');
  });

  it('carries the sport, so a run notification does not land on the bike tab', () => {
    expect(resolveNotificationTarget(notif).path).toContain('sport=run');
  });

  it('asks for the curve', () => {
    expect(resolveNotificationTarget(notif).path).toContain('curve=1');
  });

  it('goes to the testing page', () => {
    expect(resolveNotificationTarget(notif).path.startsWith('/testing?')).toBe(true);
  });
});

describe('integration_reconnect deep link', () => {
  it('lands on the card with the Reconnect button, not the dashboard', () => {
    const target = resolveNotificationTarget({
      type: 'integration_reconnect',
      resourceType: 'settings',
      pushData: { screen: 'settings', tab: 'integrations', provider: 'garmin' },
    });
    expect(target.path).toBe('/settings?tab=integrations');
  });
});

describe('everything else still routes', () => {
  it('sends a synced activity to the activity itself', () => {
    const target = resolveNotificationTarget({
      type: 'strava_import',
      resourceType: 'strava',
      resourceId: '99',
    });
    expect(target.path).toContain('openActivity=');
  });

  it('falls back to the dashboard when there is nothing to open', () => {
    expect(resolveNotificationTarget({ type: 'something_new' }).path).toBe('/dashboard');
  });
});
