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
      headline: 'Akutní únava',
      detail: 'Form pod −30 tři dny po sobě — zvaž recovery den.',
      severity: 'warning',
    });
  }

  const atlGrowth = atlSpikeFromSeries(sparklineData);
  if (atlGrowth != null) {
    insights.push({
      headline: 'Náhlý skok zátěže',
      detail: `ATL +${Math.round(atlGrowth * 100)} % za 7 dní — pozor na zranění.`,
      severity: 'watch',
    });
  }

  if (readiness?.level === 'high') {
    insights.push({
      headline: 'Tělo signalizuje přetížení',
      detail: readiness.reasons?.length
        ? readiness.reasons.join(' · ')
        : 'HRV/RHR mimo normu nebo velmi negativní Form.',
      severity: 'warning',
    });
  }

  const hrvBase = baseline(wellnessDays, 'hrvMs');
  const latestWell = wellnessDays?.length ? wellnessDays[wellnessDays.length - 1] : null;
  if (hrvBase && latestWell?.hrvMs > 0 && form != null && form < -15) {
    const delta = (latestWell.hrvMs - hrvBase) / hrvBase;
    if (delta < -0.15) {
      insights.push({
        headline: 'HRV + zátěž',
        detail: `HRV ${Math.round(Math.abs(delta) * 100)} % pod baseline — dnes spíš Z1/Z2.`,
        severity: 'watch',
      });
    }
  }

  const yTss = yesterdayTss(activities, userProfile);
  if (yTss > 120 && hardToday.length > 0) {
    insights.push({
      headline: 'Včera těžký den',
      detail: `Včera ${Math.round(yTss)} TSS a dnes intervaly — zvaž posun nebo Z2.`,
      severity: 'warning',
    });
  }

  if (form != null && form <= -28 && hardToday.length > 0) {
    insights.push({
      headline: `Form ${Math.round(form)} — dnes opatrně`,
      detail: `„${hardToday[0]?.title || 'náročný trénink'}" na plánu → Z2 nebo posun.`,
      severity: 'warning',
    });
  } else if (form != null && form <= -15) {
    insights.push({
      headline: `Form ${Math.round(form)}`,
      detail: 'Tělo nejspíš nestíhá — lehčí objem nebo recovery.',
      severity: 'watch',
    });
  }

  const mono = detectMonotony(activities);
  if (mono) {
    insights.push({
      headline: 'Chybí variace',
      detail: '14 dní bez volna / stejný sport — riziko přetížení.',
      severity: 'watch',
    });
  }

  const streak = complianceStreak(plannedWorkouts, activities);
  if (streak >= 3) {
    insights.push({
      headline: 'Plán vs. realita',
      detail: `${streak}× Short/Missed — uprav TSS nebo ambici plánu.`,
      severity: 'watch',
    });
  }

  if (nextRace?.priority === 'A' && daysUntilRace(nextRace.date) > 0 && daysUntilRace(nextRace.date) <= 21) {
    insights.push({
      headline: 'Taper období',
      detail: `Do ${nextRace.name} ${daysUntilRace(nextRace.date)} dní — zvaž periodu „Taper" v kalendáři.`,
      severity: 'ok',
    });
  }

  if (nextRace?.priority === 'A' && daysUntilRace(nextRace.date) === 10) {
    const weekTss = sumWeekPlannedTss(plannedWorkouts);
    if (weekTss > 0) {
      const rec = recommendedTaperTss(weekTss);
      insights.push({
        headline: 'Taper týden',
        detail: `Plán ${Math.round(weekTss)} TSS, doporučeno ~${rec}.`,
        severity: weekTss > rec * 1.15 ? 'watch' : 'ok',
      });
    }
  }

  if (nextRace?.targetCTL != null && fitness != null && daysUntilRace(nextRace.date) > 0 && daysUntilRace(nextRace.date) <= 21) {
    const gap = Math.round(Number(nextRace.targetCTL) - fitness);
    if (Math.abs(gap) >= 3) {
      insights.push({
        headline: gap > 0 ? `CTL gap +${gap}` : `CTL nad cílem`,
        detail:
          gap > 0
            ? `Zbývá ${daysUntilRace(nextRace.date)} dní — přidej objem nebo sniž cíl CTL.`
            : `Fitness ${Math.round(fitness)} vs. cíl ${Math.round(nextRace.targetCTL)}.`,
        severity: gap > 8 ? 'watch' : 'ok',
      });
    }
  }

  if (daysSinceTest(tests) >= 28 && risingVolume(activities)) {
    insights.push({
      headline: 'Čas na kontrolu zón',
      detail: '4+ týdny bez testu a rostoucí objem — zvaž laktát nebo FTP check.',
      severity: 'watch',
    });
  }

  if (form != null && form >= 5 && hardToday.length > 0) {
    insights.push({
      headline: `Form +${Math.round(form)} — dobrý den`,
      detail: 'Prostor na kvalitní trénink podle plánu.',
      severity: 'ok',
    });
  }

  if (!insights.length && form != null) {
    const sign = form >= 0 ? '+' : '';
    insights.push({
      headline: `Form ${sign}${Math.round(form)}`,
      detail: todayPlans.length ? 'Drž se dnešního plánu.' : 'Volno nebo lehká aktivita.',
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
    headline: 'Dnešní doporučení',
    detail: null,
    severity: 'ok',
    form: null,
  };
  return { ...top, moreCount: Math.max(0, all.length - 1), all };
}

export { sumWeekPlannedTss, recommendedTaperTss, daysUntilRace };
