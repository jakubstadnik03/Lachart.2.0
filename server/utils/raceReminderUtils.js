/**
 * Shared race-reminder logic for the server scheduler and (mirrored on client) UI hints.
 */

/** Countdown push days by race priority. */
function reminderDaysForPriority(priority) {
  if (priority === 'A') return [14, 7, 3, 1];
  return [3, 1];
}

function startOfUtcDay(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Whole calendar days from `from` to `to` (UTC midnight). */
function daysBetweenUtc(from, to) {
  return Math.round((startOfUtcDay(to) - startOfUtcDay(from)) / 86400000);
}

function reminderKey(daysLeft) {
  return `d${daysLeft}`;
}

function formatForm(tsb) {
  if (tsb == null || Number.isNaN(Number(tsb))) return null;
  const n = Math.round(Number(tsb));
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Countdown message: "In 7 days: Livigno Trail — Form +12, target CTL 165 (yours 167)"
 */
function buildCountdownBody(race, daysLeft, metrics = {}) {
  const form = formatForm(metrics.form);
  const fitness = metrics.fitness != null ? Math.round(metrics.fitness) : null;
  const dayWord = daysLeft === 1 ? 'day' : 'days';
  let body = `In ${daysLeft} ${dayWord}: ${race.name}`;
  if (form) body += ` — Form ${form}`;
  if (race.targetCTL != null && fitness != null) {
    body += `, target CTL ${Math.round(race.targetCTL)} (yours ${fitness})`;
  } else if (race.targetCTL != null) {
    body += `, target CTL ${Math.round(race.targetCTL)}`;
  }
  return body;
}

/** Simple taper target ≈ 67 % of planned week TSS when A-race is ~10 days out. */
function recommendedTaperTss(plannedWeekTss) {
  const p = Number(plannedWeekTss) || 0;
  if (p <= 0) return 0;
  return Math.round(p * 0.67);
}

function buildTaperBody(race, plannedWeekTss) {
  const rec = recommendedTaperTss(plannedWeekTss);
  return `${race.name} in 10 days — ${Math.round(plannedWeekTss)} TSS planned this week, recommended taper ~${rec}`;
}

function buildCtlGapBody(race, daysLeft, currentCtl) {
  const target = Number(race.targetCTL);
  const ctl = Number(currentCtl);
  if (!target || Number.isNaN(ctl)) return null;
  const gap = Math.round(target - ctl);
  if (gap === 0) return `${daysLeft} days to ${race.name} — you're at target CTL ${target}`;
  const dir = gap > 0 ? `+${gap}` : `${gap}`;
  return `${dir} CTL to target in ${daysLeft} days — add volume or lower the goal`;
}

function buildPostRaceBody(race) {
  return `How did ${race.name} go? Add how you felt, RPE, or a race note.`;
}

module.exports = {
  reminderDaysForPriority,
  startOfUtcDay,
  daysBetweenUtc,
  reminderKey,
  buildCountdownBody,
  recommendedTaperTss,
  buildTaperBody,
  buildCtlGapBody,
  buildPostRaceBody,
};
