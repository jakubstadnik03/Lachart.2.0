const axios = require('axios');
const User = require('../models/UserModel');

/**
 * Send Expo push messages (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Fire-and-forget from Strava sync; errors are logged, not thrown to callers.
 */
async function sendExpoPushToTokens(tokens, { title, body, data = {} }) {
  if (!Array.isArray(tokens) || tokens.length === 0) return { sent: 0 };
  const clean = [...new Set(tokens.map((t) => String(t).trim()).filter(Boolean))];
  if (clean.length === 0) return { sent: 0 };

  const messages = clean.map((to) => ({
    to,
    sound: 'default',
    title: title || 'LaChart',
    body: body || '',
    data: typeof data === 'object' && data !== null ? data : {},
  }));

  const chunkSize = 100;
  let sent = 0;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    try {
      const resp = await axios.post('https://exp.host/--/api/v2/push/send', chunk, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        validateStatus: () => true,
        timeout: 15000,
      });
      if (resp.status >= 400) {
        const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data || '');
        console.warn('[ExpoPush] send batch failed', resp.status, text.slice(0, 200));
      }
    } catch (e) {
      console.warn('[ExpoPush] send batch error:', e.message || e);
    }
    sent += chunk.length;
  }
  return { sent };
}

/**
 * Notify user when new Strava activities were imported (Expo mobile app with registered token).
 */
async function notifyUserStravaActivitiesImported(userId, importedCount) {
  try {
    const n = Number(importedCount);
    if (!userId || !Number.isFinite(n) || n < 1) return;

    const user = await User.findById(userId).select('expoPushTokens notifications').lean();
    if (!user) return;

    if (user.notifications && user.notifications.pushStravaImport === false) return;

    const tokens = Array.isArray(user.expoPushTokens) ? user.expoPushTokens : [];
    if (tokens.length === 0) return;

    const body =
      n === 1
        ? '1 new activity imported from Strava.'
        : `${n} new activities imported from Strava.`;

    await sendExpoPushToTokens(tokens, {
      title: 'LaChart — Strava',
      body,
      data: { type: 'strava_import', count: n },
    });
  } catch (e) {
    console.error('[ExpoPush] notifyUserStravaActivitiesImported:', e.message || e);
  }
}

async function notifyUserLactateTestCompleted(userId) {
  try {
    if (!userId) return;
    const user = await User.findById(userId).select('expoPushTokens notifications').lean();
    if (!user) return;
    if (user.notifications && user.notifications.pushLactateTest === false) return;
    const tokens = Array.isArray(user.expoPushTokens) ? user.expoPushTokens : [];
    if (tokens.length === 0) return;

    await sendExpoPushToTokens(tokens, {
      title: 'LaChart',
      body: 'Your lactate test was saved. Open the app to review zones and thresholds.',
      data: { type: 'lactate_test_complete' },
    });
  } catch (e) {
    console.error('[ExpoPush] notifyUserLactateTestCompleted:', e.message || e);
  }
}

async function notifyUserLactateTestFollowUp(userId) {
  try {
    if (!userId) return;
    const user = await User.findById(userId).select('expoPushTokens notifications').lean();
    if (!user) return;
    if (user.notifications && user.notifications.pushLactateTest === false) return;
    const tokens = Array.isArray(user.expoPushTokens) ? user.expoPushTokens : [];
    if (tokens.length === 0) return;

    await sendExpoPushToTokens(tokens, {
      title: 'LaChart',
      body: 'Revisit your lactate test — update zones or plan your next training block.',
      data: { type: 'lactate_test_followup' },
    });
  } catch (e) {
    console.error('[ExpoPush] notifyUserLactateTestFollowUp:', e.message || e);
  }
}

/**
 * Notify all admin users when a new user registers.
 */
async function notifyAdminNewUserRegistered(newUser) {
  try {
    const admins = await User.find({ admin: true }).select('expoPushTokens').lean();
    const tokens = admins.flatMap(a => Array.isArray(a.expoPushTokens) ? a.expoPushTokens : []);
    if (tokens.length === 0) return;

    const name = [newUser?.name, newUser?.surname].filter(Boolean).join(' ') || newUser?.email || 'Someone';
    const sport = newUser?.sport ? ` (${newUser.sport})` : '';

    await sendExpoPushToTokens(tokens, {
      title: '🆕 New user registered',
      body: `${name}${sport} just signed up to LaChart.`,
      data: { type: 'admin_new_user', userId: String(newUser?._id || '') },
    });
  } catch (e) {
    console.error('[ExpoPush] notifyAdminNewUserRegistered:', e.message || e);
  }
}

module.exports = {
  sendExpoPushToTokens,
  notifyUserStravaActivitiesImported,
  notifyUserLactateTestCompleted,
  notifyUserLactateTestFollowUp,
  notifyAdminNewUserRegistered,
};
