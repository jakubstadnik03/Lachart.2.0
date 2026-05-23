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

function sessionShade(idx, total) {
  const t = total <= 1 ? 1 : idx / (total - 1);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(196, 109)},${lerp(181, 88)},${lerp(253, 217)})`;
}

function isWarmupOrCooldown(iv, idx, total) {
  const t = String(iv?.intervalType || '').toLowerCase();
  if (t === 'warmup' || t === 'cooldown') return true;
  if (iv?.isRecovery === true) return true;
  if (total >= 3 && (idx === 0 || idx === total - 1)) return true;
  return false;
}

/**
 * Detect if a lap is a non-work lap (warmup, cooldown, recovery, rest).
 * Mirrors CalendarView's detectLapType() heuristic.
 */
function isNonWorkLap(iv, idx, total) {
  const t = String(iv?.intervalType || '').toLowerCase();
  if (t === 'warmup' || t === 'cooldown' || t === 'recovery' || t === 'rest') return true;
  if (t === 'work') return false;
  const name = String(iv?.name || '').toLowerCase();
  if (/warm.?up|rozeh/i.test(name)) return true;
  if (/cool.?down|zklidn/i.test(name)) return true;
  if (/recov|odpoc|rest/i.test(name)) return true;
  // distance-based: short laps (<200m) are likely recovery
  const dist = Number(iv?.distanceMeters || iv?.distance || iv?.totalDistance || 0);
  if (dist > 0 && dist < 200) return true;
  // pace-based: very slow laps (>8:00/km) are likely recovery
  const dur = Number(iv?.elapsed_time || iv?.totalElapsedTime || iv?.durationSeconds || iv?.duration || 0);
  if (dist > 0 && dur > 0) {
    const paceSecKm = dur / (dist / 1000);
    if (paceSecKm > 480) return true;
  }
  // position-based
  if (total >= 3 && (idx === 0 || idx === total - 1)) return true;
  // alternating pattern (even = recovery between work intervals)
  if (total >= 5 && idx % 2 === 0 && idx > 0 && idx < total - 1) return true;
  return false;
}

function lapBarColor({ intervalType, lactate, sessionShade: shade, isSelected = false }) {
  const t = String(intervalType || '').toLowerCase();
  if (t === 'warmup')   return isSelected ? '#d97706' : '#fbbf24';
  if (t === 'cooldown') return isSelected ? '#0284c7' : '#38bdf8';
  if (t === 'recovery') return isSelected ? '#6b7280' : '#d1d5db';
  if (lactate != null)  return isSelected ? '#7c3aed' : '#a78bfa';
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
  const W = 320, H = 230, padX = 30, padTop = 14, padBottom = 28;
  const sportIsPace = sport === 'run' || sport === 'swim';
  const isPace = sportIsPace && metric === 'power';

  const [selected, setSelected] = useState(null);
  const clearSelection = () => setSelected(null);

  const data = useMemo(() => {
    return sessions.map((s, i) => {
      let intervals = getIntervals(s);
      const rawTotal = intervals.length;
      if (workOnly) {
        // Filter to work laps only (exclude warmup, cooldown, recovery, rest)
        intervals = intervals.filter((iv, idx) => !isNonWorkLap(iv, idx, rawTotal));
      } else if (hideWarmCool) {
        intervals = intervals.filter((iv, idx) => !isWarmupOrCooldown(iv, idx, rawTotal));
      }
      const laps = intervals.map((iv, idx) => {
        let v = null;
        if (isPace) v = intervalPaceSec(iv, sport);
        else        v = getIntervalMetric(iv, metric);
        const durSec = parseResultDurationSec(iv) || Number(iv.moving_time || iv.elapsed_time) || 0;
        const hr     = Number(iv.heartRate ?? iv.average_heartrate ?? iv.avgHeartRate) || null;
        const dist   = Number(iv.distanceMeters ?? iv.distance) || null;
        const pace   = (sport === 'run' || sport === 'swim') ? intervalPaceSec(iv, sport) : null;
        const power  = sport === 'bike' ? Number(iv.power ?? iv.average_watts ?? iv.avgPower) || null : null;
        const rpe    = Number(iv.RPE ?? iv.rpe) || null;
        return { idx, value: v, lactate: intervalLactate(iv), intervalType: iv?.intervalType || null, durationSec: durSec, hr, dist, pace, power, rpe };
      }).filter(l => l.value != null && l.value > 0);
      return { id: activityKey(s), date: getDate(s), laps, color: sessionShade(i, sessions.length), meta: s };
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
  const sessionWs  = sessionTotals.map(d => (innerW - totalGaps) * (d / grandTotal));
  const lapGap     = 0.8;

  const ticks = [yLo, yLo + (yHi - yLo) / 2, yHi];
  const labelStep = Math.max(1, Math.ceil(data.length / 3));
  const labeledIdxs = data.map((_, i) => i).filter(i => i === 0 || i === data.length - 1 || i % labelStep === 0);
  const fmtY = (v) => isPace ? fmtPace(v) : Math.round(v).toString();

  return (
    <div style={{ position: 'relative', width: '100%' }}
      onClick={(e) => { if (e.target.tagName !== 'rect') clearSelection(); }}
    >
      <SelectedLapInfo
        selected={selected}
        onOpen={() => { if (!selected) return; clearSelection(); onSessionTap && onSessionTap(selected.session); }}
        onEdit={onEditSession ? () => { if (!selected) return; clearSelection(); onEditSession(selected.session); } : undefined}
        onClear={clearSelection}
        formatValue={fmtTooltipValue}
      />
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
        {/* Session clusters */}
        {(() => {
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
            return (
              <g key={s.id} style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity .25s ease' }}>
                {s.laps.map((l, li) => {
                  const lapW  = lapWs[li];
                  const x     = clusterX + lapWs.slice(0, li).reduce((a, b) => a + b + lapGap, 0);
                  const top   = py(l.value);
                  const baseY = H - padBottom;
                  const h     = Math.abs(baseY - top);
                  const isSel = selected && selected.sessionId === s.id && selected.lapIdx === li + 1;
                  const fill  = lapBarColor({ intervalType: l.intervalType, lactate: l.lactate, sessionShade: s.color, isSelected: isSel });
                  return (
                    <g key={li}>
                      <rect x={x} y={Math.min(top, baseY)} width={lapW} height={Math.max(1.5, h)} rx={Math.min(2, lapW / 2)}
                        fill={fill}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSel) { clearSelection(); return; }
                          setSelected({
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
  );
}
