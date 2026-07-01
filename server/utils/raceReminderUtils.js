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
 * Countdown message: „Za 7 dní: Livigno Trail — Form +12, cíl CTL 165 (máš 167)“
 */
function buildCountdownBody(race, daysLeft, metrics = {}) {
  const form = formatForm(metrics.form);
  const fitness = metrics.fitness != null ? Math.round(metrics.fitness) : null;
  const dayWord = daysLeft === 1 ? 'den' : 'dní';
  let body = `Za ${daysLeft} ${dayWord}: ${race.name}`;
  if (form) body += ` — Form ${form}`;
  if (race.targetCTL != null && fitness != null) {
    body += `, cíl CTL ${Math.round(race.targetCTL)} (máš ${fitness})`;
  } else if (race.targetCTL != null) {
    body += `, cíl CTL ${Math.round(race.targetCTL)}`;
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
  return `Za 10 dní ${race.name} — tento týden máš v plánu ${Math.round(plannedWeekTss)} TSS, doporučený taper ~${rec}`;
}

function buildCtlGapBody(race, daysLeft, currentCtl) {
  const target = Number(race.targetCTL);
  const ctl = Number(currentCtl);
  if (!target || Number.isNaN(ctl)) return null;
  const gap = Math.round(target - ctl);
  if (gap === 0) return `Do ${race.name} zbývá ${daysLeft} dní — jsi na cílovém CTL ${target}`;
  const dir = gap > 0 ? `+${gap}` : `${gap}`;
  return `Do cílového CTL zbývá ${dir} za ${daysLeft} dní — buď přidej objem, nebo sniž cíl`;
}

function buildPostRaceBody(race) {
  return `Jak dopadl ${race.name}? Přidej pocit, RPE nebo poznámku k závodu.`;
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
