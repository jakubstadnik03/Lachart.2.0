/**
 * ThresholdMethodPicker
 * ─────────────────────
 * Transparent side-by-side display of every LT1 / LT2 method LaChart
 * actually computed for this test, with a "pin" button so the tester
 * can lock the test to one specific method instead of trusting the
 * default ensemble median.
 *
 * Data source: the `thresholds` object produced by
 * DataTable.calculateThresholds(). That object already contains every
 * named method (`'OBLA 2.0'`, `'Bsln + 1.0'`, `'IAT'`, `'Log-log'`,
 * etc.) with its power/pace, heart rate and lactate value. We just
 * shape it into a comparison table — no recompute.
 *
 * Methodology popovers cite the original paper for each method so a
 * sport scientist can verify the implementation against the literature.
 */
import React, { useMemo, useState } from 'react';

// ── Reference card content for each method (citations + plain English) ──
const METHOD_INFO = {
  baseline: {
    title: 'Baseline + delta (Mader)',
    summary: 'LT1 is the power/pace at which blood lactate first rises by a fixed delta above the resting baseline — most commonly +1.0 mmol/L. Conservative aerobic threshold; insensitive to individual baseline drift across tests.',
    formula: 'LT1 = power where lactate(P) = baseline + 1.0 mmol/L',
    citation: 'Mader A, Heck H. A theory of the metabolic origin of "anaerobic threshold". Int J Sports Med. 1986; 7 Suppl 1: 45-65.',
  },
  obla: {
    title: 'OBLA (Onset of Blood Lactate Accumulation)',
    summary: 'A fixed-lactate threshold. OBLA 2.0 mmol/L is a common LT1 proxy; OBLA 4.0 is the classical LT2 / anaerobic threshold. Lab-standard but ignores individual variation in baseline.',
    formula: 'Threshold = power where lactate(P) = target (2.0 or 4.0 mmol/L), via linear interpolation between stages.',
    citation: 'Sjödin B, Jacobs I. Onset of blood lactate accumulation and marathon running performance. Int J Sports Med. 1981; 2(1): 23-26.',
  },
  loglog: {
    title: 'Log-log breakpoint',
    summary: 'Two-segment linear regression in log-log space (log power vs log lactate). The breakpoint between segments is taken as LT2. Less affected by absolute lactate magnitude than D-max.',
    formula: 'breakpoint of two-segment linear regression on (log P, log La)',
    citation: 'Beaver WL, Wasserman K, Whipp BJ. Improved detection of lactate threshold during exercise using a log-log transformation. J Appl Physiol. 1985; 59(6): 1936-1940.',
  },
  iat: {
    title: 'Individual Anaerobic Threshold (Dickhuth)',
    summary: 'LT2 = the power at which lactate equals lactate(LT1) + 1.5 mmol/L. Individualised because it starts from the athlete\'s own LT1 instead of a fixed lactate value.',
    formula: 'LT2 = power where lactate(P) = lactate(LT1) + 1.5 mmol/L',
    citation: 'Dickhuth HH, Yin L, Niess A, et al. Ventilatory, lactate-derived and catecholamine thresholds during incremental treadmill running. Int J Sports Med. 1999; 20(2).',
  },
  modifiedDmax: {
    title: 'Modified D-max',
    summary: 'Reference chord drawn from LT1 (or the lactate minimum) to the last data point; LT2 = point on the polynomial fit with maximum perpendicular distance from the chord.',
    formula: 'LT2 = argmax_P |fit(P) − chord(P)| / √(1 + slope²)',
    citation: 'Cheng B, Kuipers H, Snyder AC, et al. A new approach for the determination of ventilatory and lactate thresholds. Int J Sports Med. 1992; 13(7): 518-522.',
  },
  classicDmax: {
    title: 'Classic D-max',
    summary: 'Reference chord drawn from the FIRST data point to the LAST; LT2 = point of maximum perpendicular distance. Original D-max definition — does NOT skip the lactate minimum / dip.',
    formula: 'LT2 = argmax_P |fit(P) − chord_classic(P)| / √(1 + slope²)',
    citation: 'Cheng B, Kuipers H, Snyder AC, et al. Int J Sports Med. 1992; 13(7): 518-522.',
  },
  ensemble: {
    title: 'Ensemble (LaChart default)',
    summary: 'Weighted median of the methods below. Robust against single-method pathologies on noisy data — recommended for routine reporting. The individual methods are shown here so you can audit.',
    formula: 'median(method values), with outlier rejection for "first-50% lactate dip" and "explosive finish" curves.',
    citation: 'Composite — see individual method citations above.',
  },
};

function MethodInfoPopover({ method, onClose }) {
  const info = METHOD_INFO[method] || METHOD_INFO.ensemble;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-base font-bold text-gray-900">{info.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 -mt-1 -mr-1 text-2xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed mb-3">{info.summary}</p>
        <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Formula</div>
          <div className="text-xs font-mono text-gray-800 leading-relaxed">{info.formula}</div>
        </div>
        <div className="text-[11px] text-gray-500 leading-relaxed">
          <span className="font-bold text-gray-700">Reference: </span>{info.citation}
        </div>
      </div>
    </div>
  );
}

// ── Format helpers ──
function fmtPowerOrPace(value, isPace) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  if (isPace) {
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, '0')}/km`;
  }
  return `${Math.round(v)} W`;
}

function fmtLactate(la) {
  if (la == null || !Number.isFinite(Number(la))) return null;
  return `${Number(la).toFixed(2)} mmol/L`;
}

function fmtHr(hr) {
  if (hr == null || !Number.isFinite(Number(hr))) return null;
  return `${Math.round(Number(hr))} bpm`;
}

/**
 * Inverse interpolation: given a target lactate value, find the power
 * (or pace seconds) on the measured curve where lactate hits that
 * target. Used as a fallback for fixed-lactate methods (OBLA 4.0,
 * Bsln + N) when DataTable's `thresholds` object doesn't include the
 * named entry — DataTable only auto-computes targets up to OBLA 3.5,
 * so OBLA 4.0 has to be reconstructed here when the athlete's curve
 * actually crosses 4 mmol/L.
 *
 * Returns null if the curve never reaches the target (athlete didn't
 * push past that lactate level).
 */
function interpolatePowerAtLactate(results, targetLa, isPace) {
  if (!Array.isArray(results) || results.length < 2 || targetLa == null) return null;
  const valid = results
    .filter((r) => Number.isFinite(Number(r?.power)) && Number.isFinite(Number(r?.lactate)))
    .map((r) => ({ power: Number(r.power), lactate: Number(r.lactate) }));
  if (valid.length < 2) return null;
  // Sort by hardness (ascending lactate generally follows ascending power
  // for bike, descending pace seconds for run/swim).
  const sorted = [...valid].sort((a, b) => isPace ? b.power - a.power : a.power - b.power);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const lo = Math.min(a.lactate, b.lactate), hi = Math.max(a.lactate, b.lactate);
    if (targetLa >= lo && targetLa <= hi && a.lactate !== b.lactate) {
      const t = (targetLa - a.lactate) / (b.lactate - a.lactate);
      return a.power + t * (b.power - a.power);
    }
  }
  return null; // curve didn't cross the target
}

// Interpolate lactate at a given power from the raw test stages. Used
// when `thresholds.lactates[methodName]` doesn't have the value (e.g.
// log-log + IAT compute power directly without storing lactate).
function interpolateLactateAt(results, targetPower, isPace) {
  if (!Array.isArray(results) || results.length === 0 || targetPower == null) return null;
  const valid = results
    .filter((r) => Number.isFinite(Number(r?.power)) && Number.isFinite(Number(r?.lactate)))
    .map((r) => ({ power: Number(r.power), lactate: Number(r.lactate), heartRate: r.heartRate != null ? Number(r.heartRate) : null }));
  if (valid.length < 2) return null;
  // For pace sports, lower power = harder = higher lactate, so sort ascending
  // by hardness regardless (we just need monotonic order for interpolation).
  const sorted = [...valid].sort((a, b) => isPace ? b.power - a.power : a.power - b.power);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const lo = Math.min(a.power, b.power), hi = Math.max(a.power, b.power);
    if (targetPower >= lo && targetPower <= hi && a.power !== b.power) {
      const t = (targetPower - a.power) / (b.power - a.power);
      return a.lactate + t * (b.lactate - a.lactate);
    }
  }
  // Past the end of the range — return nearest stage's lactate
  const nearest = sorted.reduce((best, p) =>
    Math.abs(p.power - targetPower) < Math.abs(best.power - targetPower) ? p : best
  );
  return nearest.lactate;
}

function interpolateHrAt(results, targetPower, isPace) {
  if (!Array.isArray(results) || results.length === 0 || targetPower == null) return null;
  const valid = results
    .filter((r) => Number.isFinite(Number(r?.power)) && r?.heartRate != null && Number.isFinite(Number(r.heartRate)))
    .map((r) => ({ power: Number(r.power), heartRate: Number(r.heartRate) }));
  if (valid.length < 2) return null;
  const sorted = [...valid].sort((a, b) => isPace ? b.power - a.power : a.power - b.power);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const lo = Math.min(a.power, b.power), hi = Math.max(a.power, b.power);
    if (targetPower >= lo && targetPower <= hi && a.power !== b.power) {
      const t = (targetPower - a.power) / (b.power - a.power);
      return a.heartRate + t * (b.heartRate - a.heartRate);
    }
  }
  const nearest = sorted.reduce((best, p) =>
    Math.abs(p.power - targetPower) < Math.abs(best.power - targetPower) ? p : best
  );
  return nearest.heartRate;
}

/**
 * Build a per-method "point" from the named entry in `thresholds`.
 * Returns { power, lactate, heartRate } or null if the method wasn't
 * computed (entry missing or NaN).
 */
function pickMethodPoint(thresholds, key, results, isPace, fallbackLactate = null) {
  if (!thresholds) return null;
  const raw = thresholds[key];
  const power = Number(raw);
  if (!Number.isFinite(power) || power <= 0) return null;
  // Lactate: try thresholds.lactates first; otherwise interpolate from stages.
  let lactate = thresholds.lactates?.[key];
  if (lactate == null || !Number.isFinite(Number(lactate))) {
    lactate = fallbackLactate != null ? fallbackLactate : interpolateLactateAt(results, power, isPace);
  }
  // HR: try thresholds.heartRates; otherwise interpolate.
  let heartRate = thresholds.heartRates?.[key];
  if (heartRate == null || !Number.isFinite(Number(heartRate))) {
    heartRate = interpolateHrAt(results, power, isPace);
  }
  return {
    power,
    lactate: lactate != null && Number.isFinite(Number(lactate)) ? Number(lactate) : null,
    heartRate: heartRate != null && Number.isFinite(Number(heartRate)) ? Number(heartRate) : null,
  };
}

/**
 * Props:
 *   mockData         — the test document (sport + baseLactate + results)
 *   thresholds       — the full thresholds object from DataTable.calculateThresholds()
 *                      (every named method entry, plus heartRates/lactates sub-objects)
 *   currentOverride  — { LTP1, LTP2, LTP1_lactate, LTP2_lactate }
 *   onPinMethod      — called with { LTP1, LTP2, LTP1_lactate, LTP2_lactate, methodKey }
 *   onClearOverride  — called when "Ensemble" is picked again
 *   defaultExpanded  — open the panel on mount (default: false / collapsed)
 */
export default function ThresholdMethodPicker({
  mockData,
  thresholds,
  currentOverride = null,
  onPinMethod = null,
  onClearOverride = null,
  defaultExpanded = false,
  // `compact` (2026-05): collapse the fat 80px header strip into a single
  // chip-sized button that sits inline with the other "Pre-test training"
  // / "Test coach" toggles. Used by LactateCurveCalculator on test-detail
  // view so the row of toggles takes one line instead of three.
  compact = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [infoMethod, setInfoMethod] = useState(null);

  const sport = String(mockData?.sport || 'bike').toLowerCase();
  const isPace = sport.includes('run') || sport.includes('swim') || sport === 'running' || sport === 'swimming';
  // Stable references for useMemo deps below.
  const results = useMemo(
    () => Array.isArray(mockData?.results) ? mockData.results : [],
    [mockData?.results],
  );
  const baseLactate = Number(mockData?.baseLactate);

  // Build the per-method candidates from the thresholds object. Each is
  // either { power, lactate, heartRate } or null when the method wasn't
  // computed for this test (e.g. OBLA 4.0 when peak lactate stayed below 4).
  const rows = useMemo(() => {
    if (!thresholds) return [];

    const ensemble = pickMethodPoint(thresholds, 'LTP1', results, isPace);
    const ensembleLt2 = pickMethodPoint(thresholds, 'LTP2', results, isPace);

    // LT1 candidates with their canonical fallback-lactate values
    const baseFB = Number.isFinite(baseLactate) ? baseLactate : null;
    const lt1Candidates = {
      'Bsln + 0.5': pickMethodPoint(thresholds, 'Bsln + 0.5', results, isPace, baseFB != null ? baseFB + 0.5 : null),
      'Bsln + 1.0': pickMethodPoint(thresholds, 'Bsln + 1.0', results, isPace, baseFB != null ? baseFB + 1.0 : null),
      'OBLA 2.0':   pickMethodPoint(thresholds, 'OBLA 2.0',   results, isPace, 2.0),
      'OBLA 2.5':   pickMethodPoint(thresholds, 'OBLA 2.5',   results, isPace, 2.5),
    };
    // LT2 candidates. DataTable's auto-computed OBLA targets stop at 3.5,
    // so OBLA 4.0 (the classical anaerobic threshold) typically isn't in
    // the `thresholds` object. Fall back to direct inverse interpolation
    // on the raw stages if the athlete's curve actually crosses 4 mmol/L.
    const obla4Fallback = (() => {
      const existing = pickMethodPoint(thresholds, 'OBLA 4.0', results, isPace, 4.0);
      if (existing) return existing;
      const power = interpolatePowerAtLactate(results, 4.0, isPace);
      if (power == null) return null;
      return {
        power,
        lactate: 4.0,
        heartRate: interpolateHrAt(results, power, isPace),
      };
    })();

    const lt2Candidates = {
      'OBLA 3.0':   pickMethodPoint(thresholds, 'OBLA 3.0', results, isPace, 3.0),
      'OBLA 3.5':   pickMethodPoint(thresholds, 'OBLA 3.5', results, isPace, 3.5),
      'OBLA 4.0':   obla4Fallback,
      'Bsln + 1.5': pickMethodPoint(thresholds, 'Bsln + 1.5', results, isPace, baseFB != null ? baseFB + 1.5 : null),
      'IAT':        pickMethodPoint(thresholds, 'IAT',      results, isPace),
      'Log-log':    pickMethodPoint(thresholds, 'Log-log',  results, isPace),
    };

    // Pairings: each table row is (LT1 method, LT2 method). The first row
    // is always the ensemble. Subsequent rows pair a sensible LT1 method
    // with each available LT2 method. Rows with both halves null are
    // dropped at render time.
    const out = [
      {
        key: 'ensemble',
        label: 'Ensemble (default)',
        lt1: ensemble,
        lt2: ensembleLt2,
        lt1MethodKey: 'ensemble',
        lt2MethodKey: 'ensemble',
        isDefault: true,
      },
      // Pairings: each row picks one LT1 method + one LT2 method that are
      // both classically-defined upper-/lower-bound thresholds. We
      // deliberately do NOT pair Mader with Log-log or IAT here:
      //   • Log-log (Beaver 1985) is conceptually an LT1-equivalent
      //     marker — the inflection-in-log-space falls in the aerobic
      //     region, not the high-intensity region.
      //   • IAT in this codebase returns the measured stage with
      //     maximum lactate slope, which for pace tests often sits
      //     below LT1. The sanity-check below also drops any row whose
      //     LT2 value isn't actually harder than its LT1 value.
      { key: 'mader-obla4',    label: 'Mader (Bsln + 1.0)  /  OBLA 4.0', lt1: lt1Candidates['Bsln + 1.0'], lt2: lt2Candidates['OBLA 4.0'], lt1MethodKey: 'baseline', lt2MethodKey: 'obla' },
      { key: 'mader-obla35',   label: 'Mader (Bsln + 1.0)  /  OBLA 3.5', lt1: lt1Candidates['Bsln + 1.0'], lt2: lt2Candidates['OBLA 3.5'], lt1MethodKey: 'baseline', lt2MethodKey: 'obla' },
      { key: 'mader-bsln15',   label: 'Mader (Bsln + 1.0)  /  Bsln + 1.5', lt1: lt1Candidates['Bsln + 1.0'], lt2: lt2Candidates['Bsln + 1.5'], lt1MethodKey: 'baseline', lt2MethodKey: 'baseline' },
      { key: 'obla2-obla4',    label: 'OBLA 2.0  /  OBLA 4.0',           lt1: lt1Candidates['OBLA 2.0'],   lt2: lt2Candidates['OBLA 4.0'], lt1MethodKey: 'obla',     lt2MethodKey: 'obla' },
      { key: 'obla2-obla35',   label: 'OBLA 2.0  /  OBLA 3.5',           lt1: lt1Candidates['OBLA 2.0'],   lt2: lt2Candidates['OBLA 3.5'], lt1MethodKey: 'obla',     lt2MethodKey: 'obla' },
      { key: 'bsln05-bsln15',  label: 'Bsln + 0.5  /  Bsln + 1.5',       lt1: lt1Candidates['Bsln + 0.5'], lt2: lt2Candidates['Bsln + 1.5'], lt1MethodKey: 'baseline', lt2MethodKey: 'baseline' },
    ];
    return out;
  }, [thresholds, results, isPace, baseLactate]);

  // No data → render a quiet placeholder so the panel doesn't disappear
  // (and so users learn the feature exists).
  if (!rows || rows.length === 0) return null;

  // Sanity-check each row before showing it:
  //   • Drop rows with neither half populated (nothing to display).
  //   • Drop rows where LT2 isn't actually a higher intensity than LT1.
  //     For bike that means LT2_watts > LT1_watts; for pace it means
  //     LT2_seconds < LT1_seconds (lower pace = faster = harder).
  //     This silently hides nonsensical pairings — e.g. "Mader / Log-log"
  //     for a pace test where Log-log + IAT happen to land in the
  //     LT1 region (Beaver-style breakpoint, not OBLA-style high-end
  //     marker). Better to show fewer correct rows than confuse the user
  //     with rows that say "LT2 = 4:00/km" when LT1 is already 3:53/km.
  const lt2HigherThanLt1 = (row) => {
    if (row.isDefault) return true; // always trust the ensemble
    if (!row.lt1 || !row.lt2) return true; // single-side rows pass through
    const margin = isPace ? 1 : 1; // 1 second / 1 watt tolerance
    if (isPace) return row.lt2.power < row.lt1.power - margin; // lower seconds = harder
    return row.lt2.power > row.lt1.power + margin;
  };
  const visibleRows = rows
    .filter((r) => r.lt1 || r.lt2)
    .filter(lt2HigherThanLt1);
  if (visibleRows.length === 0) return null;

  const isPinned = currentOverride && (currentOverride.LTP1 != null || currentOverride.LTP2 != null);

  // A row is "active" when the override matches its LT1 + LT2 values
  // within ~1 W / 1 second (rounding tolerance).
  const matchesMethod = (row) => {
    if (row.isDefault) return !isPinned;
    if (!isPinned) return false;
    const lt1Match = row.lt1 && currentOverride.LTP1 != null &&
      Math.abs(Number(currentOverride.LTP1) - row.lt1.power) < 1.5;
    const lt2Match = row.lt2 && currentOverride.LTP2 != null &&
      Math.abs(Number(currentOverride.LTP2) - row.lt2.power) < 1.5;
    if (row.lt1 && row.lt2) return lt1Match && lt2Match;
    if (row.lt1) return lt1Match;
    if (row.lt2) return lt2Match;
    return false;
  };
  const activeRow = visibleRows.find(matchesMethod);

  const handlePick = (row) => {
    if (row.isDefault) {
      if (onClearOverride) onClearOverride();
      return;
    }
    if (!onPinMethod) return;
    onPinMethod({
      LTP1: row.lt1?.power ?? null,
      LTP2: row.lt2?.power ?? null,
      LTP1_lactate: row.lt1?.lactate ?? null,
      LTP2_lactate: row.lt2?.lactate ?? null,
      methodKey: row.key,
    });
  };

  // Header summary string for the collapsed state. Shows the currently
  // active row's name so the user knows which method is in effect
  // without expanding the panel.
  const activeLabel = activeRow ? activeRow.label : 'Ensemble (default)';

  return (
    <div className={
      compact
        // In compact mode we drop the card chrome around the header (the
        // parent already provides the row container). Body still gets the
        // card look when expanded, see below.
        ? ''
        : 'bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden'
    }>
      {compact ? (
        // Chip-sized toggle — matches the visual weight of the sibling
        // "Pre-test training" / "Test coach" chips so they line up cleanly.
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            expanded
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
          }`}
          title={`Active method: ${activeLabel}`}
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? '' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Threshold methods
        </button>
      ) : (
        /* Original fat header — always visible. Tap to expand. */
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900">
              Threshold methods
              <span className="ml-2 text-[11px] font-medium text-gray-500">
                · active: <span className="font-semibold text-gray-700">{activeLabel}</span>
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
              All candidates LaChart computes from this test. Tap to compare and optionally pin one.
            </div>
          </div>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {expanded && (
        <div className={
          compact
            // In compact mode the outer wrapper is bare, so the body needs
            // its own card chrome. Adds a small top margin so it visually
            // detaches from the chip row above. Matches the "Pre-test
            // training" / "Test coach" body styling.
            ? 'mt-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5'
            : 'px-4 sm:px-5 pb-4'
        }>
          {compact && (
            <div className="text-[11px] text-gray-500 mb-3 leading-snug">
              All candidates LaChart computes from this test · active: <strong className="text-gray-700">{activeLabel}</strong>. Tap a row to compare and optionally pin one.
            </div>
          )}
          {/* Header row */}
          <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2 mb-1 mt-2">
            <div className="col-span-1">Pick</div>
            <div className="col-span-5">Method</div>
            <div className="col-span-3">LT1</div>
            <div className="col-span-2">LT2</div>
            <div className="col-span-1 text-right">Info</div>
          </div>

          <div className="space-y-1.5">
            {visibleRows.map((row) => {
              const active = matchesMethod(row);
              return (
                <div
                  key={row.key}
                  onClick={() => handlePick(row)}
                  className={`grid grid-cols-1 sm:grid-cols-12 gap-2 items-center px-2 sm:px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                    active
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="sm:col-span-1 flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      active ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'
                    }`}>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <div className="sm:col-span-5 text-xs font-semibold text-gray-800 leading-tight">
                    {row.label}
                    {row.isDefault && <span className="ml-1 text-[9px] font-bold uppercase text-emerald-700">default</span>}
                  </div>

                  <div className="sm:col-span-3 text-xs">
                    {row.lt1 ? (
                      <>
                        <div className="font-bold text-gray-900 tabular-nums leading-tight">
                          {fmtPowerOrPace(row.lt1.power, isPace) ?? '—'}
                        </div>
                        <div className="text-[10px] text-gray-500 tabular-nums leading-tight">
                          {[fmtLactate(row.lt1.lactate), fmtHr(row.lt1.heartRate)].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </div>

                  <div className="sm:col-span-2 text-xs">
                    {row.lt2 ? (
                      <>
                        <div className="font-bold text-gray-900 tabular-nums leading-tight">
                          {fmtPowerOrPace(row.lt2.power, isPace) ?? '—'}
                        </div>
                        <div className="text-[10px] text-gray-500 tabular-nums leading-tight">
                          {[fmtLactate(row.lt2.lactate), fmtHr(row.lt2.heartRate)].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </div>

                  <div className="sm:col-span-1 flex items-center justify-end gap-1 flex-shrink-0">
                    {row.lt1MethodKey && row.lt1MethodKey !== 'ensemble' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setInfoMethod(row.lt1MethodKey); }}
                        className="w-5 h-5 rounded-full border border-gray-300 text-[9px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        title="LT1 method info"
                      >
                        i
                      </button>
                    )}
                    {row.lt2MethodKey && row.lt2MethodKey !== 'ensemble' && row.lt2MethodKey !== row.lt1MethodKey && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setInfoMethod(row.lt2MethodKey); }}
                        className="w-5 h-5 rounded-full border border-gray-300 text-[9px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        title="LT2 method info"
                      >
                        i
                      </button>
                    )}
                    {row.isDefault && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setInfoMethod('ensemble'); }}
                        className="w-5 h-5 rounded-full border border-gray-300 text-[9px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        title="How is the ensemble computed?"
                      >
                        i
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer: methodology references */}
          <div className="mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-500 leading-relaxed">
            <span className="font-semibold text-gray-600">Methodology refs:</span>
            {' '}Cheng 1992 (Dmax) · Mader 1986 (baseline) · Sjödin 1981 (OBLA) · Beaver 1985 (log-log) · Dickhuth 1999 (IAT).
            {' '}Pin a method to override the ensemble default for this test only.
          </div>
        </div>
      )}

      {infoMethod && (
        <MethodInfoPopover method={infoMethod} onClose={() => setInfoMethod(null)} />
      )}
    </div>
  );
}
