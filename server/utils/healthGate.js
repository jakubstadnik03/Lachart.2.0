/**
 * healthGate.js - the daily verdict for an open health episode.
 *
 * Pure functions over (episode, catalogue entry, check-ins, load, wellness) so
 * the same logic can run in a route, in a scheduler, or in a unit test without
 * touching Mongo. Mirrors the shape of trainingAlertUtils.evaluateTrainingAlerts.
 *
 * Three layers, in priority order:
 *
 *  1. Hard stops - a fixed list that overrides everything else and never gets
 *     traded off against "but the plan says". Night pain, a limp, pain over the
 *     tissue's cap, fever. These produce `light: 'red'` and a step-back.
 *  2. Cautions - things that hold progression without reversing it.
 *  3. Advancement - only when the current stage's gate is fully met.
 *
 * The design intent is that a red light REWRITES the plan rather than merely
 * warning about it: warnings get dismissed, a smaller number in the plan does
 * not. `stepBack` in the result is what the route acts on.
 */

'use strict';

const { FUNCTIONAL_TESTS } = require('../data/injuryCatalog');

const DAY_MS = 86400000;

function toDateKey(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

function daysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return null;
  const a = Date.parse(`${String(fromKey).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toKey).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

function num(v) {
  return v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
}

/** Group check-ins by date, newest first. */
function byDateDesc(checkIns = []) {
  const map = new Map();
  for (const c of checkIns) {
    const key = toDateKey(c.date);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

/**
 * A day counts as pain-free when nothing on it suggests the tissue objected.
 * Bone episodes allow zero; everything else tolerates a 1-2/10 awareness, which
 * is what athletes actually report when things are going well.
 */
function isPainFreeDay(dayCheckIns, painRule) {
  const cap = painRule?.zeroTolerance ? 0 : 2;
  return dayCheckIns.every((c) => {
    if (c.limping || c.nightPain || c.painAtRest) return false;
    const vals = [num(c.painNow), num(c.painDuringSession), num(c.painNextMorning)]
      .filter((v) => v != null);
    return vals.every((v) => v <= cap);
  });
}

/** Consecutive pain-free days counting back from the most recent check-in day. */
function painFreeStreak(checkIns, painRule) {
  const days = byDateDesc(checkIns);
  let streak = 0;
  let expected = days.length ? days[0][0] : null;
  for (const [dateKey, dayCheckIns] of days) {
    // A gap in reporting breaks the streak - we cannot claim days we never saw.
    if (expected && dateKey !== expected) break;
    if (!isPainFreeDay(dayCheckIns, painRule)) break;
    streak += 1;
    const prev = new Date(Date.parse(`${dateKey}T00:00:00Z`) - DAY_MS);
    expected = prev.toISOString().slice(0, 10);
  }
  return streak;
}

/** Most recent non-null hallmark reading. */
function latestHallmark(checkIns) {
  const days = byDateDesc(checkIns);
  for (const [, dayCheckIns] of days) {
    for (const c of dayCheckIns) {
      const v = num(c.hallmarkValue);
      if (v != null) return { value: v, date: toDateKey(c.date) };
    }
  }
  return null;
}

/**
 * How many consecutive recent days the hallmark stayed on the good side of
 * `threshold`. `betterIsLower` flips the comparison for metrics like
 * time-to-pain, where a bigger number is the improvement.
 */
function hallmarkStreak(checkIns, threshold, betterIsLower = true) {
  const days = byDateDesc(checkIns);
  let streak = 0;
  let expected = days.length ? days[0][0] : null;
  for (const [dateKey, dayCheckIns] of days) {
    if (expected && dateKey !== expected) break;
    const readings = dayCheckIns.map((c) => num(c.hallmarkValue)).filter((v) => v != null);
    if (!readings.length) break;
    const worst = betterIsLower ? Math.max(...readings) : Math.min(...readings);
    const ok = betterIsLower ? worst <= threshold : worst >= threshold;
    if (!ok) break;
    streak += 1;
    const prev = new Date(Date.parse(`${dateKey}T00:00:00Z`) - DAY_MS);
    expected = prev.toISOString().slice(0, 10);
  }
  return streak;
}

/** Best result recorded for a functional test, newest first. */
function latestTest(checkIns, testKey) {
  const days = byDateDesc(checkIns);
  for (const [, dayCheckIns] of days) {
    for (const c of dayCheckIns) {
      const t = (c.functionalTests || []).find((x) => x.test === testKey);
      if (t) return t;
    }
  }
  return null;
}

/**
 * Read a functional test result back in the athlete's own words. The catalogue
 * owns the unit, so a gate on minutes never gets described as reps.
 */
function formatTestValue(value, unit) {
  const shown = value == null ? '-' : value;
  if (unit === 'cm') return `${shown} cm`;
  if (unit === 'minutes') return `${shown} min`;
  if (unit === 'pain') return `${shown}/10`;
  if (unit === 'reps') return `${shown} reps`;
  return `${shown}`;
}

/**
 * The one number a minValue gate compares against.
 *
 * `value` wins whenever it is present: a single-sided measurement is
 * unambiguous, so there is nothing to reconcile. Otherwise a bilateral test
 * falls back to the weaker side, which is the safe reading when we do not know
 * which limb is injured. A one-sided test with no `value` has simply not been
 * measured, and a missing measurement must never open a gate.
 */
function measuredTestValue(result, spec) {
  const single = num(result.value);
  if (single != null) return single;
  if (spec && spec.bilateral === false) return null;
  const sides = [num(result.left), num(result.right)].filter((v) => v != null);
  return sides.length ? Math.min(...sides) : null;
}

function symptomFreeStreak(checkIns) {
  const days = byDateDesc(checkIns);
  let streak = 0;
  let expected = days.length ? days[0][0] : null;
  for (const [dateKey, dayCheckIns] of days) {
    if (expected && dateKey !== expected) break;
    const clear = dayCheckIns.every((c) => {
      const t = num(c.temperatureC);
      if (t != null && t >= 37.8) return false;
      const h = num(c.hallmarkValue);
      if (h != null && h > 0) return false;
      return !(c.symptoms || []).length;
    });
    if (!clear) break;
    streak += 1;
    const prev = new Date(Date.parse(`${dateKey}T00:00:00Z`) - DAY_MS);
    expected = prev.toISOString().slice(0, 10);
  }
  return streak;
}

/**
 * Hard stops. Each returns a reason object or null. Kept as a list so the set
 * is auditable at a glance and easy to extend per tissue.
 */
function hardStops(episode, entry, checkIns) {
  const out = [];
  const days = byDateDesc(checkIns);
  const today = days[0]?.[1] || [];
  const painRule = entry?.painRule || null;

  const anyToday = (pred) => today.some(pred);

  if (anyToday((c) => c.nightPain)) {
    out.push({
      id: 'night_pain',
      severity: 'stop',
      title: 'Pain at night',
      body: 'Pain that wakes you is not a training-load problem. Get it assessed before your next session.',
      medical: true,
    });
  }

  if (anyToday((c) => c.painAtRest)) {
    out.push({
      id: 'pain_at_rest',
      severity: 'stop',
      title: 'Pain at rest',
      body: 'Pain with no load on the tissue needs a diagnosis, not a smaller training week.',
      medical: true,
    });
  }

  if (anyToday((c) => c.limping)) {
    out.push({
      id: 'altered_gait',
      severity: 'stop',
      title: 'You are moving differently',
      body: 'Limping or guarding loads everything else wrongly. No running until you can walk normally.',
    });
  }

  const reported = today.flatMap((c) => c.redFlagsReported || []);
  if (reported.length) {
    const labels = (entry?.redFlags || [])
      .filter((f) => reported.includes(f.id))
      .map((f) => f.label);
    out.push({
      id: 'red_flag',
      severity: 'stop',
      title: 'Red flag reported',
      body: labels[0] || 'You reported a symptom that needs a clinician, not a training plan.',
      medical: true,
    });
  }

  if (painRule) {
    const during = today.map((c) => num(c.painDuringSession)).filter((v) => v != null);
    const worstDuring = during.length ? Math.max(...during) : null;
    if (worstDuring != null && worstDuring > painRule.duringMax) {
      out.push({
        id: 'pain_over_cap',
        severity: 'stop',
        title: `Pain ${worstDuring}/10 during training`,
        body: painRule.zeroTolerance
          ? 'Bone stress injuries have no acceptable pain level - that session was too much load.'
          : `Above the ${painRule.duringMax}/10 ceiling for this tissue. Back off a step.`,
      });
    }

    // The 24 h response - for a tendon this is the decisive signal, more than
    // anything felt during the session itself.
    if (painRule.morningMustNotWorsen) {
      const morning = today.map((c) => num(c.painNextMorning)).filter((v) => v != null);
      const worstMorning = morning.length ? Math.max(...morning) : null;
      const prevDay = days[1]?.[1] || [];
      const prevMorning = prevDay.map((c) => num(c.painNextMorning) ?? num(c.painNow))
        .filter((v) => v != null);
      const prevWorst = prevMorning.length ? Math.max(...prevMorning) : null;
      if (worstMorning != null && prevWorst != null && worstMorning >= prevWorst + 2) {
        out.push({
          id: 'morning_worse',
          severity: 'stop',
          title: 'Worse the morning after',
          body: `Morning pain ${worstMorning}/10 against ${prevWorst}/10 yesterday. `
            + 'The tissue did not tolerate that dose - repeat the previous week instead of progressing.',
        });
      }
    }
  }

  // Illness: fever is absolute. Training through a febrile infection is the one
  // scenario in this whole feature with a genuinely dangerous downside.
  const temps = today.map((c) => num(c.temperatureC)).filter((v) => v != null);
  const maxTemp = temps.length ? Math.max(...temps) : null;
  const feverReported = anyToday((c) => (c.symptoms || []).includes('fever'));
  if ((maxTemp != null && maxTemp >= 38) || feverReported) {
    out.push({
      id: 'fever',
      severity: 'stop',
      title: 'Fever - no training',
      body: 'Do not train with a fever. Wait until you have been fever-free for 24-48 h without medication.',
      medical: true,
    });
  }
  if (anyToday((c) => (c.symptoms || []).includes('chest'))) {
    out.push({
      id: 'chest_symptoms',
      severity: 'stop',
      title: 'Chest symptoms',
      body: 'Chest tightness, a deep cough or breathlessness means no training until a doctor has cleared you.',
      medical: true,
    });
  }

  return out;
}

/** Non-blocking cautions: hold the current stage, do not reverse it. */
function cautions(episode, entry, checkIns, { wellness = [], loadSummary = null } = {}) {
  const out = [];
  const days = byDateDesc(checkIns);

  // Hallmark stalled: not worse, but not better either. Suppressed once the
  // reading already clears the current stage gate - "not improving" is not a
  // useful thing to say to someone sitting at their target.
  const hallmark = entry?.hallmark;
  const stageGateOut = currentStage(episode, entry)?.gateOut;
  const latest = latestHallmark(checkIns);
  const alreadyAtTarget = latest && stageGateOut && (
    (stageGateOut.hallmarkAtMost != null && latest.value <= stageGateOut.hallmarkAtMost)
    || (stageGateOut.hallmarkAtLeast != null && latest.value >= stageGateOut.hallmarkAtLeast)
  );
  if (hallmark && days.length >= 3) {
    const recent = days.slice(0, 3)
      .map(([, cs]) => cs.map((c) => num(c.hallmarkValue)).filter((v) => v != null))
      .filter((arr) => arr.length)
      .map((arr) => (hallmark.betterIsLower ? Math.max(...arr) : Math.min(...arr)));
    if (recent.length === 3) {
      const improving = hallmark.betterIsLower
        ? recent[0] < recent[2]
        : recent[0] > recent[2];
      const worsening = hallmark.betterIsLower
        ? recent[0] > recent[2]
        : recent[0] < recent[2];
      if (worsening) {
        out.push({
          id: 'hallmark_worsening',
          severity: 'warning',
          title: 'Trending the wrong way',
          body: `${hallmark.prompt} - worse than three days ago. Hold this week's load where it is.`,
        });
      } else if (!improving && !alreadyAtTarget) {
        out.push({
          id: 'hallmark_flat',
          severity: 'watch',
          title: 'Not improving yet',
          body: 'Three days without progress. Stay at the current dose rather than adding to it.',
        });
      }
    }
  }

  // Reporting gaps make every other rule guesswork.
  const lastDate = days[0]?.[0] || null;
  const gap = lastDate ? daysBetween(lastDate, toDateKey(new Date())) : null;
  if (gap != null && gap >= 3) {
    out.push({
      id: 'stale_checkins',
      severity: 'watch',
      title: `No check-in for ${gap} days`,
      body: 'The plan is running on old information. One tap gets it back on track.',
    });
  }

  // Systemic recovery - reuses the same wellness rows the training alerts read.
  const hrvVals = wellness.map((w) => num(w.hrvMs)).filter((v) => v != null && v > 0);
  if (hrvVals.length >= 4) {
    const base = hrvVals.slice(0, -1).reduce((a, b) => a + b, 0) / (hrvVals.length - 1);
    const latest = hrvVals[hrvVals.length - 1];
    if (base > 0 && (latest - base) / base < -0.15) {
      out.push({
        id: 'hrv_suppressed',
        severity: 'watch',
        title: 'HRV below baseline',
        body: 'Recovery is lagging. Tissue heals on recovery days - keep today easy.',
      });
    }
  }

  const rhrVals = wellness.map((w) => num(w.restingHeartRate)).filter((v) => v != null && v > 0);
  if (rhrVals.length >= 4) {
    const base = rhrVals.slice(0, -1).reduce((a, b) => a + b, 0) / (rhrVals.length - 1);
    const latest = rhrVals[rhrVals.length - 1];
    if (latest - base >= 5) {
      out.push({
        id: 'rhr_elevated',
        severity: 'watch',
        title: `Resting HR up ${Math.round(latest - base)} bpm`,
        body: 'Elevated resting heart rate often shows up before you feel ill. Worth a lighter day.',
      });
    }
  }

  // Load ceiling for the stage.
  if (loadSummary?.overCapPct > 0) {
    out.push({
      id: 'over_stage_cap',
      severity: 'warning',
      title: `${Math.round(loadSummary.overCapPct)}% over this week's ceiling`,
      body: `Stage cap is ${loadSummary.capLabel}; you are at ${loadSummary.actualLabel}.`,
    });
  }

  // Muscle strains are re-torn by a single fast segment at the end of an
  // otherwise easy run, not by weekly volume. This is the one gate we can check
  // without asking the athlete anything - the pace is already in the activity.
  if (loadSummary?.speedBreach) {
    const b = loadSummary.speedBreach;
    out.push({
      id: 'speed_over_cap',
      severity: 'warning',
      title: `Faster than this stage allows`,
      body: `Your ceiling is ${b.capPct}% of pre-injury speed (${b.capMps.toFixed(2)} m/s); `
        + `a session this week hit ${b.actualMps.toFixed(2)} m/s. `
        + 'Most re-injuries happen exactly here.',
    });
  }

  if (loadSummary?.sessionsOverCap > 0) {
    out.push({
      id: 'sessions_over_cap',
      severity: 'watch',
      title: `${loadSummary.sessionsOverCap} session(s) over the weekly count`,
      body: 'Frequency is a separate variable from volume - add one or the other, never both in the same week.',
    });
  }

  // Rehab work is the thing that actually changes tissue capacity. Skipping it
  // while adding running is how tendinopathy recurs.
  const stage = currentStage(episode, entry);
  if (stage?.minRehabAdherencePct && loadSummary?.rehabAdherencePct != null
      && loadSummary.rehabAdherencePct < stage.minRehabAdherencePct) {
    out.push({
      id: 'rehab_adherence',
      severity: 'warning',
      title: 'Strength work is behind',
      body: `${Math.round(loadSummary.rehabAdherencePct)}% of prescribed rehab sessions done `
        + `(${stage.minRehabAdherencePct}% needed to unlock the next stage).`,
    });
  }

  if (episode?.isRecurrence) {
    out.push({
      id: 'recurrence',
      severity: 'watch',
      title: 'This is a repeat',
      body: 'A previous episode at the same site is the strongest predictor of the next one. '
        + 'Progress a step slower than feels necessary.',
    });
  }

  return out;
}

function currentStage(episode, entry) {
  if (!entry?.stages?.length) return null;
  const idx = Math.min(Math.max(Number(episode?.currentStageIndex) || 0, 0), entry.stages.length - 1);
  return entry.stages[idx];
}

/**
 * Does the current stage's gate open? Returns every unmet condition so the UI
 * can show a checklist rather than a bare "not yet".
 */
function evaluateStageGate(episode, entry, checkIns, opts = {}) {
  const stage = currentStage(episode, entry);
  const gate = stage?.gateOut;
  if (!stage) return { met: false, conditions: [], isFinalStage: false };
  if (!gate) return { met: false, conditions: [], isFinalStage: true };

  const painRule = entry.painRule;
  const conditions = [];

  if (gate.requiresManualClearance) {
    conditions.push({
      id: 'medical_clearance',
      label: 'Medical clearance recorded',
      met: Boolean(episode.medicalClearanceAt),
      detail: episode.medicalClearanceAt ? 'Cleared' : 'Not yet cleared',
    });
  }

  if (gate.painFreeDays != null) {
    const streak = painFreeStreak(checkIns, painRule);
    conditions.push({
      id: 'pain_free_days',
      label: `${gate.painFreeDays} consecutive pain-free days`,
      met: streak >= gate.painFreeDays,
      detail: `${streak} / ${gate.painFreeDays}`,
      progress: Math.min(1, streak / gate.painFreeDays),
    });
  }

  if (gate.symptomFreeDays != null) {
    const streak = symptomFreeStreak(checkIns);
    conditions.push({
      id: 'symptom_free_days',
      label: `${gate.symptomFreeDays} consecutive symptom-free days`,
      met: streak >= gate.symptomFreeDays,
      detail: `${streak} / ${gate.symptomFreeDays}`,
      progress: Math.min(1, streak / gate.symptomFreeDays),
    });
  }

  if (gate.hallmarkAtMost != null) {
    const need = gate.consecutiveDays || 1;
    const streak = hallmarkStreak(checkIns, gate.hallmarkAtMost, true);
    conditions.push({
      id: 'hallmark_at_most',
      label: `${entry.hallmark?.prompt || 'Symptom'} at or below ${gate.hallmarkAtMost} for ${need} days`,
      met: streak >= need,
      detail: `${streak} / ${need}`,
      progress: Math.min(1, streak / need),
    });
  }

  if (gate.hallmarkAtLeast != null) {
    const need = gate.consecutiveDays || 1;
    const streak = hallmarkStreak(checkIns, gate.hallmarkAtLeast, false);
    conditions.push({
      id: 'hallmark_at_least',
      label: `${entry.hallmark?.prompt || 'Symptom'} at or above ${gate.hallmarkAtLeast} for ${need} days`,
      met: streak >= need,
      detail: `${streak} / ${need}`,
      progress: Math.min(1, streak / need),
    });
  }

  for (const req of gate.tests || []) {
    const spec = FUNCTIONAL_TESTS[req.test] || null;
    const result = latestTest(checkIns, req.test);
    let met = false;
    let detail = 'Not tested yet';
    if (result) {
      const checks = [];
      if (req.symmetryPct != null) {
        checks.push(num(result.symmetryPct) != null && result.symmetryPct >= req.symmetryPct);
        detail = `${result.symmetryPct ?? '-'}% symmetry (need ${req.symmetryPct}%)`;
      }
      if (req.minValue != null) {
        const measured = measuredTestValue(result, spec);
        checks.push(measured != null && measured >= req.minValue);
        detail = `${formatTestValue(measured, spec?.unit)} (need ${req.minValue})`;
      }
      if (req.maxPain != null) {
        checks.push(num(result.painDuring) != null && result.painDuring <= req.maxPain);
        detail = `pain ${result.painDuring ?? '-'}/10 (need ≤ ${req.maxPain})`;
      }
      met = checks.length > 0 && checks.every(Boolean);
    }
    conditions.push({
      id: `test_${req.test}`,
      // A raw catalogue key in a checklist is a bug the athlete has to read.
      label: spec?.label || req.test,
      met,
      detail,
      // Passed through so the client can pick the right input without having to
      // fetch and re-derive the catalogue itself.
      unit: spec?.unit ?? null,
      bilateral: spec?.bilateral ?? null,
    });
  }

  if (gate.speedPctReached != null) {
    const reached = num(episode.speedPctReached) || 0;
    conditions.push({
      id: 'speed_pct',
      label: `Cleared ${gate.speedPctReached}% of pre-injury speed`,
      met: reached >= gate.speedPctReached,
      detail: `${reached}% / ${gate.speedPctReached}%`,
      progress: Math.min(1, reached / gate.speedPctReached),
    });
  }

  if (gate.volumePctOfBaseline != null && opts.volumePctOfBaseline != null) {
    conditions.push({
      id: 'volume_pct',
      label: `Training at ${gate.volumePctOfBaseline}% of pre-injury volume`,
      met: opts.volumePctOfBaseline >= gate.volumePctOfBaseline,
      detail: `${Math.round(opts.volumePctOfBaseline)}% / ${gate.volumePctOfBaseline}%`,
      progress: Math.min(1, opts.volumePctOfBaseline / gate.volumePctOfBaseline),
    });
  }

  if (gate.continuousRunMinutes != null && opts.continuousRunMinutes != null) {
    conditions.push({
      id: 'continuous_run',
      label: `${gate.continuousRunMinutes} min continuous running`,
      met: opts.continuousRunMinutes >= gate.continuousRunMinutes,
      detail: `${Math.round(opts.continuousRunMinutes)} / ${gate.continuousRunMinutes} min`,
    });
  }

  if (gate.restingHrWithinBpm != null && opts.restingHrDelta != null) {
    conditions.push({
      id: 'rhr_baseline',
      label: `Resting HR within ${gate.restingHrWithinBpm} bpm of baseline`,
      met: Math.abs(opts.restingHrDelta) <= gate.restingHrWithinBpm,
      detail: `${opts.restingHrDelta > 0 ? '+' : ''}${Math.round(opts.restingHrDelta)} bpm`,
    });
  }

  if (gate.feverFreeHours != null) {
    const streak = symptomFreeStreak(checkIns);
    const hours = streak * 24;
    conditions.push({
      id: 'fever_free',
      label: `${gate.feverFreeHours} h fever-free`,
      met: hours >= gate.feverFreeHours,
      detail: `${hours} h`,
    });
  }

  // Conditions we could not evaluate (no data supplied) count as unmet - the
  // gate should never open on missing evidence.
  const met = conditions.length > 0 && conditions.every((c) => c.met);
  return { met, conditions, isFinalStage: false };
}

/**
 * Today's ceiling, expressed in whatever unit the athlete actually thinks in.
 * Derived from the stage's percentage of the frozen pre-injury baseline.
 */
function stageCaps(episode, entry, sport = 'run') {
  const stage = currentStage(episode, entry);
  if (!stage) return null;
  const baseWeeklyDistance = num(episode?.baseline?.weeklyDistanceBySport?.[sport]);
  const baseWeeklyDuration = num(episode?.baseline?.weeklyDurationBySport?.[sport]);
  const basePeakSpeed = num(episode?.baseline?.peakSpeedBySport?.[sport]);
  const pct = num(stage.volumePctOfBaseline);

  const speedCapPct = num(stage.speedCapPct)
    ?? (stage.speedProgression ? (num(episode.speedPctReached) || stage.speedProgression[0]) : null);

  return {
    stageId: stage.id,
    stageName: stage.name,
    focus: stage.focus,
    runningAllowed: stage.runningAllowed !== false,
    volumePctOfBaseline: pct,
    weeklyDistanceCapM: pct != null && baseWeeklyDistance != null
      ? Math.round((baseWeeklyDistance * pct) / 100) : null,
    weeklyDurationCapS: pct != null && baseWeeklyDuration != null
      ? Math.round((baseWeeklyDuration * pct) / 100) : null,
    allowedZones: stage.allowedZones || null,
    maxSessionsPerWeek: stage.maxSessionsPerWeek ?? null,
    minRestDaysBetweenRuns: stage.minRestDaysBetweenRuns ?? null,
    weeklyIncreasePct: stage.weeklyIncreasePct ?? null,
    rehabSessionsPerWeek: stage.rehabSessionsPerWeek ?? null,
    minRehabAdherencePct: stage.minRehabAdherencePct ?? null,
    speedCapPct,
    /** Absolute speed ceiling in m/s, checkable straight against activity data. */
    speedCapMps: speedCapPct != null && basePeakSpeed != null
      ? Math.round(((basePeakSpeed * speedCapPct) / 100) * 1000) / 1000
      : null,
    /** ITB-style: cap the run at the time pain historically appears, minus a margin. */
    useTimeToPainCap: Boolean(stage.useTimeToPainCap),
  };
}

/**
 * The verdict.
 *
 * @param {object}   episode   HealthEpisode (lean)
 * @param {object}   entry     catalogue entry for episode.catalogId
 * @param {Array}    checkIns  HealthCheckIn docs, any order
 * @param {object}   opts      { wellness, loadSummary, sport, ...gate inputs }
 * @returns {{ light, reasons, hardStop, stepBack, canAdvance, stageGate, caps }}
 */
function evaluateHealthGate(episode, entry, checkIns = [], opts = {}) {
  if (!episode || !entry) {
    return {
      light: null, reasons: [], hardStop: false, stepBack: false, canAdvance: false,
      stageGate: null, caps: null,
    };
  }

  const stops = hardStops(episode, entry, checkIns);
  const warns = cautions(episode, entry, checkIns, opts);
  const caps = stageCaps(episode, entry, opts.sport || 'run');
  const stageGate = evaluateStageGate(episode, entry, checkIns, opts);

  if (stops.length) {
    return {
      light: 'red',
      reasons: [...stops, ...warns],
      hardStop: true,
      // A medical red flag is not a plan problem - do not silently rewrite the
      // week and imply a smaller dose is the answer.
      stepBack: !stops.every((s) => s.medical),
      requiresMedicalAttention: stops.some((s) => s.medical),
      canAdvance: false,
      stageGate,
      caps,
    };
  }

  const hasWarning = warns.some((w) => w.severity === 'warning');
  if (hasWarning) {
    return {
      light: 'amber',
      reasons: warns,
      hardStop: false,
      stepBack: false,
      canAdvance: false,
      stageGate,
      caps,
    };
  }

  const canAdvance = stageGate.met && !stageGate.isFinalStage;
  return {
    light: 'green',
    reasons: warns,
    hardStop: false,
    stepBack: false,
    canAdvance,
    stageGate,
    caps,
  };
}

module.exports = {
  evaluateHealthGate,
  evaluateStageGate,
  stageCaps,
  currentStage,
  painFreeStreak,
  symptomFreeStreak,
  hallmarkStreak,
  latestHallmark,
  latestTest,
  isPainFreeDay,
  daysBetween,
  toDateKey,
};
