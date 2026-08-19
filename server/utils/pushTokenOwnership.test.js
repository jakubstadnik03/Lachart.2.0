/**
 * Plain-node tests: node server/utils/pushTokenOwnership.test.js
 *
 * The invariant is one line long and was worth a production incident: a device
 * token may sit on exactly one account.
 */
const assert = require('assert');
const { claimPushTokenForUser, releasePushTokenFromUser } = require('./pushTokenOwnership');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  ✓ ${name}`); };
const asyncTest = async (name, fn) => { await fn(); passed += 1; console.log(`  ✓ ${name}`); };

/** A User model just real enough: an array of {_id, expoPushTokens}. */
function fakeUsers(rows) {
  const users = rows.map((r) => ({ ...r, expoPushTokens: [...(r.expoPushTokens || [])] }));
  return {
    users,
    async updateMany(filter, update) {
      const token = update.$pull.expoPushTokens;
      const skip = String(filter._id.$ne);
      let modifiedCount = 0;
      for (const u of users) {
        if (String(u._id) === skip) continue;
        if (!u.expoPushTokens.includes(token)) continue;
        u.expoPushTokens = u.expoPushTokens.filter((t) => t !== token);
        modifiedCount += 1;
      }
      return { modifiedCount };
    },
    async findByIdAndUpdate(id, update) {
      const u = users.find((x) => String(x._id) === String(id));
      if (!u) return null;
      if (update.$addToSet) {
        const t = update.$addToSet.expoPushTokens;
        if (!u.expoPushTokens.includes(t)) u.expoPushTokens.push(t);
      }
      if (update.$pull) {
        const t = update.$pull.expoPushTokens;
        u.expoPushTokens = u.expoPushTokens.filter((x) => x !== t);
      }
      return u;
    },
  };
}

(async () => {
  console.log('claimPushTokenForUser');

  await asyncTest('takes the token off everyone else', async () => {
    // Straight from production: one phone, nine athletes, nine sets of pushes.
    const U = fakeUsers([
      { _id: 'a', expoPushTokens: ['dev-1'] },
      { _id: 'b', expoPushTokens: ['dev-1', 'dev-2'] },
      { _id: 'c', expoPushTokens: [] },
    ]);
    const res = await claimPushTokenForUser(U, 'c', 'dev-1');
    assert.strictEqual(res.releasedFrom, 2);
    assert.deepStrictEqual(U.users.find((u) => u._id === 'a').expoPushTokens, []);
    assert.deepStrictEqual(U.users.find((u) => u._id === 'b').expoPushTokens, ['dev-2']);
    assert.deepStrictEqual(U.users.find((u) => u._id === 'c').expoPushTokens, ['dev-1']);
  });

  await asyncTest('leaves other devices of the same athlete alone', async () => {
    const U = fakeUsers([{ _id: 'a', expoPushTokens: ['phone', 'ipad'] }]);
    await claimPushTokenForUser(U, 'a', 'phone');
    assert.deepStrictEqual(U.users[0].expoPushTokens, ['phone', 'ipad']);
  });

  await asyncTest('is idempotent — re-registering does not duplicate', async () => {
    const U = fakeUsers([{ _id: 'a', expoPushTokens: ['phone'] }]);
    await claimPushTokenForUser(U, 'a', 'phone');
    await claimPushTokenForUser(U, 'a', 'phone');
    assert.deepStrictEqual(U.users[0].expoPushTokens, ['phone']);
  });

  await asyncTest('trims what the client sent', async () => {
    const U = fakeUsers([{ _id: 'a', expoPushTokens: [] }]);
    await claimPushTokenForUser(U, 'a', '  phone  ');
    assert.deepStrictEqual(U.users[0].expoPushTokens, ['phone']);
  });

  await asyncTest('refuses junk rather than storing it', async () => {
    const U = fakeUsers([{ _id: 'a', expoPushTokens: [] }]);
    for (const bad of ['', '   ', null, undefined, 42]) {
      const res = await claimPushTokenForUser(U, 'a', bad);
      assert.strictEqual(res.claimed, false);
    }
    assert.deepStrictEqual(U.users[0].expoPushTokens, []);
  });

  console.log('releasePushTokenFromUser');

  await asyncTest('takes the token off the account signing out', async () => {
    const U = fakeUsers([{ _id: 'a', expoPushTokens: ['phone', 'ipad'] }]);
    assert.strictEqual(await releasePushTokenFromUser(U, 'a', 'phone'), true);
    assert.deepStrictEqual(U.users[0].expoPushTokens, ['ipad']);
  });

  await asyncTest('says no when there is nothing to release', async () => {
    const U = fakeUsers([{ _id: 'a', expoPushTokens: [] }]);
    assert.strictEqual(await releasePushTokenFromUser(U, 'a', ''), false);
    assert.strictEqual(await releasePushTokenFromUser(U, null, 'phone'), false);
  });

  console.log(`\n${passed} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
