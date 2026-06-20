/**
 * Shared notification helper — creates in-app Notification document + fires Expo push.
 * Always fire-and-forget: wrap calls in (async () => { ... })() so they never block responses.
 */
const mongoose = require('mongoose');
const User = require('../models/UserModel');
const Notification = require('../models/Notification');
const { sendExpoPushToTokens } = require('./expoPushNotifications');

/**
 * Send an in-app notification (DB doc) + Expo push to one or more recipients.
 * @param {string|string[]} recipientIds  - user _id(s) to notify
 * @param {object} opts
 *   @param {string} opts.type            - e.g. 'training_comment', 'lactate_added', 'zones_updated'
 *   @param {string} opts.title           - short title
 *   @param {string} opts.body            - longer description (max ~200 chars)
 *   @param {string} [opts.resourceId]    - training/test id for deep link
 *   @param {string} [opts.resourceType]  - 'training'|'strava'|'fit'|'test'
 *   @param {string} [opts.fromName]      - display name of the actor
 *   @param {object} [opts.pushData]      - extra data payload for push notification
 */
async function sendNotification(recipientIds, opts = {}) {
  const ids = (Array.isArray(recipientIds) ? recipientIds : [recipientIds])
    .map(String)
    .filter(id => id && mongoose.Types.ObjectId.isValid(id));

  if (!ids.length) return;

  const { type, title, body, resourceId, resourceType, sport, fromName, pushData = {}, skipPush = false } = opts;

  // 1. Create in-app Notification documents
  try {
    const docs = ids.map(rid => ({
      recipientId: rid,
      type,
      title,
      body,
      resourceId: resourceId || null,
      resourceType: resourceType || null,
      sport: sport || null,
      fromName: fromName || null,
      read: false,
    }));
    await Notification.insertMany(docs);
  } catch (e) {
    console.error('[notificationHelper] insertMany error:', e.message);
  }

  if (skipPush) return;

  // 2. Send Expo push to each recipient that has tokens registered
  try {
    const recipients = await User.find({ _id: { $in: ids } })
      .select('expoPushTokens notifications')
      .lean();

    for (const recipient of recipients) {
      const tokens = Array.isArray(recipient.expoPushTokens) ? recipient.expoPushTokens : [];
      if (!tokens.length) continue;

      const prefs = recipient.notifications || {};
      if (type === 'strava_import' && prefs.pushStravaImport === false) continue;
      if ((type === 'garmin_import' || type === 'apple_health_sync') && prefs.pushStravaImport === false) continue;
      if ((type === 'training_comment' || type === 'test_comment') && prefs.trainingComments === false) continue;
      if (type === 'lactate_test_complete' || type === 'lactate_test_followup') {
        if (prefs.pushLactateTest === false) continue;
      }

      await sendExpoPushToTokens(tokens, {
        title,
        body,
        data: { type, resourceId: resourceId || null, resourceType: resourceType || null, ...pushData },
      });
    }
  } catch (e) {
    console.error('[notificationHelper] push error:', e.message);
  }
}

/**
 * Notify all coaches of an athlete.
 * @param {string} athleteId
 * @param {object} opts  — same as sendNotification opts
 */
async function notifyCoachesOfAthlete(athleteId, opts) {
  try {
    if (!athleteId || !mongoose.Types.ObjectId.isValid(String(athleteId))) return;
    const athlete = await User.findById(athleteId).select('coachIds coachId').lean();
    if (!athlete) return;

    const coachIds = [
      ...(Array.isArray(athlete.coachIds) ? athlete.coachIds.map(String) : []),
      ...(athlete.coachId ? [String(athlete.coachId)] : []),
    ].filter((id, i, a) => id && mongoose.Types.ObjectId.isValid(id) && a.indexOf(id) === i);

    if (!coachIds.length) return;
    await sendNotification(coachIds, opts);
  } catch (e) {
    console.error('[notificationHelper] notifyCoachesOfAthlete error:', e.message);
  }
}

/**
 * Notify the athlete owned by a training resource.
 * @param {string} athleteId
 * @param {object} opts
 */
async function notifyAthlete(athleteId, opts) {
  try {
    if (!athleteId || !mongoose.Types.ObjectId.isValid(String(athleteId))) return;
    await sendNotification([String(athleteId)], opts);
  } catch (e) {
    console.error('[notificationHelper] notifyAthlete error:', e.message);
  }
}

module.exports = { sendNotification, notifyCoachesOfAthlete, notifyAthlete };
