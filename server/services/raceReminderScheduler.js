const RaceEvent = require('../models/RaceEvent');
const PlannedWorkout = require('../models/PlannedWorkout');
const User = require('../models/UserModel');
const { sendNotification } = require('../utils/notificationHelper');
const { calculateTodayMetrics } = require('../controllers/fitnessMetricsController');
const {
  reminderDaysForPriority,
  startOfUtcDay,
  daysBetweenUtc,
  reminderKey,
  buildCountdownBody,
  buildTaperBody,
  buildCtlGapBody,
  buildPostRaceBody,
} = require('../utils/raceReminderUtils');

async function getCurrentWeekPlannedTss(athleteId) {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7;
  const monday = startOfUtcDay(now);
  monday.setUTCDate(monday.getUTCDate() - dow);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);

  const workouts = await PlannedWorkout.find({
    athleteId: String(athleteId),
    date: { $gte: monday, $lte: sunday },
    status: { $ne: 'skipped' },
  })
    .select('targetTss')
    .lean();

  return workouts.reduce((s, w) => s + (Number(w.targetTss) || 0), 0);
}

async function processRace(race, today) {
  const daysLeft = daysBetweenUtc(today, race.date);
  const sent = race.remindersSent || {};
  const metrics = await calculateTodayMetrics(race.athleteId).catch(() => ({}));
  const updates = {};

  // Post-race (+1 day)
  if (daysLeft === -1 && !sent.postRace) {
    await sendNotification(race.athleteId, {
      type: 'race_post',
      title: 'How did the race go?',
      body: buildPostRaceBody(race),
      resourceId: String(race._id),
      resourceType: 'race',
      skipPush: true,
      pushData: {
        raceId: String(race._id),
        openRaceFeedback: String(race._id),
      },
    });
    updates['remindersSent.postRace'] = new Date();
  }

  if (daysLeft < 0) {
    if (Object.keys(updates).length) {
      await RaceEvent.updateOne({ _id: race._id }, { $set: updates });
    }
    return;
  }

  const days = reminderDaysForPriority(race.priority || 'A');
  for (const d of days) {
    const key = reminderKey(d);
    if (daysLeft === d && !sent[key]) {
      await sendNotification(race.athleteId, {
        type: 'race_reminder',
        title: daysLeft === 1 ? 'Race tomorrow!' : `Race in ${daysLeft} days`,
        body: buildCountdownBody(race, daysLeft, metrics),
        resourceId: String(race._id),
        resourceType: 'race',
        pushData: { raceId: String(race._id), openRace: String(race._id) },
      });
      updates[`remindersSent.${key}`] = new Date();
    }
  }

  // Taper alert — A races only, 10 days out
  if (race.priority === 'A' && daysLeft === 10 && !sent.taper10) {
    const weekTss = await getCurrentWeekPlannedTss(race.athleteId);
    if (weekTss > 0) {
      await sendNotification(race.athleteId, {
        type: 'race_taper',
        title: 'Taper — reduce volume',
        body: buildTaperBody(race, weekTss),
        resourceId: String(race._id),
        resourceType: 'race',
        pushData: { raceId: String(race._id), openRace: String(race._id) },
      });
      updates['remindersSent.taper10'] = new Date();
    }
  }

  // CTL gap — in-app only when target set and race within 21 days (avoid duplicate with countdown)
  if (
    race.targetCTL != null &&
    daysLeft > 0 &&
    daysLeft <= 21 &&
    !sent[`ctlGap${daysLeft}`] &&
    metrics.fitness != null
  ) {
    const gapBody = buildCtlGapBody(race, daysLeft, metrics.fitness);
    const gap = Math.round(Number(race.targetCTL) - Number(metrics.fitness));
    if (gapBody && Math.abs(gap) >= 3) {
      await sendNotification(race.athleteId, {
        type: 'race_ctl_gap',
        title: 'Fitness vs. race target',
        body: gapBody,
        resourceId: String(race._id),
        resourceType: 'race',
        skipPush: true,
      });
      updates[`remindersSent.ctlGap${daysLeft}`] = new Date();
    }
  }

  if (Object.keys(updates).length) {
    await RaceEvent.updateOne({ _id: race._id }, { $set: updates });
  }
}

function startRaceReminderScheduler() {
  const enabled =
    process.env.ENABLE_RACE_REMINDER_SCHEDULER === 'true' || process.env.NODE_ENV === 'production';
  if (!enabled) {
    console.log('[RaceReminderScheduler] Disabled (set ENABLE_RACE_REMINDER_SCHEDULER=true).');
    return;
  }

  const intervalMs = Number(process.env.RACE_REMINDER_SCHEDULER_INTERVAL_MS || 60 * 60 * 1000);

  const tick = async () => {
    const today = startOfUtcDay(new Date());
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + 16);
    const past = new Date(today);
    past.setUTCDate(past.getUTCDate() - 2);

    const races = await RaceEvent.find({
      date: { $gte: past, $lte: horizon },
    })
      .limit(500)
      .lean();

    const athleteIds = [...new Set(races.map((r) => String(r.athleteId)))];
    const users = await User.find({ _id: { $in: athleteIds } })
      .select('notifications')
      .lean();
    const prefsByAthlete = new Map(users.map((u) => [String(u._id), u.notifications || {}]));

    for (const race of races) {
      const prefs = prefsByAthlete.get(String(race.athleteId)) || {};
      if (prefs.pushRaceReminders === false) continue;
      try {
        await processRace(race, today);
      } catch (e) {
        console.error('[RaceReminderScheduler] race', race._id, e.message || e);
      }
    }
  };

  setTimeout(() => tick().catch((e) => console.error('[RaceReminderScheduler] tick', e)), 60 * 1000);
  setInterval(() => tick().catch((e) => console.error('[RaceReminderScheduler] tick', e)), intervalMs);
  console.log('[RaceReminderScheduler] Started.', { intervalMs });
}

module.exports = { startRaceReminderScheduler };
