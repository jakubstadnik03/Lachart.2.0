import { lastOutreachSentAt, formatOutreachSentAt } from './lastOutreachSentAt';

describe('lastOutreachSentAt', () => {
  test('picks the most recent send across the segments', () => {
    const d = lastOutreachSentAt({ outreach: {
      coachOutreachSentAt: '2026-03-01T10:00:00Z',
      othersOutreachSentAt: '2026-08-05T15:16:44Z',
    }});
    expect(d.toISOString()).toBe('2026-08-05T15:16:44.000Z');
  });

  test('order in the object does not matter', () => {
    const a = lastOutreachSentAt({ outreach: { athleteOutreachSentAt: '2026-01-01', untestedOutreachSentAt: '2026-06-01' }});
    const b = lastOutreachSentAt({ outreach: { untestedOutreachSentAt: '2026-06-01', athleteOutreachSentAt: '2026-01-01' }});
    expect(a.getTime()).toBe(b.getTime());
  });

  test('a single send is returned as it is', () => {
    expect(lastOutreachSentAt({ outreach: { coachOutreachSentAt: '2026-05-08' } })).toBeInstanceOf(Date);
  });

  test('never sent is null, not the epoch', () => {
    expect(lastOutreachSentAt({ outreach: {} })).toBeNull();
    expect(lastOutreachSentAt({ outreach: { coachOutreachSentAt: null } })).toBeNull();
  });

  test('a user with no outreach block at all is null', () => {
    expect(lastOutreachSentAt({})).toBeNull();
    expect(lastOutreachSentAt(null)).toBeNull();
    expect(lastOutreachSentAt(undefined)).toBeNull();
  });

  test('an unparseable date is ignored rather than shown as Invalid Date', () => {
    expect(lastOutreachSentAt({ outreach: { coachOutreachSentAt: 'not a date' } })).toBeNull();
    const d = lastOutreachSentAt({ outreach: { coachOutreachSentAt: 'nope', othersOutreachSentAt: '2026-08-05' } });
    expect(d).toBeInstanceOf(Date);
  });
});

describe('formatOutreachSentAt', () => {
  test('null in, null out — the caller shows nothing', () => {
    expect(formatOutreachSentAt(null)).toBeNull();
  });

  test('renders a real date as a short string', () => {
    expect(typeof formatOutreachSentAt(new Date('2026-08-05'))).toBe('string');
  });
});
