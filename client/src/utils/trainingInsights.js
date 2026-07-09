/**
 * Dashboard training insights — rule-based coach hints (phases 1–3).
 */
import { assessReadiness, baseline } from './recovery';
import { findCompliance, getCompliance, plannedWorkoutDurationSecs } from './planCompliance';
import { resolveActivityTss } from './computeTss';
import { enrichProfileForTss } from './inferThresholdsFromActivities';
import { activityCalendarDateKey } from './formFitnessFromActivities';

const HARD_TSS = 80;
const HARD_CATEGORIES = /vo2|threshold|interval|tempo|race|hard|lt2|vo2max|hills/i;
const ENDURANCE_PATTERNS = /\b(long|endurance|z2|zone\s*2|easy|lt1|aerobic|base|brick|off\s*bike)\b/i;
const INTERVAL_PATTERNS = /\b(interval|vo2|vo₂|threshold|lt2|tempo|hard|sprint|reps?|×|\d+\s*[x×]\s*\d+)\b/i;
const EASY_CATEGORY_IDS = new Set(['endurance', 'zone2', 'lt1']);
const HARD_CATEGORY_IDS = new Set(['vo2max', 'lt2', 'tempo', 'hills']);

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
  return activityCalendarDateKey(a) || '';
}

function sessionDisplayLabel(item) {
  const title = String(item?.title || item?.name || '').trim();
  if (title) return title;
  const cat = String(item?.category || '').trim();
  if (cat) return cat.replace(/_/g, ' ');
  const sport = normSport(item?.sport || item?.type);
  if (sport !== 'other') return sport;
  return 'session';
}

function classifySessionIntensity(item, tss = 0) {
  const text = `${item?.title || ''} ${item?.name || ''} ${item?.category || ''}`;
  const cat = String(item?.category || '').toLowerCase();

  if (HARD_CATEGORY_IDS.has(cat) || INTERVAL_PATTERNS.test(text)) return 'hard';
  if (EASY_CATEGORY_IDS.has(cat) || ENDURANCE_PATTERNS.test(text)) return 'endurance';
  if (tss >= 120) return 'endurance';
  if (tss >= HARD_TSS || HARD_CATEGORIES.test(text)) return 'hard';
  if (tss >= 35) return 'moderate';
  return 'easy';
}

function buildTssContext(activities, userProfile) {
  if (!userProfile) return { profile: null, user: null };
  const profile = enrichProfileForTss(userProfile, activities);
  return { profile, user: userProfile };
}

function resolveInsightTss(activity, tssCtx) {
  if (!tssCtx?.profile) return resolveActivityTss(activity) || 0;
  return resolveActivityTss(activity, tssCtx.profile, { user: tssCtx.user || tssCtx.profile }) || 0;
}

function summarizeActivityDay(activities, dateKey, tssCtx) {
  const sessions = (activities || [])
    .filter((a) => activityDateStr(a) === dateKey)
    .map((a) => {
      const tss = resolveInsightTss(a, tssCtx);
      return {
        label: sessionDisplayLabel(a),
        sport: normSport(a.sport || a.type),
        tss,
        intensity: classifySessionIntensity(a, tss),
      };
    })
    .filter((s) => s.tss >= 5 || s.label !== 'session')
    .sort((a, b) => b.tss - a.tss);

  const totalTss = sessions.reduce((s, x) => s + x.tss, 0);
  const hardCount = sessions.filter((s) => s.intensity === 'hard').length;
  const enduranceCount = sessions.filter((s) => s.intensity === 'endurance').length;
  const sports = new Set(sessions.map((s) => s.sport).filter((s) => s !== 'other'));

  let profile = 'easy';
  if (hardCount > 0 && hardCount >= enduranceCount) profile = 'intensity';
  else if (enduranceCount > 0 || totalTss >= 120) profile = 'endurance_volume';
  else if (sessions.length >= 2 && sports.size >= 2) profile = 'multi_sport';
  else if (totalTss >= HARD_TSS) profile = 'moderate';

  return { totalTss, sessions, profile, sessionCount: sessions.length, sportCount: sports.size };
}

function summarizePlannedDay(plannedWorkouts, dateKey) {
  const sessions = (plannedWorkouts || [])
    .filter((p) => planDateStr(p) === dateKey && p.status !== 'skipped')
    .map((p) => {
      const tss = Number(p.targetTss) || 0;
      return {
        label: sessionDisplayLabel(p),
        sport: normSport(p.sport),
        tss,
        intensity: classifySessionIntensity(p, tss),
        hard: isHardPlannedWorkout(p),
      };
    });

  const hardSessions = sessions.filter((s) => s.hard);
  const totalTss = sessions.reduce((s, x) => s + x.tss, 0);
  return { totalTss, sessions, hardSessions, sessionCount: sessions.length };
}

function describePastDay(summary) {
  const tss = Math.round(summary.totalTss || 0);
  if (!tss) return 'a hard day yesterday';

  const { sessions, profile, sessionCount } = summary;
  const main = sessions[0];
  const mainLabel = main?.label;

  if (profile === 'endurance_volume') {
    if (sessionCount > 1) {
      return `${tss} TSS yesterday — ${mainLabel || 'long ride'} plus ${sessionCount - 1} more session${sessionCount - 1 === 1 ? '' : 's'}`;
    }
    return `${tss} TSS yesterday — ${mainLabel || 'endurance volume'}`;
  }

  if (profile === 'intensity') {
    const hardLabels = sessions.filter((s) => s.intensity === 'hard').map((s) => s.label);
    if (hardLabels.length === 1) return `${tss} TSS yesterday — ${hardLabels[0]}`;
    return `${tss} TSS yesterday — ${hardLabels.slice(0, 2).join(' + ')}`;
  }

  if (profile === 'multi_sport' && sessionCount > 1) {
    const labels = sessions.slice(0, 3).map((s) => s.label).join(', ');
    return `${tss} TSS yesterday — ${sessionCount}-session day (${labels})`;
  }

  if (mainLabel) return `${tss} TSS yesterday — ${mainLabel}`;
  return `${tss} TSS yesterday`;
}

function describeTodayHardPlan(hardSessions) {
  if (!hardSessions?.length) return 'a hard session on today\'s plan';
  if (hardSessions.length === 1) return `"${hardSessions[0].label}" on today's plan`;
  const labels = hardSessions.map((s) => s.label).slice(0, 2).join(', ');
  return `${hardSessions.length} quality sessions today (${labels})`;
}

function detectMonotony(activities, tssCtx) {
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
    const tss = resolveInsightTss(a, tssCtx);
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

function risingVolume(activities, tssCtx) {
  const now = new Date();
  const thisWeek = [];
  const prevWeek = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = toLocalDateStr(d);
    const tss = (activities || []).reduce((s, a) => {
      if (activityDateStr(a) !== key) return s;
      return s + resolveInsightTss(a, tssCtx);
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

/** Daily TSS that counts as genuinely hard relative to chronic fitness (CTL). */
function relativeHardDayThreshold(fitness) {
  const ctl = Number(fitness) || 0;
  if (ctl >= 120) return Math.round(ctl * 1.35);
  if (ctl >= 80) return Math.round(ctl * 1.3);
  if (ctl >= 50) return Math.round(Math.max(90, ctl * 1.25));
  return 100;
}

function isGenuinelyHardYesterday(summary, fitness) {
  const yTss = Number(summary?.totalTss) || 0;
  if (yTss < 40) return false;
  const ctl = Number(fitness) || 0;
  const threshold = relativeHardDayThreshold(fitness);

  if (summary?.profile === 'intensity') {
    return yTss >= Math.max(70, ctl * 0.55);
  }
  if (summary?.profile === 'endurance_volume') {
    return yTss >= Math.max(threshold, ctl * 1.5);
  }
  return yTss >= threshold;
}

function formatFormShort(form) {
  if (form == null || !Number.isFinite(form)) return null;
  const rounded = Math.round(form);
  return rounded >= 0 ? `+${rounded}` : String(rounded);
}

/**
 * Yesterday load + today's hard plan, scaled to CTL/Form — not fixed 120 TSS.
 */
function buildStackedTrainingInsight(yesterdaySummary, todayPlanSummary, { form, fitness, hardToday }) {
  const yTss = yesterdaySummary.totalTss || 0;
  if (!hardToday.length || yTss < 40) return null;

  const ctl = Number(fitness) || 0;
  const formVal = form != null ? Number(form) : null;
  const genuinelyHard = isGenuinelyHardYesterday(yesterdaySummary, fitness);
  const yesterdayDesc = describePastDay(yesterdaySummary);
  const todayDesc = describeTodayHardPlan(todayPlanSummary.hardSessions);
  const formStr = formatFormShort(formVal);
  const ctlStr = ctl > 0 ? String(Math.round(ctl)) : null;

  const contextBits = [];
  if (formStr != null) contextBits.push(`Form ${formStr}`);
  if (ctlStr) contextBits.push(`CTL ${ctlStr}`);
  const context = contextBits.length ? ` (${contextBits.join(', ')})` : '';

  if (genuinelyHard && formVal != null && formVal <= -20) {
    return {
      headline: 'Hard day yesterday',
      detail: `${yesterdayDesc}; ${todayDesc}${context}. Legs likely need Z2 — shift or shorten the quality work.`,
      severity: 'warning',
    };
  }

  if (genuinelyHard && formVal != null && formVal <= -10) {
    return {
      headline: 'Back-to-back load',
      detail: `${yesterdayDesc}; ${todayDesc}${context}. Consider Z2 or moving one session if legs feel heavy.`,
      severity: 'watch',
    };
  }

  if (genuinelyHard) {
    return {
      headline: 'Back-to-back load',
      detail: `${yesterdayDesc}; ${todayDesc}${context}. Form looks OK — start easy and adjust by feel.`,
      severity: 'watch',
    };
  }

  // Moderate / easy yesterday (e.g. 150 TSS at CTL 164) + quality today — normal training pattern
  if (formVal != null && formVal <= -22) {
    return {
      headline: 'Fatigue building',
      detail: `${yesterdayDesc}; ${todayDesc}${context}. Form is low — lighter work or postpone intensity.`,
      severity: 'watch',
    };
  }

  if (hardToday.length >= 2) {
    return {
      headline: 'Quality day ahead',
      detail: `${yesterdayDesc}; ${todayDesc}${context}. Yesterday was manageable for your fitness — execute if you feel ready.`,
      severity: formVal != null && formVal < -12 ? 'watch' : 'ok',
    };
  }

  return {
    headline: 'Quality session today',
    detail: `${yesterdayDesc}; ${todayDesc}${context}. Load yesterday fits your fitness — stick to plan if legs feel fine.`,
    severity: formVal != null && formVal < -15 ? 'watch' : 'ok',
  };
}

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
  const tssCtx = buildTssContext(activities, userProfile);

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

  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterdayKey = toLocalDateStr(y);
  const yesterdaySummary = summarizeActivityDay(activities, yesterdayKey, tssCtx);
  const todayPlanSummary = summarizePlannedDay(plannedWorkouts, today);

  const stacked = buildStackedTrainingInsight(yesterdaySummary, todayPlanSummary, {
    form,
    fitness,
    hardToday,
  });
  if (stacked) insights.push(stacked);

  if (form != null && form <= -28 && hardToday.length > 0) {
    insights.push({
      headline: `Form ${Math.round(form)} — go easy`,
      detail: `"${hardToday[0]?.title || 'hard session'}" on plan → Z2 or reschedule.`,
      severity: 'warning',
    });
  } else if (form != null && form <= -15 && form > -22) {
    insights.push({
      headline: `Form ${Math.round(form)}`,
      detail: 'Slightly fatigued — keep intensity controlled or trim volume.',
      severity: 'watch',
    });
  } else if (form != null && form <= -22) {
    insights.push({
      headline: `Form ${Math.round(form)}`,
      detail: 'Body may not be keeping up — lighter volume or recovery.',
      severity: 'watch',
    });
  }

  const mono = detectMonotony(activities, tssCtx);
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

  if (daysSinceTest(tests) >= 28 && risingVolume(activities, tssCtx)) {
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

function sumWeekActualTss(activities, tssCtx, ref = new Date()) {
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
    return s + resolveInsightTss(a, tssCtx);
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
  const tssCtx = buildTssContext(activities, userProfile);
  const weekActual = sumWeekActualTss(activities, tssCtx);
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
