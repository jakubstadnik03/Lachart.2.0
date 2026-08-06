/**
 * SymptomLoadChart - the hallmark symptom metric over time.
 *
 * Drawn on one axis with the pain reported during sessions, so the lag between
 * a hard week and the flare-up it produced is visible rather than argued about.
 * Step-backs and red-flag days are marked, because "what happened around the
 * 12th?" is the question people actually ask when they look at this.
 */
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts';

const COLORS = {
  hallmark: '#2563EB',
  painDuring: '#EA580C',
  flag: '#DC2626',
};

function fmtDay(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function SymptomLoadChart({ checkIns = [], catalogEntry }) {
  const hallmark = catalogEntry?.hallmark;

  const data = useMemo(() => {
    // One row per day; a day with both a morning and a post-session report keeps
    // the worse of the two, which is the value the gate reasons about anyway.
    const byDay = new Map();
    for (const c of checkIns) {
      const key = String(c.date).slice(0, 10);
      const prev = byDay.get(key) || { date: key };
      const worse = (a, b) => {
        if (a == null) return b;
        if (b == null) return a;
        return hallmark?.betterIsLower === false ? Math.min(a, b) : Math.max(a, b);
      };
      prev.hallmarkValue = worse(prev.hallmarkValue, c.hallmarkValue ?? null);
      prev.painDuring = Math.max(prev.painDuring ?? 0, c.painDuringSession ?? 0) || null;
      prev.flagged = prev.flagged || c.limping || c.nightPain || c.painAtRest
        || (c.redFlagsReported || []).length > 0;
      byDay.set(key, prev);
    }
    return Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [checkIns, hallmark]);

  if (data.length < 2) return null;

  const flagged = data.filter((d) => d.flagged);
  // Minutes-based metrics blow the axis out next to a 0-10 pain scale, so they
  // get their own right-hand axis rather than being squashed together.
  const hallmarkOnRightAxis = hallmark?.kind === 'minutes';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-700">Symptom trend</div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 rounded" style={{ background: COLORS.hallmark }} />
            {hallmark?.kind === 'minutes' ? 'Minutes' : 'Score'}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 rounded" style={{ background: COLORS.painDuring }} />
            Pain in session
          </span>
        </div>
      </div>

      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDay}
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              yAxisId="pain"
              domain={[0, 10]}
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            {hallmarkOnRightAxis && (
              <YAxis
                yAxisId="hallmark"
                orientation="right"
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
            )}
            <Tooltip
              labelFormatter={fmtDay}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
              formatter={(value, name) => [value, name]}
            />
            <Line
              yAxisId={hallmarkOnRightAxis ? 'hallmark' : 'pain'}
              type="monotone"
              dataKey="hallmarkValue"
              name={hallmark?.kind === 'minutes' ? 'Minutes' : 'Score'}
              stroke={COLORS.hallmark}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              connectNulls
            />
            <Line
              yAxisId="pain"
              type="monotone"
              dataKey="painDuring"
              name="Pain in session"
              stroke={COLORS.painDuring}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
            />
            {flagged.map((d) => (
              <ReferenceDot
                key={d.date}
                yAxisId="pain"
                x={d.date}
                y={10}
                r={4}
                fill={COLORS.flag}
                stroke="none"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {flagged.length > 0 && (
        <div className="text-[10px] text-gray-500 mt-1">
          <span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: COLORS.flag }} />
          {flagged.length} day{flagged.length > 1 ? 's' : ''} with a limp, night pain or a red flag
        </div>
      )}
    </div>
  );
}
