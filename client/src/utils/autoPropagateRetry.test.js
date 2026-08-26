/**
 * The calendar propagates a planned workout's title and category onto the
 * activity it paired with, once per activity, and remembers which it has done
 * so it does not repeat itself. On failure it forgot, so the next render tried
 * again — fine for a hiccup, but a 404 is a settled answer, and the effect
 * reruns constantly. One missing activity meant the same PUT forever.
 *
 * Mirrors the catch in CalendarView's propagation effect.
 */
const shouldRetryAfter = (status) => !(status === 404 || status === 403);

describe('retrying an auto-propagation that failed', () => {
  test('a missing activity is not asked for again', () => {
    expect(shouldRetryAfter(404)).toBe(false);
  });

  test('nor one we are not allowed to touch', () => {
    expect(shouldRetryAfter(403)).toBe(false);
  });

  test('a server error may well work next time', () => {
    expect(shouldRetryAfter(500)).toBe(true);
    expect(shouldRetryAfter(502)).toBe(true);
  });

  test('so may a rate limit', () => {
    expect(shouldRetryAfter(429)).toBe(true);
  });

  test('and being offline, where there is no status at all', () => {
    expect(shouldRetryAfter(undefined)).toBe(true);
    expect(shouldRetryAfter(null)).toBe(true);
  });
});
