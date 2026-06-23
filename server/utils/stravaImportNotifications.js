const { sendNotification } = require('./notificationHelper');
const { notifyUserStravaActivitiesImported } = require('./expoPushNotifications');
const { normalizeSportForNotif, sportNotifLabel } = require('./sportNotif');

/**
 * Push + in-app bell when Strava activities were imported.
 * activityDoc — { name, sport, distance, stravaId, … }
 */
function notifyStravaImportedPush(userId, imported, latestStravaId = null, latestSport = null, activityDoc = null) {
  const n = Number(imported);
  if (!userId || !Number.isFinite(n) || n < 1) return;

  notifyUserStravaActivitiesImported(userId, n, {
    latestActivityId: latestStravaId,
    activity: activityDoc || null,
  }).catch((e) => console.error('[Strava sync push]', e.message || e));

  let title = 'New training synced';
  let body;
  const sportKey = normalizeSportForNotif(latestSport || activityDoc?.sport);
  const sportName = sportNotifLabel(sportKey);

  if (n === 1 && activityDoc) {
    const dist = activityDoc.distance >= 1000
      ? `${(activityDoc.distance / 1000).toFixed(1)} km`
      : activityDoc.distance > 0 ? `${Math.round(activityDoc.distance)} m` : null;
    const actName = activityDoc.name && String(activityDoc.name).trim();
    title = actName || `New ${sportName} synced`;
    const label = sportName.charAt(0).toUpperCase() + sportName.slice(1);
    body = dist
      ? `${label} · ${dist} · Tap to add lactate`
      : `${label} · Tap to add lactate`;
  } else {
    body = n === 1 ? '1 new activity imported from Strava.' : `${n} new activities imported from Strava.`;
  }

  sendNotification(String(userId), {
    type: 'strava_import',
    title,
    body,
    resourceType: 'strava',
    sport: sportKey,
    skipPush: true,
    ...(latestStravaId ? { resourceId: String(latestStravaId) } : {}),
  }).catch((e) => console.error('[Strava sync notification]', e.message || e));
}

module.exports = { notifyStravaImportedPush };
