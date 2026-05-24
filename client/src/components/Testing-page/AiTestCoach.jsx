/**
 * AiTestCoach
 * ───────────
 * Single panel on the lactate test detail page that replaces the older
 * PreTestTrainingContext + PredictedLactateCurve duo. Three sections,
 * one server roundtrip, one LLM call:
 *
 *   1. **AI narrative** — 2-4 sentence interpretation from Claude
 *      (headline + interpretation + recommendation). Falls back to a
 *      neutral template when the API key isn't configured.
 *   2. **Predicted vs measured curve** — overlay SVG: athlete's actual
 *      measured points + the predicted curve from the protocol model.
 *   3. **Suggested protocol** — start watts/pace + step + 8 stages
 *      with predicted lactate per stage. Anchor comes from a SINGLE
 *      source (measured / prior test / best 20-min / profile FTP)
 *      with no ensemble math.
 *
 * Triggered by a POST on mount; result cached in component state.
 */
import React, { useEffect, useState, useMemo } from 'react';
import api from '../../services/api';

// ── Format helpers ──
function fmtIntensity(v, isPace) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (isPace) {
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}:${String(s).padStart(2, '0')}/km`;
  }
  return `${Math.round(n)} W`;
}

// Short human-readable label for the anchor source. Used in the
// collapsed header summary AND above the protocol table.
function describeAnchor(source) {
  return {
    'measured':    'measured LT2 from this test',
    'prior-test':  'previous test',
    'best-20min':  'best 20-min effort in last 30 days',
    'profile-ftp': 'FTP in athlete profile',
    'best-10k':    'best 10 km in last 30 days',
    'none':        'no usable data',
  }[source] || source || 'unknown';
}

function ConfidencePill({ confidence }) {
  if (!confidence || confidence === 'none') return null;
  const map = {
    high:   { label: 'High confidence',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    medium: { label: 'Medium confidence', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    low:    { label: 'Low confidence',    cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  };
  const m = map[confidence] || map.low;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.cls}`}>
      {m.label}
    </span>
  );
}

/**
 * SVG curve overlay: measured points (gray dots + connecting line) +
 * predicted curve (purple, dashed) + LT1/LT2 reference horizontal lines.
 */
function CurveOverlay({ measured, predicted, isPace }) {
  const { paths, xLabels, yLabels } = useMemo(() => {
    if (!predicted?.stages?.length && !measured?.length) {
      return { paths: null, xLabels: [], yLabels: [] };
    }

    // Combine x-range
    const allIntensities = [
      ...(measured || []).map((m) => m.x),
      ...(predicted?.stages || []).map((s) => s.intensity),
    ].filter((v) => Number.isFinite(v));
    if (allIntensities.length === 0) return { paths: null, xLabels: [], yLabels: [] };

    const minI = Math.min(...allIntensities);
    const maxI = Math.max(...allIntensities);
    const allLactates = [
      ...(measured || []).map((m) => m.y),
      ...(predicted?.stages || []).map((s) => s.lactatePredicted),
    ].filter((v) => Number.isFinite(v));
    const maxLa = Math.max(8, ...allLactates) * 1.1;

    const W = 600, H = 180;
    const PAD = { l: 32, r: 12, t: 12, b: 24 };
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;

    // For pace sports, the X axis is reversed (slower → faster left → right
    // doesn't read naturally; we plot HARDER to the RIGHT regardless).
    const x = (i) => {
      const frac = isPace
        ? (maxI - i) / Math.max(0.001, maxI - minI)   // higher seconds (slower) at left
        : (i - minI) / Math.max(0.001, maxI - minI);
      return PAD.l + frac * innerW;
    };
    const y = (la) => PAD.t + innerH - (la / maxLa) * innerH;

    const measuredPath = (measured || []).length >= 2
      ? (measured || [])
          .slice()
          .sort((a, b) => isPace ? b.x - a.x : a.x - b.x)
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`)
          .join(' ')
      : null;

    const predictedPath = (predicted?.stages || []).length >= 2
      ? predicted.stages
          .slice()
          .sort((a, b) => isPace ? b.intensity - a.intensity : a.intensity - b.intensity)
          .map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(s.intensity).toFixed(1)} ${y(s.lactatePredicted).toFixed(1)}`)
          .join(' ')
      : null;

    // X labels: leftmost, midpoint, rightmost (in display order)
    const xLabels = [
      { x: PAD.l, label: fmtIntensity(isPace ? maxI : minI, isPace) },
      { x: PAD.l + innerW / 2, label: fmtIntensity((minI + maxI) / 2, isPace) },
      { x: PAD.l + innerW, label: fmtIntensity(isPace ? minI : maxI, isPace) },
    ];
    const yLabels = [
      { y: y(2), label: '2 mmol/L', color: '#10b981' },
      { y: y(4), label: '4 mmol/L', color: '#ef4444' },
    ];

    return {
      paths: {
        W, H, PAD,
        measuredPath, predictedPath,
        measuredPts: (measured || []).map((m) => ({ x: x(m.x), y: y(m.y), label: fmtIntensity(m.x, isPace), la: m.y })),
        predictedPts: (predicted?.stages || []).map((s) => ({ x: x(s.intensity), y: y(s.lactatePredicted) })),
        xMin: PAD.l, xMax: PAD.l + innerW, y2: y(2), y4: y(4),
      },
      xLabels,
      yLabels,
    };
  }, [measured, predicted, isPace]);

  if (!paths) {
    return <div className="text-xs text-gray-400 italic py-4">No data to plot yet.</div>;
  }

  const { W, H, measuredPath, predictedPath, measuredPts, predictedPts, xMin, xMax, y2, y4 } = paths;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H, display: 'block' }}>
        {/* Reference 2/4 mmol horizontal lines */}
        <line x1={xMin} x2={xMax} y1={y2} y2={y2} stroke="#10b981" strokeWidth="0.6" strokeDasharray="3 3" />
        <line x1={xMin} x2={xMax} y1={y4} y2={y4} stroke="#ef4444" strokeWidth="0.6" strokeDasharray="3 3" />
        {yLabels.map((l, i) => (
          <text key={i} x={xMin - 4} y={l.y + 3} fontSize="8" fill={l.color} textAnchor="end">{l.label}</text>
        ))}

        {/* Predicted curve (dashed, purple) */}
        {predictedPath && (
          <path d={predictedPath} fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />
        )}
        {predictedPts.map((p, i) => (
          <circle key={`p${i}`} cx={p.x} cy={p.y} r="2" fill="#7c3aed" opacity="0.6" />
        ))}

        {/* Measured curve (solid, blue) */}
        {measuredPath && (
          <path d={measuredPath} fill="none" stroke="#1e40af" strokeWidth="1.8" strokeLinejoin="round" />
        )}
        {measuredPts.map((p, i) => (
          <circle key={`m${i}`} cx={p.x} cy={p.y} r="3" fill="#1e40af" />
        ))}

        {/* X axis labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 6} fontSize="8" fill="#9ca3af" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
            {l.label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="absolute top-1 right-1 flex items-center gap-3 text-[9px] font-semibold pointer-events-none">
        <span className="flex items-center gap-1.5 text-blue-700">
          <span className="inline-block w-4 h-0.5 bg-blue-700" />Measured
        </span>
        <span className="flex items-center gap-1.5 text-violet-700">
          <span className="inline-block w-4 h-0.5" style={{ background: 'repeating-linear-gradient(90deg,#7c3aed 0 3px,transparent 3px 6px)' }} />Predicted
        </span>
      </div>
    </div>
  );
}

// ─── Client-side next-test protocol generator ────────────────────────────────
// Used as fallback when server returns anchor.source === 'none' but we
// already have the test's measured LT1/LT2 from props.

function generateClientProtocol(lt2, lt1, sport, baseLac) {
  const isPace = sport === 'run' || sport === 'swim';
  const base = Number(baseLac) || 1.0;
  const stages = [];

  if (isPace) {
    // Run/swim: start 75 s/km slower than LT2, step −15 s/km (faster each stage)
    const start = lt2 + 75;
    const step  = -15;
    for (let i = 0; i < 8; i++) {
      const intensity = start + i * step;
      const fracOfLt2 = lt2 / intensity; // >1 means faster than LT2
      // Simple lactate model: flat below LT1, quadratic LT1→LT2, exponential above
      let la;
      if (lt1 && intensity > lt1) {
        la = base + (4.0 - base) * Math.pow((intensity - lt1) / Math.max(1, lt2 - lt1), 1.5);
      } else {
        la = base + (2.0 - base) * Math.max(0, 1 - (intensity - lt2 * 1.2) / (lt2 * 0.2));
      }
      la = Math.max(base, Math.min(12, la));
      const rpe = Math.round(4 + fracOfLt2 * 4);
      stages.push({
        stage: i + 1,
        intensity,
        intensityLabel: fmtIntensity(intensity, true),
        lactatePredicted: parseFloat(la.toFixed(2)),
        rpePredicted: Math.min(10, Math.max(3, rpe)),
        durationS: 3 * 60,
      });
    }
  } else {
    // Bike: start at 55% LT2, step +25W
    const start = Math.round((lt2 * 0.55) / 25) * 25;
    const step  = 25;
    for (let i = 0; i < 8; i++) {
      const intensity = start + i * step;
      const fracOfLt2 = intensity / lt2;
      let la;
      if (lt1 && intensity > lt1) {
        la = base + (4.0 - base) * Math.pow((intensity - lt1) / Math.max(1, lt2 - lt1), 1.8);
      } else {
        la = base + (2.0 - base) * Math.min(1, intensity / (lt1 || lt2 * 0.72));
      }
      la = Math.max(base, Math.min(12, la));
      const rpe = Math.round(3 + fracOfLt2 * 6);
      stages.push({
        stage: i + 1,
        intensity,
        intensityLabel: fmtIntensity(intensity, false),
        lactatePredicted: parseFloat(la.toFixed(2)),
        rpePredicted: Math.min(10, Math.max(2, rpe)),
        durationS: 4 * 60,
      });
    }
  }

  return { stages, stageDurationS: isPace ? 3 * 60 : 4 * 60, isPace };
}

// ─── Protocol table ───────────────────────────────────────────────────────────

function ProtocolTable({ stages, stageDurationS, isPace }) {
  if (!stages?.length) return null;
  const totalMin = Math.round(stages.length * stageDurationS / 60);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
          Suggested next test protocol
        </div>
        <span className="text-[10px] text-gray-500 font-semibold whitespace-nowrap">
          {stages.length} × {Math.round(stageDurationS / 60)} min · {totalMin} min total
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left py-1.5 px-2 text-[10px] font-bold text-gray-500 uppercase">Stage</th>
              <th className="text-left py-1.5 px-2 text-[10px] font-bold text-gray-500 uppercase">Target</th>
              <th className="text-left py-1.5 px-2 text-[10px] font-bold text-gray-500 uppercase">Est. lactate</th>
              <th className="text-left py-1.5 px-2 text-[10px] font-bold text-gray-500 uppercase">RPE</th>
              <th className="text-left py-1.5 px-2 text-[10px] font-bold text-gray-500 uppercase">Duration</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.stage} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50">
                <td className="py-1.5 px-2 font-bold text-gray-700">{s.stage}</td>
                <td className="py-1.5 px-2 tabular-nums font-semibold text-gray-900">{s.intensityLabel}</td>
                <td className="py-1.5 px-2 tabular-nums">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    s.lactatePredicted < 2   ? 'bg-emerald-50 text-emerald-700' :
                    s.lactatePredicted < 4   ? 'bg-amber-50 text-amber-700' :
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
  );
}

// ─── Training tiles ───────────────────────────────────────────────────────────

function TrainingTiles({ training }) {
  if (!training) return null;
  const tiles = [
    { label: 'Sessions (30d)', value: training.sessions ?? '—' },
    { label: 'Hours',          value: training.totalHours ?? '—' },
    { label: 'TSS',            value: training.totalTss ?? '—' },
    {
      label: 'Avg HR % max',
      value: training.avgHrFractionOfMax != null
        ? `${Math.round(training.avgHrFractionOfMax * 100)}%`
        : '—',
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {tiles.map(({ label, value }) => (
        <div key={label} className="rounded-xl bg-gray-50 px-3 py-2.5">
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">{label}</div>
          <div className="text-base font-bold tabular-nums mt-1 text-gray-900">{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AiTestCoach({
  athleteId,
  testId,
  testDate,
  sport,
  measuredLt1,
  measuredLt2,
  measuredLt1Lactate,
  measuredLt2Lactate,
  results,
  baseLactate,
}) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!testId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.post(`/test/${testId}/ai-coach`, { sport, language: 'en' })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => {
        if (cancelled) return;
        const status = e?.response?.status;
        if (status === 403 || status === 404) setError('hidden');
        else setError(e?.response?.data?.error || e?.message || 'Failed to load');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [testId, sport]);

  // Measured points for the overlay chart
  const measuredPoints = useMemo(() => {
    if (!Array.isArray(results)) return [];
    return results
      .map((r) => ({ x: Number(r?.power), y: Number(r?.lactate) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y >= 0);
  }, [results]);

  // ── Determine whether server found a usable anchor ──────────────────────────
  const serverHasProtocol = !!(data?.protocol?.stages?.length);

  // ── Client-side fallback protocol (from this test's own measured LT2) ────────
  // Must be declared before any early return so hook order is stable.
  const clientProtocol = useMemo(() => {
    if (serverHasProtocol) return null;           // server already has one
    if (!measuredLt2 || !Number.isFinite(Number(measuredLt2))) return null;
    return generateClientProtocol(
      Number(measuredLt2),
      measuredLt1 ? Number(measuredLt1) : null,
      sport,
      baseLactate
    );
  }, [serverHasProtocol, measuredLt2, measuredLt1, sport, baseLactate]);

  if (error === 'hidden' || !testId) return null;

  const isPace = data?.isPace ?? (
    String(sport || '').toLowerCase().includes('run') ||
    String(sport || '').toLowerCase().includes('swim')
  );

  const serverAnchorNone = !loading && data?.anchor?.source === 'none';

  const effectiveProtocol = data?.protocol ?? (clientProtocol ? { ...clientProtocol } : null);
  const usingClientFallback = !serverHasProtocol && !!clientProtocol;

  // ── Collapsed headline ───────────────────────────────────────────────────────
  const lt2Predicted = data?.protocol?.summary?.lt2Estimate;
  let headline;
  if (loading) {
    headline = 'Analysing training data…';
  } else if (data?.narrative?.headline) {
    headline = data.narrative.headline;
  } else if (serverHasProtocol && lt2Predicted) {
    headline = `Next test: LT2 ≈ ${fmtIntensity(lt2Predicted, isPace)} · based on ${describeAnchor(data?.anchor?.source)}`;
  } else if (usingClientFallback) {
    headline = `Next test protocol · based on measured LT2 (${fmtIntensity(measuredLt2, isPace)})`;
  } else if (serverAnchorNone && !clientProtocol) {
    headline = 'No FTP / LT2 reference — set profile zones or connect Strava';
  } else {
    headline = 'Test coach';
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* ── Always-visible header ────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
            <span>Test coach</span>
            {!loading && data?.anchor && <ConfidencePill confidence={data.anchor.confidence} />}
            {usingClientFallback && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                From this test
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-1">
            {headline}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Always-visible training tiles (no longer hidden behind expand) ── */}
      {!loading && data?.training && (
        <div className="px-4 sm:px-5 pb-3 border-t border-gray-100">
          <div className="pt-3">
            <TrainingTiles training={data.training} />
          </div>
        </div>
      )}

      {/* ── Expandable detail ─────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-4 sm:px-5 pb-4 border-t border-gray-100 space-y-4 pt-3">

          {loading && (
            <div className="h-20 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-violet-500 rounded-full animate-spin" />
            </div>
          )}

          {!loading && error && error !== 'hidden' && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {!loading && (
            <>
              {/* AI narrative */}
              {data?.narrative && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                  {data.narrative.headline && (
                    <div className="text-sm font-bold text-violet-900 mb-1">{data.narrative.headline}</div>
                  )}
                  {data.narrative.interpretation && (
                    <p className="text-xs text-violet-900/90 leading-relaxed">{data.narrative.interpretation}</p>
                  )}
                  {data.narrative.recommendation && (
                    <p className="text-xs text-violet-900 font-semibold leading-relaxed mt-2">
                      → {data.narrative.recommendation}
                    </p>
                  )}
                </div>
              )}

              {/* Measured vs predicted curve */}
              {data?.protocol && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Measured vs predicted lactate curve
                  </div>
                  <CurveOverlay
                    measured={measuredPoints}
                    predicted={data.protocol}
                    isPace={isPace}
                  />
                </div>
              )}

              {/* Protocol table — server or client fallback */}
              {effectiveProtocol?.stages && (
                <>
                  {usingClientFallback && (
                    <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <span className="font-semibold">Protocol based on this test's measured LT2</span>
                      {' '}({fmtIntensity(measuredLt2, isPace)}).
                      Connect Strava or set profile zones to get a server-computed protocol with training load context.
                    </div>
                  )}
                  {serverHasProtocol && data?.anchor?.value && (
                    <div className="text-[11px] text-gray-600">
                      Anchor: <span className="font-semibold">{describeAnchor(data.anchor.source)}</span>
                      {' '}→ LT2 ≈ <span className="font-bold tabular-nums">{fmtIntensity(data.anchor.value, isPace)}</span>
                    </div>
                  )}
                  <ProtocolTable
                    stages={effectiveProtocol.stages}
                    stageDurationS={effectiveProtocol.stageDurationS}
                    isPace={effectiveProtocol.isPace ?? isPace}
                  />
                </>
              )}

              {/* No data at all */}
              {!effectiveProtocol?.stages && serverAnchorNone && !usingClientFallback && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 leading-relaxed">
                  <div className="font-semibold text-gray-700 mb-1">No protocol reference found</div>
                  To generate a personalised test protocol, do one of:
                  <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-gray-500">
                    <li>Set your FTP / threshold pace in <strong>Profile → Zones</strong></li>
                    <li>Connect Strava — best 20-min power effort is used automatically</li>
                    <li>Complete at least one previous lactate test for the same sport</li>
                  </ul>
                </div>
              )}

              <div className="text-[10px] text-gray-400 leading-relaxed">
                Protocol anchored on a single reference point (priority: measured LT2 → prior test → best 20-min → profile FTP).
                Estimated lactate uses a piecewise model: flat below LT1, quadratic LT1→LT2, exponential above LT2.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
