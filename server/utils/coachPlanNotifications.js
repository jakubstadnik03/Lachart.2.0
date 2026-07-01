const User = require('../models/UserModel');
const { notifyAthlete } = require('./notificationHelper');

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isTomorrow(date) {
  const d = startOfLocalDay(date);
  const t = startOfLocalDay(new Date());
  t.setDate(t.getDate() + 1);
  return d.getTime() === t.getTime();
}

function planDateKey(pw) {
  if (!pw?.date) return '';
  return new Date(pw.date).toISOString().slice(0, 10);
}

/**
 * Notify athlete when a coach adds or changes a plan for tomorrow.
 */
async function maybeNotifyCoachPlanUpdate({
  athleteId,
  coachUserId,
  plannedWorkout,
  isNew = false,
  previousDate = null,
}) {
  const athlete = String(athleteId);
  const coach = String(coachUserId);
  if (!athlete || athlete === coach) return;

  const pwDate = plannedWorkout?.date;
  if (!isTomorrow(pwDate)) return;

  const coachUser = await User.findById(coach).select('name').lean();
  const coachName = coachUser?.name || 'Trenér';
  const title = plannedWorkout?.title || 'Trénink';
  const dateLabel = new Date(pwDate).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'short' });

  const notifTitle = isNew ? 'Nový plán od trenéra' : 'Trenér změnil plán';
  const body = isNew
    ? `${coachName} přidal na zítra: ${title}`
    : `${coachName} upravil zítřejší plán: ${title} (${dateLabel})`;

  notifyAthlete(athlete, {
    type: isNew ? 'coach_plan_added' : 'coach_plan_changed',
    title: notifTitle,
    body,
    resourceId: String(plannedWorkout._id),
    resourceType: 'planned',
    sport: plannedWorkout.sport || null,
    fromName: coachName,
    pushData: {
      plannedWorkoutId: String(plannedWorkout._id),
      openPlanned: String(plannedWorkout._id),
    },
  }).catch(() => {});
}

module.exports = { maybeNotifyCoachPlanUpdate, isTomorrow, planDateKey };
