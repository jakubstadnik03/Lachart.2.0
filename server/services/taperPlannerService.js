const RaceEvent = require('../models/RaceEvent');
const PlannedWorkout = require('../models/PlannedWorkout');
const CalendarPeriod = require('../models/CalendarPeriod');
const { buildTaperPlan, taperPeriodDates, startOfUtcDay } = require('../utils/taperPlannerUtils');

async function previewTaperForRace(raceId, athleteId) {
  const race = await RaceEvent.findById(raceId).lean();
  if (!race || String(race.athleteId) !== String(athleteId)) {
    return { ok: false, code: 404, error: 'Race not found' };
  }

  const today = startOfUtcDay(new Date());
  const raceDay = startOfUtcDay(race.date);
  if (raceDay < today) return { ok: false, code: 400, error: 'Race is in the past' };

  const workouts = await PlannedWorkout.find({
    athleteId: String(athleteId),
    date: { $gte: today, $lt: raceDay },
    status: 'planned',
  })
    .sort({ date: 1 })
    .lean();

  const plan = buildTaperPlan(workouts, race.date);
  const period = taperPeriodDates(race.date);

  return {
    ok: true,
    race: { id: String(race._id), name: race.name, date: race.date, priority: race.priority },
    ...plan,
    suggestedPeriod: period
      ? { type: 'Taper', startDate: period.startDate, endDate: period.endDate, notes: race.name }
      : null,
  };
}

async function applyTaperForRace(raceId, athleteId, userId, { createPeriod = true } = {}) {
  const preview = await previewTaperForRace(raceId, athleteId);
  if (!preview.ok) return preview;

  let updated = 0;
  for (const ch of preview.changes) {
    const pw = await PlannedWorkout.findById(ch.id);
    if (!pw || String(pw.athleteId) !== String(athleteId)) continue;
    if (ch.after.targetTss != null) pw.targetTss = ch.after.targetTss;
    if (ch.after.plannedDuration != null) pw.plannedDuration = ch.after.plannedDuration;
    if (ch.after.steps) pw.steps = ch.after.steps;
    await pw.save();
    updated += 1;
  }

  let period = null;
  if (createPeriod && preview.suggestedPeriod) {
    const { startDate, endDate, notes } = preview.suggestedPeriod;
    const existing = await CalendarPeriod.findOne({
      athleteId: String(athleteId),
      type: 'Taper',
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    }).lean();
    if (!existing) {
      period = await CalendarPeriod.create({
        athleteId: String(athleteId),
        createdBy: String(userId),
        type: 'Taper',
        startDate,
        endDate,
        notes: notes || preview.race.name,
        color: '#d97706',
      });
    }
  }

  return {
    ok: true,
    updated,
    summary: preview.summary,
    period,
    race: preview.race,
  };
}

module.exports = { previewTaperForRace, applyTaperForRace };
