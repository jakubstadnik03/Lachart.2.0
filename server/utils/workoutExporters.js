/**
 * workoutExporters
 * ────────────────
 * Convert a LaChart PlannedWorkout document into one of the structured
 * workout file formats third-party trainers understand:
 *
 *   • ZWO — Zwift workout XML. Used by Zwift, TrainerRoad import,
 *           Wahoo SYSTM, Rouvy, IndieVelo, MyWhoosh. Power is fractional
 *           FTP (0.0–2.0+).
 *   • TCX — Garmin Training Center XML v2. Power is in absolute watts.
 *
 *           IMPORTANT: Garmin Connect has NO workout importer. The
 *           "Import Data" page at connect.garmin.com only ingests
 *           COMPLETED activities (.fit/.gpx/.tcx) into the history feed —
 *           it cannot create a planned workout, cannot schedule one, and
 *           never syncs to the watch. Do not label this export as
 *           "send to Garmin Connect" in the UI.
 *
 *           Where TCX actually lands: TrainingPeaks (web → Calendar →
 *           Apply Library Workout → Upload) and other platforms whose
 *           uploader accepts a workout TCX. Reaching a Garmin watch means
 *           either a FIT workout file sideloaded to GARMIN/NEWFILES over
 *           USB, or a partner platform (intervals.icu / TrainingPeaks)
 *           that holds Garmin Training API access pushing it for us.
 *
 * Both formats describe a flat list of steps (no nested intervals), so
 * we expand grouped steps (`isGroupHeader` + `groupRepeat`) before
 * emitting. Open / no-power steps map to the nearest neutral notion
 * each format supports (Rest in TCX, Power=0.5 in ZWO).
 *
 * The resolveTargetWatts helper takes a `ctx = { ftp, lt1Power, lt2Power }`
 * and returns absolute watts for any target type. For ZWO we need the
 * fractional FTP, so we divide by `ctx.ftp` after resolving.
 */

// TCX Intensity_t is a two-value enum: "Active" | "Resting". Emitting
// "Rest" makes the whole document schema-invalid, and strict validators
// (TrainingPeaks) reject the file rather than just the step.
const STEP_TYPE_TO_INTENSITY = {
  warmup:   'Active',
  work:     'Active',
  recovery: 'Resting',
  cooldown: 'Active',
  rest:     'Resting',
};

const SPORT_TO_TCX = {
  bike:       'Biking',
  mtbike:     'Biking',
  run:        'Running',
  walk:       'Running',
  brick:      'Running',
  crosstrain: 'Other',
  swim:       'Other',
  rowing:     'Other',
  strength:   'Other',
  other:      'Other',
};

const SPORT_TO_ZWO = {
  bike: 'bike',
  mtbike: 'bike',
  run: 'run',
  walk: 'run',
  brick: 'bike',
  // ZWO format technically only supports bike + run. Everything else
  // falls back to "bike" so the file at least imports.
};

/**
 * Resolve a power-target spec to absolute watts. Mirrors
 * resolveTargetWatts in WorkoutExecutionPage so the exported file
 * matches what the athlete would see on the live screen.
 */
/** Mid-point of a profile zone object {min, max}. Mirrors zoneMid in WorkoutBuilder. */
function zoneMid(z) {
  if (!z) return null;
  const min = z.min ?? 0;
  const max = (z.max != null && z.max !== Infinity && z.max > 0) ? z.max : min * 1.08;
  return (min + max) / 2;
}

/**
 * Mid-point of a target's own value, honouring `useRange` for EVERY target
 * type. The previous version only did this for `watts`, so a
 * {percent_ftp, useRange:true, rangeMin:88, rangeMax:94} target read
 * `value` (undefined) and exported as 0 W.
 */
function targetMid(t) {
  if (t.useRange) {
    // Average only the endpoints actually set. Summing a half-filled range
    // (rangeMin 88, rangeMax undefined) and dividing by 2 halved the target;
    // an entirely empty range produced 0 W and a dead step.
    const ends = [t.rangeMin, t.rangeMax]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ends.length) return ends.reduce((a, b) => a + b, 0) / ends.length;
  }
  return Number(t.value || 0);
}

function resolveTargetWatts(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  const { ftp = 250, lt1Power = null, lt2Power = null, cyclingZones = null } = ctx;
  const pct = targetMid(target);
  if (target.type === 'watts')       return Math.round(pct);
  if (target.type === 'percent_ftp') return Math.round(ftp * pct / 100);
  if (target.type === 'percent_lt1') return Math.round((lt1Power || ftp * 0.75) * pct / 100);
  if (target.type === 'percent_lt2') return Math.round((lt2Power || ftp) * pct / 100);
  if (target.type === 'lt1') return Math.round(target.override ?? (lt1Power || cyclingZones?.lt1 || ftp * 0.75));
  if (target.type === 'lt2') return Math.round(target.override ?? (lt2Power || cyclingZones?.lt2 || ftp));
  if (target.type === 'zone') {
    if (target.override != null) return Math.round(target.override);
    const z = Number(target.value) || 2;
    // Profile zone midpoint wins, exactly as the live workout screen does —
    // otherwise a Z2 step is exported at a different wattage than it is ridden at.
    const profileMid = cyclingZones ? zoneMid(cyclingZones[`zone${z}`]) : null;
    if (profileMid != null && profileMid > 0) return Math.round(profileMid);
    const lt2 = lt2Power || ftp;
    const lt1 = lt1Power || ftp * 0.75;
    return Math.round([lt1 * 0.8, lt1, lt2 * 0.95, lt2, lt2 * 1.1][Math.min(Math.max(z, 1) - 1, 4)]);
  }
  return null;
}

/**
 * Absolute watts low/high for a target. An explicit range on the target is
 * resolved through its own units (a 88–94 %FTP range becomes watts, not 88–94 W);
 * otherwise we widen the centre by ±5 %, matching the green band on the live chart.
 */
function resolveTargetRange(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  // Only types whose `value` is a magnitude can carry a meaningful range.
  // For `zone` the value is a zone NUMBER and for lt1/lt2 it is unused, so
  // those fall through to the ±5 % band below.
  const RANGEABLE = ['watts', 'percent_ftp', 'percent_lt1', 'percent_lt2'];
  const hasBothEnds = Number(target.rangeMin) > 0 && Number(target.rangeMax) > 0;
  if (target.useRange && RANGEABLE.includes(target.type) && hasBothEnds) {
    const lowW = resolveTargetWatts({ ...target, useRange: false, value: target.rangeMin }, ctx);
    const highW = resolveTargetWatts({ ...target, useRange: false, value: target.rangeMax }, ctx);
    // Require BOTH ends to resolve. The old `(lowW > 0 || highW > 0)` guard let
    // a half-resolved range through and emitted a 0 W floor, which reads as
    // "no lower bound" to Garmin and TrainingPeaks.
    if (lowW > 0 && highW > 0) {
      return { low: Math.min(lowW, highW), high: Math.max(lowW, highW) };
    }
  }
  const centre = resolveTargetWatts(target, ctx);
  if (centre == null) return null;
  return {
    low: Math.round(centre * 0.95),
    high: Math.round(centre * 1.05),
  };
}

/**
 * Flatten grouped repeat blocks into a single linear step list.
 *
 * Important: the WorkoutBuilder data model treats the group HEADER as a
 * REAL step (typically the work interval). The header only carries the
 * `groupRepeat` count for the whole block — it is not a label-only
 * container. So a "5 × (8 min work + 2 min recovery)" block is stored as
 *
 *     { groupId:G, isGroupHeader:true,  groupRepeat:5, stepType:'work',     dur:480 }
 *     { groupId:G, isGroupHeader:false,                stepType:'recovery', dur:120 }
 *
 * The earlier version of this function dropped the header on the floor,
 * which made every exported ZWO / TCX file lose the work intervals
 * entirely. We now include the header in the per-repeat emission and
 * strip `isGroupHeader` from each emitted copy so downstream code
 * (Zwift / Garmin / TP) doesn't treat them as anything special.
 */
function expandSteps(steps = []) {
  if (!Array.isArray(steps)) return [];
  const out = [];
  const visited = new Set();
  for (const s of steps) {
    if (!s.groupId) { out.push({ ...s }); continue; }
    if (visited.has(s.groupId)) continue;
    visited.add(s.groupId);
    // Collect by groupId rather than by position, so a member stored before
    // its header still inherits the repeat count. The previous positional
    // scan only opened a group on `isGroupHeader` and silently dropped the
    // repeat when the order differed from the client's.
    const group = steps.filter((x) => x.groupId === s.groupId);
    const repeat = Math.max(1, Number(group.find((x) => x.isGroupHeader)?.groupRepeat) || 1);
    for (let r = 0; r < repeat; r++) {
      for (const gs of group) out.push({ ...gs, isGroupHeader: false });
    }
  }
  return out;
}

/**
 * Group steps into a linear list of plain steps and repeat blocks, preserving
 * calendar order. Unlike expandSteps this does NOT multiply out the repeats —
 * used by the TCX writer, which has a native <Repeat_t> element.
 *
 * Returns entries of `{ kind: 'step', step }` or
 * `{ kind: 'repeat', repetitions, steps }`.
 */
function groupSteps(steps = []) {
  if (!Array.isArray(steps)) return [];
  const out = [];
  const visited = new Set();
  for (const s of steps) {
    if (!s.groupId) { out.push({ kind: 'step', step: { ...s } }); continue; }
    if (visited.has(s.groupId)) continue;
    visited.add(s.groupId);
    const members = steps.filter((x) => x.groupId === s.groupId);
    const repetitions = Math.max(1, Number(members.find((x) => x.isGroupHeader)?.groupRepeat) || 1);
    const inner = members.map((m) => ({ ...m, isGroupHeader: false }));
    if (!inner.length) continue;
    if (repetitions === 1) {
      for (const m of inner) out.push({ kind: 'step', step: m });
    } else {
      out.push({ kind: 'repeat', repetitions, steps: inner });
    }
  }
  return out;
}

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ────────────────────────────────────────────────────────────────────────── */
/* ZWO — Zwift Workout File                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Build a ZWO XML string. Power values are expressed as fractions of FTP
 * (0.0–2.0+). Step elements:
 *   <Warmup>      — warmup ramp (linear from PowerLow → PowerHigh)
 *   <SteadyState> — constant power
 *   <Cooldown>    — cooldown ramp (PowerLow > PowerHigh)
 *   <FreeRide>    — open / no power
 */
function buildZwo(workout, ctx = {}) {
  const ftp = Number(ctx.ftp) || 250;
  const steps = expandSteps(workout.steps || []);

  const sportType = SPORT_TO_ZWO[workout.sport] || 'bike';
  const name = xmlEscape(workout.title || 'Workout');
  const desc = xmlEscape((workout.description || '') + (workout.coachNotes ? `\n\n${workout.coachNotes}` : ''));

  const stepXml = steps.map((s) => {
    const dur = Math.max(1, Number(s.durationSeconds) || 0);
    const target = s.powerTarget;
    if (!target || target.type === 'open') {
      return `    <FreeRide Duration="${dur}" FlatRoad="1"/>`;
    }
    const w = resolveTargetWatts(target, ctx);
    if (w == null) return `    <FreeRide Duration="${dur}" FlatRoad="1"/>`;
    const power = (w / ftp).toFixed(2);
    if (s.stepType === 'warmup' || s.stepType === 'cooldown') {
      // Ramp endpoints must be resolved through the target's own units before
      // being normalised to FTP. Reading rangeMin/rangeMax as raw watts made a
      // 50→75 %FTP warmup export at ~3x too low a fraction.
      // Without an explicit range, keep the default 55 %→100 % ramp — the
      // ±5 % band from resolveTargetRange would flatten the ramp to nothing.
      const explicit = target.useRange ? resolveTargetRange(target, ctx) : null;
      const lowW = explicit ? explicit.low : Math.round(w * 0.55);
      const highW = explicit ? explicit.high : w;
      const lowFrac = (lowW / ftp).toFixed(2);
      const highFrac = (highW / ftp).toFixed(2);
      return s.stepType === 'warmup'
        ? `    <Warmup Duration="${dur}" PowerLow="${lowFrac}" PowerHigh="${highFrac}"/>`
        : `    <Cooldown Duration="${dur}" PowerLow="${highFrac}" PowerHigh="${lowFrac}"/>`;
    }
    const cadence = Number(s.cadenceMin) > 0
      ? ` Cadence="${Math.round((Number(s.cadenceMin) + Number(s.cadenceMax || s.cadenceMin)) / 2)}"`
      : '';
    return `    <SteadyState Duration="${dur}" Power="${power}"${cadence}/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>LaChart</author>
  <name>${name}</name>
  <description>${desc}</description>
  <sportType>${sportType}</sportType>
  <tags/>
  <workout>
${stepXml}
  </workout>
</workout_file>
`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* TCX — Training Center XML (Garmin / TrainingPeaks)                         */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Build a TCX <Workout> document. Power targets use absolute watts via
 * CustomPowerZone. Cadence range supported. Garmin Connect web caps
 * workout names at 15 chars when uploading — we truncate before export
 * so the file imports without warnings.
 */
function buildTcx(workout, ctx = {}) {
  const sport = SPORT_TO_TCX[workout.sport] || 'Other';
  const steps = expandSteps(workout.steps || []);
  // Garmin Connect workout-name limit is 15 chars. Strip + truncate.
  const rawName = (workout.title || 'Workout').replace(/[^A-Za-z0-9 _-]/g, '').trim();
  const name = xmlEscape(rawName.slice(0, 15) || 'Workout');
  const fullName = xmlEscape(workout.title || 'Workout');

  // TCX caps <Workout> at 20 <Step> children, so a 10 × (work + recovery) set
  // cannot be flattened — it would be schema-invalid and rejected on import.
  // Emit the repeats natively instead, which is also what the athlete meant.
  let stepId = 0;
  const renderStep = (s, indent) => {
    const pad = ' '.repeat(indent);
    const dur = Math.max(1, Number(s.durationSeconds) || 0);
    const intensity = STEP_TYPE_TO_INTENSITY[s.stepType] || 'Active';
    const label = xmlEscape((s.label || s.stepType || '').slice(0, 15));
    const range = resolveTargetRange(s.powerTarget, ctx);
    stepId += 1;
    const id = stepId;
    const targetXml = range
      ? `${pad}  <Target xsi:type="Power_t">
${pad}    <PowerZone xsi:type="CustomPowerZone_t">
${pad}      <Low><Value>${range.low}</Value></Low>
${pad}      <High><Value>${range.high}</Value></High>
${pad}    </PowerZone>
${pad}  </Target>`
      : `${pad}  <Target xsi:type="None_t"/>`;
    return `${pad}<StepId>${id}</StepId>
${pad}<Name>${label || `Step ${id}`}</Name>
${pad}<Duration xsi:type="Time_t"><Seconds>${dur}</Seconds></Duration>
${pad}<Intensity>${intensity}</Intensity>
${targetXml}`;
  };

  const stepXml = groupSteps(workout.steps || []).map((entry) => {
    if (entry.kind === 'step') {
      return `      <Step xsi:type="Step_t">
${renderStep(entry.step, 8)}
      </Step>`;
    }
    stepId += 1;
    const repeatId = stepId;
    const children = entry.steps.map((s) => `        <Child xsi:type="Step_t">
${renderStep(s, 10)}
        </Child>`).join('\n');
    return `      <Step xsi:type="Repeat_t">
        <StepId>${repeatId}</StepId>
        <Repetitions>${entry.repetitions}</Repetitions>
${children}
      </Step>`;
  }).join('\n');

  // <ScheduledOn> puts the workout on a date in the Garmin Connect calendar
  // instead of dropping it loose into the workout library. Per the XSD it sits
  // between the steps and <Notes>.
  const scheduledOn = workout.date ? new Date(workout.date) : null;
  const scheduledOnXml = scheduledOn && !Number.isNaN(scheduledOn.getTime())
    ? `      <ScheduledOn>${scheduledOn.toISOString().slice(0, 10)}</ScheduledOn>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Workouts>
    <Workout Sport="${sport}">
      <Name>${name}</Name>
${stepXml}
${scheduledOnXml}      <Notes>${fullName}${workout.description ? ` — ${xmlEscape(workout.description)}` : ''}</Notes>
    </Workout>
  </Workouts>
</TrainingCenterDatabase>
`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* FIT — Garmin FIT (placeholder — needs binary encoder)                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * FIT is binary. The Garmin FIT SDK has a JS encoder
 * (`@garmin/fitsdk`) but it ships as a 5 MB package. Until we adopt it
 * (planned in a follow-up), this stub throws so the caller can return
 * a friendly 501 to the client.
 */
function buildFit() {
  const err = new Error('FIT workout export not implemented yet — use TCX or ZWO for now.');
  err.code = 'FORMAT_NOT_IMPLEMENTED';
  throw err;
}

module.exports = {
  buildZwo,
  buildTcx,
  buildFit,
  expandSteps,
  resolveTargetWatts,
  resolveTargetRange,
};
