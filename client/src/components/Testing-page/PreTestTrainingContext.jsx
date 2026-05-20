/**
 * PreTestTrainingContext
 * ──────────────────────
 * "What was the athlete actually doing in the weeks before this test?"
 *
 * Displayed on the lactate test detail page. Surfaces 28 days of
 * training context — total volume + TSS, lactate sessions, races, plus
 * a CTL/ATL sparkline. This is the missing piece sport scientists (test
 * centres in particular) need to interpret threshold drift between
 * consecutive tests: a 15 W LT2 jump means very different things if it
 * follows a heavy training block vs. a 2-week taper.
 *
 * Data comes from a single server endpoint that aggregates Strava + FIT
 * + manual Training docs in the window before the test date.
 */
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';

function fmtNumber(n, decimals = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
}

/** Compact tile for one of the 6 headline numbers. */
function StatTile({ label, value, unit = '', accent = null }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5 flex flex-col">
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">
        {label}
      </span>
      <span className={`text-base font-bold mt-1 tabular-nums leading-none ${accent || 'text-gray-900'}`}>
        {value}
        {unit && <span className="text-[10px] font-semibold text-gray-500 ml-1">{unit}</span>}
      </span>
    </div>
  );
}

/**
 * Tiny SVG sparkline with TSS bars + CTL (chronic, solid line) + ATL
 * (acute, dashed line) overlaid. Keeps the widget self-contained — no
 * chart library dependency for a single chart.
 */
function CtlAtlSparkline({ daily, ctl, atl, height = 80 }) {
  const { paths, ticks } = useMemo(() => {
    if (!daily?.length) return { paths: null, ticks: [] };
    const n = daily.length;
    const maxTss = Math.max(1, ...daily.map(d => d.tss || 0));
    const maxCa = Math.max(
      maxTss,
      ...(ctl || []).map(c => c.value),
      ...(atl || []).map(a => a.value),
    ) * 1.1;

    const x = (i) => (i / Math.max(1, n - 1)) * 100;
    const yBar = (v) => height - (v / maxCa) * (height - 6);

    // Background bars (one per day TSS)
    const bars = daily.map((d, i) => {
      const w = Math.max(0.6, 100 / Math.max(1, n) - 0.5);
      const h = Math.max(0, height - 6 - yBar(d.tss));
      return { x: x(i) - w / 2, y: yBar(d.tss), w, h, isWeekend: new Date(d.date + 'T12:00:00Z').getUTCDay() % 6 === 0 };
    });

    const linePath = (arr) => arr.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${yBar(p.value).toFixed(2)}`).join(' ');
    const ctlPath = ctl?.length ? linePath(ctl) : null;
    const atlPath = atl?.length ? linePath(atl) : null;

    // Date ticks: first, mid, last
    const ticks = [
      { x: 0, label: daily[0].date.slice(5) },
      { x: 50, label: daily[Math.floor(n / 2)].date.slice(5) },
      { x: 100, label: daily[n - 1].date.slice(5) },
    ];

    return {
      paths: { bars, ctlPath, atlPath, maxCa: Math.round(maxCa) },
      ticks,
    };
  }, [daily, ctl, atl, height]);

  if (!paths) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-gray-400">
        No training data in this window.
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 100 ${height + 14}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: height + 14 }}
      >
        {/* TSS bars */}
        {paths.bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={b.isWeekend ? '#cbd5e1' : '#94a3b8'}
            opacity={0.55}
          />
        ))}
        {/* CTL line (chronic — solid, blue) */}
        {paths.ctlPath && (
          <path d={paths.ctlPath} fill="none" stroke="#2563eb" strokeWidth="0.7" />
        )}
        {/* ATL line (acute — dashed, amber) */}
        {paths.atlPath && (
          <path d={paths.atlPath} fill="none" stroke="#f59e0b" strokeWidth="0.7" strokeDasharray="1.5 1.5" />
        )}
        {/* Date ticks */}
        {ticks.map((t, i) => (
          <text key={i} x={t.x} y={height + 12} fontSize="3" fill="#94a3b8" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
            {t.label}
          </text>
        ))}
      </svg>
      <div className="absolute top-1 right-1 flex items-center gap-3 text-[9px] font-semibold pointer-events-none">
        <span className="flex items-center gap-1 text-blue-600">
          <span className="inline-block w-3 h-0.5 bg-blue-600" /> CTL
        </span>
        <span className="flex items-center gap-1 text-amber-600">
          <span className="inline-block w-3 h-0.5" style={{ background: 'repeating-linear-gradient(90deg,#f59e0b 0 2px,transparent 2px 4px)' }} /> ATL
        </span>
      </div>
    </div>
  );
}

export default function PreTestTrainingContext({ athleteId, testDate, days = 28 }) {
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!athleteId || !testDate) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/test/${athleteId}/training-context`, { params: { testDate, days } })
      .then((res) => { if (!cancelled) setCtx(res.data); })
      .catch((e) => {
        if (cancelled) return;
        const status = e?.response?.status;
        if (status === 403) {
          // Not authorised — hide silently.
          setError('hidden');
        } else if (status === 404) {
          // Endpoint not deployed yet (server is on an older build).
          // Hide silently rather than showing a red banner — it'll just
          // start working once the backend redeploys.
          setError('hidden');
        } else {
          setError(e?.response?.data?.error || e?.message || 'Failed to load');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [athleteId, testDate, days]);

  // Silent hide when forbidden or missing inputs
  if (error === 'hidden' || (!athleteId && !loading) || (!testDate && !loading)) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            Training context — {days} days before this test
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            What the athlete actually did before walking into the lab. Helpful for interpreting threshold drift vs. previous tests.
          </p>
        </div>
        {ctx?.window && (
          <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap">
            {ctx.window.from} → {ctx.window.to}
          </span>
        )}
      </div>

      {loading && (
        <div className="h-32 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && error !== 'hidden' && (
        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!loading && !error && ctx && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            <StatTile label="Total TSS" value={fmtNumber(ctx.totals.tss)} />
            <StatTile label="Hours" value={fmtNumber(ctx.totals.hours, 1)} unit="h" />
            <StatTile label="Sessions" value={fmtNumber(ctx.totals.sessions)} />
            <StatTile label="Distance" value={fmtNumber(ctx.totals.distanceKm, 1)} unit="km" />
            <StatTile label="Lactate" value={fmtNumber(ctx.totals.lactateSessions)} unit="sess." />
            <StatTile label="Races" value={fmtNumber(ctx.totals.races)} accent={ctx.totals.races > 0 ? 'text-rose-600' : null} />
          </div>

          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                TSS per day + CTL/ATL
              </span>
              <div className="flex items-center gap-3 text-[10px] font-semibold">
                <span>CTL <span className="font-bold text-blue-600 tabular-nums">{fmtNumber(ctx.ctlNow, 0)}</span></span>
                <span>ATL <span className="font-bold text-amber-600 tabular-nums">{fmtNumber(ctx.atlNow, 0)}</span></span>
                <span>
                  TSB <span className={`font-bold tabular-nums ${ctx.tsbNow > 5 ? 'text-emerald-600' : ctx.tsbNow < -10 ? 'text-rose-600' : 'text-gray-700'}`}>
                    {ctx.tsbNow > 0 ? '+' : ''}{fmtNumber(ctx.tsbNow, 0)}
                  </span>
                </span>
              </div>
            </div>
            <CtlAtlSparkline daily={ctx.daily} ctl={ctx.ctl} atl={ctx.atl} />
            <div className="mt-2 text-[10px] text-gray-500 leading-relaxed">
              {ctx.tsbNow > 10 && (
                <span>Athlete arrived <span className="font-bold text-emerald-700">fresh / tapered</span> (TSB +{Math.round(ctx.tsbNow)}). Higher thresholds vs. previous tests likely reflect freshness, not pure adaptation.</span>
              )}
              {ctx.tsbNow < -10 && (
                <span>Athlete arrived <span className="font-bold text-rose-700">fatigued</span> (TSB {Math.round(ctx.tsbNow)}). Thresholds may be depressed vs. true ceiling — consider retest after recovery.</span>
              )}
              {ctx.tsbNow >= -10 && ctx.tsbNow <= 10 && (
                <span>Athlete arrived in a <span className="font-bold text-gray-700">neutral form state</span> (TSB {ctx.tsbNow > 0 ? '+' : ''}{Math.round(ctx.tsbNow)}). Threshold comparisons vs. previous tests are reliable.</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
