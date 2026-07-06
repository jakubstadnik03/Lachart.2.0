/**
 * Dashboard training insights — rule-based coach hints (phases 1–3).
 */
import { assessReadiness, baseline } from './recovery';
import { findCompliance, getCompliance, plannedWorkoutDurationSecs } from './planCompliance';
import { resolveActivityTss } from './computeTss';

const HARD_TSS = 80;
const HARD_CATEGORIES = /vo2|threshold|interval|tempo|race|hard/i;

function toLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function planDateStr(pw) {
  return String(pw?.date || '').slice(0, 10);
}

function isHardPlannedWorkout(pw) {
  if (!pw || pw.status === 'skipped') return false;
  const tss = Number(pw.targetTss) || 0;
  const title = `${pw.title || ''} ${pw.category || ''}`;
  return tss >= HARD_TSS || HARD_CATEGORIES.test(title);
}

function sumWeekPlannedTss(plannedWorkouts, ref = new Date()) {
  const dow = (ref.getDay() + 6) % 7;
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - dow);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  return (plannedWorkouts || []).reduce((s, pw) => {
    if (pw.status === 'skipped') return s;
    const d = new Date(planDateStr(pw) + 'T12:00:00');
    if (d < mon || d > sun) return s;
    return s + (Number(pw.targetTss) || 0);
  }, 0);
}

function recommendedTaperTss(planned) {
  const p = Number(planned) || 0;
  return p > 0 ? Math.round(p * 0.67) : 0;
}

function daysUntilRace(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function normSport(sport) {
  const v = String(sport || '').toLowerCase();
  if (v.includes('ride') || v.includes('bike') || v.includes('cycle')) return 'bike';
  if (v.includes('run') || v.includes('walk') || v.includes('hike')) return 'run';
  if (v.includes('swim')) return 'swim';
  return 'other';
}

function activityDateStr(a) {
  const raw = a?.date || a?.startDate || a?.timestamp;
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

function yesterdayTss(activities, userProfile) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const key = toLocalDateStr(y);
  return (activities || []).reduce((s, a) => {
    if (activityDateStr(a) !== key) return s;
    return s + (resolveActivityTss(a, userProfile) || 0);
  }, 0);
}

function detectMonotony(activities) {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(toLocalDateStr(d));
  }
  const byDay = new Map();
  (activities || []).forEach((a) => {
    const key = activityDateStr(a);
    if (!days.includes(key)) return;
    const tss = resolveActivityTss(a) || 0;
    if (tss < 5) return;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(normSport(a.sport || a.type));
  });

  const activeDays = [...byDay.keys()];
  if (activeDays.length < 10) return null;

  const sports = new Set();
  byDay.forEach((list) => list.forEach((s) => sports.add(s)));
  const restDays = days.filter((d) => !byDay.has(d));
  if (restDays.length === 0 && sports.size <= 1) {
    return { sport: [...sports][0] || 'training' };
  }
  return null;
}

function complianceStreak(plannedWorkouts, activities) {
  const today = toLocalDateStr();
  const past = (plannedWorkouts || [])
    .filter((p) => planDateStr(p) < today && p.status !== 'skipped')
    .sort((a, b) => planDateStr(b).localeCompare(planDateStr(a)));

  let streak = 0;
  for (const pw of past.slice(0, 5)) {
    if (pw.status === 'planned') {
      streak += 1;
      continue;
    }
    const dayActs = (activities || []).filter((a) => activityDateStr(a) === planDateStr(pw));
    const c = findCompliance(pw, dayActs);
    if (c && (c.label === 'Short' || c.label === 'Missed')) {
      streak += 1;
      continue;
    }
    const planned = plannedWorkoutDurationSecs(pw);
    const match = dayActs[0];
    const actual = Number(match?.duration || match?.moving_time || 0);
    const fallback = getCompliance(planned, actual);
    if (fallback && (fallback.label === 'Short' || fallback.label === 'Missed')) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function daysSinceTest(tests) {
  const sorted = (tests || [])
    .map((t) => new Date(t.date || t.createdAt || 0))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a);
  if (!sorted.length) return Infinity;
  return Math.round((Date.now() - sorted[0].getTime()) / 86400000);
}

function risingVolume(activities) {
  const now = new Date();
  const thisWeek = [];
  const prevWeek = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = toLocalDateStr(d);
    const tss = (activities || []).reduce((s, a) => {
      if (activityDateStr(a) !== key) return s;
      return s + (resolveActivityTss(a) || 0);
    }, 0);
    if (i < 7) thisWeek.push(tss);
    else prevWeek.push(tss);
  }
  const cur = thisWeek.reduce((a, b) => a + b, 0);
  const prev = prevWeek.reduce((a, b) => a + b, 0);
  return prev > 0 && cur > prev * 1.15;
}

function readPmcField(row, key) {
  if (!row) return null;
  const v = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
  return v != null ? Number(v) : null;
}

function acuteFatigueFromSeries(sparklineData) {
  const tail = (sparklineData || []).slice(-3);
  if (tail.length < 3) return false;
  return tail.every((d) => {
    const f = readPmcField(d, 'Form');
    return f != null && f < -30;
  });
}

function atlSpikeFromSeries(sparklineData) {
  const series = sparklineData || [];
  if (series.length < 8) return null;
  const cur = readPmcField(series[series.length - 1], 'Fatigue');
  const prev = readPmcField(series[series.length - 8], 'Fatigue');
  if (cur == null || !prev) return null;
  const growth = (cur - prev) / prev;
  return growth > 0.3 ? growth : null;
}

const SEVERITY_RANK = { warning: 0, watch: 1, ok: 2 };

/**
 * All active insights, highest severity first.
 */
export function computeAllInsights({
  todayMetrics = {},
  plannedWorkouts = [],
  wellnessDays = [],
  activities = [],
  tests = [],
  sparklineData = [],
  nextRace = null,
  userProfile = null,
} = {}) {
  const form = todayMetrics.form != null ? Number(todayMetrics.form) : null;
  const fitness = todayMetrics.fitness != null ? Number(todayMetrics.fitness) : null;
  const today = toLocalDateStr();
  const todayPlans = (plannedWorkouts || []).filter((p) => planDateStr(p) === today && p.status !== 'skipped');
  const hardToday = todayPlans.filter(isHardPlannedWorkout);
  const readiness = assessReadiness(wellnessDays, { tsb: form });
  const insights = [];

  if (acuteFatigueFromSeries(sparklineData)) {
    insights.push({
      headline: 'Acute fatigue',
      detail: 'Form below −30 for three days — consider a recovery day.',
      severity: 'warning',
    });
  }

  const atlGrowth = atlSpikeFromSeries(sparklineData);
  if (atlGrowth != null) {
    insights.push({
      headline: 'Load spike',
      detail: `ATL up ${Math.round(atlGrowth * 100)}% in 7 days — watch injury risk.`,
      severity: 'watch',
    });
  }

  if (readiness?.level === 'high') {
    insights.push({
      headline: 'Body signals overload',
      detail: readiness.reasons?.length
        ? readiness.reasons.join(' · ')
        : 'HRV/RHR off baseline or very negative Form.',
      severity: 'warning',
    });
  }

  const hrvBase = baseline(wellnessDays, 'hrvMs');
  const latestWell = wellnessDays?.length ? wellnessDays[wellnessDays.length - 1] : null;
  if (hrvBase && latestWell?.hrvMs > 0 && form != null && form < -15) {
    const delta = (latestWell.hrvMs - hrvBase) / hrvBase;
    if (delta < -0.15) {
      insights.push({
        headline: 'HRV + load',
        detail: `HRV ${Math.round(Math.abs(delta) * 100)}% below baseline — keep it Z1/Z2 today.`,
        severity: 'watch',
      });
    }
  }

  const yTss = yesterdayTss(activities, userProfile);
  if (yTss > 120 && hardToday.length > 0) {
    insights.push({
      headline: 'Hard day yesterday',
      detail: `${Math.round(yTss)} TSS yesterday with intervals today — consider Z2 or a shift.`,
      severity: 'warning',
    });
  }

  if (form != null && form <= -28 && hardToday.length > 0) {
    insights.push({
      headline: `Form ${Math.round(form)} — go easy`,
      detail: `"${hardToday[0]?.title || 'hard session'}" on plan → Z2 or reschedule.`,
      severity: 'warning',
    });
  } else if (form != null && form <= -15) {
    insights.push({
      headline: `Form ${Math.round(form)}`,
      detail: 'Body may not be keeping up — lighter volume or recovery.',
      severity: 'watch',
    });
  }

  const mono = detectMonotony(activities);
  if (mono) {
    insights.push({
      headline: 'Low variety',
      detail: '14 days without rest / same sport — overreach risk.',
      severity: 'watch',
    });
  }

  const streak = complianceStreak(plannedWorkouts, activities);
  if (streak >= 3) {
    insights.push({
      headline: 'Plan vs. reality',
      detail: `${streak}× short or missed — adjust TSS or plan ambition.`,
      severity: 'watch',
    });
  }

  if (nextRace?.priority === 'A' && daysUntilRace(nextRace.date) > 0 && daysUntilRace(nextRace.date) <= 21) {
    insights.push({
      headline: 'Taper window',
      detail: `${daysUntilRace(nextRace.date)} days to ${nextRace.name} — add a Taper period on the calendar.`,
      severity: 'ok',
    });
  }

  if (nextRace?.priority === 'A' && daysUntilRace(nextRace.date) === 10) {
    const weekTss = sumWeekPlannedTss(plannedWorkouts);
    if (weekTss > 0) {
      const rec = recommendedTaperTss(weekTss);
      insights.push({
        headline: 'Taper week',
        detail: `Plan ${Math.round(weekTss)} TSS; target ~${rec}.`,
        severity: weekTss > rec * 1.15 ? 'watch' : 'ok',
      });
    }
  }

  if (nextRace?.targetCTL != null && fitness != null && daysUntilRace(nextRace.date) > 0 && daysUntilRace(nextRace.date) <= 21) {
    const gap = Math.round(Number(nextRace.targetCTL) - fitness);
    if (Math.abs(gap) >= 3) {
      insights.push({
        headline: gap > 0 ? `CTL gap +${gap}` : 'CTL above target',
        detail:
          gap > 0
            ? `${daysUntilRace(nextRace.date)} days left — add volume or lower CTL target.`
            : `Fitness ${Math.round(fitness)} vs. target ${Math.round(nextRace.targetCTL)}.`,
        severity: gap > 8 ? 'watch' : 'ok',
      });
    }
  }

  if (daysSinceTest(tests) >= 28 && risingVolume(activities)) {
    insights.push({
      headline: 'Zone check due',
      detail: '4+ weeks without a test and rising volume — lactate or FTP check.',
      severity: 'watch',
    });
  }

  if (form != null && form >= 5 && hardToday.length > 0) {
    insights.push({
      headline: `Form +${Math.round(form)} — good day`,
      detail: 'Room for a quality session as planned.',
      severity: 'ok',
    });
  }

  if (!insights.length && form != null) {
    const sign = form >= 0 ? '+' : '';
    insights.push({
      headline: `Form ${sign}${Math.round(form)}`,
      detail: todayPlans.length ? 'Stick to today\'s plan.' : 'Rest or easy activity.',
      severity: form < -10 ? 'watch' : 'ok',
    });
  }

  insights.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  return insights.map((i) => ({ ...i, form }));
}

/** Top insight for compact card. */
export function computeDailyInsight(opts = {}) {
  const all = computeAllInsights(opts);
  const top = all[0] || {
    headline: 'Today\'s insight',
    detail: null,
    severity: 'ok',
    form: null,
  };
  return { ...top, moreCount: Math.max(0, all.length - 1), all };
}

function sumWeekActualTss(activities, userProfile, ref = new Date()) {
  const dow = (ref.getDay() + 6) % 7;
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - dow);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);

  return (activities || []).reduce((s, a) => {
    const raw = a?.date || a?.startDate || a?.timestamp;
    if (!raw) return s;
    const d = new Date(raw);
    if (d < mon || d > sun) return s;
    return s + (resolveActivityTss(a, userProfile) || 0);
  }, 0);
}

/** Weekly stats + secondary insights for the expanded sheet. */
export function computeWeeklyOverview({
  todayMetrics = {},
  plannedWorkouts = [],
  activities = [],
  tests = [],
  sparklineData = [],
  nextRace = null,
  userProfile = null,
  wellnessDays = [],
} = {}) {
  const weekPlanned = sumWeekPlannedTss(plannedWorkouts);
  const weekActual = sumWeekActualTss(activities, userProfile);
  const form = todayMetrics.form != null ? Number(todayMetrics.form) : null;
  const fitness = todayMetrics.fitness != null ? Number(todayMetrics.fitness) : null;
  const fatigue = todayMetrics.fatigue != null ? Number(todayMetrics.fatigue) : null;
  const streak = complianceStreak(plannedWorkouts, activities);
  const all = computeAllInsights({
    todayMetrics,
    plannedWorkouts,
    wellnessDays,
    activities,
    tests,
    sparklineData,
    nextRace,
    userProfile,
  });

  const stats = [];
  if (weekActual > 0) stats.push({ label: 'Logged', value: `${Math.round(weekActual)} TSS` });
  if (weekPlanned > 0) stats.push({ label: 'Planned', value: `${Math.round(weekPlanned)} TSS` });
  if (fitness != null) stats.push({ label: 'CTL', value: String(Math.round(fitness)) });
  if (form != null) stats.push({ label: 'Form', value: `${form >= 0 ? '+' : ''}${Math.round(form)}` });
  if (fatigue != null) stats.push({ label: 'ATL', value: String(Math.round(fatigue)) });
  if (streak >= 2) stats.push({ label: 'Compliance', value: `${streak} short/missed` });

  return {
    stats,
    weekActual,
    weekPlanned,
    insights: all.slice(0, 6),
    insightCount: all.length,
  };
}

export { sumWeekPlannedTss, recommendedTaperTss, daysUntilRace, toLocalDateStr };
