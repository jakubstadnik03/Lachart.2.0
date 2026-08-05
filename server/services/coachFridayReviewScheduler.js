const User = require('../models/UserModel');
const { sendNotification } = require('../utils/notificationHelper');

function fridayWeekKey(d = new Date()) {
  const x = new Date(d);
  const day = x.getUTCDay();
  const diff = x.getUTCDate() - day + (day === 0 ? -6 : 5);
  x.setUTCDate(diff);
  return x.toISOString().slice(0, 10);
}

/**
 * Monday of the same week, 'YYYY-MM-DD'.
 *
 * fridayWeekKey() above returns the FRIDAY and is kept as-is because the
 * per-athlete dedupe field already holds those values. The calendar and
 * WeeklyReview key weeks by their Monday, so deep links must be converted or
 * the notification opens the wrong week.
 */
function mondayOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getUTCDay();            // 0=Sun
  const delta = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + delta);
  return x.toISOString().slice(0, 10);
}

function startCoachFridayReviewScheduler() {
  const enabled =
    process.env.ENABLE_COACH_FRIDAY_REVIEW_SCHEDULER === 'true' || process.env.NODE_ENV === 'production';
  if (!enabled) {
    console.log('[CoachFridayReview] Disabled (set ENABLE_COACH_FRIDAY_REVIEW_SCHEDULER=true).');
    return;
  }

  const sendHourUtc = Number(process.env.COACH_FRIDAY_REVIEW_HOUR_UTC || 16);
  const intervalMs = Number(process.env.COACH_FRIDAY_REVIEW_INTERVAL_MS || 60 * 60 * 1000);

  const tick = async () => {
    const now = new Date();
    if (now.getUTCDay() !== 5) return;
    const hour = now.getUTCHours();
    if (hour < sendHourUtc || hour > sendHourUtc + 1) return;

    const weekKey = fridayWeekKey(now);
    const mondayKey = mondayOfWeek(now);   // what the calendar keys weeks by

    const athletes = await User.find({
      isActive: { $ne: false },
      $or: [
        { coachIds: { $exists: true, $not: { $size: 0 } } },
        { coachId: { $ne: null } },
      ],
    })
      .select('_id name coachIds coachId notifications fridayReviewLastSentWeekStart')
      .limit(2000)
      .lean();

    let sent = 0;
    for (const athlete of athletes) {
      if (athlete.notifications?.pushCoachUpdates === false) continue;
      if (athlete.fridayReviewLastSentWeekStart === weekKey) continue;

      const coachIds = [
        ...(Array.isArray(athlete.coachIds) ? athlete.coachIds : []),
        ...(athlete.coachId ? [athlete.coachId] : []),
      ].filter(Boolean);
      if (!coachIds.length) continue;

      const coach = await User.findById(coachIds[0]).select('name').lean();
      const coachName = coach?.name || 'Coach';

      await sendNotification(String(athlete._id), {
        type: 'weekly_review_request',
        title: 'Weekly review',
        body: `${coachName} is waiting for your week — add a note or summary.`,
        // Carry the week being reviewed so the tap lands on that Sunday's note
        // instead of the dashboard, which had nowhere to write anything.
        resourceId: mondayKey,
        resourceType: 'weekly_review',
        pushData: { screen: 'calendar', weeklyReview: mondayKey },
      });

      await User.updateOne(
        { _id: athlete._id },
        { $set: { fridayReviewLastSentWeekStart: weekKey } }
      );
      sent += 1;
    }

    if (sent > 0) console.log('[CoachFridayReview] Sent', sent, 'review request(s)');
  };

  setTimeout(() => tick().catch((e) => console.error('[CoachFridayReview] tick', e)), 150 * 1000);
  setInterval(() => tick().catch((e) => console.error('[CoachFridayReview] tick', e)), intervalMs);
  console.log('[CoachFridayReview] Started.', { sendHourUtc, intervalMs });
}

module.exports = { startCoachFridayReviewScheduler };
