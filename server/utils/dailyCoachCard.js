/**
 * Daily coaching card — server build.
 *
 * The web client and the Capacitor shell build this card locally (they already
 * hold the calendar in memory, and building it locally keeps the card instant
 * and available offline). The Expo app has no such pipeline, so it asks the
 * server instead.
 *
 * ── MIRROR WARNING ────────────────────────────────────────────────────────
 * The readiness bands, the six coaching voices and the lesson rotation are
 * duplicated from:
 *     client/src/constants/coachingStyles.js
 *     client/src/content/dailyLessons.js
 *     client/src/utils/dailyCoachCard.js
 * CRA cannot import from outside client/src, so a single shared module is not
 * available without a build change. If you edit the copy or the thresholds on
 * one side, edit the other — an athlete who reads the card on the web and then
 * on the phone must not be told two different things.
 */
const StravaActivity = require('../models/StravaActivity');
const FitTraining = require('../models/fitTraining');
const Training = require('../models/training');
const PlannedWorkout = require('../models/PlannedWorkout');
const AppleHealthWellness = require('../models/AppleHealthWellness');
const GarminWellness = require('../models/GarminWellness');
const fitnessMetricsController = require('../controllers/fitnessMetricsController');
const { buildUserProfile, resolveActivityTss, mapActivityForTss } = require('./activityTss');

// ── Readiness ──────────────────────────────────────────────────────

const READINESS_META = {
  veryFresh: {
    label: 'Very fresh',
    color: '#0EA5E9',
    fact: 'Form is high and Fitness is drifting down — this is rest, not sharpness.',
  },
  fresh: {
    label: 'Fresh',
    color: '#059669',
    fact: 'Form is positive. This is the window where hard work lands well.',
  },
  neutral: {
    label: 'Neutral',
    color: '#475569',
    fact: 'Form is near zero — neither carrying fatigue nor especially rested.',
  },
  productive: {
    label: 'Productive fatigue',
    color: '#B45309',
    fact: 'Negative Form with Fitness holding or rising — the normal cost of a build.',
  },
  strained: {
    label: 'Strained',
    color: '#B91C1C',
    fact: 'Form is deep negative. Past this point extra load buys fatigue, not fitness.',
  },
};

function readinessStateFrom(form, fitness = 0) {
  const f = Number(form);
  if (!Number.isFinite(f)) return 'neutral';
  const ctl = Number(fitness) || 0;
  const strainedAt = Math.max(-45, Math.min(-18, -(18 + ctl * 0.2)));
  if (f > 20) return 'veryFresh';
  if (f > 5) return 'fresh';
  if (f >= -10) return 'neutral';
  if (f > strainedAt) return 'productive';
  return 'strained';
}

function formGaugePosition(form) {
  const f = Number(form);
  if (!Number.isFinite(f)) return 0.5;
  return Math.max(0, Math.min(1, (f + 40) / 70));
}

// ── Voices ─────────────────────────────────────────────────────────

const STYLES = {
  gentle: {
    label: 'Gentle',
    greeting: (n) => (n ? `Morning, ${n}.` : 'Morning.'),
    headline: {
      veryFresh: "You're well rested",
      fresh: 'You’re in a good place today',
      neutral: 'Steady as you go',
      productive: 'You’ve been working hard',
      strained: 'Your body is asking for a break',
    },
    frame: {
      veryFresh: 'Whenever you feel ready, something easy will bring the rhythm back.',
      fresh: 'If you fancy the hard session, today is a kind day for it.',
      neutral: 'Nothing dramatic needed — just do what’s on the plan and enjoy it.',
      productive: 'This tiredness is earned and normal. Be a little kind to yourself.',
      strained: 'Please take the easy option today. The fitness will still be there tomorrow.',
    },
    hardOnTired: {
      strained: (t) => `${t} is on the plan, but your legs are asking for less today. Moving it wouldn’t be a failure.`,
      productive: (t) => `${t} today, on tired legs. That’s normal this deep into a block — start the warm-up gently and see how it feels.`,
    },
    bodySays: {
      high: (r) => `${r}. That’s your body asking for a quiet day, and it’s worth listening to — whatever the plan says.`,
      watch: (r, t) => `${r}. ${t} is on the plan, but there’s no harm in keeping today gentle instead.`,
    },
    restLine: 'Nothing planned today — rest is part of the work.',
  },
  supportive: {
    label: 'Supportive',
    greeting: (n) => (n ? `Good morning, ${n}!` : 'Good morning!'),
    headline: {
      veryFresh: 'Rested and ready',
      fresh: 'Green light',
      neutral: 'Solid ground',
      productive: 'Deep in the work',
      strained: 'Time to back off',
    },
    frame: {
      veryFresh: 'Ease back in — a session or two and you’ll feel sharp again.',
      fresh: 'Good day to ask something of yourself.',
      neutral: 'Follow the plan. Consistency is what’s building here.',
      productive: 'This is what progress feels like from the inside. Keep the easy days easy.',
      strained: 'Take the recovery. You’ll come back stronger for it — that’s not a cliché, it’s the physiology.',
    },
    hardOnTired: {
      strained: (t) => `${t} is planned, but you’re deep in the red. Move it a day and you’ll get far more out of it.`,
      productive: (t) => `${t} on tired legs. It should still land — just don’t chase numbers in the warm-up.`,
    },
    bodySays: {
      high: (r) => `${r}. Your recovery markers are asking for a day back — take it, and the next block will thank you.`,
      watch: (r, t) => `${r}. ${t} can still happen, but take the intensity down a notch and see how it feels.`,
    },
    restLine: 'Rest day. Take it properly — that’s where the adaptation happens.',
  },
  straight: {
    label: 'Straight',
    greeting: (n) => (n ? `${n} —` : 'Today —'),
    headline: {
      veryFresh: 'Very fresh',
      fresh: 'Fresh',
      neutral: 'Neutral',
      productive: 'Carrying fatigue',
      strained: 'Overreached',
    },
    frame: {
      veryFresh: 'Fitness is decaying. Add load if you want to hold it.',
      fresh: 'Good window for intensity.',
      neutral: 'Train as planned.',
      productive: 'Normal for a build block. Protect the easy days.',
      strained: 'Reduce load. Recovery, not intensity.',
    },
    hardOnTired: {
      strained: (t) => `${t} planned on strained legs. Move it or cut it — the quality won’t be there.`,
      productive: (t) => `${t} planned on tired legs. Expect it to feel hard early. That alone isn’t a reason to stop.`,
    },
    bodySays: {
      high: (r) => `${r}. Recovery day — the markers matter more than the plan here.`,
      watch: (r, t) => `${r}. Reduce the intensity of ${t} or move it.`,
    },
    restLine: 'No session planned.',
  },
  direct: {
    label: 'Direct',
    greeting: () => 'Right.',
    headline: {
      veryFresh: 'Too fresh',
      fresh: 'Use it',
      neutral: 'Get on with it',
      productive: 'Hold the line',
      strained: 'Stop',
    },
    frame: {
      veryFresh: 'You’ve rested enough. Put work back in.',
      fresh: 'Fresh legs are for hard sessions, not easy ones. Use them.',
      neutral: 'Nothing to decide. Do the session.',
      productive: 'Tired is the point. Easy days easy, hard days hard, no blurring.',
      strained: 'You’re digging. Take the day off or go genuinely easy — pick one.',
    },
    hardOnTired: {
      strained: (t) => `${t} is planned. Don’t do it today. Move it.`,
      productive: (t) => `${t} on tired legs. Do it, but hit the targets or stop — junk intensity helps nobody.`,
    },
    bodySays: {
      high: (r) => `${r}. Not today. Rest.`,
      watch: (r, t) => `${r}. Keep ${t} easy, or don’t bother doing it at all.`,
    },
    restLine: 'Nothing on. Rest, properly.',
  },
  dark: {
    label: 'Dark Night',
    greeting: () => 'Well.',
    headline: {
      veryFresh: 'Rested. Now what?',
      fresh: 'No excuses today',
      neutral: 'Average is a choice',
      productive: 'This is the part that counts',
      strained: 'You went too far',
    },
    frame: {
      veryFresh: 'Freshness you don’t spend is just fitness you lost slowly.',
      fresh: 'The legs are there. If today is easy, that was your decision, not your body’s.',
      neutral: 'Nobody is coming to make this session more interesting. Do it anyway.',
      productive: 'Everyone trains when it feels good. This is the week that separates you.',
      strained: 'Pushing now is ego, not training. Back off before your body makes the choice for you.',
    },
    hardOnTired: {
      strained: (t) => `${t} is on the plan and you’re in no state to do it justice. Doing it anyway is ego, not training.`,
      productive: (t) => `${t} on tired legs. This is the session everyone else finds a reason to skip.`,
    },
    bodySays: {
      high: (r) => `${r}. Train through this and you’ll lose a week instead of a day.`,
      watch: (r, t) => `${r}. Force ${t} today and you’ll pay for it on Thursday.`,
    },
    restLine: 'No session today. Rest is not a reward, it’s a requirement.',
  },
  nerd: {
    label: 'Nerd',
    greeting: () => '',
    headline: {
      veryFresh: 'TSB high',
      fresh: 'TSB positive',
      neutral: 'TSB neutral',
      productive: 'TSB negative',
      strained: 'TSB deep negative',
    },
    frame: {
      veryFresh: 'CTL decay exceeds ATL decay; net fitness declining.',
      fresh: 'ATL below CTL. Intensity tolerance elevated.',
      neutral: 'ATL ≈ CTL. No meaningful freshness signal either way.',
      productive: 'ATL above CTL, CTL stable or rising. Expected during load accumulation.',
      strained: 'ATL well above CTL. Marginal fitness return per additional TSS approaching zero.',
    },
    hardOnTired: {
      strained: (t) => `${t} scheduled below the strained TSB threshold. Expect reduced output and elevated RPE at target intensity.`,
      productive: (t) => `${t} scheduled with ATL above CTL. Session quality usually holds; watch for decay across intervals.`,
    },
    bodySays: {
      high: (r) => `${r}. Autonomic markers and training load both negative — recovery indicated.`,
      watch: (r, t) => `${r}. Reduce prescribed intensity for ${t} until markers return to baseline.`,
    },
    restLine: 'Planned TSS today: 0.',
  },
};

const DEFAULT_STYLE = 'supportive';

function getStyle(id) {
  return STYLES[id] || STYLES[DEFAULT_STYLE];
}

// ── Lessons ────────────────────────────────────────────────────────
// Titles + tags only on the server: the body text is long, and the Expo app
// ships the full table locally (app/src/coach/lessons.ts). Keeping the index
// calculation here is what guarantees both platforms show the same lesson.

const LESSON_COUNT = 30;

function lessonIndexFor(date = new Date(), salt = '') {
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayIndex = Math.floor(utcMidnight / 86400000);
  let offset = 0;
  for (let i = 0; i < String(salt).length; i += 1) {
    offset = (offset + String(salt).charCodeAt(i)) % LESSON_COUNT;
  }
  return (((dayIndex + offset) % LESSON_COUNT) + LESSON_COUNT) % LESSON_COUNT;
}

// ── Helpers ────────────────────────────────────────────────────────

const SPORT_LABEL = {
  run: 'Run', bike: 'Ride', mtbike: 'MTB', swim: 'Swim', strength: 'Strength',
  gym: 'Gym', walk: 'Walk', brick: 'Brick', crosstrain: 'Cross-training',
  rowing: 'Row', lactate: 'Lactate test', other: 'Session',
};

const HARD_HINT = /vo2|threshold|lt2|interval|tempo|race|hard|sprint|hill|\d+\s*[x×]\s*\d+/i;

function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayBounds(ref, offsetDays = 0) {
  const start = new Date(ref);
  start.setDate(start.getDate() + offsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
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

function plannedSeconds(pw) {
  const explicit = Number(pw.plannedDuration || 0);
  if (explicit > 0) return explicit;
  const steps = Array.isArray(pw.steps) ? pw.steps : [];
  if (!steps.length) return 0;
  const seen = new Set();
  let total = 0;
  steps.forEach((s) => {
    if (!s.groupId) { total += Number(s.durationSeconds) || 0; return; }
    if (seen.has(String(s.groupId))) return;
    seen.add(String(s.groupId));
    const group = steps.filter((x) => String(x.groupId) === String(s.groupId));
    const reps = (group.find((x) => x.isGroupHeader) || {}).groupRepeat || 1;
    group.forEach((gs) => { total += (Number(gs.durationSeconds) || 0) * reps; });
  });
  return total;
}

function describePlanned(pw) {
  const bits = [];
  const dur = formatDuration(plannedSeconds(pw));
  if (dur) bits.push(dur);
  const tss = Number(pw.targetTss || 0);
  if (tss > 0) bits.push(`${Math.round(tss)} TSS`);
  const hard = HARD_HINT.test(String(pw.title || ''))
    || HARD_HINT.test(String(pw.category || ''))
    || Number(pw.targetTss || 0) >= 80;
  return {
    id: String(pw._id),
    title: pw.title || SPORT_LABEL[pw.sport] || 'Session',
    sport: pw.sport || 'other',
    sportLabel: SPORT_LABEL[pw.sport] || 'Session',
    detail: bits.join(' · ') || null,
    hard,
    isLactateTest: !!pw.isLactateTest,
    status: pw.status || 'planned',
  };
}

/** Completed sessions in a window, merged across every source the app tracks. */
async function loadSessions(athleteId, start, end, profile) {
  const [strava, fits, trainings] = await Promise.all([
    StravaActivity.find({ userId: athleteId, startDate: { $gte: start, $lt: end } })
      .select('stravaId name titleManual category sport startDate movingTime elapsedTime distance averageHeartRate averagePower weightedAveragePower averageSpeed manualTss tssDisplayMode rpe')
      .lean(),
    FitTraining.find({ athleteId: String(athleteId), timestamp: { $gte: start, $lt: end } })
      .select('_id titleManual titleAuto category sport timestamp totalElapsedTime totalDistance avgHeartRate avgPower normalizedPower avgSpeed trainingStressScore manualTss tssDisplayMode rpe')
      .lean(),
    Training.find({ athleteId: String(athleteId), date: { $gte: start, $lt: end } })
      .select('_id title sport date duration results sourceFitTrainingId sourceStravaActivityId rpe')
      .lean(),
  ]);

  const out = [];

  for (const a of strava) {
    const seconds = Number(a.movingTime || 0);
    out.push({
      id: `strava-${a.stravaId}`,
      title: (a.titleManual && a.titleManual.trim()) || a.name || 'Untitled',
      sport: a.sport || 'other',
      sportLabel: SPORT_LABEL[a.sport] || 'Session',
      seconds,
      distance: Number(a.distance || 0),
      tss: Math.round(resolveActivityTss(mapActivityForTss(a), profile) || 0),
      avgHeartRate: Number(a.averageHeartRate || 0) || null,
      rpe: Number(a.rpe) || null,
    });
  }

  for (const f of fits) {
    out.push({
      id: `fit-${f._id}`,
      title: (f.titleManual && f.titleManual.trim()) || f.titleAuto || 'Untitled',
      sport: f.sport || 'other',
      sportLabel: SPORT_LABEL[f.sport] || 'Session',
      seconds: Number(f.totalElapsedTime || 0),
      distance: Number(f.totalDistance || 0),
      tss: Math.round(resolveActivityTss(mapActivityForTss(f), profile) || 0),
      avgHeartRate: Number(f.avgHeartRate || 0) || null,
      rpe: Number(f.rpe) || null,
    });
  }

  // Manual trainings only when they aren't a mirror of a synced activity —
  // otherwise the same session is counted twice in the day's load.
  for (const t of trainings) {
    if (t.sourceFitTrainingId || t.sourceStravaActivityId) continue;
    out.push({
      id: `regular-${t._id}`,
      title: t.title || 'Untitled',
      sport: t.sport || 'other',
      sportLabel: SPORT_LABEL[t.sport] || 'Session',
      seconds: 0,
      distance: 0,
      tss: 0,
      avgHeartRate: null,
      rpe: Number(t.rpe) || null,
    });
  }

  return out.map((s) => {
    const bits = [];
    const dur = formatDuration(s.seconds);
    if (dur) bits.push(dur);
    if (s.distance > 0) bits.push(`${(s.distance / 1000).toFixed(1)} km`);
    if (s.tss > 0) bits.push(`${s.tss} TSS`);
    return { ...s, detail: bits.join(' · ') || null };
  });
}

/**
 * Recovery readiness from wearable rows — mirrors client/src/utils/recovery.js
 * assessReadiness(), including its thresholds (RHR +5%, HRV −10%, sleep < 6h).
 * Change one, change the other.
 */
function assessReadiness(days, tsb) {
  const latest = days.length ? days[days.length - 1] : null;
  if (!latest && tsb == null) return null;

  const mean = (key) => {
    const vals = days.map((d) => d[key]).filter((v) => v != null && v > 0).slice(0, -1);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const rhrBase = mean('restingHeartRate');
  const hrvBase = mean('hrvMs');
  const reasons = [];
  let rhrFlag = false;
  let hrvFlag = false;
  let rhrPct = null;
  let hrvPct = null;

  if (rhrBase && latest && latest.restingHeartRate > 0) {
    const delta = (latest.restingHeartRate - rhrBase) / rhrBase;
    rhrPct = Math.round(delta * 100);
    if (delta > 0.05) { rhrFlag = true; reasons.push(`resting HR ${rhrPct}% above baseline`); }
  }
  if (hrvBase && latest && latest.hrvMs > 0) {
    const delta = (latest.hrvMs - hrvBase) / hrvBase;
    hrvPct = Math.round(delta * 100);
    if (delta < -0.10) { hrvFlag = true; reasons.push(`HRV ${Math.abs(hrvPct)}% below baseline`); }
  }

  const sleepLow = latest && latest.sleepMinutes > 0 && latest.sleepMinutes < 360;
  if (sleepLow) reasons.push('short sleep');

  const deepFatigue = tsb != null && tsb <= -25;
  const someFatigue = tsb != null && tsb <= -15;
  if (deepFatigue) reasons.push(`very negative Form (TSB ${Math.round(tsb)})`);
  else if (someFatigue) reasons.push(`negative Form (TSB ${Math.round(tsb)})`);

  const recoveryFlag = rhrFlag || hrvFlag;
  let level;
  if ((rhrFlag && hrvFlag) || (recoveryFlag && deepFatigue)) level = 'high';
  else if (recoveryFlag || sleepLow || deepFatigue) level = 'watch';
  else level = 'ok';

  const LABELS = { high: 'Overreaching', watch: 'Watch recovery', ok: 'Recovered' };
  const HEX = { high: '#f43f5e', watch: '#f59e0b', ok: '#10b981' };

  return {
    level,
    label: LABELS[level],
    hex: HEX[level],
    reasons,
    sleepMinutes: latest ? latest.sleepMinutes : null,
    restingHeartRate: latest ? latest.restingHeartRate : null,
    restingHeartRateDeltaPct: rhrPct,
    hrvMs: latest ? latest.hrvMs : null,
    hrvDeltaPct: hrvPct,
  };
}

/** Apple Health and Garmin merged per day — Apple first, Garmin fills the gaps. */
async function loadWellness(athleteId, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceKey = localDayKey(since);

  const [apple, garmin] = await Promise.all([
    AppleHealthWellness.find({ userId: athleteId, date: { $gte: sinceKey } })
      .select('date restingHeartRate sleepMinutes hrvMs').lean(),
    GarminWellness.find({ userId: athleteId, date: { $gte: sinceKey } })
      .select('date restingHeartRate sleepMinutes hrvMs').lean(),
  ]);

  const byDate = new Map();
  for (const row of [...apple, ...garmin]) {
    const existing = byDate.get(row.date);
    if (!existing) { byDate.set(row.date, { ...row }); continue; }
    for (const f of ['restingHeartRate', 'sleepMinutes', 'hrvMs']) {
      if (existing[f] == null && row[f] != null) existing[f] = row[f];
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

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
    return `Lactate test today — ${test.title}. Same warm-up, same steps, same conditions as last time, or the comparison is worthless.`;
  }
  // The body overrules the load model: TSB predicts what training should have
  // cost, resting HR / HRV / sleep record what it actually cost.
  if (recovery && recovery.level === 'high') {
    return style.bodySays.high(capitalize(phraseReasons(recovery.reasons)));
  }

  const hard = todayPlanned.find((p) => p.hard);

  if (recovery && recovery.level === 'watch' && hard) {
    return style.bodySays.watch(capitalize(phraseReasons(recovery.reasons)), hard.title);
  }

  if (hard && (state === 'strained' || state === 'productive')) {
    // Voiced like every other branch — a fixed sentence here made the tone
    // slider look broken in the most common interesting case.
    return style.hardOnTired[state](hard.title);
  }
  if (hard) return `${hard.title} today. ${style.frame[state]}`;
  if (todayPlanned.length) return style.frame[state];
  if (yesterday && yesterday.tss >= 90) {
    const detail = yesterday.detail ? ` (${yesterday.detail})` : '';
    return `Nothing planned after yesterday’s ${yesterday.title}${detail}. ${style.restLine}`;
  }
  if (load.sessions7 === 0) {
    return 'No sessions logged in the last seven days. Getting one in beats planning the perfect one.';
  }
  return style.restLine;
}

/**
 * Build the card for one athlete.
 * @param {object} user      the athlete's user document (for name, prefs, profile)
 * @param {Date}   now       server-side "now"; the caller passes the athlete's local time
 */
async function buildDailyCardForUser(user, now = new Date()) {
  const athleteId = String(user._id);
  const notifs = user.notifications || {};
  const style = getStyle(notifs.dailyCardStyle);
  const profile = buildUserProfile(user);

  const today = dayBounds(now, 0);
  const yesterday = dayBounds(now, -1);
  const tomorrow = dayBounds(now, 1);
  const weekAgo = dayBounds(now, -6).start;
  const twoWeeksAgo = dayBounds(now, -13).start;

  const [metrics, plans, todaySessions, yesterdaySessions, thisWeek, prevWeek, wellness] = await Promise.all([
    fitnessMetricsController.calculateTodayMetrics(athleteId).catch(() => ({})),
    PlannedWorkout.find({
      athleteId,
      date: { $gte: today.start, $lt: tomorrow.end },
    }).sort({ dayOrder: 1 }).lean(),
    loadSessions(athleteId, today.start, today.end, profile),
    loadSessions(athleteId, yesterday.start, yesterday.end, profile),
    // Rolling 7 vs the 7 before it — deliberately not "since Monday", which
    // makes every Sunday look like a big week and every Monday like a rest week.
    loadSessions(athleteId, weekAgo, today.end, profile),
    loadSessions(athleteId, twoWeeksAgo, weekAgo, profile),
    loadWellness(athleteId, 7),
  ]);

  const fitness = Math.round(Number(metrics.fitness) || 0);
  const fatigue = Math.round(Number(metrics.fatigue) || 0);
  const form = Math.round(Number(metrics.form) || 0);
  const state = readinessStateFrom(form, fitness);
  const meta = READINESS_META[state];

  const todayKey = localDayKey(today.start);
  const tomorrowKey = localDayKey(tomorrow.start);
  const planKey = (p) => localDayKey(new Date(p.date));

  const todayPlanned = plans
    .filter((p) => planKey(p) === todayKey && p.status !== 'skipped' && p.status !== 'completed')
    .map(describePlanned);
  const tomorrowPlanned = plans
    .filter((p) => planKey(p) === tomorrowKey && p.status !== 'skipped')
    .map(describePlanned);

  const biggestYesterday = yesterdaySessions.length
    ? yesterdaySessions.reduce((best, s) => (s.tss > best.tss ? s : best), yesterdaySessions[0])
    : null;

  const sum7 = thisWeek.reduce((acc, s) => acc + (s.tss || 0), 0);
  const sumPrev7 = prevWeek.reduce((acc, s) => acc + (s.tss || 0), 0);

  const load = {
    last7: Math.round(sum7),
    prev7: Math.round(sumPrev7),
    sessions7: thisWeek.length,
    changePct: sumPrev7 > 0 ? Math.round(((sum7 - sumPrev7) / sumPrev7) * 100) : null,
  };

  // Null when the athlete has no wearable data — the card then runs on the load
  // model alone, exactly as it did before wellness was wired in.
  const recovery = wellness.length ? assessReadiness(wellness, form) : null;

  const directive = buildDirective({
    state, todayPlanned, yesterday: biggestYesterday, style, load, recovery,
  });
  const nameFirst = String(user.name || '').trim().split(/\s+/)[0] || '';

  // The headline follows the body when the body overruled the load model —
  // "Green light" above "take a day back" destroys trust in the card.
  const HEADLINE_STATE_FOR_KIND = { 'body-override': 'strained', 'body-watch': 'neutral' };
  const directiveKind = recovery && recovery.level === 'high'
    ? 'body-override'
    : recovery && recovery.level === 'watch' && todayPlanned.some((p) => p.hard)
      ? 'body-watch'
      : null;
  const headlineState = HEADLINE_STATE_FOR_KIND[directiveKind] || state;

  return {
    dateKey: todayKey,
    styleId: notifs.dailyCardStyle || DEFAULT_STYLE,
    styleLabel: style.label,
    greeting: style.greeting(nameFirst),
    headline: style.headline[headlineState],
    directive,
    readiness: {
      state,
      label: meta.label,
      fact: meta.fact,
      color: meta.color,
      fitness,
      fatigue,
      form,
      gauge: formGaugePosition(form),
      readout: `CTL ${fitness} · ATL ${fatigue} · TSB ${form > 0 ? '+' : ''}${form}`,
    },
    recovery: recovery
      ? {
          ...recovery,
          disagreesWithLoad:
            (recovery.level !== 'ok' && (state === 'fresh' || state === 'veryFresh'))
            || (recovery.level === 'ok' && state === 'strained'),
        }
      : null,
    load,
    todayPlanned,
    todayCompleted: todaySessions,
    tomorrowPlanned,
    yesterday: biggestYesterday,
    lessonIndex: lessonIndexFor(now, athleteId),
    showLesson: notifs.dailyCardLesson !== false,
    pushBody: [
      todayPlanned.length ? todayPlanned.map((p) => p.title).join(' + ') : 'Rest day',
      `Form ${form > 0 ? '+' : ''}${form}`,
    ].join(' · '),
  };
}

module.exports = {
  buildDailyCardForUser,
  readinessStateFrom,
  formGaugePosition,
  lessonIndexFor,
  READINESS_META,
  STYLES,
};
