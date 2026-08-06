/**
 * ReturnProgressChart - weekly volume and pace across a health episode.
 *
 * The point of this chart is a comparison the athlete cannot make in their head:
 * what they actually did each week, against the ceiling the protocol allowed
 * them AT THAT TIME, against what they used to do before the injury. The ceiling
 * moves every time the stage changes, so a single "your limit is X" line would
 * be wrong for most of the history. The server reconstructs it per week from
 * stageHistory and sends it back; this component only draws.
 *
 * Weeks before onset are shaded as a control band. Seeing eight normal weeks
 * followed by the drop is what makes the scale of a comeback legible, and it is
 * also where the volume spike that preceded the injury shows up.
 */
import React, { useMemo, useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';
import { fetchProgress } from '../../services/healthApi';

const COLORS = {
  ok: '#2563EB',
  breach: '#DC2626',
  preInjury: '#CBD5E1',
  ceiling: '#EA580C',
  baseline: '#94A3B8',
  pace: '#0F766E',
  fastest: '#7C3AED',
  cap: '#EA580C',
};

function fmtWeek(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** m/s to seconds per km. Null-safe: a week with no usable speed has no pace. */
function paceSecPerKm(mps) {
  const v = Number(mps);
  return v > 0 ? 1000 / v : null;
}

function fmtPaceSec(sec) {
  if (!(sec > 0) || !Number.isFinite(sec)) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ChartTooltip({ active, payload, mode }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <div className="font-semibold text-gray-900">Week of {fmtWeek(row.weekStart)}</div>
      {row.isPreInjury ? (
        <div className="text-gray-500 mt-0.5">Before the injury</div>
      ) : row.stageName ? (
        <div className="text-gray-500 mt-0.5">{row.stageName}</div>
      ) : null}

      {mode === 'volume' ? (
        <div className="mt-1.5 space-y-0.5">
          <div className="text-gray-700">
            {row.km != null ? `${row.km.toFixed(1)} km` : 'no running'}
            {row.sessions ? ` in ${row.sessions} session${row.sessions > 1 ? 's' : ''}` : ''}
          </div>
          {row.ceilingKm != null && (
            <div style={{ color: row.breachedVolume ? COLORS.breach : '#6B7280' }}>
              Ceiling {row.ceilingKm.toFixed(1)} km
              {row.breachedVolume ? ' - over it' : ''}
            </div>
          )}
          {row.pctOfBaseline != null && (
            <div className="text-gray-500">{row.pctOfBaseline}% of pre-injury volume</div>
          )}
        </div>
      ) : (
        <div className="mt-1.5 space-y-0.5">
          <div className="text-gray-700">
            {row.avgPaceSec != null ? `${fmtPaceSec(row.avgPaceSec)} /km average` : 'no pace recorded'}
          </div>
          {row.fastestPaceSec != null && (
            <div className="text-gray-500">{fmtPaceSec(row.fastestPaceSec)} /km fastest session</div>
          )}
          {row.capPaceSec != null && (
            <div style={{ color: row.breachedSpeed ? COLORS.breach : '#6B7280' }}>
              Speed ceiling {fmtPaceSec(row.capPaceSec)} /km
              {row.breachedSpeed ? ' - went faster' : ''}
            </div>
          )}
        </div>
      )}

      {row.painMax != null && (
        <div className="mt-1 pt-1 border-t border-gray-100 text-gray-500">
          Worst pain that week: {row.painMax}/10
        </div>
      )}
    </div>
  );
}

export default function ReturnProgressChart({ progress, loading, error }) {
  const [mode, setMode] = useState('volume');

  const rows = useMemo(() => (progress?.weeks || []).map((w) => {
    const km = Number(w.distanceM) > 0 ? Number(w.distanceM) / 1000 : 0;
    const ceilingKm = w.ceilingDistanceM == null ? null : Number(w.ceilingDistanceM) / 1000;
    return {
      ...w,
      km,
      ceilingKm,
      avgPaceSec: paceSecPerKm(w.avgSpeedMps),
      fastestPaceSec: paceSecPerKm(w.fastestSpeedMps),
      capPaceSec: paceSecPerKm(w.speedCapMps),
    };
  }), [progress]);

  // The band behind the weeks that predate the injury.
  const preInjuryEnd = useMemo(() => {
    const last = [...rows].reverse().find((r) => r.isPreInjury);
    return last ? last.weekStart : null;
  }, [rows]);

  const baselineKm = progress?.baseline?.weeklyDistanceM > 0
    ? progress.baseline.weeklyDistanceM / 1000
    : null;

  const hasPace = rows.some((r) => r.avgPaceSec != null);

  if (loading) return <div className="h-52 bg-gray-100 rounded-lg animate-pulse" />;
  if (error) {
    return (
      <div className="text-xs text-gray-500 py-3">
        Progress data is unavailable right now.
      </div>
    );
  }
  if (rows.length < 2) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-xs font-semibold text-gray-700">Return progress</div>
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {[['volume', 'Volume'], ['pace', 'Pace']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              disabled={key === 'pace' && !hasPace}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                mode === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              } disabled:opacity-40`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />

            {preInjuryEnd && (
              <ReferenceArea
                x1={rows[0].weekStart}
                x2={preInjuryEnd}
                fill="#F1F5F9"
                fillOpacity={0.8}
                ifOverflow="extendDomain"
              />
            )}

            <XAxis
              dataKey="weekStart"
              tickFormatter={fmtWeek}
              tick={{ fontSize: 10, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />

            {mode === 'volume' ? (
              <>
                <YAxis
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                  unit=" km"
                />
                <Tooltip content={<ChartTooltip mode="volume" />} cursor={{ fill: '#F8FAFC' }} />
                {baselineKm != null && (
                  <ReferenceLine
                    y={baselineKm}
                    stroke={COLORS.baseline}
                    strokeDasharray="4 4"
                    label={{
                      value: 'pre-injury',
                      position: 'insideTopRight',
                      fontSize: 9,
                      fill: COLORS.baseline,
                    }}
                  />
                )}
                <Bar dataKey="km" name="Weekly volume" radius={[3, 3, 0, 0]} maxBarSize={26}>
                  {rows.map((r) => (
                    <Cell
                      key={r.weekStart}
                      fill={r.isPreInjury ? COLORS.preInjury : r.breachedVolume ? COLORS.breach : COLORS.ok}
                    />
                  ))}
                </Bar>
                <Line
                  type="stepAfter"
                  dataKey="ceilingKm"
                  name="Allowed ceiling"
                  stroke={COLORS.ceiling}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  connectNulls={false}
                />
              </>
            ) : (
              <>
                {/* Pace is seconds per km, so smaller is faster. Reversing the
                    axis puts faster at the top, which is what "getting better"
                    looks like to everyone reading it. */}
                <YAxis
                  reversed
                  domain={['dataMin - 20', 'dataMax + 20']}
                  tickFormatter={fmtPaceSec}
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={<ChartTooltip mode="pace" />} cursor={{ stroke: '#E2E8F0' }} />
                <Line
                  type="monotone"
                  dataKey="avgPaceSec"
                  name="Average pace"
                  stroke={COLORS.pace}
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="fastestPaceSec"
                  name="Fastest session"
                  stroke={COLORS.fastest}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls
                />
                <Line
                  type="stepAfter"
                  dataKey="capPaceSec"
                  name="Speed ceiling"
                  stroke={COLORS.cap}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={false}
                  connectNulls={false}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] text-gray-500">
        {mode === 'volume' ? (
          <>
            <Legend swatch={COLORS.ok} label="Weekly volume" />
            <Legend swatch={COLORS.breach} label="Over the ceiling" />
            <Legend swatch={COLORS.ceiling} label="Allowed ceiling" dashed />
            {baselineKm != null && (
              <Legend swatch={COLORS.baseline} label={`Pre-injury ${baselineKm.toFixed(0)} km/wk`} dashed />
            )}
          </>
        ) : (
          <>
            <Legend swatch={COLORS.pace} label="Average pace" />
            <Legend swatch={COLORS.fastest} label="Fastest session" dashed />
            <Legend swatch={COLORS.cap} label="Speed ceiling" dashed />
          </>
        )}
      </div>

      {!hasPace && mode === 'volume' && (
        <div className="text-[10px] text-gray-400 mt-1">
          Pace needs sessions with distance and time. Nothing usable recorded yet.
        </div>
      )}
    </div>
  );
}

/**
 * Self-fetching wrapper so a caller only has to know the episode id. Renders
 * nothing at all when there is no usable series, because an empty chart frame
 * on a page that is already dense reads as something being broken.
 */
export function EpisodeProgressPanel({ episodeId, weeks = 8, className = '', unstyled = false }) {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!episodeId) return undefined;
    setLoading(true);
    setError(null);
    fetchProgress(episodeId, weeks)
      .then((p) => { if (!cancelled) setProgress(p); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.error || 'unavailable'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [episodeId, weeks]);

  if (!loading && !error && (progress?.weeks?.length || 0) < 2) return null;
  if (error) return null;

  // The native screen supplies its own glass card, so the web chrome would sit
  // a second border inside it.
  const wrapper = unstyled ? className : `bg-white rounded-xl border border-gray-200 p-4 ${className}`;

  return (
    <div className={wrapper}>
      <ReturnProgressChart progress={progress} loading={loading} error={null} />
    </div>
  );
}

function Legend({ swatch, label, dashed }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block"
        style={{
          width: 12,
          height: dashed ? 0 : 8,
          borderTop: dashed ? `2px dashed ${swatch}` : undefined,
          background: dashed ? undefined : swatch,
          borderRadius: dashed ? 0 : 2,
        }}
      />
      {label}
    </span>
  );
}
