const { shouldFollowUp, warmth, MIN_GAP_DAYS } = require('./outreachFollowUpEligibility');

const ago = (d) => new Date(Date.now() - d * 864e5);
const opener = (over = {}) => ({
  email: 'matt@example.com', sentCount: 1, opens: 3, clicks: 0,
  lastSentAt: ago(30), followUpCount: 0, ...over,
});

describe('who gets a second letter', () => {
  test('somebody who opened the first and said nothing', () => {
    expect(shouldFollowUp(opener())).toEqual({ ok: true, reason: null });
  });

  test('never somebody who unsubscribed', () => {
    expect(shouldFollowUp(opener({ unsubscribed: true })).reason).toBe('unsubscribed');
  });

  test('never somebody who replied or signed up', () => {
    expect(shouldFollowUp(opener({ responded: true })).reason).toBe('already_replied');
    expect(shouldFollowUp(opener({ registered: true })).reason).toBe('already_registered');
  });

  test('never somebody who did not open the first one', () => {
    // The premise of the campaign. Writing again to someone who ignored you
    // unopened is how a sending domain earns its reputation.
    expect(shouldFollowUp(opener({ opens: 0 })).reason).toBe('never_opened');
  });

  test('never somebody who was never written to', () => {
    expect(shouldFollowUp(opener({ sentCount: 0 })).reason).toBe('never_written_to');
  });

  test('once, and then never again', () => {
    expect(shouldFollowUp(opener({ followUpCount: 1 })).reason).toBe('already_followed_up');
  });

  test('three weeks after the first, not three days', () => {
    expect(shouldFollowUp(opener({ lastSentAt: ago(5) })).reason).toBe('too_soon');
    expect(shouldFollowUp(opener({ lastSentAt: ago(MIN_GAP_DAYS + 1) })).ok).toBe(true);
  });

  test('the gap is adjustable', () => {
    expect(shouldFollowUp(opener({ lastSentAt: ago(10) }), { minGapDays: 7 }).ok).toBe(true);
  });

  test('nothing to write to', () => {
    expect(shouldFollowUp({}).ok).toBe(false);
    expect(shouldFollowUp(null).ok).toBe(false);
  });
});

describe('warmth', () => {
  test('a click beats any number of opens', () => {
    expect(warmth({ clicks: 1, opens: 1 })).toBeGreaterThan(warmth({ clicks: 0, opens: 50 }));
  });

  test('more opens beat fewer', () => {
    expect(warmth({ opens: 5 })).toBeGreaterThan(warmth({ opens: 1 }));
  });

  test('missing counters are zero, not NaN', () => {
    expect(warmth({})).toBe(0);
    expect(warmth(null)).toBe(0);
  });
});
