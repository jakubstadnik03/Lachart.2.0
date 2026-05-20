/**
 * ThresholdMethodPicker
 * ─────────────────────
 * Transparent side-by-side display of every LT1 / LT2 method LaChart
 * computes internally, with a radio-button "pin" so the tester can lock
 * the test to one specific method instead of trusting the default
 * ensemble median.
 *
 * Why this exists: sport scientists (e.g. accredited test centres) need
 * to see WHICH method produced the threshold, not just the final number.
 * The internal ensemble (median of Modified Dmax + OBLA 2.0 + Baseline+1
 * for LT1; D-max + Modified D-max + OBLA 4.0 + log-log + IAT + segmented
 * for LT2) is robust against single-method pathologies, but a domain
 * expert may prefer to pin a specific method that matches their lab's
 * established protocol.
 *
 * Mechanism: pinning a method writes through the existing
 * `thresholdOverrides` document field (the same place manual overrides
 * land). Plain English: the picker just pre-fills the override with the
 * value from method X and saves it — no new server endpoint needed.
 *
 * Cited references appear in the methodology popover so the user can
 * verify each method against its source paper.
 */
import React, { useMemo, useState } from 'react';
import { computeLactateThresholds } from './lactateThresholdSegmented';

// Inline reference card content for each method. Kept here (not in a
// separate i18n file) so the citation is right next to the implementation
// — when an algorithm gets refined, the docstring stays in sync.
const METHOD_INFO = {
  baseline: {
    title: 'Baseline + 1.0 mmol/L (Mader)',
    summary: 'LT1 = the power/pace at which blood lactate first rises 1.0 mmol/L above the resting baseline. Conservative aerobic threshold.',
    formula: 'LT1 = power where lactate(P) = baseline + 1.0 mmol/L',
    citation: 'Mader A, Heck H. A theory of the metabolic origin of "anaerobic threshold". Int J Sports Med. 1986; 7 Suppl 1: 45-65.',
  },
  segmented: {
    title: 'Segmented regression (two-breakpoint)',
    summary: 'Fits a piecewise-linear lactate curve with two break points; the first is LT1, the second is LT2. Captures the inflexion explicitly rather than via a fixed lactate value.',
    formula: 'min over (b₁, b₂) of Σ residuals² for La = β₀ + β₁·P + β₂·max(0, P−b₁) + β₃·max(0, P−b₂)',
    citation: 'Implementation: piecewise linear least-squares on isotonic-regressed lactate. Domain reference: Beaver WL et al. J Appl Physiol. 1985; 59(6).',
  },
  modifiedDmax: {
    title: 'Modified D-max',
    summary: 'For LT2: reference chord drawn from LT1 (or the lactate minimum) to the last data point; LT2 = point on the polynomial fit with maximum perpendicular distance from the chord.',
    formula: 'LT2 = argmax_P |fit(P) − chord(P)| / √(1 + slope²)',
    citation: 'Cheng B, Kuipers H, Snyder AC, et al. A new approach for the determination of ventilatory and lactate thresholds. Int J Sports Med. 1992; 13(7): 518-522.',
  },
  dmax: {
    title: 'Classic D-max',
    summary: 'Reference chord drawn from the FIRST data point to the LAST; LT2 = point of maximum perpendicular distance. Original D-max definition (no minimum-skip).',
    formula: 'LT2 = argmax_P |fit(P) − chord_classic(P)| / √(1 + slope²)',
    citation: 'Cheng B, Kuipers H, Snyder AC, et al. Int J Sports Med. 1992; 13(7): 518-522.',
  },
  obla: {
    title: 'OBLA 4.0 mmol/L',
    summary: 'Onset of Blood Lactate Accumulation at the fixed lactate value of 4 mmol/L. Classic running/cycling LT2 definition; lab-standard but ignores individual variation in baseline.',
    formula: 'LT2 = power where lactate(P) = 4.0 mmol/L (linear interpolation between adjacent stages)',
    citation: 'Sjödin B, Jacobs I. Onset of blood lactate accumulation and marathon running performance. Int J Sports Med. 1981; 2(1): 23-26.',
  },
  loglog: {
    title: 'Log-log breakpoint',
    summary: 'Two-segment linear fit in log-log space (log power vs log lactate). The breakpoint between segments is taken as LT2. Less affected by absolute lactate magnitude.',
    formula: 'breakpoint of two-segment linear regression on (log P, log La)',
    citation: 'Beaver WL, Wasserman K, Whipp BJ. Improved detection of lactate threshold during exercise using a log-log transformation. J Appl Physiol. 1985; 59(6): 1936-1940.',
  },
  iat: {
    title: 'Individual Anaerobic Threshold (Dickhuth)',
    summary: 'LT2 = LT1 + 1.5 mmol/L. Individualised because it starts from the athlete\'s own LT1 instead of a fixed lactate value.',
    formula: 'LT2 = power where lactate(P) = lactate(LT1) + 1.5 mmol/L',
    citation: 'Dickhuth HH, Yin L, Niess A, et al. Ventilatory, lactate-derived and catecholamine thresholds during incremental treadmill running. Int J Sports Med. 1999; 20(2).',
  },
  ensemble: {
    title: 'Ensemble (LaChart default)',
    summary: 'Weighted median of the methods above. Robust against single-method pathologies on noisy data — recommended for routine reporting. The individual methods are still shown here so you can audit.',
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

/**
 * Interpolate lactate at a given power on the raw stage data. Same logic
 * the main DataTable uses — we re-implement here so this component can
 * stand alone without importing the big DataTable.
 */
function interpolateLactate(points, targetPower, isPace = false) {
  if (!points || points.length === 0 || targetPower == null) return null;
  const sorted = [...points].sort((a, b) => isPace ? Number(b.power) - Number(a.power) : Number(a.power) - Number(b.power));
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const pa = Number(a.power), pb = Number(b.power);
    const lo = Math.min(pa, pb), hi = Math.max(pa, pb);
    if (targetPower >= lo && targetPower <= hi && pa !== pb) {
      const la = Number(a.lactate), lb = Number(b.lactate);
      return la + (lb - la) * (targetPower - pa) / (pb - pa);
    }
  }
  // Extrapolate to nearest
  const nearest = sorted.reduce((best, p) =>
    Math.abs(Number(p.power) - targetPower) < Math.abs(Number(best.power) - targetPower) ? p : best
  );
  return Number(nearest.lactate);
}

/** Same idea for heart rate. */
function interpolateHR(points, targetPower, isPace = false) {
  if (!points || points.length === 0 || targetPower == null) return null;
  const sorted = [...points].sort((a, b) => isPace ? Number(b.power) - Number(a.power) : Number(a.power) - Number(b.power));
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const pa = Number(a.power), pb = Number(b.power);
    const lo = Math.min(pa, pb), hi = Math.max(pa, pb);
    if (targetPower >= lo && targetPower <= hi && pa !== pb) {
      const ha = a.heartRate != null ? Number(a.heartRate) : null;
      const hb = b.heartRate != null ? Number(b.heartRate) : null;
      if (ha == null || hb == null) return ha ?? hb;
      return ha + (hb - ha) * (targetPower - pa) / (pb - pa);
    }
  }
  const nearest = sorted.reduce((best, p) =>
    Math.abs(Number(p.power) - targetPower) < Math.abs(Number(best.power) - targetPower) ? p : best
  );
  return nearest.heartRate != null ? Number(nearest.heartRate) : null;
}

/** Format power/pace value for the user-visible card. */
function fmtPowerOrPace(value, isPace) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (isPace) {
    // value is seconds per km (running) or per 100m (swimming) — show MM:SS
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${Math.round(value)} W`;
}

function fmtLactate(la) {
  if (la == null || !Number.isFinite(la)) return '—';
  return `${la.toFixed(2)} mmol/L`;
}

function fmtHr(hr) {
  if (hr == null || !Number.isFinite(hr)) return '—';
  return `${Math.round(hr)} bpm`;
}

/**
 * Props:
 *   mockData         — the test document (results + sport + baseLactate + …)
 *   ensembleLT1      — the LT1 watts/pace currently displayed by the main
 *                      threshold panel (so we can mark which row is active)
 *   ensembleLT2      — same for LT2
 *   currentOverride  — { LTP1, LTP2, LTP1_lactate, LTP2_lactate } so we
 *                      know if a method is already pinned
 *   onPinMethod      — called with { LTP1, LTP2, LTP1_lactate, LTP2_lactate }
 *                      when the user picks a method. Caller saves to server.
 *   onClearOverride  — called when the user picks "Ensemble" — caller
 *                      should clear the override (back to default).
 */
export default function ThresholdMethodPicker({
  mockData,
  ensembleLT1 = null,
  ensembleLT2 = null,
  currentOverride = null,
  onPinMethod = null,
  onClearOverride = null,
  unitLabel = 'W', // 'W' for cycling, 'pace' for run/swim
}) {
  const [infoMethod, setInfoMethod] = useState(null); // which method's ⓘ is open

  const sport = String(mockData?.sport || 'bike').toLowerCase();
  const isPace = sport.includes('run') || sport.includes('swim');

  // Recompute the candidates from raw stage data so the picker is
  // self-contained and doesn't depend on the giant DataTable plumbing.
  const candidates = useMemo(() => {
    const results = Array.isArray(mockData?.results) ? mockData.results : [];
    const points = results
      .map((r) => ({ power: Number(r.power), lactate: Number(r.lactate), heartRate: r.heartRate != null ? Number(r.heartRate) : null }))
      .filter((p) => Number.isFinite(p.power) && Number.isFinite(p.lactate));
    if (points.length < 3) return null;

    try {
      const segResult = computeLactateThresholds(points, {
        smooth: false,
        bootstrap: false,
        isPace,
        baseLactate: Number(mockData?.baseLactate) || null,
        maxLactate: Number(mockData?.maxLactate) || null,
        stageDurationSec: Number(mockData?.stageDurationSec) || null,
      });

      // Internal values are sign-flipped for pace; flip back for display.
      const xUnsign = (v) => (v == null ? null : (isPace ? -v : v));

      const make = (rawPower) => {
        const power = xUnsign(rawPower);
        if (power == null || !Number.isFinite(power)) return null;
        return {
          power,
          lactate: interpolateLactate(points, power, isPace),
          heartRate: interpolateHR(points, power, isPace),
        };
      };

      // Build a unified list of candidates. Some methods don't apply to
      // pace sports (e.g. baseline+1 isn't standard there); we still try
      // each but null entries get filtered out at render time.
      const lt1 = segResult.methods?.LT1 || {};
      const lt2 = segResult.methods?.LT2 || {};
      return {
        LT1: {
          baseline: make(lt1.baseline),
          segmented: make(lt1.segmented),
        },
        LT2: {
          dmax: make(lt2.dmax),
          modifiedDmax: make(lt2.modifiedDmax),
          obla: make(lt2.obla),
          loglog: make(lt2.loglog),
          iat: make(lt2.iat),
          segmented: make(lt2.segmented),
        },
        ensemble: {
          // The ensemble row uses the values passed in from the parent,
          // not the recomputed segResult — so a manual override stays
          // visible as "active" while still showing the candidates.
          LT1: ensembleLT1 != null ? {
            power: Number(ensembleLT1),
            lactate: interpolateLactate(points, Number(ensembleLT1), isPace),
            heartRate: interpolateHR(points, Number(ensembleLT1), isPace),
          } : null,
          LT2: ensembleLT2 != null ? {
            power: Number(ensembleLT2),
            lactate: interpolateLactate(points, Number(ensembleLT2), isPace),
            heartRate: interpolateHR(points, Number(ensembleLT2), isPace),
          } : null,
        },
        confidence: segResult.confidence,
        metrics: segResult.metrics,
      };
    } catch (e) {
      console.warn('[ThresholdMethodPicker] recompute failed:', e?.message || e);
      return null;
    }
  }, [mockData, ensembleLT1, ensembleLT2, isPace]);

  if (!candidates) {
    return null;
  }

  // Detect which method is currently pinned (if any) by matching the
  // override value against each candidate's power.
  const isPinned = currentOverride && (currentOverride.LTP1 != null || currentOverride.LTP2 != null);
  const matchesMethod = (lt1Cand, lt2Cand) => {
    if (!isPinned) return false;
    const lt1Match = lt1Cand && currentOverride.LTP1 != null &&
      Math.abs(Number(currentOverride.LTP1) - lt1Cand.power) < 1;
    const lt2Match = lt2Cand && currentOverride.LTP2 != null &&
      Math.abs(Number(currentOverride.LTP2) - lt2Cand.power) < 1;
    // Pinning a method always sets BOTH LT1 and LT2 from that method-row,
    // so consider a row "pinned" only when both halves match.
    return lt1Match && lt2Match;
  };

  // Build the rows that the table will render. Each row has a methodKey
  // pair (lt1 / lt2 method names) and computed candidates.
  const rows = [
    {
      key: 'ensemble',
      label: 'Ensemble (default)',
      lt1: candidates.ensemble.LT1,
      lt2: candidates.ensemble.LT2,
      isDefault: true,
    },
    {
      key: 'baseline+modifiedDmax',
      label: 'Baseline + 1.0  /  Modified D-max',
      lt1: candidates.LT1.baseline,
      lt2: candidates.LT2.modifiedDmax,
      lt1MethodKey: 'baseline',
      lt2MethodKey: 'modifiedDmax',
    },
    {
      key: 'segmented',
      label: 'Segmented regression (both)',
      lt1: candidates.LT1.segmented,
      lt2: candidates.LT2.segmented,
      lt1MethodKey: 'segmented',
      lt2MethodKey: 'segmented',
    },
    {
      key: 'baseline+obla',
      label: 'Baseline + 1.0  /  OBLA 4.0',
      lt1: candidates.LT1.baseline,
      lt2: candidates.LT2.obla,
      lt1MethodKey: 'baseline',
      lt2MethodKey: 'obla',
    },
    {
      key: 'baseline+dmax',
      label: 'Baseline + 1.0  /  Classic D-max',
      lt1: candidates.LT1.baseline,
      lt2: candidates.LT2.dmax,
      lt1MethodKey: 'baseline',
      lt2MethodKey: 'dmax',
    },
    {
      key: 'baseline+iat',
      label: 'Baseline + 1.0  /  Dickhuth IAT (LT1 + 1.5)',
      lt1: candidates.LT1.baseline,
      lt2: candidates.LT2.iat,
      lt1MethodKey: 'baseline',
      lt2MethodKey: 'iat',
    },
    {
      key: 'baseline+loglog',
      label: 'Baseline + 1.0  /  Log-log',
      lt1: candidates.LT1.baseline,
      lt2: candidates.LT2.loglog,
      lt1MethodKey: 'baseline',
      lt2MethodKey: 'loglog',
    },
  ];

  // Filter: drop rows where neither LT1 nor LT2 has a value (e.g.
  // segmented row when segmented regression returned null on this curve).
  const visibleRows = rows.filter((r) => r.lt1 || r.lt2);

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

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            Threshold methods
            <button
              type="button"
              onClick={() => setInfoMethod('ensemble')}
              className="w-5 h-5 rounded-full border border-gray-300 text-[10px] font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              title="How is each method computed?"
            >
              i
            </button>
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            All candidates LaChart computes from this test. Pick a row to lock the test to that method.
          </p>
        </div>
        {candidates.metrics?.noisy && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md whitespace-nowrap">
            Noisy data
          </span>
        )}
      </div>

      {/* Header row */}
      <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2 mb-1">
        <div className="col-span-1">Pick</div>
        <div className="col-span-4">Method</div>
        <div className="col-span-3">LT1</div>
        <div className="col-span-3">LT2</div>
        <div className="col-span-1 text-right">Info</div>
      </div>

      <div className="space-y-1.5">
        {visibleRows.map((row) => {
          const active = row.isDefault
            ? !isPinned
            : matchesMethod(row.lt1, row.lt2);
          return (
            <div
              key={row.key}
              onClick={() => handlePick(row)}
              className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-2 items-center px-2 sm:px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                active
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Radio + label (mobile stacks) */}
              <div className="sm:col-span-1 flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  active ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'
                }`}>
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <div className="sm:col-span-4 text-xs font-semibold text-gray-800">
                {row.label}
                {row.isDefault && <span className="ml-1 text-[9px] font-bold uppercase text-emerald-700">default</span>}
              </div>

              {/* LT1 */}
              <div className="sm:col-span-3 text-xs">
                {row.lt1 ? (
                  <>
                    <div className="font-bold text-gray-900 tabular-nums">
                      {fmtPowerOrPace(row.lt1.power, isPace)}
                    </div>
                    <div className="text-[10px] text-gray-500 tabular-nums leading-tight">
                      {fmtLactate(row.lt1.lactate)} · {fmtHr(row.lt1.heartRate)}
                    </div>
                  </>
                ) : (
                  <span className="text-gray-400 text-xs">—</span>
                )}
              </div>

              {/* LT2 */}
              <div className="sm:col-span-3 text-xs">
                {row.lt2 ? (
                  <>
                    <div className="font-bold text-gray-900 tabular-nums">
                      {fmtPowerOrPace(row.lt2.power, isPace)}
                    </div>
                    <div className="text-[10px] text-gray-500 tabular-nums leading-tight">
                      {fmtLactate(row.lt2.lactate)} · {fmtHr(row.lt2.heartRate)}
                    </div>
                  </>
                ) : (
                  <span className="text-gray-400 text-xs">—</span>
                )}
              </div>

              {/* Info buttons */}
              <div className="sm:col-span-1 flex items-center justify-end gap-1 flex-shrink-0">
                {row.lt1MethodKey && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setInfoMethod(row.lt1MethodKey); }}
                    className="w-5 h-5 rounded-full border border-gray-300 text-[9px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    title="LT1 method info"
                  >
                    i
                  </button>
                )}
                {row.lt2MethodKey && row.lt2MethodKey !== row.lt1MethodKey && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setInfoMethod(row.lt2MethodKey); }}
                    className="w-5 h-5 rounded-full border border-gray-300 text-[9px] font-bold text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    title="LT2 method info"
                  >
                    i
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confidence indicator + methodology disclosure footer */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
        {typeof candidates.confidence === 'number' && (
          <span>
            Confidence: <span className="font-bold text-gray-700">{Math.round(candidates.confidence * 100)}%</span>
          </span>
        )}
        {candidates.metrics?.explosiveFinish && (
          <span className="text-amber-700">Explosive finish detected — log-log + IAT excluded from ensemble.</span>
        )}
        {candidates.metrics?.segmentedLT1Rejected && (
          <span className="text-amber-700">Segmented LT1 rejected (lactate dip in warm-up).</span>
        )}
        <span className="ml-auto">
          Methodology refs: Cheng 1992 (Dmax), Mader 1986 (baseline), Sjödin 1981 (OBLA), Beaver 1985 (log-log).
        </span>
      </div>

      {infoMethod && (
        <MethodInfoPopover method={infoMethod} onClose={() => setInfoMethod(null)} />
      )}
    </div>
  );
}
