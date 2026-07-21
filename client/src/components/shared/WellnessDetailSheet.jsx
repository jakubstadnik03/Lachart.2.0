import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import EChartsModule from 'echarts-for-react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { fetchWellness } from '../../services/wellnessData';

const ReactECharts = EChartsModule?.default ?? EChartsModule;

/**
 * Wellness metric detail — tap-through from the calendar day strips and the
 * dashboard wellness cards. Trend chart with personal baseline + normal range;
 * tap any point to select that day (its values, status and the sleep hypnogram
 * update). Swipe the sheet down to dismiss.
 */

const METRICS = [
  { id: 'sleep', key: 'sleepMinutes', label: 'Sleep', unit: 'h', color: '#8b5cf6', higherIsBetter: true },
  { id: 'rhr', key: 'restingHeartRate', label: 'Resting HR', unit: 'bpm', color: '#f43f5e', higherIsBetter: false },
  { id: 'hrv', key: 'hrvMs', label: 'HRV', unit: 'ms', color: '#10b981', higherIsBetter: true },
  { id: 'lowhr', key: 'sleepingHeartRate', label: 'Low HR', unit: 'bpm', color: '#0ea5e9', higherIsBetter: false },
];
const RANGES = [7, 14, 30, 60, 90];

// Hypnogram rows, bottom (deep) → top (awake). unspecified folds into core.
const STAGE_ROWS = ['deep', 'core', 'rem', 'awake'];
const STAGE_META = {
  deep: { label: 'Deep', color: '#3730a3' },
  core: { label: 'Core', color: '#6366f1' },
  rem: { label: 'REM', color: '#a5b4fc' },
  awake: { label: 'Awake', color: '#fb923c' },
};
const stageRow = (stage) => {
  const s = stage === 'unspecified' ? 'core' : stage;
  const idx = STAGE_ROWS.indexOf(s);
  return idx < 0 ? 1 : idx;
};

const fmtSleepHm = (mins) => {
  if (mins == null || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};
const fmtClock = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtDur = (mins) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
  return { mean, sd, lo: Math.max(0, mean - sd), hi: mean + sd, count: vals.length };
}

function dayStatus(val, stats, metric) {
  if (val == null || val <= 0 || !stats || stats.count < 3) return 'normal';
  if (val < stats.lo) return metric.higherIsBetter ? 'low' : 'good-low';
  if (val > stats.hi) return metric.higherIsBetter ? 'good-high' : 'high';
  return 'normal';
}

const STATUS_UI = {
  low: { label: 'Below your normal', cls: 'bg-rose-50 text-rose-600 ring-rose-200' },
  high: { label: 'Above your normal', cls: 'bg-rose-50 text-rose-600 ring-rose-200' },
  'good-low': { label: 'Better than usual', cls: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  'good-high': { label: 'Better than usual', cls: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  normal: { label: 'In your normal range', cls: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
};

function insightText(metric, stats, status) {
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
      if (status === 'low') return `${head} HRV below your baseline suggests accumulated stress or incomplete recovery — favour easy sessions and sleep until it rebounds.`;
      if (status === 'good-high') return `${head} HRV above baseline — you are well recovered and ready for harder training.`;
      return `${head} A stable HRV around your baseline means recovery is keeping up with training.`;
    case 'rhr':
      if (status === 'high') return `${head} Resting HR above your baseline often signals fatigue, dehydration or oncoming illness — consider an easier day.`;
      if (status === 'good-low') return `${head} Resting HR below baseline is a good sign of adaptation and recovery.`;
      return `${head} Resting HR at your baseline means your body is coping well with the current load.`;
    case 'lowhr':
      if (status === 'high') return `${head} Your overnight low is elevated — a classic sign of incomplete recovery, late meals, alcohol or an oncoming illness.`;
      if (status === 'good-low') return `${head} A lower overnight minimum than usual signals deep recovery and good aerobic adaptation.`;
      return `${head} This is your nightly heart-rate minimum (what Apple shows in Vitals) — it dips well below daytime resting HR during deep sleep.`;
    case 'sleep':
    default:
      if (status === 'low') return `${head} You slept less than usual — recovery quality drops fast under 7 h; try to bank extra sleep tonight.`;
      return `${head} For endurance athletes 7.5–9 h is the optimum; consistency matters more than one long night.`;
  }
}

export default function WellnessDetailSheet({ open, onClose, initialMetric = 'sleep', athleteId = null }) {
  const [metricId, setMetricId] = useState(initialMetric);
  const [rangeDays, setRangeDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(null); // index into windowRows; null = latest
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef({ startY: 0, dragging: false, atTop: true });
  const scrollRef = useRef(null);

  useEffect(() => { if (open) { setMetricId(initialMetric); setSelectedIdx(null); setDragY(0); } }, [open, initialMetric]);

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

  // Changing metric/range resets the selection to the most recent day with data.
  useEffect(() => { setSelectedIdx(null); }, [metricId, rangeDays]);

  const stats = useMemo(() => computeStats(windowRows, metric), [windowRows, metric]);

  const resolvedIdx = useMemo(() => {
    if (selectedIdx != null && windowRows[selectedIdx]) return selectedIdx;
    for (let i = windowRows.length - 1; i >= 0; i -= 1) {
      if (windowRows[i][metric.key] != null && windowRows[i][metric.key] > 0) return i;
    }
    return windowRows.length - 1;
  }, [selectedIdx, windowRows, metric]);

  const selectedRow = resolvedIdx >= 0 ? windowRows[resolvedIdx] : null;
  const selVal = selectedRow ? selectedRow[metric.key] : null;
  const selStatus = dayStatus(selVal, stats, metric);
  const statusUi = STATUS_UI[selStatus];

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
    const avg = stats ? toUnit(stats.mean) : null;
    const marks = [];
    if (stats && stats.count >= 3) {
      marks.push({
        yAxis: avg,
        lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 },
        label: {
          position: 'insideStartTop', // left side — the right edge clips the text
          formatter: () => `Avg ${isSleep ? fmtSleepHm(stats.mean) : `${Math.round(avg)} ${metric.unit}`}`,
          fontSize: 10,
          color: '#b45309',
          backgroundColor: 'rgba(255,255,255,0.85)',
          padding: [1, 3],
          borderRadius: 3,
        },
      });
    }
    if (resolvedIdx >= 0 && dates[resolvedIdx] != null) {
      marks.push({
        xAxis: dates[resolvedIdx],
        lineStyle: { color: metric.color, type: 'dashed', width: 1.5, opacity: 0.7 },
        label: { show: false },
      });
    }

    return {
      grid: { left: 42, right: 16, top: 16, bottom: 26 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: metric.color, opacity: 0.4 } },
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (!p) return '';
          const row = windowRows[p.dataIndex] || {};
          const dateLabel = row.date
            ? new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
            : p.axisValue;
          const line = (label, v, suffix) => (v != null && v > 0
            ? `<div style="display:flex;justify-content:space-between;gap:14px"><span style="color:#6b7280">${label}</span><b>${v}${suffix}</b></div>` : '');
          return `<div style="font-weight:700;margin-bottom:4px">${dateLabel}</div>`
            + line('Sleep', row.sleepMinutes > 0 ? fmtSleepHm(row.sleepMinutes) : null, '')
            + line('Resting HR', row.restingHeartRate, ' bpm')
            + line('Low HR', row.sleepingHeartRate, ' bpm')
            + line('HRV', row.hrvMs, ' ms');
        },
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
        symbolSize: 7,
        lineStyle: { color: metric.color, width: 2 },
        itemStyle: { color: metric.color },
        emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2 } },
        ...(stats && stats.count >= 3 ? {
          markArea: {
            silent: true,
            itemStyle: { color: `${metric.color}14` },
            data: [[{ yAxis: toUnit(stats.lo) }, { yAxis: toUnit(stats.hi) }]],
          },
        } : {}),
        ...(marks.length ? { markLine: { silent: true, symbol: 'none', data: marks } } : {}),
      }],
    };
  }, [windowRows, metric, stats, resolvedIdx]);

  const onChartEvents = useMemo(() => ({
    click: (p) => { if (p && typeof p.dataIndex === 'number') setSelectedIdx(p.dataIndex); },
  }), []);

  // Hypnogram for the selected night.
  const hypnoOption = useMemo(() => {
    const segs = selectedRow?.sleepSegments;
    if (!Array.isArray(segs) || segs.length === 0) return null;
    const data = segs
      .filter((s) => s && s.end > s.start)
      .map((s) => ({ value: [s.start, s.end, stageRow(s.stage)], stage: s.stage }));
    if (!data.length) return null;
    const minX = Math.min(...data.map((d) => d.value[0]));
    const maxX = Math.max(...data.map((d) => d.value[1]));

    return {
      grid: { left: 52, right: 12, top: 6, bottom: 22 },
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const [s, e, row] = p.value;
          const stage = STAGE_META[STAGE_ROWS[row]];
          return `<b style="color:${stage.color}">${stage.label}</b><br/>${fmtClock(s)} – ${fmtClock(e)} · ${fmtDur((e - s) / 60000)}`;
        },
      },
      xAxis: {
        type: 'time',
        min: minX,
        max: maxX,
        axisLabel: { fontSize: 9, color: '#9ca3af', formatter: (v) => fmtClock(v) },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: STAGE_ROWS.map((s) => STAGE_META[s].label),
        axisLabel: { fontSize: 9, color: '#9ca3af' },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: true, lineStyle: { color: '#f3f4f6' } },
      },
      series: [{
        type: 'custom',
        renderItem: (params, api) => {
          const start = api.coord([api.value(0), api.value(2)]);
          const end = api.coord([api.value(1), api.value(2)]);
          const bandH = api.size([0, 1])[1];
          const h = Math.max(6, bandH * 0.5);
          const stageKey = STAGE_ROWS[api.value(2)];
          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: start[1] - h / 2,
              width: Math.max(1.5, end[0] - start[0]),
              height: h,
              r: 2,
            },
            style: { fill: STAGE_META[stageKey].color },
          };
        },
        encode: { x: [0, 1], y: 2 },
        data,
      }],
    };
  }, [selectedRow]);

  // Legend totals for the selected night (from per-stage minutes).
  const stageLegend = useMemo(() => {
    const st = selectedRow?.sleepStages;
    if (!st) return null;
    const items = [
      { key: 'deep', min: st.deepMin || 0 },
      { key: 'core', min: (st.coreMin || 0) + (st.unspecifiedMin || 0) },
      { key: 'rem', min: st.remMin || 0 },
      { key: 'awake', min: st.awakeMin || 0 },
    ].filter((s) => s.min > 0);
    return items.length ? items : null;
  }, [selectedRow]);

  // Swipe-down-to-close (drag the header / handle).
  const onDragStart = (e) => {
    const y = e.touches?.[0]?.clientY ?? 0;
    dragRef.current = { startY: y, dragging: true, atTop: (scrollRef.current?.scrollTop || 0) <= 2 };
  };
  const onDragMove = (e) => {
    if (!dragRef.current.dragging) return;
    const y = e.touches?.[0]?.clientY ?? 0;
    const dy = y - dragRef.current.startY;
    if (dy > 0 && dragRef.current.atTop) setDragY(dy);
  };
  const onDragEnd = () => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (dragY > 110) onClose();
    else setDragY(0);
  };

  if (!open) return null;

  const selDateLabel = selectedRow?.date
    ? new Date(`${selectedRow.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', weekday: 'short' })
    : null;

  return ReactDOM.createPortal(
    // app-modal-root has pointer-events:none — the sheet must re-enable them.
    <div className="fixed inset-0 z-[1200] flex items-end md:items-center justify-center pointer-events-auto" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : 'transform 0.2s ease-out' }}
      >
        <div
          className="shrink-0 bg-white rounded-t-2xl"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
        >
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>
          <div className="px-4 pb-2 flex items-center justify-between border-b border-gray-100">
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1 overflow-x-auto max-w-[calc(100%-3rem)]">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetricId(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap flex-shrink-0 ${m.id === metric.id ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="px-4 py-4 overflow-y-auto">
          <div className="flex items-end justify-between mb-1">
            <div>
              <div className="text-3xl font-extrabold text-gray-900">
                {fmtValue(metric, selVal)}
                <span className="text-sm font-semibold text-gray-400 ml-1">{metric.id === 'sleep' ? 'h' : metric.unit}</span>
              </div>
              {selDateLabel && <div className="text-xs text-gray-400 mt-0.5">{selDateLabel}</div>}
            </div>
            {stats && stats.count >= 3 && selVal > 0 && (
              <div className="text-right">
                <div className={`inline-block text-[11px] font-bold px-2 py-1 rounded-full ring-1 ${statusUi.cls}`}>{statusUi.label}</div>
                <div className="text-xs text-gray-400 mt-1">
                  Normal: {metric.id === 'sleep' ? `${fmtSleepHm(stats.lo)}–${fmtSleepHm(stats.hi)} h` : `${Math.round(stats.lo)}–${Math.round(stats.hi)} ${metric.unit}`}
                </div>
              </div>
            )}
          </div>

          {/* All of the selected day's metrics at a glance. */}
          {selectedRow && (
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {METRICS.map((m) => {
                const v = selectedRow[m.key];
                const active = m.id === metric.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetricId(m.id)}
                    className={`rounded-lg py-1.5 px-1 text-center transition-colors ${active ? 'bg-gray-100 ring-1 ring-gray-200' : 'bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="text-[9px] text-gray-400 truncate">{m.label}</div>
                    <div className="text-[13px] font-bold text-gray-800 tabular-nums">
                      {m.id === 'sleep' ? (v > 0 ? fmtSleepHm(v) : '—') : (v ?? '—')}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <div className="h-56 flex items-center justify-center text-sm text-gray-400">Loading…</div>
          ) : windowRows.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-gray-400 text-center px-6">
              No data in this range yet. Sync Apple Health in Settings and daily values will appear here.
            </div>
          ) : (
            <ReactECharts
              key={`${metric.id}-${rangeDays}`}
              option={chartOption}
              onEvents={onChartEvents}
              style={{ height: 220 }}
              notMerge
              lazyUpdate
            />
          )}
          {windowRows.length > 0 && (
            <div className="text-[10px] text-gray-400 text-center -mt-1 mb-1">Tap a point to see that day</div>
          )}

          {metric.id === 'sleep' && hypnoOption && (
            <div className="mt-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                Sleep stages{selDateLabel ? ` · ${selDateLabel}` : ''}
              </div>
              <ReactECharts key={`hypno-${selectedRow?.date}`} option={hypnoOption} style={{ height: 150 }} notMerge lazyUpdate />
              {stageLegend && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {stageLegend.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_META[s.key].color }} />
                      <span className="font-semibold">{STAGE_META[s.key].label}</span>
                      <span className="text-gray-400">{fmtSleepHm(s.min)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fallback proportional bar when the night has stage totals but no timeline. */}
          {metric.id === 'sleep' && !hypnoOption && stageLegend && (() => {
            const total = stageLegend.reduce((a, s) => a + s.min, 0);
            return (
              <div className="mt-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                  Sleep stages{selDateLabel ? ` · ${selDateLabel}` : ''}
                </div>
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                  {stageLegend.map((s) => (
                    <div key={s.key} style={{ width: `${(s.min / total) * 100}%`, backgroundColor: STAGE_META[s.key].color }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {stageLegend.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STAGE_META[s.key].color }} />
                      <span className="font-semibold">{STAGE_META[s.key].label}</span>
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
            {insightText(metric, stats, selStatus)}
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body,
  );
}
