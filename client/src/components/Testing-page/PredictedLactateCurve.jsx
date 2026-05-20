/**
 * PredictedLactateCurve
 * ─────────────────────
 * Displays the output of the lactateCurvePredictor server endpoint:
 *
 *   • Predicted LT1 / LT2 power-or-pace with confidence score
 *   • What inputs drove the prediction (best 20-min effort, CP model,
 *     prior test, etc.) so the sport scientist can audit the math
 *   • Training profile classification (polarised / pyramidal / threshold)
 *   • Suggested incremental test protocol — start intensity, step
 *     size, stage count + duration, predicted lactate per stage
 *   • When a real test is attached: measured-vs-predicted comparison
 *     with a one-sentence verdict (on-target / over-performed / under-
 *     performed, plus CTL/ATL fatigue context)
 *
 * The widget self-fetches from `/test/:athleteId/protocol-suggestion`.
 * Collapsed by default so the test detail stays compact; the user
 * expands when they want to audit / pre-fill a new test protocol.
 */
import React, { useEffect, useState } from 'react';
import api from '../../services/api';

// ── Format helpers ──
function fmtPowerOrPace(value, isPace) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const v = Number(value);
  if (isPace) {
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, '0')}/km`;
  }
  return `${Math.round(v)} W`;
}

function fmtConfidence(c) {
  if (c == null) return '—';
  if (c >= 70) return { text: `${Math.round(c)}/100`, color: 'text-emerald-700', bg: 'bg-emerald-50' };
  if (c >= 40) return { text: `${Math.round(c)}/100`, color: 'text-amber-700', bg: 'bg-amber-50' };
  return { text: `${Math.round(c)}/100`, color: 'text-rose-700', bg: 'bg-rose-50' };
}

function PolarisationBadge({ p }) {
  if (!p) return null;
  const map = {
    polarised:         { label: 'Polarised',          color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pyramidal:         { label: 'Pyramidal',          color: 'bg-blue-50 text-blue-700 border-blue-200' },
    'threshold-heavy': { label: 'Threshold-heavy',    color: 'bg-amber-50 text-amber-800 border-amber-200' },
  };
  const m = map[p] || { label: p, color: 'bg-gray-100 text-gray-700 border-gray-200' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.color}`}>{m.label}</span>;
}

function StatTile({ label, value, accent = null, sublabel = null }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5 flex flex-col">
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">{label}</span>
      <span className={`text-base font-bold tabular-nums leading-none mt-1 ${accent || 'text-gray-900'}`}>{value}</span>
      {sublabel && <span className="text-[10px] text-gray-500 mt-1 leading-none">{sublabel}</span>}
    </div>
  );
}

// ── Tiny inline curve renderer for the predicted protocol ──
function PredictedCurveChart({ stages, isPace, baseLactate = 1.0 }) {
  if (!Array.isArray(stages) || stages.length < 2) return null;
  const intensities = stages.map((s) => s.intensity);
  const lactates = stages.map((s) => s.lactatePredicted);
  const minI = Math.min(...intensities);
  const maxI = Math.max(...intensities);
  const maxLa = Math.max(...lactates, 4) * 1.15;
  const w = 100, h = 80;
  const x = (i) => ((isPace ? maxI - i : i - minI) / Math.abs(maxI - minI)) * w;
  const y = (la) => h - (la / maxLa) * (h - 6);

  const path = stages.map((s, i) => {
    const px = x(s.intensity), py = y(s.lactatePredicted);
    return `${i === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`;
  }).join(' ');

  return (
    <svg viewBox={`-2 -2 ${w + 4} ${h + 14}`} className="w-full" style={{ height: 110 }}>
      {/* Reference lines at LT1 (~2 mmol) and LT2 (~4 mmol) lactate */}
      <line x1="0" y1={y(2)} x2={w} y2={y(2)} stroke="#10b981" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
      <line x1="0" y1={y(4)} x2={w} y2={y(4)} stroke="#ef4444" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
      <text x={w} y={y(2) - 1} fontSize="2.5" fill="#10b981" textAnchor="end">LT1 ≈ 2 mmol</text>
      <text x={w} y={y(4) - 1} fontSize="2.5" fill="#ef4444" textAnchor="end">LT2 ≈ 4 mmol</text>
      {/* Predicted curve */}
      <path d={path} fill="none" stroke="#6366f1" strokeWidth="0.9" />
      {stages.map((s, i) => (
        <circle key={i} cx={x(s.intensity)} cy={y(s.lactatePredicted)} r="1.4" fill="#6366f1" />
      ))}
      {/* X-axis labels (first + last) */}
      <text x={0} y={h + 10} fontSize="2.5" fill="#94a3b8" textAnchor="start">{stages[0].intensityLabel}</text>
      <text x={w} y={h + 10} fontSize="2.5" fill="#94a3b8" textAnchor="end">{stages[stages.length - 1].intensityLabel}</text>
    </svg>
  );
}

export default function PredictedLactateCurve({ athleteId, sport, testId = null, defaultExpanded = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (!athleteId || !sport) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/test/${athleteId}/protocol-suggestion`, { params: { sport, ...(testId ? { testId } : {}) } })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => {
        if (cancelled) return;
        const status = e?.response?.status;
        if (status === 403 || status === 404) {
          // Permission or endpoint missing → silently hide.
          setError('hidden');
        } else {
          setError(e?.response?.data?.error || e?.message || 'Failed to load prediction');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [athleteId, sport, testId]);

  if (error === 'hidden' || !athleteId || !sport) return null;

  const result = data;
  const isPace = result?.isPace;
  const pred = result?.prediction;
  const protocol = result?.protocol;
  const interp = result?.interpretation;
  const conf = fmtConfidence(pred?.confidence);
  const confObj = typeof conf === 'object' ? conf : { text: conf, color: 'text-gray-700', bg: 'bg-gray-50' };

  // Short headline for the collapsed view.
  const headline = pred?.lt1 && pred?.lt2
    ? `LT1 ≈ ${fmtPowerOrPace(pred.lt1, isPace)}  ·  LT2 ≈ ${fmtPowerOrPace(pred.lt2, isPace)}`
    : 'Not enough training data';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
            <span>Predicted from training data</span>
            {!loading && pred && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${confObj.bg} ${confObj.color}`}>
                {confObj.text}
              </span>
            )}
            {interp?.verdict === 'on-target' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700">✓ matches measured</span>
            )}
            {interp?.verdict === 'over-performed' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700">↑ over-performed</span>
            )}
            {interp?.verdict === 'under-performed' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700">↓ under-performed</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            {loading ? 'Crunching last 90 days of training…' : headline}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 border-t border-gray-100">
          {loading && (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          )}

          {!loading && error && error !== 'hidden' && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 mt-3">
              {error}
            </div>
          )}

          {!loading && !error && result && (
            <>
              {/* 1. Predicted thresholds + key inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                <StatTile
                  label="LT1 (predicted)"
                  value={fmtPowerOrPace(pred?.lt1, isPace)}
                  accent="text-emerald-700"
                  sublabel={pred?.ratio ? `${Math.round(pred.ratio * 100)} % of LT2` : null}
                />
                <StatTile
                  label="LT2 (predicted)"
                  value={fmtPowerOrPace(pred?.lt2, isPace)}
                  accent="text-rose-700"
                />
                <StatTile
                  label="CTL / ATL"
                  value={`${result.fitnessState?.ctl ?? '—'} / ${result.fitnessState?.atl ?? '—'}`}
                  sublabel={`TSB ${result.fitnessState?.tsb > 0 ? '+' : ''}${result.fitnessState?.tsb ?? '—'}`}
                />
                <StatTile
                  label="Activities"
                  value={result.activitiesCount}
                  sublabel={`${result.distribution?.totalHours?.toFixed(0) ?? '—'} h in last 90 d`}
                />
              </div>

              {/* 2. What drove the prediction */}
              {pred?.candidates?.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Prediction inputs</div>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {pred.candidates.map((c, i) => (
                      <li
                        key={i}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${
                          c.excluded ? 'bg-rose-50 line-through opacity-60' : 'bg-gray-50'
                        }`}
                        title={c.excluded ? 'Excluded as outlier vs other candidates' : ''}
                      >
                        <span className="font-semibold">
                          {{
                            'best-20min':       'Best 20-min effort × 0.93',
                            'critical-power':   `Critical Power × 0.95 (CP = ${result.criticalPower?.cp ?? '?'} W, W' = ${(result.criticalPower?.wPrime / 1000).toFixed(1) ?? '?'} kJ)`,
                            'user-ftp':         'FTP from athlete profile × 0.93',
                            'prior-test':       'Prior lactate test, CTL-adjusted',
                            'hr-anchored-lt2':  `HR-anchored LT2 — median power at 88-92 % HRmax (${result.hrEsts?.lt2Samples ?? 0} efforts)`,
                            'best-10km':        'Best 10 km × 1.06',
                            'best-5km':         'Best 5 km × 1.10',
                            'best-half':        'Half-marathon × 1.01',
                          }[c.source] || c.source}
                        </span>
                        <span className="text-[11px] text-gray-500 tabular-nums">
                          → {fmtPowerOrPace(c.lt2, isPace)} ({Math.round(c.weight * 100)} % weight)
                          {c.excluded && <span className="ml-1 text-rose-700 font-bold">(excluded)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 3. Training distribution — only render the zone bar when we
                  actually have HR data; otherwise show a hint message so the
                  user knows what's missing. Total hours always shows in the
                  stat tile above regardless. */}
              {result.distribution?.hasZoneData ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Training distribution (last 90 d)</span>
                    <PolarisationBadge p={result.distribution.polarisation} />
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                    {[
                      { pct: result.distribution.z1Pct, color: '#86efac', label: 'Z1' },
                      { pct: result.distribution.z2Pct, color: '#3b82f6', label: 'Z2' },
                      { pct: result.distribution.z3Pct, color: '#f59e0b', label: 'Z3' },
                      { pct: result.distribution.z4Pct, color: '#ef4444', label: 'Z4' },
                      { pct: result.distribution.z5Pct, color: '#a855f7', label: 'Z5' },
                    ].map((z, i) => z.pct > 0 ? (
                      <div key={i} style={{ width: `${z.pct}%`, background: z.color }} title={`${z.label}: ${z.pct.toFixed(0)} %`} />
                    ) : null)}
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-500 mt-1 tabular-nums">
                    <span>Z1 {Math.round(result.distribution.z1Pct)}%</span>
                    <span>Z2 {Math.round(result.distribution.z2Pct)}%</span>
                    <span>Z3 {Math.round(result.distribution.z3Pct)}%</span>
                    <span>Z4 {Math.round(result.distribution.z4Pct)}%</span>
                    <span>Z5 {Math.round(result.distribution.z5Pct)}%</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-[10px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  Set your <b>Max HR</b> in Settings → Profile to enable training-zone distribution and HR-anchored LT estimates.
                </div>
              )}

              {/* 3a. Notes (outlier-rejection messages, fatigue caveats) —
                  render only when there's something useful to say. */}
              {pred?.notes?.length > 0 && (
                <div className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                  {pred.notes.map((n, i) => (
                    <div key={i} className="leading-snug">⚠️ {n}</div>
                  ))}
                </div>
              )}

              {/* 4. Suggested protocol + predicted curve */}
              {protocol && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Suggested incremental test protocol</span>
                    <span className="text-[10px] font-semibold text-gray-500">
                      {protocol.stages.length} stages × {Math.round(protocol.stageDurationS / 60)} min · {protocol.summary.totalDurationMin} min total
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <PredictedCurveChart stages={protocol.stages} isPace={isPace} />
                  </div>
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-1.5 pr-2 font-bold text-gray-500 uppercase text-[10px]">Stage</th>
                          <th className="text-left py-1.5 px-2 font-bold text-gray-500 uppercase text-[10px]">Target</th>
                          <th className="text-left py-1.5 px-2 font-bold text-gray-500 uppercase text-[10px]">Pred. La</th>
                          <th className="text-left py-1.5 px-2 font-bold text-gray-500 uppercase text-[10px]">RPE</th>
                          <th className="text-left py-1.5 px-2 font-bold text-gray-500 uppercase text-[10px]">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {protocol.stages.map((s) => (
                          <tr key={s.stage} className="border-b border-gray-100 last:border-b-0">
                            <td className="py-1.5 pr-2 font-bold text-gray-700">{s.stage}</td>
                            <td className="py-1.5 px-2 tabular-nums font-semibold text-gray-900">{s.intensityLabel}</td>
                            <td className="py-1.5 px-2 tabular-nums">
                              <span className={`px-1.5 py-0.5 rounded ${
                                s.lactatePredicted < 2 ? 'bg-emerald-50 text-emerald-700' :
                                s.lactatePredicted < 4 ? 'bg-amber-50 text-amber-700' :
                                'bg-rose-50 text-rose-700'
                              }`}>
                                {s.lactatePredicted.toFixed(2)} mmol/L
                              </span>
                            </td>
                            <td className="py-1.5 px-2 tabular-nums text-gray-600">{s.rpePredicted}/10</td>
                            <td className="py-1.5 px-2 tabular-nums text-gray-600">{Math.round(s.durationS / 60)} min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. Measured-vs-predicted (only when test data present) */}
              {interp && (
                <div className={`mt-4 rounded-xl p-3 border ${
                  interp.verdict === 'on-target' ? 'bg-emerald-50 border-emerald-200' :
                  interp.verdict === 'over-performed' ? 'bg-blue-50 border-blue-200' :
                  'bg-rose-50 border-rose-200'
                }`}>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-1">
                    {interp.verdict === 'on-target' ? '✓ Prediction matched measured' :
                     interp.verdict === 'over-performed' ? '↑ Measured outperformed prediction' :
                     '↓ Measured under-performed'}
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">{interp.summary}</p>
                  {(interp.lt1PctDev != null || interp.lt2PctDev != null) && (
                    <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                      {interp.lt1PctDev != null && (
                        <span className="px-2 py-0.5 rounded bg-white/70 font-semibold text-gray-700 tabular-nums">
                          LT1: {interp.lt1PctDev > 0 ? '+' : ''}{interp.lt1PctDev} %
                        </span>
                      )}
                      {interp.lt2PctDev != null && (
                        <span className="px-2 py-0.5 rounded bg-white/70 font-semibold text-gray-700 tabular-nums">
                          LT2: {interp.lt2PctDev > 0 ? '+' : ''}{interp.lt2PctDev} %
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 6. Confidence boosters list (what's behind the score) */}
              {pred?.confidenceBoosters?.length > 0 && (
                <details className="mt-4 text-xs text-gray-600">
                  <summary className="cursor-pointer font-semibold text-[10px] uppercase tracking-wide text-gray-500">
                    Why this confidence score? ({Math.round(pred.confidence)}/100)
                  </summary>
                  <ul className="mt-2 space-y-0.5">
                    {pred.confidenceBoosters.map((b, i) => (
                      <li key={i} className="flex justify-between gap-2 px-2 py-0.5 bg-gray-50 rounded">
                        <span>{b.label}</span>
                        <span className="font-bold tabular-nums text-gray-700">+{b.points}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="mt-3 text-[10px] text-gray-400 leading-relaxed">
                Model: best-effort power profile + Critical Power + training-zone distribution → LT2 estimate;
                LT1 = LT2 × ratio (calibrated to training polarisation). Stage-lactate prediction is a
                piecewise model (flat → LT1 → LT2 → exponential). Refs: Coggan, Monod-Scherrer (CP),
                Seiler (polarisation), Banister (CTL/ATL).
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
