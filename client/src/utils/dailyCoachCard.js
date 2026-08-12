/**
 * buildDailyCard — the day's coaching, assembled once and rendered everywhere.
 *
 * Pure function, no React and no network: the web dashboard, the Capacitor
 * native dashboard, the push-notification body and the Expo app all call this
 * with the data they already hold, so an athlete can never see two different
 * versions of "today" depending on which screen they opened.
 *
 * Facts come from the athlete's own numbers. The coaching style only reframes
 * them — see constants/coachingStyles.js for why that separation matters.
 */
import { resolveActivityTss } from './computeTss';
import { enrichProfileForTss } from './inferThresholdsFromActivities';
import { activityCalendarDateKey, localCalendarDateKey } from './calendarDateKeys';
import { assessReadiness } from './recovery';
import { getDailyLesson } from '../content/dailyLessons';
import {
  READINESS_META,
  getCoachingStyle,
  readinessStateFrom,
  formGaugePosition,
} from '../constants/coachingStyles';

const SPORT_LABEL = {
  run: 'Run', bike: 'Ride', mtbike: 'MTB', swim: 'Swim', strength: 'Strength',
  gym: 'Gym', walk: 'Walk', brick: 'Brick', crosstrain: 'Cross-training',
  rowing: 'Row', lactate: 'Lactate test', other: 'Session',
};

/** Planned sessions whose title/category says "this is a hard one". */
const HARD_HINT = /vo2|v̇o2|threshold|lt2|interval|tempo|race|hard|sprint|hill|\d+\s*[x×]\s*\d+/i;

function dayKeyOffset(days, ref = new Date()) {
  const d = new Date(ref);
  d.setDate(d.getDate() + days);
  return localCalendarDateKey(d);
}

function planDateKey(pw) {
  return String(pw?.date || '').slice(0, 10);
}

function sportLabel(sport) {
  return SPORT_LABEL[String(sport || '').toLowerCase()] || 'Session';
}

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function formatDistance(metres, useMiles = false) {
  const m = Number(metres) || 0;
  if (m <= 0) return null;
  if (useMiles) return `${(m / 1609.34).toFixed(1)} mi`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Total planned seconds, honouring interval-group repeats. */
function plannedSeconds(pw) {
  const explicit = Number(pw?.plannedDuration || 0);
  if (explicit > 0) return explicit;
  const steps = Array.isArray(pw?.steps) ? pw.steps : [];
  if (!steps.length) return 0;
  const seen = new Set();
  let total = 0;
  steps.forEach((s) => {
    if (!s.groupId) { total += Number(s.durationSeconds) || 0; return; }
    if (seen.has(s.groupId)) return;
    seen.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const reps = group.find((x) => x.isGroupHeader)?.groupRepeat || 1;
    group.forEach((gs) => { total += (Number(gs.durationSeconds) || 0) * reps; });
  });
  return total;
}

function isHardPlan(pw) {
  if (!pw) return false;
  if (HARD_HINT.test(String(pw.title || ''))) return true;
  if (HARD_HINT.test(String(pw.category || ''))) return true;
  return Number(pw.targetTss || 0) >= 80;
}

function describePlanned(pw) {
  const bits = [];
  const dur = formatDuration(plannedSeconds(pw));
  if (dur) bits.push(dur);
  const tss = Number(pw?.targetTss || 0);
  if (tss > 0) bits.push(`${Math.round(tss)} TSS`);
  return {
    id: pw?._id || pw?.id || `${planDateKey(pw)}-${pw?.title}`,
    title: pw?.title || sportLabel(pw?.sport),
    sport: pw?.sport || 'other',
    sportLabel: sportLabel(pw?.sport),
    detail: bits.join(' · ') || null,
    hard: isHardPlan(pw),
    isLactateTest: !!pw?.isLactateTest,
    status: pw?.status || 'planned',
  };
}

function describeActivity(act, tssCtx, useMiles) {
  const bits = [];
  const dur = formatDuration(act?.totalTime || act?.totalElapsedTime || act?.duration);
  if (dur) bits.push(dur);
  const dist = formatDistance(act?.distance || act?.totalDistance, useMiles);
  if (dist) bits.push(dist);
  const tss = Math.round(resolveActivityTss(act, tssCtx.profile, { user: tssCtx.user }) || 0);
  if (tss > 0) bits.push(`${tss} TSS`);
  return {
    id: act?.id || act?._id || null,
    title: act?.title || sportLabel(act?.sport),
    sport: act?.sport || 'other',
    sportLabel: sportLabel(act?.sport),
    detail: bits.join(' · ') || null,
    tss,
    rpe: Number(act?.rpe) || null,
    avgHeartRate: Number(act?.avgHeartRate) || null,
  };
}

/**
 * Rolling window totals. Deliberately a true rolling 7 days rather than
 * "since Monday" — a Monday reset makes every Sunday look like a big week and
 * every Monday like a rest week, which is an artefact of the calendar, not the
 * training.
 */
function rollingLoad(activities, tssCtx, ref = new Date()) {
  const keysThis = new Set();
  const keysPrev = new Set();
  for (let i = 0; i < 7; i += 1) keysThis.add(dayKeyOffset(-i, ref));
  for (let i = 7; i < 14; i += 1) keysPrev.add(dayKeyOffset(-i, ref));

  let last7 = 0;
  let prev7 = 0;
  let sessions7 = 0;
  for (const act of activities) {
    const dk = activityCalendarDateKey(act);
    if (!dk) continue;
    const inThis = keysThis.has(dk);
    const inPrev = !inThis && keysPrev.has(dk);
    if (!inThis && !inPrev) continue;
    const tss = resolveActivityTss(act, tssCtx.profile, { user: tssCtx.user }) || 0;
    if (inThis) { last7 += tss; sessions7 += 1; } else { prev7 += tss; }
  }

  const changePct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
  return {
    last7: Math.round(last7),
    prev7: Math.round(prev7),
    sessions7,
    changePct,
  };
}

function greetingFor(hour) {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * The one line that decides the day. Ordered by what should override what:
 * a lactate test beats a hard session, a hard session on strained legs beats
 * the generic readiness line, and only then do we fall back to tone.
 */
/** "resting HR 7% above baseline and short sleep" — reasons as one readable clause. */
function phraseReasons(reasons = []) {
  const list = reasons.filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function buildDirective({ state, todayPlanned, yesterday, style, load, recovery }) {
  const test = todayPlanned.find((p) => p.isLactateTest);
  if (test) {
    return {
      kind: 'test',
      text: `Lactate test today — ${test.title}. Same warm-up, same steps, same conditions as last time, or the comparison is worthless.`,
    };
  }

  // The body overrules the load model. TSB is a projection of what training
  // *should* have cost; resting HR, HRV and sleep are what it actually cost.
  // When they disagree, the measurements win.
  if (recovery && recovery.level === 'high') {
    return {
      kind: 'body-override',
      text: style.bodySays.high(capitalize(phraseReasons(recovery.reasons))),
    };
  }

  const hard = todayPlanned.find((p) => p.hard);

  // A softer recovery signal only earns the headline when something hard is
  // planned — otherwise it is noise the athlete can't act on.
  if (recovery && recovery.level === 'watch' && hard) {
    return {
      kind: 'body-watch',
      text: style.bodySays.watch(capitalize(phraseReasons(recovery.reasons)), hard.title),
    };
  }

  if (hard && (state === 'strained' || state === 'productive')) {
    // This is the most common interesting case, so it gets the voice too —
    // a single fixed sentence here made the tone slider look broken.
    return {
      kind: 'hard-on-tired',
      text: style.hardOnTired[state](hard.title),
    };
  }

  if (hard) {
    return {
      kind: 'hard',
      text: `${hard.title} today. ${style.frame[state]}`,
    };
  }

  if (todayPlanned.length) {
    return { kind: 'planned', text: style.frame[state] };
  }

  if (yesterday && yesterday.tss >= 90) {
    const detail = yesterday.detail ? ` (${yesterday.detail})` : '';
    return {
      kind: 'rest-after-hard',
      text: `Nothing planned after yesterday’s ${yesterday.title}${detail}. ${style.restLine}`,
    };
  }

  if (load.sessions7 === 0) {
    return {
      kind: 'idle',
      text: 'No sessions logged in the last seven days. Getting one in beats planning the perfect one.',
    };
  }

  return { kind: 'rest', text: style.restLine };
}

/**
 * @param {object} opts
 * @param {object} opts.todayMetrics  { fitness, fatigue, form, formChange, ... }
 * @param {Array}  opts.plannedWorkouts
 * @param {Array}  opts.activities    calendar activities (same list the dashboard uses)
 * @param {object} opts.userProfile   for TSS resolution
 * @param {object} opts.user          for unit preferences
 * @param {string} opts.styleId       coaching voice id
 * @param {object} opts.weather       { tempC, description, place, icon } | null
 * @param {Date}   opts.now
 * @returns {object} card model — see the shape at the bottom of this function
 */
export function buildDailyCard({
  todayMetrics = {},
  plannedWorkouts = [],
  activities = [],
  userProfile = null,
  user = null,
  styleId = undefined,
  weather = null,
  wellness = [],
  now = new Date(),
} = {}) {
  const style = getCoachingStyle(styleId);
  const acts = Array.isArray(activities) ? activities : [];
  const plans = Array.isArray(plannedWorkouts) ? plannedWorkouts : [];

  const tssCtx = {
    profile: userProfile ? enrichProfileForTss(userProfile, acts) : null,
    user: user || userProfile,
  };
  const useMiles = String(user?.units?.distance || user?.distanceUnit || '').toLowerCase() === 'mi';

  const fitness = Math.round(Number(todayMetrics?.fitness) || 0);
  const fatigue = Math.round(Number(todayMetrics?.fatigue) || 0);
  const form = Math.round(Number(todayMetrics?.form) || 0);
  const state = readinessStateFrom(form, fitness);
  const meta = READINESS_META[state];

  const todayKey = localCalendarDateKey(now);
  const yesterdayKey = dayKeyOffset(-1, now);

  const todayPlanned = plans
    .filter((p) => planDateKey(p) === todayKey && p.status !== 'skipped' && p.status !== 'completed')
    .sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0))
    .map(describePlanned);

  const tomorrowPlanned = plans
    .filter((p) => planDateKey(p) === dayKeyOffset(1, now) && p.status !== 'skipped')
    .sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0))
    .map(describePlanned);

  const yesterdayActs = acts.filter((a) => activityCalendarDateKey(a) === yesterdayKey);
  /** The raw activity, kept so the card can offer to rate it. */
  const yesterdayRaw = yesterdayActs.length
    ? yesterdayActs.reduce((best, a) => {
        const t = resolveActivityTss(a, tssCtx.profile, { user: tssCtx.user }) || 0;
        const bt = resolveActivityTss(best, tssCtx.profile, { user: tssCtx.user }) || 0;
        return t > bt ? a : best;
      }, yesterdayActs[0])
    : null;
  // Biggest session of the day is the one worth reporting back.
  const yesterday = yesterdayRaw ? describeActivity(yesterdayRaw, tssCtx, useMiles) : null;

  const todayCompleted = acts
    .filter((a) => activityCalendarDateKey(a) === todayKey)
    .map((a) => describeActivity(a, tssCtx, useMiles));

  const load = rollingLoad(acts, tssCtx, now);

  // Same readiness model the wellness card and calendar badges use, so the card
  // can't disagree with the rest of the dashboard about how recovered you are.
  // Null when the athlete has no Apple Health / Garmin data — the card then
  // falls back to the load model alone, exactly as before.
  const recovery = Array.isArray(wellness) && wellness.length
    ? assessReadiness(wellness, { tsb: form })
    : null;

  const directive = buildDirective({ state, todayPlanned, yesterday, style, load, recovery });
  const lesson = getDailyLesson(now, String(user?._id || userProfile?._id || ''));

  const hour = now.getHours();
  const nameFirst = String(user?.name || '').trim().split(/\s+/)[0] || '';

  // When the body overrules the load model, the headline has to follow it too.
  // "Green light" above "your recovery markers are asking for a day back" is the
  // kind of contradiction that makes an athlete stop trusting the card.
  const HEADLINE_STATE_FOR_KIND = { 'body-override': 'strained', 'body-watch': 'neutral' };
  const headlineState = HEADLINE_STATE_FOR_KIND[directive.kind] || state;

  return {
    dateKey: todayKey,
    styleId: style.id,
    styleLabel: style.label,

    greeting: style.greeting(nameFirst),
    partOfDay: greetingFor(hour),
    headline: style.headline[headlineState],
    directive: directive.text,
    directiveKind: directive.kind,

    readiness: {
      state,
      label: meta.label,
      fact: meta.fact,
      color: meta.color,
      bg: meta.bg,
      border: meta.border,
      fitness,
      fatigue,
      form,
      formChange: Math.round(Number(todayMetrics?.formChange) || 0),
      gauge: formGaugePosition(form),
      /** Nerd voice reads this instead of the prose. */
      readout: `CTL ${fitness} · ATL ${fatigue} · TSB ${form > 0 ? '+' : ''}${form}`,
    },

    /**
     * What the body says, as opposed to what the load model predicts.
     * null when there is no wearable data to say it with.
     */
    recovery: recovery
      ? {
          level: recovery.level,          // 'ok' | 'watch' | 'high'
          label: recovery.label,
          hex: recovery.hex,
          reasons: recovery.reasons,
          sleepMinutes: recovery.metrics.sleepMinutes,
          restingHeartRate: recovery.metrics.rhrNow,
          restingHeartRateDeltaPct: recovery.metrics.rhrPct,
          hrvMs: recovery.metrics.hrvNow,
          hrvDeltaPct: recovery.metrics.hrvPct,
          /** True when the wearables and the load model point opposite ways. */
          disagreesWithLoad:
            (recovery.level !== 'ok' && (state === 'fresh' || state === 'veryFresh'))
            || (recovery.level === 'ok' && state === 'strained'),
        }
      : null,

    load,
    todayPlanned,
    todayCompleted,
    tomorrowPlanned,
    yesterday,
    /** Raw activity behind `yesterday`, so the card can offer to rate it. */
    yesterdayActivity: yesterdayRaw,
    /** A finished session with no RPE — the one moment an athlete will actually rate it. */
    needsRpe: !!(yesterdayRaw && !(Number(yesterdayRaw.rpe ?? yesterdayRaw.RPE) > 0)),
    weather: weather || null,
    lesson,

    /** Single-line body for a push notification — same facts, no layout. */
    pushBody: [
      todayPlanned.length ? todayPlanned.map((p) => p.title).join(' + ') : 'Rest day',
      `Form ${form > 0 ? '+' : ''}${form}`,
    ].join(' · '),
  };
}

/** Push/notification title, kept in one place so app and server agree. */
export function dailyCardPushTitle(card) {
  if (!card) return 'Your day';
  return card.headline || 'Your day';
}
