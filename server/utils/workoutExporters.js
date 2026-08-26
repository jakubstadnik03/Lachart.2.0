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

/** Mid-point of a zone object {min, max} — falls back to min when max is absent/Infinity. */
function zoneMid(z) {
  if (!z) return null;
  const min = Number(z.min) || 0;
  if (min <= 0) return null;
  const max = (z.max != null && z.max !== Infinity && Number(z.max) > 0) ? Number(z.max) : min * 1.08;
  return (min + max) / 2;
}

/**
 * Resolve a power-target spec to absolute watts. Mirrors resolveTargetWatts in
 * WorkoutBuilder: profile zone ranges (`ctx.cyclingZones` — the athlete's
 * Training Zones screen) are the primary source for zone/LT targets, with
 * LT-derived fallbacks. Anything else here and the watch gets different watts
 * than the builder showed while planning.
 */
function resolveTargetWatts(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  const { ftp = 250, lt1Power = null, lt2Power = null, cyclingZones = null } = ctx;
  // A pinned override beats the calculation. It is the number the athlete
  // typed, so it is the number the watch has to be given — the exports used to
  // recompute the zone and quietly send something else.
  const pinned = Number(target.override);
  if (Number.isFinite(pinned) && pinned > 0) return Math.round(pinned);
  if (target.type === 'watts') {
    return target.useRange
      ? Math.round((Number(target.rangeMin || 0) + Number(target.rangeMax || 0)) / 2)
      : Number(target.value || 0);
  }
  const lt1 = lt1Power || cyclingZones?.lt1 || ftp * 0.75;
  const lt2 = lt2Power || cyclingZones?.lt2 || ftp;
  const pct = Number(target.value) || 0;
  if (target.type === 'percent_ftp') return Math.round(ftp * pct / 100);
  if (target.type === 'percent_lt1') return Math.round(lt1 * pct / 100);
  if (target.type === 'percent_lt2') return Math.round(lt2 * pct / 100);
  if (target.type === 'lt1') return Math.round(lt1);
  if (target.type === 'lt2') return Math.round(lt2);
  if (target.type === 'zone') {
    const z = Math.max(1, Math.min(5, Number(target.value) || 1));
    const profileMid = cyclingZones ? zoneMid(cyclingZones[`zone${z}`]) : null;
    if (profileMid != null && profileMid > 0) return Math.round(profileMid);
    return Math.round([lt1 * 0.8, lt1, lt2 * 0.95, lt2, lt2 * 1.1][z - 1]);
  }
  return null;
}

/**
 * Resolve a target to running pace in sec/km. Server mirror of
 * resolveTargetPace in WorkoutBuilder — same inputs (`runningZones` is
 * user.powerZones.running: { lt1, lt2, zone1..5:{min,max} }, paces in sec/km),
 * same fallbacks, so the watch gets the pace the athlete saw in the builder.
 * Returns null when there is no pace reference at all.
 */
function resolveTargetPaceSecPerKm(target, ctx = {}) {
  const { lt1Pace = null, lt2Pace = null, runningZones = null } = ctx;
  const lt2p = lt2Pace || runningZones?.lt2 || null;
  if (!lt2p) return null;
  if (!target || target.type === 'open') return null; // open = no watch target
  const mid = (t) => (t.useRange ? (Number(t.rangeMin) + Number(t.rangeMax)) / 2 : (Number(t.value) || 0));
  const lt1p = lt1Pace || runningZones?.lt1 || lt2p * 1.12;
  const pinned = Number(target.override);
  if (Number.isFinite(pinned) && pinned > 0) return pinned;
  if (target.type === 'lt1') return lt1p;
  if (target.type === 'lt2') return lt2p;
  // 100 % LT2 = lt2Pace; 105 % means 5 % faster (÷1.05).
  if (target.type === 'percent_lt1') return mid(target) > 0 ? lt1p / (mid(target) / 100) : null;
  if (target.type === 'percent_lt2') return mid(target) > 0 ? lt2p / (mid(target) / 100) : null;
  if (target.type === 'percent_ftp') return mid(target) > 0 ? lt2p / (mid(target) / 100) : null;
  if (target.type === 'zone') {
    const z = Number(target.value) || 2;
    const pz = runningZones?.[`zone${z}`];
    if (pz && pz.min > 0) {
      const max = (pz.max != null && pz.max !== Infinity && pz.max > 0) ? pz.max : pz.min * 1.08;
      return (pz.min + max) / 2;
    }
    return [lt2p * 1.30, lt1p, lt2p * 1.04, lt2p, lt2p * 0.93][Math.min(z - 1, 4)];
  }
  return null;
}

/** Swim variant — sec/100m, using user.powerZones.swimming. */
function resolveTargetSwimPaceSecPer100m(target, ctx = {}) {
  const { lt1Swim = null, lt2Swim = null, swimmingZones = null } = ctx;
  const lt2p = lt2Swim || swimmingZones?.lt2 || null;
  if (!lt2p) return null;
  if (!target || target.type === 'open') return null;
  const mid = (t) => (t.useRange ? (Number(t.rangeMin) + Number(t.rangeMax)) / 2 : (Number(t.value) || 0));
  const lt1p = lt1Swim || swimmingZones?.lt1 || lt2p * 1.10;
  const pinned = Number(target.override);
  if (Number.isFinite(pinned) && pinned > 0) return pinned;
  if (target.type === 'lt1') return lt1p;
  if (target.type === 'lt2') return lt2p;
  if (target.type === 'percent_lt1') return mid(target) > 0 ? lt1p / (mid(target) / 100) : null;
  if (target.type === 'percent_lt2') return mid(target) > 0 ? lt2p / (mid(target) / 100) : null;
  if (target.type === 'percent_ftp') return mid(target) > 0 ? lt2p / (mid(target) / 100) : null;
  if (target.type === 'zone') {
    const z = Number(target.value) || 2;
    const pz = swimmingZones?.[`zone${z}`];
    if (pz && pz.min > 0) {
      const max = (pz.max != null && pz.max !== Infinity && pz.max > 0) ? pz.max : pz.min * 1.08;
      return (pz.min + max) / 2;
    }
    return [lt2p * 1.25, lt1p, lt2p * 1.04, lt2p, lt2p * 0.92][Math.min(z - 1, 4)];
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
  const out = [];
  let group = null;
  const flushGroup = () => {
    if (!group || !group.members.length) { group = null; return; }
    const repeat = Math.max(1, Number(group.repeat) || 1);
    for (let r = 0; r < repeat; r++) {
      for (const c of group.members) out.push({ ...c, isGroupHeader: false });
    }
    group = null;
  };
  for (const s of steps) {
    if (s.isGroupHeader) {
      // Header opens a new group — it IS the first member of that group.
      flushGroup();
      group = {
        id: s.groupId,
        repeat: s.groupRepeat || 1,
        members: [{ ...s }],
      };
      continue;
    }
    if (group && s.groupId && s.groupId === group.id) {
      group.members.push({ ...s });
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
    const meters = Math.round(Number(s.distanceMeters) || 0);
    const isDistance = s.durationType === 'distance' && meters > 0;
    const durationXml = isDistance
      ? `<Duration xsi:type="Distance_t"><Meters>${meters}</Meters></Duration>`
      : `<Duration xsi:type="Time_t"><Seconds>${dur}</Seconds></Duration>`;
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
        ${durationXml}
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
  resolveTargetPaceSecPerKm,
  resolveTargetSwimPaceSecPer100m,
};
