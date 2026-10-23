const { classifyStravaAuthError } = require('./stravaAuthError');

/**
 * Taken from production logs: one user failed every five minutes for as long
 * as the log went back, because the backfill paused and restarted on an error
 * that restarting can never clear.
 */
const stravaError = (status, errors) => ({
  response: { status, data: { message: 'Authorization Error', errors } },
});

describe('errors no retry can clear', () => {
  test('the athlete withdrew the activity scope', () => {
    const e = stravaError(401, [
      { resource: 'AccessToken', field: 'activity:read_permission', code: 'missing' },
    ]);
    expect(classifyStravaAuthError(e)).toEqual({
      permanent: true, reason: 'scope_missing:activity:read_permission',
    });
  });

  test('any other scope, missing', () => {
    expect(classifyStravaAuthError(stravaError(401, [
      { resource: 'AccessToken', field: 'profile:read_all', code: 'missing' },
    ])).permanent).toBe(true);
  });

  test('the athlete disconnected the app', () => {
    expect(classifyStravaAuthError(stravaError(401, [
      { resource: 'Athlete', field: 'access_token', code: 'invalid' },
    ])).permanent).toBe(true);
  });

  test('403 counts the same as 401', () => {
    expect(classifyStravaAuthError(stravaError(403, [
      { resource: 'AccessToken', field: 'activity:read_permission', code: 'missing' },
    ])).permanent).toBe(true);
  });
});

describe('errors worth one more go', () => {
  test('a 401 whose body says nothing useful', () => {
    // An expired access token reads like this, and a refresh fixes it. The
    // caller still has to bound the retry.
    expect(classifyStravaAuthError(stravaError(401, []))).toEqual({
      permanent: false, reason: 'auth_unclear',
    });
    expect(classifyStravaAuthError({ response: { status: 401 } }).permanent).toBe(false);
  });

  test('an exhausted rate limit is not an auth problem at all', () => {
    expect(classifyStravaAuthError(stravaError(429, []))).toEqual({ permanent: false, reason: null });
  });

  test('server errors and timeouts are left alone', () => {
    expect(classifyStravaAuthError(stravaError(500, [])).reason).toBeNull();
    expect(classifyStravaAuthError({ code: 'ETIMEDOUT' }).reason).toBeNull();
    expect(classifyStravaAuthError(null).permanent).toBe(false);
  });

  test('a required field that is merely absent is not a scope', () => {
    // "field: 'id', code: 'missing'" is a malformed request, not a withdrawn
    // permission — retrying it is pointless but stopping the backfill for
    // good is the wrong answer.
    expect(classifyStravaAuthError(stravaError(401, [
      { resource: 'Activity', field: 'id', code: 'missing' },
    ])).permanent).toBe(false);
  });
});
