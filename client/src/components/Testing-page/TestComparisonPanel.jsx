/**
 * TestComparisonPanel
 * ───────────────────
 * In-page side-by-side comparison of the current lactate test against
 * 1–2 previous same-sport tests. Two halves:
 *
 *   1. **LT1/LT2 delta table** — explicit numerical comparison: power
 *      or pace, lactate, HR. Per threshold per test, with Δ value +
 *      percentage. Colour-coded: green for improvement, red for decline,
 *      grey for no change. Matches what sport scientists put in lab PDFs.
 *
 *   2. **Curve overlay + zones table** — delegated to the existing
 *      <TestComparison> component, which already handles the visual
 *      overlay + zones comparison. We just feed it the right `tests`
 *      array.
 *
 * Selector: chip-style row of recent same-sport tests; tap up to 2 to
 * overlay. Defaults to the most recent previous test. Lives at the top
 * of the panel so the comparison updates instantly.
 */
import React, { useMemo, useState, useEffect } from 'react';
import TestComparison from './TestComparison';
import { calculateThresholds } from './DataTable';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return String(d); }
}

function normalizeSport(s) {
  const lower = String(s || '').toLowerCase();
  if (lower === 'bike' || lower === 'cycling' || lower === 'cycle' || lower.includes('bike') || lower.includes('ride')) return 'bike';
  if (lower === 'run' || lower === 'running' || lower.includes('run')) return 'run';
  if (lower === 'swim' || lower === 'swimming' || lower.includes('swim')) return 'swim';
  return 'bike';
}

function fmtPowerOrPace(value, sport) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const v = Number(value);
  if (sport === 'bike') return `${Math.round(v)} W`;
  // For pace sports the value is seconds-per-km (run) or per-100m (swim)
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtChange(delta, sport, isPercent = false) {
  if (delta == null || !Number.isFinite(Number(delta)) || Math.abs(delta) < 0.05) return '0';
  const sign = delta > 0 ? '+' : '−';
  const abs = Math.abs(Number(delta));
  if (isPercent) return `${sign}${abs.toFixed(1)} %`;
  if (sport === 'bike') return `${sign}${Math.round(abs)} W`;
  // pace: lower is better; the caller decides sign convention. We show MM:SS abs.
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  if (m > 0) return `${sign}${m}:${String(s).padStart(2, '0')}`;
  return `${sign}${Math.round(abs)} s`;
}

function fmtHr(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${Math.round(Number(v))} bpm`;
}

function fmtLactate(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `${Number(v).toFixed(2)} mmol/L`;
}

/**
 * Extract the LT1/LT2 + HR + lactate triple for one test by running it
 * through the same calculateThresholds() the chart uses. Returns null
 * if the test has too little data for thresholds.
 */
function extractThresholds(test) {
  if (!test || !Array.isArray(test.results) || test.results.length < 3) return null;
  try {
    const t = calculateThresholds(test);
    const lt1Power = t['LTP1'];
    const lt2Power = t['LTP2'];
    if (lt1Power == null && lt2Power == null) return null;
    return {
      lt1: {
        power: lt1Power,
        lactate: t.lactates?.['LTP1'] ?? null,
        hr: t.heartRates?.['LTP1'] ?? null,
      },
      lt2: {
        power: lt2Power,
        lactate: t.lactates?.['LTP2'] ?? null,
        hr: t.heartRates?.['LTP2'] ?? null,
      },
    };
  } catch (e) {
    console.warn('[TestComparisonPanel] calculateThresholds failed for test', test?._id, e?.message);
    return null;
  }
}

/**
 * Compute change cell content + colour class for one metric.
 * sport: 'bike' | 'run' | 'swim'. For bike, "higher = better" (watts);
 * for pace sports, "lower = better" (seconds/km).
 *
 * `flipBetter`: when true, lower is the improvement direction (used for
 * lactate-at-threshold — lower lactate at the same intensity = better
 * fitness, though small differences are noise).
 */
function computeDelta({ prev, curr, sport, kind }) {
  if (prev == null || curr == null || !Number.isFinite(prev) || !Number.isFinite(curr)) {
    return { delta: null, percent: null, color: 'gray', arrow: '—', isImprove: null };
  }
  let delta;
  let isImprove;
  if (kind === 'power_or_pace') {
    if (sport === 'bike') {
      delta = curr - prev;
      isImprove = delta > 0;
    } else {
      // Pace: lower seconds = better. We report `prev - curr` so a
      // positive value means the athlete got faster.
      delta = prev - curr;
      isImprove = delta > 0;
    }
  } else if (kind === 'hr') {
    // HR at the threshold isn't an unambiguous "improvement" metric — we
    // just show the raw shift. Colour is neutral.
    delta = curr - prev;
    isImprove = null;
  } else if (kind === 'lactate') {
    // Lactate at threshold: small absolute changes are noise (< 0.2);
    // a meaningful drop suggests better lactate clearance. We treat
    // lower as improvement but keep colour subtle.
    delta = curr - prev;
    if (Math.abs(delta) < 0.2) isImprove = null;
    else isImprove = delta < 0;
  }
  const percent = (prev !== 0 && Number.isFinite(delta)) ? (delta / Math.abs(prev)) * 100 : null;
  const arrow = (kind === 'power_or_pace' || kind === 'lactate' || kind === 'hr')
    ? (Math.abs(delta) < 0.05 ? '−' : (delta > 0 ? '↑' : '↓'))
    : '—';
  let color = 'gray';
  if (isImprove === true) color = 'green';
  else if (isImprove === false) color = 'red';
  return { delta, percent, color, arrow, isImprove };
}

function changeCell({ prev, curr, sport, kind, label }) {
  const c = computeDelta({ prev, curr, sport, kind });
  const bgClass =
    c.color === 'green' ? 'bg-emerald-50 text-emerald-700' :
    c.color === 'red' ? 'bg-rose-50 text-rose-700' :
    'bg-gray-50 text-gray-600';
  if (c.delta == null) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${bgClass}`}>—</span>
    );
  }
  const absDelta = kind === 'power_or_pace' && sport !== 'bike' ? Math.abs(c.delta) : c.delta;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${bgClass}`} title={label}>
      <span>{c.arrow}</span>
      <span className="tabular-nums">{fmtChange(absDelta, sport)}</span>
      {c.percent != null && (
        <span className="tabular-nums opacity-80">({c.percent > 0 ? '+' : ''}{c.percent.toFixed(1)} %)</span>
      )}
    </span>
  );
}

export default function TestComparisonPanel({
  currentTest,
  allPrevTests = [],
  initialSelected = [],
}) {
  // Selected previous test IDs (max 2). Default to the most recent.
  const [selected, setSelected] = useState(() => {
    if (initialSelected.length > 0) return initialSelected;
    return allPrevTests[0]?._id ? [allPrevTests[0]._id] : [];
  });

  // If allPrevTests changes (e.g. async load), keep selection in sync —
  // pick the most recent if nothing is selected yet.
  useEffect(() => {
    if (selected.length === 0 && allPrevTests.length > 0) {
      setSelected([allPrevTests[0]._id]);
    }
  }, [allPrevTests, selected.length]);

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // FIFO — drop oldest selection
      return [...prev, id];
    });
  };

  // Build the tests array for the existing TestComparison component +
  // for the delta table. Order: oldest → newest (left → right reads
  // like time).
  const selectedTests = useMemo(() => {
    const picked = selected
      .map((id) => allPrevTests.find((t) => t._id === id))
      .filter(Boolean);
    const all = currentTest ? [...picked, currentTest] : picked;
    return all.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [selected, allPrevTests, currentTest]);

  const sport = normalizeSport(currentTest?.sport);

  // Per-test threshold extraction once, memoised.
  const testThresholds = useMemo(
    () => selectedTests.map((t) => ({ test: t, th: extractThresholds(t) })),
    [selectedTests],
  );

  // No data → graceful "nothing to compare yet" placeholder.
  if (!currentTest) return null;
  if (allPrevTests.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Test-to-test comparison</h3>
        <p className="text-[11px] text-gray-500">
          This is the first {sport} test on file for this athlete. After the next test,
          this panel will show a side-by-side comparison of LT1/LT2 power, HR and lactate
          across tests, plus an overlay of the curves.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Compare with previous tests</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            Select up to 2 previous {sport} tests to overlay against this one. Δ shows the change from the previous test to this one.
          </p>
        </div>
      </div>

      {/* Chip selector for previous tests */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {allPrevTests.slice(0, 10).map((t) => {
          const isSel = selected.includes(t._id);
          const selIdx = selected.indexOf(t._id);
          return (
            <button
              key={t._id}
              type="button"
              onClick={() => toggle(t._id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                isSel
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold ${
                isSel ? 'bg-white text-emerald-600' : 'bg-gray-100 text-gray-500'
              }`} style={{ fontSize: '9px' }}>
                {isSel ? selIdx + 1 : ''}
              </span>
              <span>{fmtDate(t.date)}</span>
              {t.title && <span className="opacity-70 hidden sm:inline">· {t.title}</span>}
            </button>
          );
        })}
        {allPrevTests.length > 10 && (
          <span className="text-[10px] text-gray-400 self-center px-1">
            +{allPrevTests.length - 10} older tests
          </span>
        )}
      </div>

      {/* Delta table — explicit LT1/LT2 numbers per test */}
      {selectedTests.length >= 2 && (
        <div className="overflow-x-auto -mx-1 px-1 mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-3 font-bold text-gray-700">Threshold</th>
                {testThresholds.map(({ test }, i) => (
                  <th key={test._id} className="text-left py-2 px-2 font-bold text-gray-700 whitespace-nowrap">
                    {i === testThresholds.length - 1 ? (
                      <span className="text-emerald-700">{fmtDate(test.date)}</span>
                    ) : (
                      <span>{fmtDate(test.date)}</span>
                    )}
                  </th>
                ))}
                <th className="text-left py-2 pl-2 font-bold text-gray-700">Δ vs previous</th>
              </tr>
            </thead>
            <tbody>
              {/* LT1 rows */}
              {[
                { key: 'lt1.power', label: 'LT1 power/pace', getter: (th) => th?.lt1.power, kind: 'power_or_pace', fmt: (v) => fmtPowerOrPace(v, sport) },
                { key: 'lt1.lactate', label: 'LT1 lactate', getter: (th) => th?.lt1.lactate, kind: 'lactate', fmt: fmtLactate },
                { key: 'lt1.hr', label: 'LT1 HR', getter: (th) => th?.lt1.hr, kind: 'hr', fmt: fmtHr },
                { key: 'lt2.power', label: 'LT2 power/pace', getter: (th) => th?.lt2.power, kind: 'power_or_pace', fmt: (v) => fmtPowerOrPace(v, sport) },
                { key: 'lt2.lactate', label: 'LT2 lactate', getter: (th) => th?.lt2.lactate, kind: 'lactate', fmt: fmtLactate },
                { key: 'lt2.hr', label: 'LT2 HR', getter: (th) => th?.lt2.hr, kind: 'hr', fmt: fmtHr },
              ].map((row) => {
                const prevVal = testThresholds.length >= 2 ? row.getter(testThresholds[testThresholds.length - 2].th) : null;
                const currVal = row.getter(testThresholds[testThresholds.length - 1].th);
                const isLt1Row = row.key.startsWith('lt1');
                const isThresholdHeaderRow = row.key === 'lt1.power' || row.key === 'lt2.power';
                return (
                  <tr key={row.key} className={`border-b border-gray-100 last:border-b-0 ${isThresholdHeaderRow ? 'bg-gray-50/60' : ''}`}>
                    <td className={`py-1.5 pr-3 text-gray-600 ${isThresholdHeaderRow ? 'font-bold' : ''}`}>
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${isLt1Row ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {row.label}
                    </td>
                    {testThresholds.map(({ test, th }) => (
                      <td key={test._id} className="py-1.5 px-2 tabular-nums text-gray-900">
                        {row.fmt(row.getter(th))}
                      </td>
                    ))}
                    <td className="py-1.5 pl-2">
                      {changeCell({ prev: prevVal, curr: currVal, sport, kind: row.kind, label: row.label })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Curve overlay + zones comparison — delegates to the existing
          TestComparison component which already handles the canvas
          rendering + zones table. */}
      {selectedTests.length >= 2 && (
        <div className="mt-2">
          <TestComparison tests={selectedTests} />
        </div>
      )}

      {selectedTests.length < 2 && (
        <p className="text-[11px] text-gray-400 italic mt-2">
          Tap a previous test above to overlay it on the current one.
        </p>
      )}
    </div>
  );
}
