/**
 * A device token belongs to exactly one account: the one signed in on it.
 *
 * It used to belong to all of them. Registering only ever did $addToSet on the
 * current user, so every athlete who signed in on a shared or handed-down
 * phone left their claim behind — in production one token was on nine
 * accounts, and that phone received all nine athletes' notifications,
 * including the contents of other people's sessions.
 */

/**
 * Move a device token to `userId`, taking it off every other account.
 *
 * @param {import('mongoose').Model} User
 * @param {string} userId
 * @param {string} token
 * @returns {Promise<{claimed: boolean, releasedFrom: number}>}
 */
async function claimPushTokenForUser(User, userId, token) {
  const tokenStr = typeof token === 'string' ? token.trim() : '';
  if (!userId || !tokenStr) return { claimed: false, releasedFrom: 0 };

  const released = await User.updateMany(
    { _id: { $ne: userId }, expoPushTokens: tokenStr },
    { $pull: { expoPushTokens: tokenStr } },
  );

  await User.findByIdAndUpdate(
    userId,
    { $addToSet: { expoPushTokens: tokenStr } },
    { new: true },
  );

  return {
    claimed: true,
    releasedFrom: Number(released?.modifiedCount ?? released?.nModified ?? 0),
  };
}

/**
 * Take the token off this account — the phone signing out.
 *
 * @returns {Promise<boolean>} whether anything was asked to change
 */
async function releasePushTokenFromUser(User, userId, token) {
  const tokenStr = typeof token === 'string' ? token.trim() : '';
  if (!userId || !tokenStr) return false;
  await User.findByIdAndUpdate(userId, { $pull: { expoPushTokens: tokenStr } });
  return true;
}

module.exports = { claimPushTokenForUser, releasePushTokenFromUser };
