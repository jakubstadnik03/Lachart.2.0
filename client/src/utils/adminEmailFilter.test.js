/**
 * The admin user list can be narrowed to who has an email address and who can
 * actually be emailed. Email is optional on the user model — an account a coach
 * created may have none — and the send paths already treat "reachable" as
 * having an address AND not having opted out, so the filter has to agree with
 * them or the count would promise more than a campaign delivers.
 *
 * Mirrors the filter in AdminDashboard.
 */
const applyEmailFilter = (users, mode) => {
  if (mode === 'has') return users.filter((u) => !!u.email);
  if (mode === 'reachable') return users.filter((u) => !!u.email && u.notifications?.emailNotifications !== false);
  if (mode === 'none') return users.filter((u) => !u.email);
  return users;
};

const USERS = [
  { id: 1, email: 'a@example.com' },
  { id: 2, email: 'b@example.com', notifications: { emailNotifications: true } },
  { id: 3, email: 'c@example.com', notifications: { emailNotifications: false } },
  { id: 4, email: null },
  { id: 5 },
  { id: 6, email: '' },
];

const ids = (list) => list.map((u) => u.id);

describe('the admin email filter', () => {
  test('"all" leaves the list alone', () => {
    expect(ids(applyEmailFilter(USERS, 'all'))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('"has email" keeps everyone with an address, opted out or not', () => {
    expect(ids(applyEmailFilter(USERS, 'has'))).toEqual([1, 2, 3]);
  });

  test('"can be emailed" drops the one who opted out', () => {
    expect(ids(applyEmailFilter(USERS, 'reachable'))).toEqual([1, 2]);
  });

  test('a missing notifications block means not opted out', () => {
    expect(ids(applyEmailFilter([{ id: 9, email: 'x@y.z' }], 'reachable'))).toEqual([9]);
  });

  test('"no email" catches null, absent and empty-string alike', () => {
    expect(ids(applyEmailFilter(USERS, 'none'))).toEqual([4, 5, 6]);
  });

  test('has and none together account for everyone, with no overlap', () => {
    const has = applyEmailFilter(USERS, 'has');
    const none = applyEmailFilter(USERS, 'none');
    expect(has.length + none.length).toBe(USERS.length);
    expect(has.some((u) => none.includes(u))).toBe(false);
  });

  test('reachable is never larger than has — it is a narrowing', () => {
    expect(applyEmailFilter(USERS, 'reachable').length)
      .toBeLessThanOrEqual(applyEmailFilter(USERS, 'has').length);
  });

  test('an empty list stays empty rather than throwing', () => {
    ['all', 'has', 'reachable', 'none'].forEach((m) => {
      expect(applyEmailFilter([], m)).toEqual([]);
    });
  });
});
