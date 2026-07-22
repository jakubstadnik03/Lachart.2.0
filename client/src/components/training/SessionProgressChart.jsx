/**
 * SessionProgressChart — shared component extracted from NativeTrainingPage.
 *
 * Shows all sessions as a cluster-bar chart (one cluster per session, one bar
 * per lap). Older sessions left, newest right. Bars are coloured by lap type
 * (warmup amber, cooldown sky, recovery gray, work → per-session purple shade,
 * lactate-annotated work → violet).
 *
 * Props:
 *   sessions      – array of training/activity objects (same shape as what
 *                   getSimilarActivities returns, or raw trainings from the
 *                   Training collection). Each must have at least:
 *                   { id/_id, results|laps, sport, date/startDate }
 *   metric        – 'power' | 'heartRate' | 'lactate' | 'RPE'
 *   sport         – 'bike' | 'run' | 'swim'
 *   highlightId   – session id string to highlight (all others dimmed)
 *   onSessionTap  – (session) => void — called when user taps "Open" in info strip
 *   onEditSession – (session) => void — called when user taps "Edit" in info strip
 *   hideWarmCool  – boolean — strip warm-up / cool-down laps from chart
 */

import React, { useState, useMemo } from 'react';
import useElementWidth from '../../hooks/useElementWidth';
import { classifyLaps } from '../../utils/lapClassify';

// ─── helpers (mirrored from NativeTrainingPage) ───────────────────────────────

function parseResultDurationSec(r) {
  if (!r) return 0;
  if (r.durationSeconds > 0) return r.durationSeconds;
  if (r.durationType === 'distance') {
    const distM = Number(r.distanceMeters || r.distance || r.duration) || 0;
    if (distM > 0) {
      let paceSec = 0;
      const p = r.power;
      if (typeof p === 'string') {
        const mmss = p.trim().match(/^(\d+):(\d{2})$/);
        if (mmss) paceSec = Number(mmss[1]) * 60 + Number(mmss[2]);
        else if (/^\d+(\.\d+)?$/.test(p.trim())) paceSec = Number(p);
      } else if (typeof p === 'number') {
        paceSec = p;
      }
      if (paceSec > 0) return (distM / 1000) * paceSec;
      return distM;
    }
  }
  if (r.durationType === 'time' && typeof r.duration === 'number' && r.duration > 0) return r.duration;
  if (typeof r.duration === 'string') {
    const parts = r.duration.split(':');
    if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  if (typeof r.duration === 'number' && r.duration > 0) return r.duration;
  // Strava lap fields
  const dur = Number(r.elapsed_time || r.totalElapsedTime || r.moving_time || 0);
  if (dur > 0) return dur;
  return 0;
}

function getIntervals(t) {
  if (!t) return [];
  if (Array.isArray(t.results) && t.results.length > 0) return t.results;
  if (Array.isArray(t.laps)    && t.laps.length    > 0) return t.laps;
  return [];
}

function activityKey(a) {
  if (!a) return '';
  return String(a.stravaId || a._id || a.id || '');
}

function getDate(a) {
  if (!a) return new Date(0);
  return new Date(a.date || a.startDate || a.timestamp || 0);
}

// Per-metric colour ramps: light (oldest session) → saturated (newest).
// Power=violet, HR=red, Lactate=amber, RPE=green.
const METRIC_RAMP = {
  power:     [[196, 181, 253], [109,  88, 217]], // violet
  heartRate: [[254, 202, 202], [185,  28,  28]], // red
  lactate:   [[253, 230, 138], [180,  83,   9]], // amber
  RPE:       [[187, 247, 208], [ 22, 101,  52]], // green
};

function sessionShade(idx, total, metric = 'power') {
  const t = total <= 1 ? 1 : idx / (total - 1);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const [lo, hi] = METRIC_RAMP[metric] || METRIC_RAMP.power;
  return `rgb(${lerp(lo[0], hi[0])},${lerp(lo[1], hi[1])},${lerp(lo[2], hi[2])})`;
}

// Saturated reference colour per metric (for line stroke + lactate accent).
function metricColor(metric) {
  const hi = (METRIC_RAMP[metric] || METRIC_RAMP.power)[1];
  return `rgb(${hi[0]},${hi[1]},${hi[2]})`;
}

function lapBarColor({ intervalType, lactate, sessionShade: shade, isSelected = false, metric = 'power' }) {
  const t = String(intervalType || '').toLowerCase();
  if (t === 'warmup')   return isSelected ? '#d97706' : '#fbbf24';
  if (t === 'cooldown') return isSelected ? '#0284c7' : '#38bdf8';
  if (t === 'recovery') return isSelected ? '#6b7280' : '#d1d5db';
  if (lactate != null) {
    // Lactate-annotated lap: emphasise with metric's saturated colour so the
    // accent stays in the same colour family as the surrounding work bars
    // (red bars → darker red accent, violet bars → violet accent, etc.).
    return metricColor(metric);
  }
  return shade;
}

function intervalLactate(item) {
  const v = item?.lactate ?? item?.lactateValue ?? item?.mmol;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

export function fmtPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm)) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function intervalPaceSec(item, sport) {
  if (!item) return null;
  const minSec = sport === 'swim' ? 25 : 100;
  const maxSec = sport === 'swim' ? 600 : 1200;
  const inRange = (n) => Number.isFinite(n) && n >= minSec && n <= maxSec;
  if (item.paceSeconds && inRange(item.paceSeconds)) return item.paceSeconds;
  const allowNumeric = sport === 'run' || sport === 'swim';
  const paceFromField = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      const mmss = s.match(/^(\d+):(\d{2})$/);
      if (mmss) {
        const total = Number(mmss[1]) * 60 + Number(mmss[2]);
        if (total >= minSec && total <= maxSec) return total;
        return null;
      }
      if (allowNumeric && /^\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        if (n >= minSec && n <= maxSec) return n;
      }
    } else if (typeof v === 'number' && allowNumeric && v >= minSec && v <= maxSec) {
      return v;
    }
    return null;
  };
  for (const candidate of [item.pace, item.power]) {
    const p = paceFromField(candidate);
    if (p != null) return p;
  }
  const dist = Number(item.distanceMeters || item.distance) || 0;
  const dur  = parseResultDurationSec(item);
  if (dist > 0 && dur > 0) {
    const pace = (dur / dist) * 1000;
    if (sport === 'swim') {
      const pace100 = pace / 10;
      if (pace100 >= minSec && pace100 <= maxSec) return pace100;
      return null;
    }
    if (pace >= minSec && pace <= maxSec) return pace;
    return null;
  }
  const speed = Number(item.average_speed) || 0;
  if (speed > 0) {
    const sec = sport === 'swim' ? 100 / speed : 1000 / speed;
    if (sec >= minSec && sec <= maxSec) return sec;
  }
  return null;
}

function getIntervalMetric(item, metric) {
  if (!item) return null;
  const v = (
    metric === 'power'     ? (item.power ?? item.average_watts ?? item.avgPower) :
    metric === 'heartRate' ? (item.heartRate ?? item.average_heartrate ?? item.avgHeartRate) :
    metric === 'lactate'   ? (item.lactate ?? item.lactateValue ?? item.mmol) :
    metric === 'RPE'       ? (item.RPE ?? item.rpe) :
    null
  );
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ─── Metric — tiny label · value pair ────────────────────────────────────────

function Metric({ label, value, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, lineHeight: 1.1 }}>
      <span style={{ fontSize: 8.5, fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: color || '#0A0E1A' }}>{value}</span>
    </span>
  );
}

// ─── SelectedLapInfo ──────────────────────────────────────────────────────────

function SelectedLapInfo({ selected, onOpen, onEdit, onClear, formatValue }) {
  const empty = !selected;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        minHeight: 44, marginBottom: 6, padding: '6px 9px', borderRadius: 10,
        background: empty ? 'rgba(118,126,181,.06)' : 'rgba(255,255,255,.85)',
        border: `1px solid ${empty ? 'rgba(118,126,181,.14)' : (selected.sessionColor + '55')}`,
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'background .2s ease, border-color .2s ease',
        backdropFilter: 'blur(4px)',
      }}
    >
      {empty ? (
        <span style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 600 }}>Tap a bar to inspect a lap</span>
      ) : (
        <>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: selected.sessionColor, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#0A0E1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.sessionTitle || 'Training'}
              </span>
              <span style={{ fontSize: 9.5, color: '#9CA3AF', fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                · {selected.sessionDate ? selected.sessionDate.toLocaleDateString('en', { day: 'numeric', month: 'short' }) : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontWeight: 800, color: selected.sessionColor, background: selected.sessionColor + '18', padding: '1px 6px', borderRadius: 5 }}>
                Lap {selected.lapIdx}{selected.lapCount ? `/${selected.lapCount}` : ''}
              </span>
              <span style={{ fontWeight: 800, color: '#0A0E1A' }}>{formatValue(selected.value)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontSize: 10, fontVariantNumeric: 'tabular-nums', color: '#6B7280', marginTop: 2 }}>
              {selected.dist > 0 && (
                <Metric label="DIST" value={selected.dist >= 1000 ? `${(selected.dist / 1000).toFixed(2)} km` : `${Math.round(selected.dist)} m`} />
              )}
              {selected.durationSec > 0 && (
                <Metric label="TIME" value={selected.durationSec >= 60
                  ? `${Math.floor(selected.durationSec / 60)}:${String(Math.round(selected.durationSec % 60)).padStart(2, '0')}`
                  : `${Math.round(selected.durationSec)}s`} />
              )}
              {selected.pace > 0 && selected.sport !== 'bike' && !selected.isPace && (
                <Metric label="PACE" value={`${Math.floor(selected.pace / 60)}:${String(Math.round(selected.pace % 60)).padStart(2, '0')}/${selected.sport === 'swim' ? '100m' : 'km'}`} />
              )}
              {selected.power > 0 && (
                <Metric label="PWR" value={`${Math.round(selected.power)} W`} />
              )}
              {selected.hr > 0 && (
                <Metric label="HR" value={`${Math.round(selected.hr)} bpm`} color="#B84238" />
              )}
              {selected.lactate != null && (
                <Metric label="LAC" value={`${Number(selected.lactate).toFixed(1)} mmol`} color="#B45309" />
              )}
              {selected.rpe > 0 && (
                <Metric label="RPE" value={String(Math.round(selected.rpe))} />
              )}
            </div>
          </div>
          {/* Edit button */}
          {onEdit && (
            <button onClick={onEdit} title="Edit training" style={{
              flexShrink: 0, padding: '5px 8px', borderRadius: 8,
              background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1',
              fontFamily: 'inherit', fontSize: 10.5, fontWeight: 800,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              WebkitTapHighlightColor: 'transparent',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
          {/* Open full modal */}
          <button onClick={onOpen} style={{
            flexShrink: 0, padding: '5px 10px', borderRadius: 8,
            background: selected.sessionColor, border: 'none', color: '#fff',
            fontFamily: 'inherit', fontSize: 10.5, fontWeight: 800,
            cursor: 'pointer', boxShadow: `0 2px 6px -1px ${selected.sessionColor}66`,
            WebkitTapHighlightColor: 'transparent',
          }}>Open</button>
          {/* Clear */}
          <button onClick={onClear} aria-label="Clear" style={{
            flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
            border: 'none', background: 'rgba(118,126,181,.12)',
            color: '#5E6590', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

// ─── SessionProgressChart ─────────────────────────────────────────────────────

export default function SessionProgressChart({
  sessions,
  metric = 'power',
  sport = 'bike',
  highlightId,
  onSessionTap,
  onEditSession,
  hideWarmCool = false,
  workOnly = false,
}) {
  // Draw into a viewBox whose width equals the chart's real pixel width so the
  // bars / line fill the full width without horizontal stretch on iPad.
  const [wrapRef, measuredW] = useElementWidth(320);
  const H = 230, padX = 30, padTop = 14, padBottom = 28;
  const W = measuredW > 0 ? measuredW : 320;
  const sportIsPace = sport === 'run' || sport === 'swim';
  const isPace = sportIsPace && metric === 'power';

  const [selected, setSelected] = useState(null);
  const [chartType, setChartType] = useState('bars'); // 'bars' | 'line'
  const [xMode, setXMode] = useState('laps'); // 'laps' (clusters) | 'time' (overlaid on shared time axis)
  const clearSelection = () => setSelected(null);
  const metricStroke = metricColor(isPace ? 'power' : metric);

  const data = useMemo(() => {
    return sessions.map((s, i) => {
      const rawIntervals = getIntervals(s);
      // Intensity-based lap types over the FULL lap set (before filtering) so
      // "Work only" keeps the real hard efforts, not odd-indexed laps, and the
      // bar colours reflect the real classification.
      const lapTypes = classifyLaps(rawIntervals, sport);
      let intervals = rawIntervals.map((iv, idx) => ({ iv, type: lapTypes[idx] }));
      if (workOnly) {
        intervals = intervals.filter((x) => x.type === 'work');
      } else if (hideWarmCool) {
        intervals = intervals.filter((x) => x.type !== 'warmup' && x.type !== 'cooldown');
      }
      const laps = intervals.map(({ iv, type }, idx) => {
        let v = null;
        if (isPace) v = intervalPaceSec(iv, sport);
        else        v = getIntervalMetric(iv, metric);
        const durSec = parseResultDurationSec(iv) || Number(iv.moving_time || iv.elapsed_time) || 0;
        const hr     = Number(iv.heartRate ?? iv.average_heartrate ?? iv.avgHeartRate) || null;
        const dist   = Number(iv.distanceMeters ?? iv.distance) || null;
        const pace   = (sport === 'run' || sport === 'swim') ? intervalPaceSec(iv, sport) : null;
        const power  = sport === 'bike' ? Number(iv.power ?? iv.average_watts ?? iv.avgPower) || null : null;
        const rpe    = Number(iv.RPE ?? iv.rpe) || null;
        return { idx, value: v, lactate: intervalLactate(iv), intervalType: iv?.intervalType || type || null, durationSec: durSec, hr, dist, pace, power, rpe };
      }).filter(l => l.value != null && l.value > 0);
      return { id: activityKey(s), date: getDate(s), laps, color: sessionShade(i, sessions.length, isPace ? 'power' : metric), meta: s };
    }).filter(s => s.laps.length > 0);
  }, [sessions, metric, isPace, sport, hideWarmCool, workOnly]);

  const fmtTooltipValue = (v) => {
    if (isPace) return fmtPace(v);
    const unit = metric === 'power' ? 'W' : metric === 'heartRate' ? 'bpm' : metric === 'lactate' ? 'mmol' : '';
    return `${Math.round(v)}${unit ? ' ' + unit : ''}`;
  };

  if (data.length === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 11 }}>
        No {isPace ? 'pace' : metric} data
      </div>
    );
  }

  // Avg-centered Y-axis across ALL visible laps so every bar type is in frame.
  // When workOnly=true the data already only has work laps, so the scale
  // stays tight automatically.
  const allVals = data.flatMap(s => s.laps.map(l => l.value));
  const avg    = allVals.reduce((a, b) => a + b, 0) / allVals.length;
  const maxDev = Math.max(...allVals.map(v => Math.abs(v - avg)));
  const spread = (maxDev || avg * 0.08 || (isPace ? 10 : 2)) * 1.3;
  const yLo = Math.max(0, avg - spread);
  const yHi = avg + spread;

  const py = (v) => isPace
    ? padTop + ((v - yLo) / (yHi - yLo || 1)) * (H - padTop - padBottom)
    : H - padBottom - ((v - yLo) / (yHi - yLo || 1)) * (H - padTop - padBottom);

  const innerW     = W - padX * 2;
  const sessionGap = 8;
  const totalGaps  = sessionGap * (data.length - 1);
  const sessionTotals = data.map(s => {
    const sum = s.laps.reduce((a, l) => a + (l.durationSec || 0), 0);
    return sum > 0 ? sum : s.laps.length;
  });
  const grandTotal = sessionTotals.reduce((a, b) => a + b, 0) || 1;

  // When only ONE session ends up with usable lap data — common when the
  // comparison list pulled in older trainings that had no per-lap power /
  // pace records — that one session would otherwise consume the entire
  // chart width and look like a giant block. Cap it to a reasonable slice
  // (≈ 1/N of the original session count or 35 % of the chart, whichever is
  // smaller) so the single bar reads as "one session" instead of "deformed
  // chart". Leftover space stays empty.
  const lonelyBarMode = data.length === 1 && sessions.length > 1;
  const sessionWs = lonelyBarMode
    ? [Math.min(innerW * 0.35, innerW / Math.max(2, sessions.length))]
    : sessionTotals.map(d => (innerW - totalGaps) * (d / grandTotal));
  const lapGap     = 0.8;

  const ticks = [yLo, yLo + (yHi - yLo) / 2, yHi];
  const labelStep = Math.max(1, Math.ceil(data.length / 3));
  const labeledIdxs = data.map((_, i) => i).filter(i => i === 0 || i === data.length - 1 || i % labelStep === 0);
  const fmtY = (v) => isPace ? fmtPace(v) : Math.round(v).toString();

  // Time mode — shared elapsed-time X axis (0 → longest visible session), so
  // sessions overlay and you compare the metric minute-by-minute.
  const maxDurAll = Math.max(1, ...data.map(s => s.laps.reduce((a, l) => a + (l.durationSec || 0), 0)));
  const tx = (t) => padX + (t / maxDurAll) * innerW;
  const fmtClockSec = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h}:${String(m % 60).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };
  const timeTicks = [0, maxDurAll / 2, maxDurAll];

  return (
    <div style={{ position: 'relative', width: '100%' }}
      onClick={(e) => { if (e.target.tagName !== 'rect' && e.target.tagName !== 'circle') clearSelection(); }}
    >
      {/* X-axis mode toggle (per-lap clusters ↔ shared time axis) */}
      <div style={{ position: 'absolute', top: 54, left: 6, zIndex: 2, display: 'flex', gap: 2,
        padding: 2, borderRadius: 7, background: 'rgba(118,126,181,.08)', border: '1px solid rgba(118,126,181,.14)' }}>
        {[{ k: 'laps', label: 'Laps' }, { k: 'time', label: 'Time' }].map(opt => {
          const active = xMode === opt.k;
          return (
            <button key={opt.k} onClick={(e) => { e.stopPropagation(); setXMode(opt.k); clearSelection(); }}
              style={{
                padding: '3px 7px', borderRadius: 5, border: 'none', cursor: 'pointer',
                fontSize: 9.5, fontWeight: 700, fontFamily: 'inherit',
                background: active ? '#fff' : 'transparent',
                color: active ? metricStroke : '#9CA3AF',
                boxShadow: active ? '0 1px 2px rgba(10,14,26,.10)' : 'none',
                WebkitTapHighlightColor: 'transparent',
              }}>
              {opt.label}
            </button>
          );
        })}
      </div>
      {/* Chart-type toggle (bars ↔ line) — laps mode only */}
      {xMode === 'laps' && (
      <div style={{ position: 'absolute', top: 54, right: 6, zIndex: 2, display: 'flex', gap: 2,
        padding: 2, borderRadius: 7, background: 'rgba(118,126,181,.08)', border: '1px solid rgba(118,126,181,.14)' }}>
        {[
          { k: 'bars', label: 'Bars', d: 'M3 18V9 M9 18V4 M15 18V11 M21 18V7' },
          { k: 'line', label: 'Line', d: 'M3 16 L9 9 L14 13 L21 5' },
        ].map(opt => {
          const active = chartType === opt.k;
          return (
            <button key={opt.k} onClick={(e) => { e.stopPropagation(); setChartType(opt.k); clearSelection(); }}
              title={opt.label}
              style={{
                padding: '3px 6px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: active ? '#fff' : 'transparent',
                color: active ? metricStroke : '#9CA3AF',
                boxShadow: active ? '0 1px 2px rgba(10,14,26,.10)' : 'none',
                display: 'flex', alignItems: 'center', WebkitTapHighlightColor: 'transparent',
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d={opt.d} />
              </svg>
            </button>
          );
        })}
      </div>
      )}
      <SelectedLapInfo
        selected={selected}
        onOpen={() => { if (!selected) return; clearSelection(); onSessionTap && onSessionTap(selected.session); }}
        onEdit={onEditSession ? () => { if (!selected) return; clearSelection(); onEditSession(selected.session); } : undefined}
        onClear={clearSelection}
        formatValue={fmtTooltipValue}
      />
      <div ref={wrapRef} style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: H, display: 'block' }}>
        {/* Y grid */}
        {ticks.map((t, i) => (
          <g key={`y-${i}`}>
            <line x1={padX} y1={py(t)} x2={W - padX} y2={py(t)} stroke="rgba(118,126,181,.08)" strokeDasharray="2 4" />
            <text x={padX - 4} y={py(t)} dy="3" textAnchor="end"
              style={{ fontSize: 8.5, fill: '#9CA3AF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {fmtY(t)}
            </text>
          </g>
        ))}
        {/* Baseline */}
        <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom} stroke="rgba(118,126,181,.18)" />

        {/* ── TIME MODE — sessions overlaid on a shared elapsed-time axis ── */}
        {xMode === 'time' && (
          <>
            {timeTicks.map((t, i) => (
              <text key={`tt-${i}`} x={tx(t)} y={H - 10}
                textAnchor={i === 0 ? 'start' : i === timeTicks.length - 1 ? 'end' : 'middle'}
                style={{ fontSize: 9, fontWeight: 700, fill: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>
                {fmtClockSec(t)}
              </text>
            ))}
            {data.map((s) => {
              const isHighlight = highlightId && s.id === highlightId;
              const dimmed = highlightId && !isHighlight;
              let t = 0;
              const pts = [];
              const segs = [];
              s.laps.forEach((l, li) => {
                const tStart = t;
                const tEnd = t + (l.durationSec || 1);
                t = tEnd;
                const y = py(l.value);
                pts.push(`${tx(tStart)},${y}`, `${tx(tEnd)},${y}`);
                segs.push({ l, li, tStart, tEnd, y });
              });
              const selectLap = (l, li) => ({
                sessionId: s.id, session: s.meta, sessionDate: s.date,
                sessionTitle: s.meta?.title || s.meta?.titleManual || s.meta?.name || 'Training',
                sessionColor: s.color, lapIdx: li + 1, lapCount: s.laps.length,
                value: l.value, lactate: l.lactate, durationSec: l.durationSec,
                hr: l.hr, dist: l.dist, pace: l.pace, power: l.power, rpe: l.rpe,
                sport, isPace, metric,
              });
              return (
                <g key={s.id} style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity .25s ease' }}>
                  <polyline fill="none" stroke={s.color} strokeWidth={isHighlight ? 2.4 : 1.6}
                    strokeLinejoin="round" strokeLinecap="round" points={pts.join(' ')} pointerEvents="none" />
                  {segs.map((seg) => {
                    const isSel = selected && selected.sessionId === s.id && selected.lapIdx === seg.li + 1;
                    return (
                      <g key={seg.li}>
                        {/* full-height transparent hit target for the lap's time span */}
                        <rect x={tx(seg.tStart)} y={padTop} width={Math.max(1, tx(seg.tEnd) - tx(seg.tStart))} height={H - padTop - padBottom}
                          fill="transparent"
                          onClick={(e) => { e.stopPropagation(); if (isSel) { clearSelection(); return; } setSelected(selectLap(seg.l, seg.li)); }}
                          style={{ cursor: 'pointer' }} />
                        {isSel && (
                          <>
                            <line x1={(tx(seg.tStart) + tx(seg.tEnd)) / 2} y1={padTop} x2={(tx(seg.tStart) + tx(seg.tEnd)) / 2} y2={H - padBottom}
                              stroke={s.color} strokeWidth={1} strokeDasharray="2 3" pointerEvents="none" />
                            <circle cx={(tx(seg.tStart) + tx(seg.tEnd)) / 2} cy={seg.y} r={3.5} fill={s.color} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </>
        )}

        {/* Session clusters */}
        {xMode === 'laps' && (() => {
          let runningX = padX;
          return data.map((s, si) => {
            const sessionW = sessionWs[si];
            const clusterX = runningX;
            runningX += sessionW + sessionGap;
            const lapDurs  = s.laps.map(l => l.durationSec || 1);
            const lapTotal = lapDurs.reduce((a, b) => a + b, 0) || 1;
            const minLap   = 2;
            let lapWs = lapDurs.map(d => ((sessionW - (s.laps.length - 1) * lapGap) * d) / lapTotal);
            const undersized = lapWs.filter(w => w < minLap).length;
            if (undersized > 0) {
              const deficit  = lapWs.reduce((acc, w) => acc + Math.max(0, minLap - w), 0);
              const sumLarge = lapWs.reduce((acc, w) => acc + (w >= minLap ? w : 0), 0) || 1;
              lapWs = lapWs.map(w => w < minLap ? minLap : Math.max(minLap, w - deficit * (w / sumLarge)));
            }
            const isHighlight = highlightId && s.id === highlightId;
            const dimmed      = highlightId && !isHighlight;
            // Pre-compute per-lap geometry (used by both bars and line modes).
            const lapGeom = s.laps.map((l, li) => {
              const lapW = lapWs[li];
              const x    = clusterX + lapWs.slice(0, li).reduce((a, b) => a + b + lapGap, 0);
              const cx   = x + lapW / 2;
              const top  = py(l.value);
              return { l, li, lapW, x, cx, top };
            });
            const selectLap = (l, li) => ({
              sessionId: s.id, session: s.meta,
              sessionDate: s.date,
              sessionTitle: s.meta?.title || s.meta?.titleManual || s.meta?.name || 'Training',
              sessionColor: s.color,
              lapIdx: li + 1, lapCount: s.laps.length,
              value: l.value, lactate: l.lactate,
              durationSec: l.durationSec, hr: l.hr, dist: l.dist,
              pace: l.pace, power: l.power, rpe: l.rpe,
              sport, isPace, metric,
            });
            return (
              <g key={s.id} style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity .25s ease' }}>
                {chartType === 'line' && lapGeom.length >= 2 && (
                  <polyline
                    fill="none" stroke={s.color} strokeWidth={isHighlight ? 2.2 : 1.6}
                    strokeLinejoin="round" strokeLinecap="round"
                    points={lapGeom.map(g => `${g.cx},${g.top}`).join(' ')}
                    pointerEvents="none"
                  />
                )}
                {lapGeom.map(({ l, li, lapW, x, cx, top }) => {
                  const baseY = H - padBottom;
                  const h     = Math.abs(baseY - top);
                  const isSel = selected && selected.sessionId === s.id && selected.lapIdx === li + 1;
                  const fill  = lapBarColor({ intervalType: l.intervalType, lactate: l.lactate, sessionShade: s.color, isSelected: isSel, metric: isPace ? 'power' : metric });
                  if (chartType === 'line') {
                    const r = isSel ? 4 : (isHighlight ? 3 : 2.4);
                    return (
                      <g key={li}>
                        <circle cx={cx} cy={top} r={r} fill={fill} stroke="#fff" strokeWidth={1}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSel) { clearSelection(); return; }
                            setSelected(selectLap(l, li));
                          }}
                          style={{ cursor: 'pointer', filter: selected && !isSel ? 'opacity(0.45)' : 'none', transition: 'filter .2s ease' }}
                        />
                        {isSel && (
                          <circle cx={cx} cy={top} r={r + 3} fill="none" stroke={fill} strokeWidth={1.2} pointerEvents="none" />
                        )}
                      </g>
                    );
                  }
                  return (
                    <g key={li}>
                      <rect x={x} y={Math.min(top, baseY)} width={lapW} height={Math.max(1.5, h)} rx={Math.min(2, lapW / 2)}
                        fill={fill}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSel) { clearSelection(); return; }
                          setSelected(selectLap(l, li));
                        }}
                        style={{ cursor: 'pointer', filter: selected && !isSel ? 'opacity(0.45)' : 'none', transition: 'filter .2s ease' }}
                      />
                      {isSel && (
                        <g pointerEvents="none">
                          <rect x={x} y={baseY + 1.5} width={lapW} height={2.5} rx={1.25} fill={fill} />
                          <path d={`M ${x + lapW / 2 - 3} ${Math.max(Math.min(top, baseY) - 6, padTop)} L ${x + lapW / 2 + 3} ${Math.max(Math.min(top, baseY) - 6, padTop)} L ${x + lapW / 2} ${Math.max(Math.min(top, baseY) - 2, padTop + 4)} Z`} fill={fill} />
                        </g>
                      )}
                    </g>
                  );
                })}
                {labeledIdxs.includes(si) && (
                  <text x={clusterX + sessionW / 2} y={H - 10} textAnchor="middle"
                    style={{ fontSize: 9, fontWeight: 700, fill: isHighlight ? '#5E6590' : '#9CA3AF', fontVariantNumeric: 'tabular-nums', transition: 'fill .2s ease' }}>
                    {s.date.toLocaleDateString('en', { day: 'numeric', month: 'numeric', year: '2-digit' })}
                  </text>
                )}
              </g>
            );
          });
        })()}
      </svg>
      </div>
    </div>
  );
}
