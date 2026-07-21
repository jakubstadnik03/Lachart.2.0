import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import EChartsModule from 'echarts-for-react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { fetchWellness } from '../../services/wellnessData';

const ReactECharts = EChartsModule?.default ?? EChartsModule;

/**
 * Wellness metric detail — tap-through from the calendar day strips and the
 * dashboard wellness card. Trend chart with personal baseline + normal range
 * (mean ± 1 SD over the visible window), latest-value status and a plain-
 * language hint about what "optimal" looks like for this athlete.
 */

const METRICS = [
  { id: 'sleep', key: 'sleepMinutes', label: 'Sleep', unit: 'h', color: '#8b5cf6', higherIsBetter: true },
  { id: 'rhr', key: 'restingHeartRate', label: 'Resting HR', unit: 'bpm', color: '#f43f5e', higherIsBetter: false },
  { id: 'hrv', key: 'hrvMs', label: 'HRV', unit: 'ms', color: '#10b981', higherIsBetter: true },
];
const RANGES = [7, 14, 30, 60, 90];

const fmtSleepHm = (mins) => {
  if (mins == null || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

const fmtValue = (metric, v) => {
  if (v == null) return '—';
  if (metric.id === 'sleep') return fmtSleepHm(v);
  return `${Math.round(v * 10) / 10}`;
};

function computeStats(rows, metric) {
  const vals = rows.map((r) => r[metric.key]).filter((v) => v != null && v > 0);
  if (vals.length === 0) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);
  const latestRow = [...rows].reverse().find((r) => r[metric.key] != null && r[metric.key] > 0);
  const latest = latestRow ? latestRow[metric.key] : null;
  const lo = Math.max(0, mean - sd);
  const hi = mean + sd;

  let status = 'normal';
  if (latest != null && vals.length >= 3) {
    if (latest < lo) status = metric.higherIsBetter ? 'low' : 'good-low';
    else if (latest > hi) status = metric.higherIsBetter ? 'good-high' : 'high';
  }
  return { mean, sd, lo, hi, latest, latestDate: latestRow?.date || null, count: vals.length, status };
}

const STATUS_UI = {
  low: { label: 'Below your normal', cls: 'bg-rose-50 text-rose-600 ring-rose-200' },
  high: { label: 'Above your normal', cls: 'bg-rose-50 text-rose-600 ring-rose-200' },
  'good-low': { label: 'Better than usual', cls: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  'good-high': { label: 'Better than usual', cls: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  normal: { label: 'In your normal range', cls: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
};

function insightText(metric, stats) {
  if (!stats || stats.count < 3) {
    return 'Not enough data yet — keep syncing daily and your personal baseline will appear here.';
  }
  const range = metric.id === 'sleep'
    ? `${fmtSleepHm(stats.lo)}–${fmtSleepHm(stats.hi)} h`
    : `${Math.round(stats.lo)}–${Math.round(stats.hi)} ${metric.unit}`;
  const base = metric.id === 'sleep' ? `${fmtSleepHm(stats.mean)} h` : `${Math.round(stats.mean)} ${metric.unit}`;
  const head = `Your baseline is ${base}; normal range ${range}.`;

  switch (metric.id) {
    case 'hrv':
      if (stats.status === 'low') return `${head} HRV below your baseline suggests accumulated stress or incomplete recovery — favour easy sessions and sleep until it rebounds.`;
      if (stats.status === 'good-high') return `${head} HRV above baseline — you are well recovered and ready for harder training.`;
      return `${head} A stable HRV around your baseline means recovery is keeping up with training.`;
    case 'rhr':
      if (stats.status === 'high') return `${head} Resting HR above your baseline often signals fatigue, dehydration or oncoming illness — consider an easier day.`;
      if (stats.status === 'good-low') return `${head} Resting HR below baseline is a good sign of adaptation and recovery.`;
      return `${head} Resting HR at your baseline means your body is coping well with the current load.`;
    case 'sleep':
    default:
      if (stats.status === 'low') return `${head} You slept less than usual — recovery quality drops fast under 7 h; try to bank extra sleep tonight.`;
      return `${head} For endurance athletes 7.5–9 h is the optimum; consistency matters more than one long night.`;
  }
}

export default function WellnessDetailSheet({ open, onClose, initialMetric = 'sleep', athleteId = null }) {
  const [metricId, setMetricId] = useState(initialMetric);
  const [rangeDays, setRangeDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (open) setMetricId(initialMetric); }, [open, initialMetric]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchWellness(90, athleteId || null)
      .then((w) => { if (!cancelled) setRows(w.days || []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, athleteId]);

  const metric = METRICS.find((m) => m.id === metricId) || METRICS[0];

  const windowRows = useMemo(() => {
    if (!rows.length) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const cutKey = cutoff.toISOString().slice(0, 10);
    return rows.filter((r) => r.date >= cutKey);
  }, [rows, rangeDays]);

  const stats = useMemo(() => computeStats(windowRows, metric), [windowRows, metric]);

  const chartOption = useMemo(() => {
    const isSleep = metric.id === 'sleep';
    const points = windowRows.map((r) => {
      const v = r[metric.key];
      return v != null && v > 0 ? (isSleep ? Math.round((v / 60) * 100) / 100 : v) : null;
    });
    const dates = windowRows.map((r) => {
      const d = new Date(`${r.date}T00:00:00`);
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    });
    const toUnit = (v) => (isSleep ? v / 60 : v);
    const bandLo = stats ? toUnit(stats.lo) : null;
    const bandHi = stats ? toUnit(stats.hi) : null;
    const avg = stats ? toUnit(stats.mean) : null;

    return {
      grid: { left: 42, right: 14, top: 14, bottom: 26 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v) => (v == null ? '—' : isSleep
          ? fmtSleepHm(Math.round(v * 60))
          : `${Math.round(v * 10) / 10} ${metric.unit}`),
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 10, color: '#9ca3af' },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { fontSize: 10, color: '#9ca3af' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      series: [{
        type: 'line',
        data: points,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: metric.color, width: 2 },
        itemStyle: { color: metric.color },
        ...(stats && stats.count >= 3 ? {
          markArea: {
            silent: true,
            itemStyle: { color: `${metric.color}14` },
            data: [[{ yAxis: bandLo }, { yAxis: bandHi }]],
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 },
            label: {
              formatter: () => (isSleep ? fmtSleepHm(stats.mean) : `${Math.round(avg)} ${metric.unit}`),
              fontSize: 10,
              color: '#b45309',
            },
            data: [{ yAxis: avg }],
          },
        } : {}),
      }],
    };
  }, [windowRows, metric, stats]);

  if (!open) return null;

  const statusUi = STATUS_UI[stats?.status || 'normal'];

  return ReactDOM.createPortal(
    // app-modal-root has pointer-events:none — the sheet must re-enable them.
    <div className="fixed inset-0 z-[1200] flex items-end md:items-center justify-center pointer-events-auto" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-4 pt-4 pb-2 flex items-center justify-between border-b border-gray-100 z-10">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetricId(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${m.id === metric.id ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-end justify-between mb-1">
            <div>
              <div className="text-3xl font-extrabold text-gray-900">
                {stats ? fmtValue(metric, stats.latest) : '—'}
                <span className="text-sm font-semibold text-gray-400 ml-1">{metric.id === 'sleep' ? 'h' : metric.unit}</span>
              </div>
              {stats?.latestDate && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(`${stats.latestDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', weekday: 'short' })}
                </div>
              )}
            </div>
            {stats && stats.count >= 3 && (
              <div className="text-right">
                <div className={`inline-block text-[11px] font-bold px-2 py-1 rounded-full ring-1 ${statusUi.cls}`}>{statusUi.label}</div>
                <div className="text-xs text-gray-400 mt-1">
                  Normal: {metric.id === 'sleep' ? `${fmtSleepHm(stats.lo)}–${fmtSleepHm(stats.hi)} h` : `${Math.round(stats.lo)}–${Math.round(stats.hi)} ${metric.unit}`}
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-56 flex items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : windowRows.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-gray-400 text-center px-6">
              No data in this range yet. Sync Apple Health in Settings and daily values will appear here.
            </div>
          ) : (
            // key forces a clean re-init when the metric or range changes —
            // some ECharts option diffs (markArea/markLine) don't apply cleanly.
            <ReactECharts key={`${metric.id}-${rangeDays}`} option={chartOption} style={{ height: 230 }} notMerge lazyUpdate />
          )}

          {metric.id === 'sleep' && (() => {
            const latestWithStages = [...windowRows].reverse().find((r) => r.sleepStages
              && (r.sleepStages.coreMin || r.sleepStages.deepMin || r.sleepStages.remMin || r.sleepStages.awakeMin));
            if (!latestWithStages) return null;
            const st = latestWithStages.sleepStages;
            const segments = [
              { label: 'Deep', min: st.deepMin || 0, color: '#3730a3' },
              { label: 'Core', min: (st.coreMin || 0) + (st.unspecifiedMin || 0), color: '#6366f1' },
              { label: 'REM', min: st.remMin || 0, color: '#a5b4fc' },
              { label: 'Awake', min: st.awakeMin || 0, color: '#fb923c' },
            ].filter((s) => s.min > 0);
            const total = segments.reduce((a, s) => a + s.min, 0);
            if (!total) return null;
            return (
              <div className="mt-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                  Sleep stages · {new Date(`${latestWithStages.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </div>
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                  {segments.map((s) => (
                    <div key={s.label} style={{ width: `${(s.min / total) * 100}%`, backgroundColor: s.color }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {segments.map((s) => (
                    <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold">{s.label}</span>
                      <span className="text-gray-400">{fmtSleepHm(s.min)}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex gap-1.5 mt-3 mb-4">
            {RANGES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRangeDays(d)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${rangeDays === d ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                {d}d
              </button>
            ))}
          </div>

          <div className="text-xs leading-relaxed text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
            {insightText(metric, stats)}
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body,
  );
}
