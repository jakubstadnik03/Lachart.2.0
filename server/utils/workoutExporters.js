/**
 * workoutExporters
 * ────────────────
 * Convert a LaChart PlannedWorkout document into one of the structured
 * workout file formats third-party trainers understand:
 *
 *   • ZWO — Zwift workout XML. Used by Zwift, TrainerRoad import,
 *           Wahoo SYSTM, Rouvy, IndieVelo, MyWhoosh. Power is fractional
 *           FTP (0.0–2.0+).
 *   • TCX — Garmin Training Center XML v2. Imported into Garmin
 *           Connect (web → Workouts → Import) and TrainingPeaks (web →
 *           Calendar → Apply Library Workout → Upload). Power is in
 *           absolute watts.
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

const STEP_TYPE_TO_INTENSITY = {
  warmup:   'Active',
  work:     'Active',
  recovery: 'Rest',
  cooldown: 'Active',
  rest:     'Rest',
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
function resolveTargetWatts(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  const { ftp = 250, lt1Power = null, lt2Power = null } = ctx;
  if (target.type === 'watts') {
    return target.useRange
      ? Math.round((Number(target.rangeMin || 0) + Number(target.rangeMax || 0)) / 2)
      : Number(target.value || 0);
  }
  const pct = Number(target.value) || 0;
  if (target.type === 'percent_ftp') return Math.round(ftp * pct / 100);
  if (target.type === 'percent_lt1') return Math.round((lt1Power || ftp * 0.75) * pct / 100);
  if (target.type === 'percent_lt2') return Math.round((lt2Power || ftp) * pct / 100);
  if (target.type === 'lt1') return Math.round(lt1Power || ftp * 0.75);
  if (target.type === 'lt2') return Math.round(lt2Power || ftp);
  if (target.type === 'zone') {
    const zoneIdx = Math.max(0, Math.min(4, (Number(target.value) || 1) - 1));
    const zonePcts = [0.55, 0.68, 0.83, 0.97, 1.10];
    return Math.round(ftp * zonePcts[zoneIdx]);
  }
  return null;
}

function resolveTargetRange(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  if (target.type === 'watts' && target.useRange) {
    return {
      low: Number(target.rangeMin) || 0,
      high: Number(target.rangeMax) || 0,
    };
  }
  const centre = resolveTargetWatts(target, ctx);
  if (centre == null) return null;
  // ±5 % default tolerance — matches the green/amber bands in
  // the live workout chart.
  return {
    low: Math.round(centre * 0.95),
    high: Math.round(centre * 1.05),
  };
}

/** Flatten grouped repeat blocks so each output step is a single occurrence. */
function expandSteps(steps = []) {
  const out = [];
  let groupHeader = null;
  let groupChildren = [];
  const flushGroup = () => {
    if (!groupHeader || !groupChildren.length) {
      groupHeader = null;
      groupChildren = [];
      return;
    }
    const repeat = Math.max(1, Number(groupHeader.groupRepeat) || 1);
    for (let r = 0; r < repeat; r++) {
      for (const c of groupChildren) out.push({ ...c });
    }
    groupHeader = null;
    groupChildren = [];
  };
  for (const s of steps) {
    if (s.isGroupHeader) {
      flushGroup();
      groupHeader = s;
      continue;
    }
    if (groupHeader && s.groupId && s.groupId === groupHeader.groupId) {
      groupChildren.push(s);
    } else {
      flushGroup();
      out.push({ ...s });
    }
  }
  flushGroup();
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
    if (s.stepType === 'warmup') {
      const lowW = target.useRange ? Number(target.rangeMin) : Math.round(w * 0.55);
      const highW = target.useRange ? Number(target.rangeMax) : w;
      const lowFrac = (lowW / ftp).toFixed(2);
      const highFrac = (highW / ftp).toFixed(2);
      return `    <Warmup Duration="${dur}" PowerLow="${lowFrac}" PowerHigh="${highFrac}"/>`;
    }
    if (s.stepType === 'cooldown') {
      const highW = target.useRange ? Number(target.rangeMax) : w;
      const lowW = target.useRange ? Number(target.rangeMin) : Math.round(w * 0.55);
      const highFrac = (highW / ftp).toFixed(2);
      const lowFrac = (lowW / ftp).toFixed(2);
      return `    <Cooldown Duration="${dur}" PowerLow="${highFrac}" PowerHigh="${lowFrac}"/>`;
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

  const stepXml = steps.map((s, i) => {
    const dur = Math.max(1, Number(s.durationSeconds) || 0);
    const intensity = STEP_TYPE_TO_INTENSITY[s.stepType] || 'Active';
    const label = xmlEscape((s.label || s.stepType || '').slice(0, 15));
    const range = resolveTargetRange(s.powerTarget, ctx);
    const targetXml = range
      ? `        <Target xsi:type="Power_t">
          <PowerZone xsi:type="CustomPowerZone_t">
            <Low><Value>${range.low}</Value></Low>
            <High><Value>${range.high}</Value></High>
          </PowerZone>
        </Target>`
      : `        <Target xsi:type="None_t"/>`;
    return `      <Step xsi:type="Step_t">
        <StepId>${i + 1}</StepId>
        <Name>${label || `Step ${i + 1}`}</Name>
        <Duration xsi:type="Time_t"><Seconds>${dur}</Seconds></Duration>
        <Intensity>${intensity}</Intensity>
${targetXml}
      </Step>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Workouts>
    <Workout Sport="${sport}">
      <Name>${name}</Name>
      <Notes>${fullName}${workout.description ? ` — ${xmlEscape(workout.description)}` : ''}</Notes>
${stepXml}
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
