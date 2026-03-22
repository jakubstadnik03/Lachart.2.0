/**
 * LaChart – analýza laktátového testu: LT1/LT2 (heuristický protokol), kvalita, flagy, insighty.
 * Doplňuje existující calculateThresholds (polynom / D-max); nezávislý výstup pro UI a reporty.
 */

import { getEffectiveLactateInputMode, normalizeLactateSport } from '../../utils/lactateTestInputMode';

const MIN_STEPS = 4;
const LT2_TARGET_LA = 4.0;
const EPS = 1e-9;

function parseNum(v) {
  if (v == null || v === '') return NaN;
  return Number(String(v).replace(',', '.'));
}

/**
 * Seřadí kroky od nízké intenzity po vysokou (pro bike roste výkon; pro pace klesá čas/km;
 * pro speed roste km/h).
 */
export function sortStepsByIntensity(results, sport, inputMode = 'pace') {
  const isPace = sport === 'run' || sport === 'swim';
  const rows = (results || [])
    .map((r) => ({
      loadRaw: parseNum(r.power),
      lactate: parseNum(r.lactate),
      hr: r.heartRate != null ? parseNum(r.heartRate) : null,
      rpe: r.RPE != null ? parseNum(r.RPE) : null,
    }))
    .filter((r) => Number.isFinite(r.loadRaw) && Number.isFinite(r.lactate) && r.lactate > 0);

  if (isPace && inputMode === 'pace') {
    rows.sort((a, b) => b.loadRaw - a.loadRaw);
  } else if (isPace && inputMode === 'speed') {
    rows.sort((a, b) => a.loadRaw - b.loadRaw);
  } else {
    rows.sort((a, b) => a.loadRaw - b.loadRaw);
  }
  return rows;
}

/** Skóre zátěže monotónně roste s intenzitou (pro kontrolu protokolu). */
function computeMonotonicLoads(rows, sport, inputMode) {
  const isPace = sport === 'run' || sport === 'swim';
  return rows.map((r) => {
    if (sport === 'bike') return r.loadRaw;
    if (isPace && inputMode === 'speed') return r.loadRaw;
    return -r.loadRaw;
  });
}

/** Vyhlazení laktátu: krajní body beze změny, prostřední 0.25/0.5/0.25. */
export function smoothLactateWeighted(lactates) {
  const n = lactates.length;
  if (n === 0) return [];
  if (n <= 2) return [...lactates];
  const out = [...lactates];
  for (let i = 1; i < n - 1; i++) {
    out[i] = 0.25 * lactates[i - 1] + 0.5 * lactates[i] + 0.25 * lactates[i + 1];
  }
  return out;
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function confidenceLabel(score) {
  if (score > 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

/** targetY na ose y → x (např. La → load) */
function interpolateLinear(x0, y0, x1, y1, targetY) {
  if (Math.abs(y1 - y0) < EPS) return (x0 + x1) / 2;
  const t = (targetY - y0) / (y1 - y0);
  const clamped = Math.max(0, Math.min(1, t));
  return x0 + clamped * (x1 - x0);
}

/** y při cílovém x (např. HR při interpolovaném výkonu) */
function interpolateByX(x0, y0, x1, y1, xTarget) {
  if (Math.abs(x1 - x0) < EPS) return y0;
  return y0 + ((y1 - y0) / (x1 - x0)) * (xTarget - x0);
}

/**
 * Detekce LT2: první krok, kde deltaLa >= 1.5 a >= 2 * median(předchozích deltaLa).
 * Vrací index koncového kroku breakpointu (vyšší intenzita).
 */
function findLt2BreakpointIndex(lac, loads) {
  const deltas = [];
  for (let i = 1; i < lac.length; i++) {
    const deltaLac = lac[i] - lac[i - 1];
    const deltaLoad = loads[i] - loads[i - 1];
    const slope = Math.abs(deltaLoad) > EPS ? deltaLac / deltaLoad : NaN;
    deltas.push({ i, deltaLac, deltaLoad, slope });
  }
  for (let j = 0; j < deltas.length; j++) {
    const prev = deltas.slice(0, j).map((d) => d.deltaLac).filter((x) => Number.isFinite(x));
    const med = median(prev);
    const d = deltas[j].deltaLac;
    if (d >= 1.5 && d >= 2 * med + 0.01) return deltas[j].i;
    if (d >= 2.0) return deltas[j].i;
  }
  let bestJ = -1;
  let bestD = 0;
  for (let j = 0; j < deltas.length; j++) {
    if (deltas[j].deltaLac > bestD) {
      bestD = deltas[j].deltaLac;
      bestJ = deltas[j].i;
    }
  }
  return bestD >= 1.0 ? bestJ : -1;
}

function computeLt2(rows, lacRawA, lacRawB, breakpointEndIndex) {
  if (breakpointEndIndex < 1 || breakpointEndIndex >= rows.length) return null;
  const A = { ...rows[breakpointEndIndex - 1], lactate: lacRawA };
  const B = { ...rows[breakpointEndIndex], lactate: lacRawB };
  const la0 = A.lactate;
  const la1 = B.lactate;
  if (Math.abs(la1 - la0) < EPS) return null;
  let t = (LT2_TARGET_LA - la0) / (la1 - la0);
  t = Math.max(0, Math.min(1, t));
  const power = A.loadRaw + t * (B.loadRaw - A.loadRaw);
  let hr = null;
  if (A.hr != null && B.hr != null && Number.isFinite(A.hr) && Number.isFinite(B.hr)) {
    hr = A.hr + t * (B.hr - A.hr);
  } else {
    hr = B.hr ?? A.hr;
  }
  return {
    power,
    lactate: LT2_TARGET_LA,
    hr,
    method: 'breakpoint + 4.0 mmol interpolation',
    breakpointFromIndex: breakpointEndIndex - 1,
    breakpointToIndex: breakpointEndIndex,
  };
}

/** LT1: nízký baseline → první překročení baseline + 0.5 mmol (na vyhlazené křivce). */
function computeLt1Normal(rows, lac, baseline) {
  const thr = baseline + 0.5;
  for (let i = 0; i < lac.length; i++) {
    if (lac[i] >= thr - EPS) {
      if (i === 0) {
        return {
          power: rows[0].loadRaw,
          lactate: lac[0],
          hr: rows[0].hr,
          method: 'baseline + 0.5 mmol (first step)',
        };
      }
      const p = interpolateLinear(
        rows[i - 1].loadRaw,
        lac[i - 1],
        rows[i].loadRaw,
        lac[i],
        thr
      );
      const hr =
        rows[i - 1].hr != null && rows[i].hr != null
          ? interpolateByX(
              rows[i - 1].loadRaw,
              rows[i - 1].hr,
              rows[i].loadRaw,
              rows[i].hr,
              p
            )
          : rows[i].hr ?? rows[i - 1].hr;
      return {
        power: p,
        lactate: thr,
        hr,
        method: 'baseline + 0.5 mmol (interpolated)',
      };
    }
  }
  return null;
}

/** LT1: vysoký baseline → první významný růst nad min(prvních kroků)+0.3 s pokračujícím růstem. */
function computeLt1HighBaseline(rows, lac, nStable = 5) {
  const k = Math.min(nStable, rows.length);
  if (k < 2) return null;
  const block = lac.slice(0, k);
  const mn = Math.min(...block);
  const thr = mn + 0.3;
  for (let i = 0; i < lac.length - 1; i++) {
    if (lac[i] <= thr) continue;
    if (lac[i + 1] < lac[i] - 0.05) continue;
    let p;
    let laOut;
    if (i > 0 && lac[i - 1] < thr) {
      p = interpolateLinear(rows[i - 1].loadRaw, lac[i - 1], rows[i].loadRaw, lac[i], thr);
      laOut = thr;
    } else {
      p = rows[i].loadRaw;
      laOut = lac[i];
    }
    const hr =
      i > 0 && rows[i - 1].hr != null && rows[i].hr != null
        ? interpolateByX(rows[i - 1].loadRaw, rows[i - 1].hr, rows[i].loadRaw, rows[i].hr, p)
        : rows[i].hr ?? (i > 0 ? rows[i - 1].hr : null);
    return {
      power: p,
      lactate: laOut,
      hr,
      method: 'baseline-adjusted first rise (high baseline)',
    };
  }
  return null;
}

function computeSpeedZones(lt1Power, lt2Power, sport, inputMode) {
  const isPace = sport === 'run' || sport === 'swim';
  if (!isPace || inputMode !== 'speed') return null;
  if (!Number.isFinite(lt1Power) || !Number.isFinite(lt2Power) || lt2Power <= lt1Power) return null;
  return {
    z1: { speedMin: null, speedMax: lt1Power * 0.9 },
    z2: { speedMin: lt1Power * 0.9, speedMax: lt1Power },
    z3: { speedMin: lt1Power, speedMax: lt2Power * 0.95 },
    z4: { speedMin: lt2Power * 0.96, speedMax: lt2Power * 1.02 },
    z5: { speedMin: lt2Power, speedMax: null },
  };
}

function computeHrZones(lt1Hr, lt2Hr) {
  if (!Number.isFinite(lt1Hr) || !Number.isFinite(lt2Hr) || lt2Hr <= lt1Hr) return null;
  return {
    z1: { hrMin: null, hrMax: lt1Hr * 0.9 },
    z2: { hrMin: lt1Hr * 0.9, hrMax: lt1Hr },
    z3: { hrMin: lt1Hr, hrMax: lt2Hr * 0.95 },
    z4: { hrMin: lt2Hr * 0.96, hrMax: lt2Hr * 1.02 },
    z5: { hrMin: lt2Hr, hrMax: null },
    hrZonesConfidenceNote: 'lower_than_load',
  };
}

function buildInsights(flags, lt1, lt2, baselineLevel, loadOk, hrOk, validationErrors) {
  const insights = [];
  if (validationErrors.length) {
    insights.push(`Test validation: ${validationErrors.join('; ')}.`);
    return insights;
  }
  if (flags.highBaselineLactate) {
    insights.push('Baseline lactate is elevated, which may reduce LT1 accuracy.');
    insights.push('The athlete may not have been fully rested or recovered before testing.');
  }
  if (baselineLevel === 'elevated' && !flags.highBaselineLactate) {
    insights.push('Baseline lactate is slightly elevated compared to typical resting values.');
  }
  if (!loadOk) insights.push('Load does not increase strictly between all steps — check step order or data entry.');
  if (!hrOk) insights.push('Heart rate does not rise steadily; HR-based zones are less reliable.');
  if (flags.poorLt1Detectability) {
    insights.push('Lactate is nearly flat at the start while baseline is high — LT1 detectability is low.');
  }
  if (flags.sharpRise) {
    insights.push('A sharp lactate rise indicates a clear anaerobic breakpoint (LT2 region).');
  }
  if (lt1?.confidence === 'low') {
    insights.push('LT1 is estimated with reduced confidence — use easy training clearly below this estimate.');
  }
  if (lt2?.confidence === 'high') {
    insights.push('LT2 is well defined and suitable for threshold zone calculation.');
  } else if (lt2?.confidence === 'medium') {
    insights.push('LT2 is moderately supported by the curve — compare with RPE and other methods.');
  }
  if (!flags.highBaselineLactate && lt1?.confidence === 'high') {
    insights.push('Lactate rises progressively from a normal baseline — LT1 estimate is more reliable.');
  }
  return insights;
}

/**
 * Hlavní vstup: mockData jako u calculateThresholds (results, sport, baseLactate, inputMode).
 * @returns {object} ThresholdResult-like
 */
export function analyzeLactateTest(mockData) {
  const sport = normalizeLactateSport(mockData?.sport);
  const inputMode = getEffectiveLactateInputMode(mockData);
  const baseForm = mockData?.baseLactate != null ? parseNum(mockData.baseLactate) : null;

  const empty = {
    valid: false,
    validationErrors: [],
    baselineLactate: null,
    baselineLevel: null,
    flags: {
      highBaselineLactate: false,
      sharpRise: false,
      poorLt1Detectability: false,
    },
    loadMonotonicOk: true,
    hrMonotonicOk: true,
    lt1: null,
    lt2: null,
    zones: null,
    insights: [],
  };

  const results = mockData?.results;
  if (!results || !Array.isArray(results)) {
    return { ...empty, validationErrors: ['missing_results'] };
  }

  const rows = sortStepsByIntensity(results, sport, inputMode);
  if (rows.length < MIN_STEPS) {
    return {
      ...empty,
      validationErrors: [`need_at_least_${MIN_STEPS}_valid_steps`],
    };
  }

  const loads = computeMonotonicLoads(rows, sport, inputMode);
  let loadMonotonicOk = true;
  for (let i = 1; i < loads.length; i++) {
    if (loads[i] < loads[i - 1] - 1e-6) loadMonotonicOk = false;
  }

  let hrDips = 0;
  for (let i = 1; i < rows.length; i++) {
    const h0 = rows[i - 1].hr;
    const h1 = rows[i].hr;
    if (h0 != null && h1 != null && Number.isFinite(h0) && Number.isFinite(h1) && h1 < h0 - 3) {
      hrDips += 1;
    }
  }
  const hrMonotonicOk = hrDips <= 1;

  const lacRaw = rows.map((r) => r.lactate);
  const lac = smoothLactateWeighted(lacRaw);

  const baselineLactate =
    baseForm != null && Number.isFinite(baseForm) ? baseForm : lac[0];

  let baselineLevel = 'normal';
  if (baselineLactate >= 3.0) baselineLevel = 'very_high';
  else if (baselineLactate > 2.5) baselineLevel = 'high';
  else if (baselineLactate >= 1.8) baselineLevel = 'elevated';

  const highBaselineLactate = baselineLactate >= 2.5;

  const deltas = [];
  for (let i = 1; i < lac.length; i++) {
    const deltaLac = lac[i] - lac[i - 1];
    const deltaLoad = loads[i] - loads[i - 1];
    const slope = Math.abs(deltaLoad) > EPS ? deltaLac / deltaLoad : NaN;
    deltas.push({ deltaLac, deltaLoad, slope });
  }

  let sharpRise = false;
  for (let j = 0; j < deltas.length; j++) {
    const prevSlopes = deltas
      .slice(0, j)
      .map((d) => d.slope)
      .filter((s) => Number.isFinite(s) && s >= 0);
    const medS = median(prevSlopes);
    if (deltas[j].deltaLac >= 2.0) sharpRise = true;
    if (prevSlopes.length >= 2 && deltas[j].deltaLac >= 1.5 && deltas[j].deltaLac >= 2 * medS + 0.05) {
      sharpRise = true;
    }
  }

  const first4 = lac.slice(0, Math.min(4, lac.length));
  const flatStart =
    first4.length >= 3 && Math.max(...first4) - Math.min(...first4) < 0.4;
  const poorLt1Detectability = highBaselineLactate && flatStart;

  const flags = {
    highBaselineLactate,
    sharpRise,
    poorLt1Detectability,
  };

  const bpEnd = findLt2BreakpointIndex(lac, loads);
  let lt2Core =
    bpEnd >= 0
      ? computeLt2(
          rows,
          lacRaw[bpEnd - 1],
          lacRaw[bpEnd],
          bpEnd
        )
      : null;
  if (!lt2Core && lac.length >= 2) {
    const fallbackEnd = lac.length - 1;
    const prev = lac[fallbackEnd] - lac[fallbackEnd - 1];
    if (prev >= 0.5) {
      lt2Core = computeLt2(
        rows,
        lacRaw[fallbackEnd - 1],
        lacRaw[fallbackEnd],
        fallbackEnd
      );
      if (lt2Core) lt2Core.method = 'last segment + 4.0 mmol (fallback)';
    }
  }

  let lt1Core =
    highBaselineLactate
      ? computeLt1HighBaseline(rows, lac)
      : computeLt1Normal(rows, lac, baselineLactate);
  if (!lt1Core) {
    lt1Core = computeLt1Normal(rows, lac, Math.min(baselineLactate, lac[0]));
  }

  let lt1Score = 1.0;
  if (highBaselineLactate) lt1Score -= 0.35;
  if (poorLt1Detectability) lt1Score -= 0.2;
  const stepsBelowLt1 = lt1Core
    ? rows.findIndex((r) => r.loadRaw >= lt1Core.power - EPS)
    : rows.length;
  if (stepsBelowLt1 < 2) lt1Score -= 0.2;
  if (!loadMonotonicOk) lt1Score -= 0.1;
  if (!hrMonotonicOk) lt1Score -= 0.05;
  lt1Score = Math.max(0, Math.min(1, lt1Score));

  let lt2Score = 1.0;
  if (bpEnd < 0) lt2Score -= 0.25;
  const stepsAfterBp = bpEnd >= 0 ? lac.length - 1 - bpEnd : 0;
  if (stepsAfterBp < 2) lt2Score -= 0.15;
  if (!lt2Core) lt2Score = 0.35;
  lt2Score = Math.max(0, Math.min(1, lt2Score));

  const lt1 = lt1Core
    ? {
        power: lt1Core.power,
        hr: lt1Core.hr,
        lactate: lt1Core.lactate,
        confidence: confidenceLabel(lt1Score),
        method: lt1Core.method,
        score: lt1Score,
      }
    : null;

  const lt2 = lt2Core
    ? {
        power: lt2Core.power,
        hr: lt2Core.hr,
        lactate: lt2Core.lactate,
        confidence: confidenceLabel(lt2Score),
        method: lt2Core.method,
        score: lt2Score,
      }
    : null;

  let zones = null;
  if (lt1 && lt2) {
    const speedZ = computeSpeedZones(lt1.power, lt2.power, sport, inputMode);
    const hrZ = computeHrZones(lt1.hr, lt2.hr);
    if (speedZ || hrZ) {
      zones = {};
      if (speedZ) Object.assign(zones, speedZ);
      if (hrZ) Object.assign(zones, hrZ);
    }
  }

  const validationErrors = [];
  if (!loadMonotonicOk) validationErrors.push('non_monotonic_load');
  if (rows.length < MIN_STEPS) validationErrors.push('too_few_steps');

  const insights = buildInsights(
    flags,
    lt1,
    lt2,
    baselineLevel,
    loadMonotonicOk,
    hrMonotonicOk,
    validationErrors
  );

  return {
    valid: loadMonotonicOk && rows.length >= MIN_STEPS,
    validationErrors,
    baselineLactate,
    baselineLevel,
    flags,
    loadMonotonicOk,
    hrMonotonicOk,
    lt1,
    lt2,
    zones,
    insights,
    lt1ConfidenceScore: lt1Score,
    lt2ConfidenceScore: lt2Score,
  };
}
