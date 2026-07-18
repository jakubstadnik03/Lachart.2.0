/**
 * ActivityPeaksTab — TrainingPeaks-style peaks view:
 *   · Power / HR by zones (bar chart + table)
 *   · Peak power / HR curve (area chart + two-column table)
 * Tap a peak row → highlights the effort on the ride + shows averages.
 * Optional Map/Graph opens the full chart at the same window.
 */

import React, { useMemo, useState } from 'react';
import {
  computePeakEfforts,
  computeZonesBreakdown,
  computeSegmentAverages,
  formatHms,
  formatPeakDuration,
  recordPower,
  recordHr,
  recordSpeed,
} from '../../utils/activityPeaks';
import { formatPaceMMSS } from '../../utils/unitsConverter';

const POWER_COLOR = '#7c3aed';
const HR_COLOR = '#ef4444';
const PACE_COLOR = '#2563eb';

function sportIsBike(sport) {
  const s = String(sport || '').toLowerCase();
  return s.includes('ride') || s.includes('bike') || s.includes('cycl') || s.includes('virtual');
}

function sportIsSwim(sport) {
  return String(sport || '').toLowerCase().includes('swim');
}

function ZonesSection({
  title, color, breakdown, selectedKey, onSelectZone,
}) {
  if (!breakdown?.zones?.length) return null;
  const maxMin = Math.max(...breakdown.zones.map((z) => z.minutes), 1);

  return (
    <section className="mb-8">
      <h3 className="text-[15px] font-bold text-gray-900 mb-3">{title}</h3>

      {/* Vertical bar chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-3">
        <div className="text-[11px] font-bold text-gray-500 text-center mb-1 uppercase tracking-wide">
          {title}
        </div>
        <div className="flex items-end justify-center gap-3 sm:gap-4" style={{ height: 140 }}>
          {breakdown.zones.map((z, i) => {
            const h = Math.max(4, (z.minutes / maxMin) * 120);
            const active = selectedKey === z.key;
            return (
              <button
                key={z.key}
                type="button"
                onClick={() => onSelectZone(z.key, z)}
                className="flex flex-col items-center justify-end flex-1 max-w-[52px] focus:outline-none group"
                style={{ touchAction: 'manipulation' }}
              >
                <div
                  className="w-full rounded-t-md transition-all duration-200"
                  style={{
                    height: h,
                    backgroundColor: color,
                    opacity: active ? 1 : 0.82,
                    boxShadow: active ? `0 0 0 2px ${color}40` : 'none',
                  }}
                />
                <span className={`text-[10px] mt-1 tabular-nums ${active ? 'font-bold text-gray-800' : 'text-gray-400'}`}>
                  Z{i + 1}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 px-1">
          <span className="text-[9px] font-semibold text-gray-400 uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            Minutes
          </span>
          <span className="text-[9px] font-semibold text-gray-400 uppercase mx-auto">Zones</span>
        </div>
      </div>

      {/* Zone table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {breakdown.zones.map((z, i) => {
          const active = selectedKey === z.key;
          return (
            <button
              key={z.key}
              type="button"
              onClick={() => onSelectZone(z.key, z)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${
                i > 0 ? 'border-t border-gray-100' : ''
              } ${active ? 'bg-violet-50' : 'hover:bg-gray-50 active:bg-gray-100'}`}
              style={{ touchAction: 'manipulation' }}
            >
              <span className="text-[13px] font-semibold text-gray-700 w-16 shrink-0">{z.label}</span>
              <span className="text-[12px] text-gray-500 flex-1 text-center tabular-nums">{z.range}</span>
              <span className="text-[13px] font-bold text-gray-900 tabular-nums w-20 text-right">
                {z.seconds > 0 ? formatHms(z.seconds) : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PeakSegmentChart({ records, startIndex, endIndex, metric, color }) {
  if (!records?.length || startIndex == null || endIndex == null) return null;
  const getter = metric === 'power' ? recordPower : metric === 'pace' ? recordSpeed : recordHr;
  const vals = records.map(getter).map((v) => v || 0);
  const maxV = Math.max(...vals.filter((v) => v > 0), 1);

  const W = 320;
  const H = 96;
  const pad = { l: 6, r: 6, t: 10, b: 14 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = records.length;
  const idxToX = (i) => pad.l + (i / Math.max(1, n - 1)) * innerW;
  const valToY = (v) => pad.t + innerH - (v / maxV) * innerH;

  const step = Math.max(1, Math.floor(n / 180));
  const linePts = [];
  for (let i = 0; i < n; i += step) {
    linePts.push(`${idxToX(i)},${valToY(vals[i])}`);
  }

  const segPts = [];
  for (let i = startIndex; i <= endIndex; i += Math.max(1, Math.floor((endIndex - startIndex) / 80))) {
    segPts.push(`${idxToX(i)},${valToY(vals[i])}`);
  }

  const x0 = idxToX(startIndex);
  const x1 = idxToX(endIndex);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md mx-auto block" style={{ minWidth: 260 }}>
        <rect x={x0} y={pad.t} width={Math.max(2, x1 - x0)} height={innerH} fill={color} fillOpacity="0.18" rx={2} />
        <polyline points={linePts.join(' ')} fill="none" stroke="#e2e8f0" strokeWidth="1.5" />
        {segPts.length > 1 && (
          <polyline points={segPts.join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        )}
        <line x1={x0} y1={pad.t} x2={x0} y2={pad.t + innerH} stroke={color} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.7" />
        <line x1={x1} y1={pad.t} x2={x1} y2={pad.t + innerH} stroke={color} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.7" />
      </svg>
    </div>
  );
}

function PeakSelectionSummary({ peak, metric, unit, color, records, onOpenGraph, isSwim }) {
  const d = peak?.[metric];
  const stats = d?.startIndex != null ? computeSegmentAverages(records, d.startIndex, peak.s) : null;
  if (!d || !stats) return null;

  const avgSpeedKmh = stats.avgSpeedMps > 0 ? stats.avgSpeedMps * 3.6 : null;
  const paceSec = metric === 'pace' ? d.value : (stats.avgSpeedMps > 0
    ? (isSwim ? 100 : 1000) / stats.avgSpeedMps
    : null);

  return (
    <div className="mb-3 rounded-xl border px-3 py-2.5" style={{ borderColor: `${color}40`, background: `${color}0d` }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[13px] font-bold text-gray-900">{peak.label} peak</div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            at {formatPeakDuration(stats.startTimeSec)} · {formatPeakDuration(stats.durationSec)} long
          </div>
        </div>
        {onOpenGraph && (
          <button
            type="button"
            onClick={() => onOpenGraph(peak, metric)}
            className="text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0"
            style={{ color, background: `${color}18` }}
          >
            Map/Graph
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-700">
        {metric === 'pace' && paceSec != null && (
          <span>
            Peak pace: <strong className="tabular-nums">{formatPaceMMSS(Math.round(paceSec))}</strong> {unit}
          </span>
        )}
        {metric === 'power' && (
          <span>
            Peak avg: <strong className="tabular-nums">{Math.round(d.value)}</strong> {unit}
          </span>
        )}
        {metric === 'hr' && (
          <span>
            Peak avg: <strong className="tabular-nums">{Math.round(d.value)}</strong> {unit}
          </span>
        )}
        {stats.avgPower > 0 && metric === 'power' && (
          <span>Avg power: <strong className="tabular-nums">{Math.round(stats.avgPower)} W</strong></span>
        )}
        {stats.avgHr > 0 && (
          <span>Avg HR: <strong className="tabular-nums text-red-600">{Math.round(stats.avgHr)} bpm</strong></span>
        )}
        {stats.avgCadence > 0 && (
          <span>Cadence: <strong className="tabular-nums">{Math.round(stats.avgCadence)} rpm</strong></span>
        )}
        {avgSpeedKmh > 0 && metric !== 'pace' && (
          <span>Speed: <strong className="tabular-nums">{avgSpeedKmh.toFixed(1)} km/h</strong></span>
        )}
      </div>
      <div className="mt-2">
        <PeakSegmentChart
          records={records}
          startIndex={stats.startIndex}
          endIndex={stats.endIndex}
          metric={metric}
          color={color}
        />
      </div>
    </div>
  );
}

function PeakCurveSection({
  title, yLabel, color, peaks, metric, unit, selectedSec, records, onSelectPeak, onOpenGraph,
  invertY = false, formatValue, isSwim = false,
}) {
  const rows = peaks.filter((p) => p[metric]?.value > 0);
  if (rows.length === 0) return null;

  const values = rows.map((p) => p[metric].value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const W = 320;
  const H = 160;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const valueToY = (val) => {
    const f = (val - minVal) / range;
    return invertY
      ? pad.t + f * innerH
      : pad.t + innerH - f * innerH;
  };

  const logT = (s) => Math.log10(Math.max(1, s));
  const tMin = logT(rows[0].s);
  const tMax = logT(rows[rows.length - 1].s);
  const tSpan = tMax - tMin || 1;

  const points = rows.map((p) => {
    const x = pad.l + ((logT(p.s) - tMin) / tSpan) * innerW;
    const y = valueToY(p[metric].value);
    return { x, y, p };
  });

  const areaPath = [
    `M ${points[0].x} ${pad.t + innerH}`,
    ...points.map((pt) => `L ${pt.x} ${pt.y}`),
    `L ${points[points.length - 1].x} ${pad.t + innerH}`,
    'Z',
  ].join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: invertY ? pad.t + f * innerH : pad.t + innerH - f * innerH,
    val: invertY ? Math.round(maxVal - range * f) : Math.round(minVal + range * f),
  }));

  const formatTick = (val) => (formatValue ? formatValue(val) : val);
  const formatCell = (val) => (formatValue ? formatValue(val) : Math.round(val));

  const xTickLabels = [
    { s: rows[0].s, label: rows[0].label },
    { s: rows[Math.floor(rows.length / 3)]?.s, label: rows[Math.floor(rows.length / 3)]?.label },
    { s: rows[Math.floor(rows.length * 2 / 3)]?.s, label: rows[Math.floor(rows.length * 2 / 3)]?.label },
    { s: rows[rows.length - 1].s, label: rows[rows.length - 1].label },
  ].filter((t) => t.s);

  const half = Math.ceil(rows.length / 2);
  const col1 = rows.slice(0, half);
  const col2 = rows.slice(half);

  const selectedPeak = selectedSec != null ? rows.find((p) => p.s === selectedSec) : null;

  return (
    <section className="mb-8">
      <h3 className="text-[15px] font-bold text-gray-900 mb-3">{title}</h3>

      {selectedPeak && records?.length > 0 && (
        <PeakSelectionSummary
          peak={selectedPeak}
          metric={metric}
          unit={unit}
          color={color}
          records={records}
          onOpenGraph={onOpenGraph}
          isSwim={isSwim}
        />
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3 mb-3 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md mx-auto block" style={{ minWidth: 280 }}>
          {/* Y-axis */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} y1={t.y} x2={W - pad.r} y2={t.y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={pad.l - 4} y={t.y + 4} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="system-ui">
                {formatTick(t.val)}
              </text>
            </g>
          ))}
          <text
            x={10}
            y={pad.t + innerH / 2}
            fontSize="8"
            fill="#94a3b8"
            fontFamily="system-ui"
            fontWeight="600"
            transform={`rotate(-90, 10, ${pad.t + innerH / 2})`}
            textAnchor="middle"
          >
            {yLabel}
          </text>

          <path d={areaPath} fill={color} fillOpacity="0.85" />
          <polyline
            points={points.map((pt) => `${pt.x},${pt.y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
          {points.map((pt) => {
            const active = selectedSec === pt.p.s;
            return (
              <circle
                key={pt.p.s}
                cx={pt.x}
                cy={pt.y}
                r={active ? 5 : 3}
                fill={active ? '#fff' : color}
                stroke={color}
                strokeWidth={active ? 2 : 0}
                className="cursor-pointer"
                onClick={() => onSelectPeak(pt.p)}
              />
            );
          })}

          {xTickLabels.map((t) => {
            const x = pad.l + ((logT(t.s) - tMin) / tSpan) * innerW;
            return (
              <text key={t.s} x={x} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="system-ui">
                {t.label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Two-column peak table */}
      <div className="grid grid-cols-2 gap-0 rounded-xl border border-gray-200 overflow-hidden divide-x divide-gray-200">
        {[col1, col2].map((col, ci) => (
          <div key={ci}>
            {col.map((p) => {
              const d = p[metric];
              const active = selectedSec === p.s;
              return (
                <button
                  key={p.s}
                  type="button"
                  onClick={() => onSelectPeak(p)}
                  className={`w-full flex items-baseline justify-between px-3 py-2 text-left ${
                    active ? 'bg-violet-50' : 'hover:bg-gray-50 active:bg-gray-100'
                  } border-b border-gray-100 last:border-b-0`}
                  style={{ touchAction: 'manipulation' }}
                >
                  <span className="text-[12px] text-gray-600">{p.label}</span>
                  <span className="text-[12px] font-bold text-gray-900 tabular-nums">
                    {formatCell(d.value)} <span className="text-[10px] font-medium text-gray-400">{unit}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ActivityPeaksTab({
  records = [],
  sport = '',
  authUser = null,
  durationSec = 0,
  onPeakFocus = null,
  onNavigateToGraph = null,
}) {
  const [selected, setSelected] = useState(null);
  const isBike = sportIsBike(sport);
  const isSwim = sportIsSwim(sport);
  const formatPaceVal = (sec) => formatPaceMMSS(Math.round(sec));

  const powerZones = useMemo(
    () => (isBike ? computeZonesBreakdown(records, sport, authUser, 'power') : null),
    [records, sport, authUser, isBike],
  );
  const hrZones = useMemo(
    () => computeZonesBreakdown(records, sport, authUser, 'hr'),
    [records, sport, authUser],
  );
  const peaks = useMemo(
    () => computePeakEfforts(records, durationSec, sport),
    [records, durationSec, sport],
  );

  const hasPower = isBike && peaks.some((p) => p.power?.value > 0);
  const hasPace = !isBike && peaks.some((p) => p.pace?.value > 0);
  const hasHr = peaks.some((p) => p.hr?.value > 0);

  const buildPeakSelection = (p, metric) => {
    const d = p[metric];
    if (!d) return null;
    return {
      type: 'peak',
      metric,
      seconds: p.s,
      label: p.label,
      focusTimeSec: d.focusTimeSec,
      startIndex: d.startIndex,
      value: d.value,
      stats: d.startIndex != null ? computeSegmentAverages(records, d.startIndex, p.s) : null,
    };
  };

  const handlePeakSelect = (p, metric) => {
    const sel = buildPeakSelection(p, metric);
    if (!sel) return;
    setSelected(sel);
    onPeakFocus?.(sel);
  };

  const handleOpenGraph = (p, metric) => {
    const sel = buildPeakSelection(p, metric);
    if (!sel) return;
    setSelected(sel);
    onPeakFocus?.(sel);
    onNavigateToGraph?.(sel);
  };

  const handleZoneSelect = (zoneKey, zone, metric) => {
    const sel = { type: 'zone', metric, zoneKey, label: zone.label, range: zone.range };
    setSelected(sel);
    onNavigateToGraph?.(sel);
  };

  if (!hasPower && !hasPace && !hasHr && !powerZones && !hrZones) {
    return (
      <div className="py-12 text-center text-sm text-gray-400 px-4">
        No pace, power or heart-rate data for peaks analysis.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[17px] font-bold text-gray-900">Peaks</h2>
        {selected && (
          <button
            type="button"
            onClick={() => { setSelected(null); onPeakFocus?.(null); }}
            className="text-[11px] font-semibold text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-100"
          >
            Clear
          </button>
        )}
      </div>

      {selected?.type === 'peak' && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 text-[12px] text-violet-800">
          Best <strong>{selected.label}</strong> effort highlighted below
          {onNavigateToGraph && (
            <button
              type="button"
              onClick={() => onNavigateToGraph(selected)}
              className="ml-2 text-[11px] font-semibold text-violet-600 underline"
            >
              Open Map/Graph
            </button>
          )}
        </div>
      )}

      {powerZones && (
        <ZonesSection
          title="Power By Zones"
          color={POWER_COLOR}
          breakdown={powerZones}
          selectedKey={selected?.type === 'zone' && selected.metric === 'power' ? selected.zoneKey : null}
          onSelectZone={(key, z) => handleZoneSelect(key, z, 'power')}
        />
      )}

      {hasPower && (
        <PeakCurveSection
          title="Peak Power"
          yLabel="WATTS"
          color={POWER_COLOR}
          peaks={peaks}
          metric="power"
          unit="watts"
          records={records}
          selectedSec={selected?.type === 'peak' && selected.metric === 'power' ? selected.seconds : null}
          onSelectPeak={(p) => handlePeakSelect(p, 'power')}
          onOpenGraph={onNavigateToGraph ? (p) => handleOpenGraph(p, 'power') : null}
        />
      )}

      {hasPace && (
        <PeakCurveSection
          title="Peak Pace"
          yLabel={isSwim ? 'SEC/100M' : 'MIN/KM'}
          color={PACE_COLOR}
          peaks={peaks}
          metric="pace"
          unit={isSwim ? '/100m' : '/km'}
          records={records}
          invertY
          formatValue={formatPaceVal}
          isSwim={isSwim}
          selectedSec={selected?.type === 'peak' && selected.metric === 'pace' ? selected.seconds : null}
          onSelectPeak={(p) => handlePeakSelect(p, 'pace')}
          onOpenGraph={onNavigateToGraph ? (p) => handleOpenGraph(p, 'pace') : null}
        />
      )}

      {hrZones && (
        <ZonesSection
          title="Heart Rate By Zones"
          color={HR_COLOR}
          breakdown={hrZones}
          selectedKey={selected?.type === 'zone' && selected.metric === 'hr' ? selected.zoneKey : null}
          onSelectZone={(key, z) => handleZoneSelect(key, z, 'hr')}
        />
      )}

      {hasHr && (
        <PeakCurveSection
          title="Peak Heart Rate"
          yLabel="BPM"
          color={HR_COLOR}
          peaks={peaks}
          metric="hr"
          unit="bpm"
          records={records}
          selectedSec={selected?.type === 'peak' && selected.metric === 'hr' ? selected.seconds : null}
          onSelectPeak={(p) => handlePeakSelect(p, 'hr')}
          onOpenGraph={onNavigateToGraph ? (p) => handleOpenGraph(p, 'hr') : null}
        />
      )}
    </div>
  );
}
