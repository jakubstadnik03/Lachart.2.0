const { lastMarketingSend, withinQuietPeriod, daysSince } = require('./marketingThrottle');

/**
 * The only thing standing between twelve campaigns and somebody getting four
 * emails in a week. It used to be a hand-written list of the other campaigns'
 * keys, kept in each campaign, and it had already fallen behind reality.
 */

const ago = (days) => new Date(Date.now() - days * 864e5);

describe('lastMarketingSend', () => {
  test('finds the most recent of several campaigns', () => {
    const user = { retentionEmails: {
      winBackSent: ago(40), trackerConnectSent: ago(9), savedCurveSent: ago(120),
    } };
    expect(Math.round(daysSince(lastMarketingSend(user)))).toBe(9);
  });

  test('sees inside the newsletter map, which the old lists did not', () => {
    // retentionEmails.productUpdates is nested, and is the largest campaign on
    // the account. Missing it meant a newsletter on Monday and a lifecycle
    // email on Tuesday.
    const user = { retentionEmails: {
      winBackSent: ago(60),
      productUpdates: { '2026-09': ago(45), '2027-01': ago(3) },
    } };
    expect(Math.round(daysSince(lastMarketingSend(user)))).toBe(3);
  });

  test('sees a campaign nobody has told it about', () => {
    // The whole point: ship a new campaign, be throttled by it immediately.
    const user = { retentionEmails: { somethingShippedNextYear: ago(1) } };
    expect(Math.round(daysSince(lastMarketingSend(user)))).toBe(1);
  });

  test('picks up the one-off that lives outside retentionEmails', () => {
    const user = { appDownloadEmail: { lastSent: ago(5) } };
    expect(Math.round(daysSince(lastMarketingSend(user)))).toBe(5);
  });

  test('ISO strings count, the way Mongo lean documents hand them over', () => {
    const user = { retentionEmails: { winBackSent: ago(7).toISOString() } };
    expect(Math.round(daysSince(lastMarketingSend(user)))).toBe(7);
  });

  test('a counter is not a date', () => {
    // retentionEmails carries numbers too. Reading 3 as an epoch would make
    // every campaign think it last mailed this person in 1970 and let
    // everything through — or, worse, stamp them as recently mailed.
    const user = { retentionEmails: { premiumPitchCount: 3, sequenceStep: 2 } };
    expect(lastMarketingSend(user)).toBeNull();
  });

  test('nobody mailed yet', () => {
    expect(lastMarketingSend({})).toBeNull();
    expect(lastMarketingSend({ retentionEmails: {} })).toBeNull();
    expect(lastMarketingSend(null)).toBeNull();
  });

  test('rubbish in a field does not throw', () => {
    const user = { retentionEmails: { a: 'not a date', b: null, c: { d: 'nope' } } };
    expect(lastMarketingSend(user)).toBeNull();
  });
});

describe('withinQuietPeriod', () => {
  const user = { retentionEmails: { winBackSent: ago(10) } };

  test('ten days ago is inside a fourteen-day quiet period', () => {
    expect(withinQuietPeriod(user, 14)).toBe(true);
  });

  test('and outside a seven-day one', () => {
    expect(withinQuietPeriod(user, 7)).toBe(false);
  });

  test('somebody never mailed is never too soon', () => {
    expect(withinQuietPeriod({}, 30)).toBe(false);
  });

  test('no gap configured means no throttle', () => {
    expect(withinQuietPeriod(user, 0)).toBe(false);
    expect(withinQuietPeriod(user, undefined)).toBe(false);
  });
});
