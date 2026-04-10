const LactateSession = require('../models/lactateSession');
const { notifyUserLactateTestFollowUp } = require('../utils/expoPushNotifications');

/**
 * Sends a one-time Expo follow-up ~24h after a completed lactate test (when user may be away from the app).
 */
function startLactateTestFollowUpScheduler() {
  const enabled =
    process.env.ENABLE_LACTATE_FOLLOWUP_SCHEDULER === 'true' || process.env.NODE_ENV === 'production';
  if (!enabled) {
    console.log(
      '[LactateFollowUpScheduler] Disabled (set ENABLE_LACTATE_FOLLOWUP_SCHEDULER=true to enable).'
    );
    return;
  }

  const intervalMs = Number(process.env.LACTATE_FOLLOWUP_SCHEDULER_INTERVAL_MS || 20 * 60 * 1000);
  /** Default 48h so it does not duplicate the in-app local reminder (~24h). */
  const minHours = Number(process.env.LACTATE_FOLLOWUP_MIN_HOURS_AFTER || 48);
  const maxAgeDays = Number(process.env.LACTATE_FOLLOWUP_MAX_SESSION_AGE_DAYS || 14);

  const tick = async () => {
    const now = Date.now();
    const completedBefore = new Date(now - minHours * 60 * 60 * 1000);
    const completedAfter = new Date(now - maxAgeDays * 24 * 60 * 60 * 1000);

    const sessions = await LactateSession.find({
      status: 'completed',
      followUpPushSentAt: null,
      completedAt: { $lte: completedBefore, $gte: completedAfter },
    })
      .select('_id athleteId')
      .limit(120)
      .lean();

    for (const s of sessions) {
      try {
        await notifyUserLactateTestFollowUp(s.athleteId);
        await LactateSession.updateOne({ _id: s._id }, { $set: { followUpPushSentAt: new Date() } });
      } catch (e) {
        console.error('[LactateFollowUpScheduler] session', s._id, e.message || e);
      }
    }
  };

  setTimeout(() => tick().catch((e) => console.error('[LactateFollowUpScheduler] tick error', e)), 45 * 1000);
  setInterval(
    () => tick().catch((e) => console.error('[LactateFollowUpScheduler] tick error', e)),
    intervalMs
  );

  console.log('[LactateFollowUpScheduler] Started.', { intervalMs, minHours, maxAgeDays });
}

module.exports = { startLactateTestFollowUpScheduler };
