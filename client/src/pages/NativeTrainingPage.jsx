// Native mobile training page — focused on visual comparison of repeated workouts.
//
//   1. Add lactate card     — quick annotation queue (most-used job)
//   2. Workout progress     — pick a repeated workout, see all instances overlaid
//                             on a multi-series chart (Power / HR / Lactate / RPE),
//                             and a session list with delta vs first session
//   3. Lactate-tested list  — history of trainings with mmol values
//
// Tapping any activity opens the same ActivityFullModal CalendarView uses
// (Summary / Laps / Edit · stats · map · chart · Lactate button).

import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';

import {
  GlassCard, SectionTitle, SportTile,
  normSport, SPORT_TINT, SPORT_ICONS,
} from '../components/native/shared/Tiles';
import {
  NATIVE_DASHBOARD_KEYFRAMES, cardEntry,
} from '../components/NativeDashboard/animations';
import { addTraining, updateTraining, getStravaActivityDetail, createFieldLactateMeasurement, updateStravaLactateValues, getFieldLactateMeasurements, deleteFieldLactateMeasurement } from '../services/api';
import RecordLactateModal from '../components/training/RecordLactateModal';
// Lazy-load — keeps the heavy editor/modal chunks out of this page's bundle
const ActivityFullModal = lazy(() =>
  import('../components/Calendar/CalendarView').then(m => ({ default: m.ActivityFullModal }))
);
const TrainingForm = lazy(() => import('../components/TrainingForm'));

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDist(meters) {
  if (!meters) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function fmtRelativeDate(date) {
  const d = new Date(date);
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: '2-digit' });
}

function getSecs(a) {
  if (!a) return 0;
  return Number(
    a.totalTime || a.duration || a.movingTime || a.moving_time ||
    a.elapsedTime || a.elapsed_time || a.totalTimerTime || 0
  );
}

function getDist(a) { if (!a) return 0;     return Number(a.distance || a.totalDistance || 0); }
function getDate(a) { if (!a) return new Date(0); return new Date(a.date || a.startDate || a.timestamp || 0); }

function hasLactate(a) {
  if (!a) return false;
  if (a.lactate != null && Number(a.lactate) > 0) return true;
  if (Array.isArray(a.laps) && a.laps.some(l => l && (l.lactate != null || l.lactateValue != null))) return true;
  if (Array.isArray(a.results) && a.results.some(r => r && (r.lactate != null || r.mmol != null))) return true;
  return false;
}

function hasLaps(a) {
  if (!a) return false;
  return (Array.isArray(a.laps) && a.laps.length > 1) ||
         (Array.isArray(a.results) && a.results.length > 1);
}

function activityKey(a) { if (!a) return ''; return String(a.stravaId || a._id || a.id || ''); }

// Parse a "result" interval's duration (seconds). Mirrors TrainingComparison.
// Handles both time-based intervals (duration is seconds) and distance-based
// intervals (duration field actually holds the distance — e.g. "800" for 800m
// — so we derive time from distance × pace).
function parseResultDurationSec(r) {
  if (!r) return 0;
  if (r.durationSeconds > 0) return r.durationSeconds;
  // Distance-type intervals: derive time from distance + pace (power field
  // stores pace as sec/km for run / sec/100m for swim).
  if (r.durationType === 'distance') {
    const distM = Number(r.distanceMeters || r.distance || r.duration) || 0;
    if (distM > 0) {
      // Pace can be MM:SS string or numeric string of seconds
      let paceSec = 0;
      const p = r.power;
      if (typeof p === 'string') {
        const mmss = p.trim().match(/^(\d+):(\d{2})$/);
        if (mmss) paceSec = Number(mmss[1]) * 60 + Number(mmss[2]);
        else if (/^\d+(\.\d+)?$/.test(p.trim())) paceSec = Number(p);
      } else if (typeof p === 'number') {
        paceSec = p;
      }
      if (paceSec > 0) {
        // Pace assumed sec/km unless distance suggests swim (≤ 1000m laps usually)
        // — bar width doesn't need to be exact, just proportional.
        return (distM / 1000) * paceSec;
      }
      // No pace info — fall back to distance as a relative weight so the
      // bars at least get sized proportionally to the lap's distance.
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
  return 0;
}

// Average over an array of numbers, ignoring null/0
function avgOf(arr, key) {
  const vals = arr.map(x => Number(x?.[key])).filter(v => Number.isFinite(v) && v > 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Detect activity flavour and build the prefixed id ActivityFullModal needs
// to fetch the correct detail endpoint.
function detectActivityKind(t) {
  if (!t) return { kind: 'regular', id: '' };
  if (t.type === 'fit')                                   return { kind: 'fit',     id: String(t._id || '') };
  if (t.type === 'strava' || t.stravaId || t.source === 'strava')
                                                          return { kind: 'strava',  id: String(t.stravaId || t.id || '').replace(/^strava-/, '') };
  if (t.type === 'regular')                               return { kind: 'regular', id: String(t._id || '') };
  // Regular trainings from /user/athlete/:id/trainings have no `type` —
  // they're plain Training documents with `_id`, `results`, `title`, `sport`.
  // Distinguish from FIT (which usually has originalFileName / records[]) by
  // checking for FIT-specific fields.
  const isFit = !!(t.originalFileName || (Array.isArray(t.records) && t.records.length > 0) || t.totalElapsedTime || t.titleAuto);
  return isFit
    ? { kind: 'fit',     id: String(t._id || '') }
    : { kind: 'regular', id: String(t._id || '') };
}

// Enrich a training before passing to ActivityFullModal — fills in summary
// stats from the `results` interval array when no execution data exists, so
// the Summary tab is useful for regular (manually-logged) trainings too.
// Also sets the prefixed `id` (`strava-…` / `fit-…` / `regular-…`) so the
// modal's detail-loader hits the right endpoint.
function enrichForModal(t) {
  if (!t) return t;
  const results = Array.isArray(t.results) ? t.results : [];
  const hasResults = results.length > 0;

  const totalSecsFromResults = hasResults
    ? results.reduce((s, r) => s + parseResultDurationSec(r), 0)
    : 0;
  const totalDistFromResults = hasResults
    ? results.reduce((s, r) => s + (Number(r.distanceMeters || r.distance) || 0), 0)
    : 0;

  const { kind, id } = detectActivityKind(t);
  const prefixedId = id ? `${kind}-${id}` : (t.id || t._id);

  return {
    ...t,
    // CRITICAL: ActivityFullModal fetches detail by parsing the prefix on `id`
    id: prefixedId,
    type: t.type || kind,
    // Duration: prefer existing actual values, else sum of intervals
    totalTime: t.totalTime || t.movingTime || t.elapsedTime || t.totalElapsedTime || (totalSecsFromResults > 0 ? totalSecsFromResults : undefined),
    movingTime: t.movingTime || (totalSecsFromResults > 0 ? totalSecsFromResults : undefined),
    duration:   t.duration   || (totalSecsFromResults > 0 ? totalSecsFromResults : undefined),
    // Distance
    distance: t.distance || t.totalDistance || (totalDistFromResults > 0 ? totalDistFromResults : undefined),
    // Aggregates
    avgPower:     t.avgPower     ?? t.averagePower     ?? avgOf(results, 'power'),
    avgHeartRate: t.avgHeartRate ?? t.averageHeartRate ?? avgOf(results, 'heartRate'),
    maxHeartRate: t.maxHeartRate ?? t.maxHr            ?? (results.length ? Math.max(...results.map(r => Number(r.heartRate) || 0)) : null),
    maxPower:     t.maxPower     ?? (results.length ? Math.max(...results.map(r => Number(r.power) || 0)) : null),
    // Surface intervals as laps so the Laps tab appears
    laps: (Array.isArray(t.laps) && t.laps.length > 0)
      ? t.laps
      : results.map((r, i) => ({
          lapNumber: i + 1,
          moving_time:       parseResultDurationSec(r),
          elapsed_time:      parseResultDurationSec(r),
          distance:          Number(r.distanceMeters || r.distance) || 0,
          average_watts:     Number(r.power)     || null,
          average_heartrate: Number(r.heartRate) || null,
          lactate:           r.lactate != null ? Number(r.lactate) : null,
          intervalType:      r.intervalType,
        })),
    // Keep the original results array too — some renderers prefer it
    results,
  };
}

// Get a numeric metric from an interval/lap (handles regular trainings + Strava laps)
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

// Returns an array of intervals (or laps) from a training
function getIntervals(t) {
  if (!t) return [];                      // ← guard against undefined activity
  if (Array.isArray(t.results) && t.results.length > 0) return t.results;
  if (Array.isArray(t.laps) && t.laps.length > 0) return t.laps;
  return [];
}

// ─── chart palette ────────────────────────────────────────────────────────────

const SERIES_COLORS = ['#5E6590', '#22C55E', '#F97316', '#06B6D4', '#A855F7', '#EAB308', '#EF4444'];

// Per-session purple-ish shades (chronological — older lighter, newer darker)
function sessionShade(idx, total) {
  const t = total <= 1 ? 1 : idx / (total - 1);
  // Lerp from soft lavender to deep purple
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const r = lerp(196, 109);
  const g = lerp(181, 88);
  const b = lerp(253, 217);
  return `rgb(${r},${g},${b})`;
}

// True when a lap should be treated as warm-up or cool-down for the
// "Hide warm-up & cool-down" comparison-chart toggle. We trust an explicit
// intervalType / isRecovery flag, and fall back to a position heuristic for
// raw Strava laps (which have no intervalType): the first and last lap of a
// session with ≥ 3 laps are almost always warm-up / cool-down for the
// repeated-workout use case the comparison chart is built around.
function isWarmupOrCooldown(iv, idx, total) {
  const t = String(iv?.intervalType || '').toLowerCase();
  if (t === 'warmup' || t === 'cooldown') return true;
  if (iv?.isRecovery === true) return true;
  // Heuristic fallback for laps without intervalType.
  if (total >= 3 && (idx === 0 || idx === total - 1)) return true;
  return false;
}

// Bar colour mirrors the LapsBarChart palette inside TrainingForm so the two
// charts read as the same kind of visualisation:
//   warmup  → amber
//   cooldown → sky
//   recovery → gray
//   work / unknown + lactate → violet
//   work / unknown (no lactate) → fall back to per-session purple shade
function lapBarColor({ intervalType, lactate, sessionShade: shade, isSelected = false }) {
  const t = String(intervalType || '').toLowerCase();
  if (t === 'warmup')   return isSelected ? '#d97706' : '#fbbf24';
  if (t === 'cooldown') return isSelected ? '#0284c7' : '#38bdf8';
  if (t === 'recovery') return isSelected ? '#6b7280' : '#d1d5db';
  // work or untyped
  if (lactate != null)  return isSelected ? '#7c3aed' : '#a78bfa';
  return shade;
}

// Get lactate from an interval / lap
function intervalLactate(item) {
  const v = item?.lactate ?? item?.lactateValue ?? item?.mmol;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

// Format pace (sec/km) → "m:ss/km"
function fmtPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm)) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

// Compute pace seconds/km from a result interval (run/swim)
function intervalPaceSec(item, sport) {
  if (!item) return null;
  // Realistic pace bounds upfront so every branch can validate.
  const minSec = sport === 'swim' ? 25 : 100;
  const maxSec = sport === 'swim' ? 600 : 1200;
  const inRange = (n) => Number.isFinite(n) && n >= minSec && n <= maxSec;
  // Direct pace fields
  if (item.paceSeconds && inRange(item.paceSeconds)) return item.paceSeconds;
  // Try to read pace from `pace` first, then `power`. Run/swim Training
  // records store pace inside `power` — TrainingForm submits it either as
  // "MM:SS" (free-text) OR as a plain numeric string of seconds. We must
  // ONLY accept a raw number when we know the sport is run/swim, otherwise
  // a wattage value (e.g. 250 W) would be mistaken for "4:10/km".
  const allowNumeric = sport === 'run' || sport === 'swim';
  const paceFromField = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      const mmss = s.match(/^(\d+):(\d{2})$/);
      if (mmss) {
        const m = Number(mmss[1]);
        const sec = Number(mmss[2]);
        if (Number.isFinite(m) && Number.isFinite(sec)) {
          const total = m * 60 + sec;
          // Always require realistic pace bounds. A "48:19" value on a 28 m
          // recovery lap is not a real pace; without this guard it blows up
          // the bar-chart Y axis.
          if (total >= minSec && total <= maxSec) return total;
          return null;
        }
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
  // Derived: distance + duration
  const dist = Number(item.distanceMeters || item.distance) || 0;
  const dur  = parseResultDurationSec(item);
  if (dist > 0 && dur > 0) {
    const pace = (dur / dist) * 1000; // sec per km
    // Convert to sec/100m for swim
    if (sport === 'swim') {
      const pace100 = pace / 10;
      if (pace100 >= minSec && pace100 <= maxSec) return pace100;
      return null;
    }
    if (pace >= minSec && pace <= maxSec) return pace;
    return null;
  }
  const speed = Number(item.average_speed) || 0; // m/s
  if (speed > 0) {
    const sec = sport === 'swim' ? 100 / speed : 1000 / speed;
    if (sec >= minSec && sec <= maxSec) return sec;
  }
  return null;
}

// ─── session bar chart (the new TrainingPeaks-style view) ────────────────────
// Each session is a CLUSTER of bars on the X-axis (one bar per lap).
// Older sessions are on the LEFT, newest on the RIGHT.
// Bars with a recorded lactate value are highlighted in warm tones.
// X-axis labels show every Nth session date.

function SessionBarChart({ sessions, metric, sport, highlightId, onSessionTap, onLapEditLactate, hideWarmCool = false }) {
  const W = 320, H = 230, padX = 30, padTop = 14, padBottom = 28;
  // For run/swim: ALWAYS use pace, regardless of metric tab (it's the natural unit).
  // For bike: use the chosen metric.
  const sportIsPace = sport === 'run' || sport === 'swim';
  const isPace = sportIsPace && metric === 'power';

  // Selection state — tapped lap shows its details ABOVE the chart in a fixed
  // info row instead of a floating popup. Tap the same bar (or empty area)
  // to deselect.
  const [selected, setSelected] = useState(null);
  // { sessionId, lapIdx, sessionTitle, sessionDate, sessionColor,
  //   value, lactate, durationSec, session }
  const clearSelection = () => setSelected(null);

  // Build per-session data with full per-lap details so the SelectedLapInfo
  // strip can show distance, time, HR, lactate, RPE alongside the active metric.
  const data = useMemo(() => {
    return sessions.map((s, i) => {
      let intervals = getIntervals(s);
      if (hideWarmCool) {
        // Drop warm-up + cool-down (and recovery) intervals from the
        // comparison chart so we only compare the meat of the workout.
        const total = intervals.length;
        intervals = intervals.filter((iv, i) => !isWarmupOrCooldown(iv, i, total));
      }
      const laps = intervals.map((iv, idx) => {
        let v = null;
        if (isPace) v = intervalPaceSec(iv, sport);
        else        v = getIntervalMetric(iv, metric);
        const durSec = parseResultDurationSec(iv) ||
                       Number(iv.moving_time || iv.elapsed_time) || 0;
        const hr = Number(iv.heartRate ?? iv.average_heartrate ?? iv.avgHeartRate) || null;
        const dist = Number(iv.distanceMeters ?? iv.distance) || null;
        const pace = (sport === 'run' || sport === 'swim') ? intervalPaceSec(iv, sport) : null;
        const power = sport === 'bike'
          ? Number(iv.power ?? iv.average_watts ?? iv.avgPower) || null
          : null;
        const rpe = Number(iv.RPE ?? iv.rpe) || null;
        return {
          idx,
          value: v,
          lactate: intervalLactate(iv),
          intervalType: iv?.intervalType || null,
          durationSec: durSec,
          hr, dist, pace, power, rpe,
        };
      }).filter(l => l.value != null && l.value > 0);
      return {
        id: activityKey(s),
        date: getDate(s),
        laps,
        color: sessionShade(i, sessions.length),
        meta: s,
      };
    }).filter(s => s.laps.length > 0);
  }, [sessions, metric, isPace, sport, hideWarmCool]);

  if (data.length === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 11 }}>
        No {metric === 'RPE' ? 'RPE' : isPace ? 'pace' : metric} data
      </div>
    );
  }

  // Y-domain
  const allVals = data.flatMap(s => s.laps.map(l => l.value));
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const yPad = (yMax - yMin) * 0.1 || (isPace ? 5 : 1);
  const yLo = Math.max(0, yMin - yPad);
  const yHi = yMax + yPad;

  // For pace: faster (smaller seconds) at TOP, slower at BOTTOM.
  // For power/HR/lactate/RPE: higher value at TOP.
  const py = (v) => {
    if (isPace) {
      // Smaller seconds → top of chart
      return padTop + ((v - yLo) / (yHi - yLo || 1)) * (H - padTop - padBottom);
    }
    return H - padBottom - ((v - yLo) / (yHi - yLo || 1)) * (H - padTop - padBottom);
  };

  // X geometry — sessions are sized PROPORTIONAL to total session duration,
  // and within each session, lap widths are proportional to the lap's duration
  // (so a 30-min interval reads as wider than a 1-min recovery).
  const innerW = W - padX * 2;
  const sessionGap = 8;
  const totalGaps = sessionGap * (data.length - 1);
  // Total duration per session — fall back to lap-count if no durations available
  const sessionTotals = data.map(s => {
    const sumDur = s.laps.reduce((a, l) => a + (l.durationSec || 0), 0);
    return sumDur > 0 ? sumDur : s.laps.length; // 1-second-per-lap fallback
  });
  const grandTotal = sessionTotals.reduce((a, b) => a + b, 0) || 1;
  // Each session gets width proportional to its total duration
  const sessionWs = sessionTotals.map(d => (innerW - totalGaps) * (d / grandTotal));
  const lapGap = 0.8;

  // Y-axis labels (3 ticks)
  const ticks = [yLo, yLo + (yHi - yLo) / 2, yHi];

  // X labels — pick ~3 evenly spaced session dates
  const labelStep = Math.max(1, Math.ceil(data.length / 3));
  const labeledIdxs = data.map((_, i) => i).filter(i =>
    i === 0 || i === data.length - 1 || i % labelStep === 0
  );

  const fmtY = (v) => isPace ? fmtPace(v) : Math.round(v).toString();

  // Format the tapped value for the tooltip
  const fmtTooltipValue = (v) => {
    if (isPace) return fmtPace(v);
    const unit = metric === 'power' ? 'W' : metric === 'heartRate' ? 'bpm' : metric === 'lactate' ? 'mmol' : '';
    return `${Math.round(v)}${unit ? ' ' + unit : ''}`;
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}
      onClick={(e) => {
        // Tap on chart background (not a bar) → clear selection
        if (e.target.tagName !== 'rect') clearSelection();
      }}
    >
    {/* Selected-lap info row — sits ABOVE the chart so the user always sees
        which lap they tapped without a popup obscuring the bars. */}
    <SelectedLapInfo
      selected={selected}
      onOpen={() => {
        if (!selected) return;
        const s = selected.session;
        clearSelection();
        onSessionTap && onSessionTap(s);
      }}
      onEditLactate={onLapEditLactate ? () => {
        if (!selected) return;
        const sessionMeta = selected.session;
        const lapIdx = selected.lapIdx;
        clearSelection();
        onLapEditLactate(sessionMeta, lapIdx);
      } : undefined}
      onClear={clearSelection}
      formatValue={fmtTooltipValue}
    />
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block' }}>

      {/* Y grid lines + labels */}
      {ticks.map((t, i) => (
        <g key={`y-${i}`}>
          <line x1={padX} y1={py(t)} x2={W - padX} y2={py(t)}
            stroke="rgba(118,126,181,.08)" strokeDasharray="2 4" />
          <text x={padX - 4} y={py(t)} dy="3"
            textAnchor="end"
            style={{ fontSize: 8.5, fill: '#9CA3AF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {fmtY(t)}
          </text>
        </g>
      ))}

      {/* Baseline */}
      <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom}
        stroke="rgba(118,126,181,.18)" />

      {/* Session clusters — each session's width is proportional to its total
          duration; each lap's width within a session is proportional to lap duration. */}
      {(() => {
        let runningX = padX;
        return data.map((s, si) => {
          const sessionW = sessionWs[si];
          const clusterX = runningX;
          runningX += sessionW + sessionGap;

          // Lap widths inside this session — proportional to durationSec
          const lapDurs = s.laps.map(l => l.durationSec || 1);
          const lapTotal = lapDurs.reduce((a, b) => a + b, 0) || 1;
          const innerLapW = sessionW - (s.laps.length - 1) * lapGap;
          // Per-lap widths (with a sane minimum so very short recoveries are still visible)
          const minLap = 2;
          let lapWs = lapDurs.map(d => (innerLapW * d) / lapTotal);
          // Enforce minimum, then redistribute extra from larger bars
          const undersized = lapWs.filter(w => w < minLap).length;
          if (undersized > 0) {
            const deficit = lapWs.reduce((acc, w) => acc + Math.max(0, minLap - w), 0);
            const sumLarge = lapWs.reduce((acc, w) => acc + (w >= minLap ? w : 0), 0) || 1;
            lapWs = lapWs.map(w => w < minLap ? minLap : Math.max(minLap, w - deficit * (w / sumLarge)));
          }

          const isHighlight = highlightId && s.id === highlightId;
          const dimmed      = highlightId && !isHighlight;

          return (
            <g key={s.id}
              style={{
                opacity: dimmed ? 0.2 : 1,
                transition: 'opacity .25s ease',
              }}
            >
              {s.laps.map((l, li) => {
                const lapW = lapWs[li];
                const xOffset = lapWs.slice(0, li).reduce((a, b) => a + b + lapGap, 0);
                const x = clusterX + xOffset;
                const top = py(l.value);
                const baselineY = H - padBottom;
                const barTop = Math.min(top, baselineY);
                const h = Math.abs(baselineY - top);

                const isSelectedBar = selected
                  && selected.sessionId === s.id
                  && selected.lapIdx === li + 1;

                // Match the LapsBarChart palette in TrainingForm: warm-up
                // amber, cool-down sky, recovery gray, lactate-marked violet,
                // otherwise per-session purple shade.
                const fill = lapBarColor({
                  intervalType: l.intervalType,
                  lactate: l.lactate,
                  sessionShade: s.color,
                  isSelected: isSelectedBar,
                });

                // Tap a bar → select (or deselect on second tap of same bar)
                const handleBarTap = (e) => {
                  e.stopPropagation();
                  if (isSelectedBar) { clearSelection(); return; }
                  setSelected({
                    sessionId: s.id,
                    session: s.meta,
                    sessionDate: s.date,
                    sessionTitle: s.meta?.title || s.meta?.name || s.meta?.titleManual || 'Training',
                    sessionColor: s.color,
                    lapIdx: li + 1,
                    lapCount: s.laps.length,
                    value: l.value,
                    lactate: l.lactate,
                    durationSec: l.durationSec,
                    hr: l.hr,
                    dist: l.dist,
                    pace: l.pace,
                    power: l.power,
                    rpe: l.rpe,
                    sport,
                    isPace,
                    metric,
                  });
                };

                // Selected bar: keep the bar clean (no harsh black outline)
                // and instead drop a small caret + value label above it. The
                // caret + label sit on TOP of the bar so the user can see
                // exactly which bar is active without occluding the colour.
                const caretX = x + lapW / 2;
                return (
                  <g key={li}>
                    <rect
                      x={x}
                      y={barTop}
                      width={lapW}
                      height={Math.max(1.5, h)}
                      rx={Math.min(2, lapW / 2)}
                      fill={fill}
                      onClick={handleBarTap}
                      style={{
                        transformOrigin: `${x + lapW / 2}px ${baselineY}px`,
                        animation: `ndBarGrow .55s ${100 + si * 50 + li * 25}ms cubic-bezier(.22,1,.36,1) both`,
                        cursor: 'pointer',
                        filter: selected && !isSelectedBar ? 'opacity(0.45)' : 'none',
                        transition: 'filter .2s ease',
                      }}
                    />
                    {isSelectedBar && (
                      <g pointerEvents="none">
                        {/* Bottom underline pip — same colour as the bar so it
                            reads as part of it, not a foreign black border. */}
                        <rect
                          x={x}
                          y={baselineY + 1.5}
                          width={lapW}
                          height={2.5}
                          rx={1.25}
                          fill={fill}
                        />
                        {/* Caret hovering just above the bar */}
                        <path
                          d={`M ${caretX - 3} ${Math.max(barTop - 6, padTop)} L ${caretX + 3} ${Math.max(barTop - 6, padTop)} L ${caretX} ${Math.max(barTop - 2, padTop + 4)} Z`}
                          fill={fill}
                        />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Session date label below cluster — only on labeled positions */}
              {labeledIdxs.includes(si) && (
                <text
                  x={clusterX + sessionW / 2}
                  y={H - 10}
                  textAnchor="middle"
                  style={{
                    fontSize: 9, fontWeight: 700,
                    fill: isHighlight ? '#5E6590' : '#9CA3AF',
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'fill .2s ease',
                  }}
                >
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

// ─── Metric — tiny LABEL · VALUE pair used inside SelectedLapInfo ──────────

function Metric({ label, value, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, lineHeight: 1.1 }}>
      <span style={{
        fontSize: 8.5, fontWeight: 800, color: '#9CA3AF',
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontSize: 10.5, fontWeight: 700,
        color: color || '#0A0E1A',
      }}>{value}</span>
    </span>
  );
}

// ─── SelectedLapInfo — fixed strip above the chart showing tapped lap ────────
// Replaces the floating popup so the chart stays unobscured. Always reserves
// vertical space; shows a hint when nothing is selected.

function SelectedLapInfo({ selected, onOpen, onEditLactate, onClear, formatValue }) {
  const empty = !selected;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        minHeight: 44,
        marginBottom: 6,
        padding: '6px 9px',
        borderRadius: 10,
        background: empty ? 'rgba(118,126,181,.06)' : 'rgba(255,255,255,.7)',
        border: `1px solid ${empty ? 'rgba(118,126,181,.14)' : (selected.sessionColor + '55')}`,
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'background .2s ease, border-color .2s ease',
      }}
    >
      {empty ? (
        <span style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 600 }}>
          Tap a bar to inspect a lap
        </span>
      ) : (
        <>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Title + date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: selected.sessionColor, flexShrink: 0,
              }} />
              <span style={{
                fontSize: 11, fontWeight: 800, color: '#0A0E1A',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {selected.sessionTitle || 'Training'}
              </span>
              <span style={{
                fontSize: 9.5, color: '#9CA3AF', fontWeight: 700,
                fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>
                · {selected.sessionDate ? selected.sessionDate.toLocaleDateString('en', { day: 'numeric', month: 'short' }) : ''}
              </span>
            </div>
            {/* Lap pill + active metric value */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{
                fontWeight: 800, color: selected.sessionColor,
                background: selected.sessionColor + '18',
                padding: '1px 6px', borderRadius: 5,
              }}>
                Lap {selected.lapIdx}{selected.lapCount ? `/${selected.lapCount}` : ''}
              </span>
              <span style={{ fontWeight: 800, color: '#0A0E1A' }}>
                {formatValue(selected.value)}
              </span>
            </div>
            {/* Per-lap metrics row — distance · time · pace · power · HR · lactate · RPE.
                Only shows fields the lap actually has so the strip stays compact. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
              fontSize: 10, fontVariantNumeric: 'tabular-nums', color: '#6B7280', marginTop: 2,
            }}>
              {selected.dist > 0 && (
                <Metric label="DIST" value={
                  selected.dist >= 1000
                    ? `${(selected.dist / 1000).toFixed(selected.dist >= 10000 ? 1 : 2)} km`
                    : `${Math.round(selected.dist)} m`
                } />
              )}
              {selected.durationSec > 0 && (
                <Metric label="TIME" value={
                  selected.durationSec >= 60
                    ? `${Math.floor(selected.durationSec / 60)}:${String(Math.round(selected.durationSec % 60)).padStart(2, '0')}`
                    : `${Math.round(selected.durationSec)}s`
                } />
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
          {/* Lactate quick-edit — opens the TrainingForm for this session so
              the user can add/edit the lactate value for this specific lap
              without going through the preview modal. */}
          {onEditLactate && (
            <button
              onClick={onEditLactate}
              aria-label="Edit lactate"
              title="Edit lactate"
              style={{
                flexShrink: 0,
                padding: '5px 8px', borderRadius: 8,
                background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E',
                fontFamily: 'inherit', fontSize: 10.5, fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3h6v4l4 8a3 3 0 0 1-2.7 4H7.7A3 3 0 0 1 5 15l4-8V3z" />
                <line x1="9" y1="3" x2="15" y2="3" />
              </svg>
              {selected.lactate != null ? 'Edit' : '+ Lac'}
            </button>
          )}
          {/* Open + close */}
          <button
            onClick={onOpen}
            style={{
              flexShrink: 0,
              padding: '5px 10px', borderRadius: 8,
              background: selected.sessionColor, border: 'none', color: '#fff',
              fontFamily: 'inherit', fontSize: 10.5, fontWeight: 800,
              cursor: 'pointer',
              boxShadow: `0 2px 6px -1px ${selected.sessionColor}66`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Open
          </button>
          <button
            onClick={onClear}
            aria-label="Clear selection"
            style={{
              flexShrink: 0,
              width: 22, height: 22, borderRadius: '50%',
              border: 'none', background: 'rgba(118,126,181,.12)',
              color: '#5E6590', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

// ─── grouped bar chart (legacy lap-grouped view) ─────────────────────────────
// For each interval/lap (X), show one bar per session side-by-side.
// Older sessions on the LEFT of each group, newest on the RIGHT (and bolder).

// eslint-disable-next-line no-unused-vars
function BarGroupChart({ sessions, metric, highlightId, onBarTap }) {
  const W = 320, H = 190, padX = 28, padTop = 14, padBottom = 22;

  // For each lap index, collect a value per session
  const maxLaps = useMemo(
    () => Math.max(...sessions.map(s => getIntervals(s).length), 0),
    [sessions]
  );

  if (maxLaps === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 11 }}>
        No interval data
      </div>
    );
  }

  // Per-session colors
  const colorOf = (i) => SERIES_COLORS[i % SERIES_COLORS.length];

  // Collect all values for y-domain
  const allVals = [];
  sessions.forEach(s => {
    getIntervals(s).forEach(iv => {
      const v = getIntervalMetric(iv, metric);
      if (v != null) allVals.push(v);
    });
  });
  if (allVals.length === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 11 }}>
        No {metric === 'RPE' ? 'RPE' : metric} data in these sessions
      </div>
    );
  }
  const yMax = Math.max(...allVals);
  const yLo = 0;
  const yHi = yMax * 1.1;

  const py = (y) => H - padBottom - (y / (yHi - yLo || 1)) * (H - padTop - padBottom);

  // Group geometry
  const innerW   = W - padX * 2;
  const groupW   = innerW / maxLaps;
  const groupGap = Math.min(6, groupW * 0.18);
  const barsW    = groupW - groupGap;
  const barW     = Math.max(2, (barsW - (sessions.length - 1) * 1.5) / Math.max(sessions.length, 1));

  // Y-axis ticks (3)
  const ticks = [yLo, yHi / 2, yHi];

  // X-axis labels — pick 1, mid, max for compactness
  const xTicks = maxLaps >= 4
    ? [1, Math.round(maxLaps / 2), maxLaps]
    : Array.from({ length: maxLaps }, (_, i) => i + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        {sessions.map((_, i) => (
          <linearGradient key={`bg-grad-${i}`} id={`bg-grad-${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={colorOf(i)} stopOpacity="1" />
            <stop offset="1" stopColor={colorOf(i)} stopOpacity=".7" />
          </linearGradient>
        ))}
      </defs>

      {/* Y grid lines + labels */}
      {ticks.map((t, i) => (
        <g key={`y-${i}`}>
          <line x1={padX} y1={py(t)} x2={W - padX} y2={py(t)}
            stroke="rgba(118,126,181,.08)" strokeDasharray="2 4" />
          <text x={padX - 4} y={py(t)} dy="3"
            textAnchor="end"
            style={{ fontSize: 8.5, fill: '#9CA3AF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(t)}
          </text>
        </g>
      ))}

      {/* X-axis baseline */}
      <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom}
        stroke="rgba(118,126,181,.18)" />

      {/* Bars per lap */}
      {Array.from({ length: maxLaps }).map((_, lapIdx) => {
        const groupX = padX + lapIdx * groupW + groupGap / 2;

        return (
          <g key={`group-${lapIdx}`}>
            {sessions.map((s, si) => {
              const intervals = getIntervals(s);
              const iv = intervals[lapIdx];
              const v = iv ? getIntervalMetric(iv, metric) : null;
              if (v == null) return null;

              const id          = activityKey(s);
              const isHighlight = highlightId && id === highlightId;
              const dimmed      = highlightId && !isHighlight;
              const isLast      = si === sessions.length - 1;

              const x = groupX + si * (barW + 1.5);
              const top = py(v);
              const bottomY = H - padBottom;
              const h = bottomY - top;

              return (
                <g key={`bar-${si}`} style={{
                  opacity: dimmed ? 0.18 : 1,
                  transition: 'opacity .25s ease',
                  cursor: onBarTap ? 'pointer' : 'default',
                }}
                  onClick={() => onBarTap && onBarTap(s)}
                >
                  {/* Bar */}
                  <rect
                    x={x}
                    y={top}
                    width={barW}
                    height={h}
                    rx={Math.min(2, barW / 2)}
                    fill={`url(#bg-grad-${si})`}
                    stroke={isLast || isHighlight ? colorOf(si) : 'none'}
                    strokeWidth={isLast || isHighlight ? 1 : 0}
                    style={{
                      transformOrigin: `${x + barW / 2}px ${bottomY}px`,
                      animation: `ndBarGrow .55s ${100 + lapIdx * 35 + si * 25}ms cubic-bezier(.22,1,.36,1) both`,
                    }}
                  />
                  {/* Newest bar value above */}
                  {isLast && barW >= 12 && (
                    <text
                      x={x + barW / 2}
                      y={top - 3}
                      textAnchor="middle"
                      style={{
                        fontSize: 8.5, fontWeight: 800, fill: colorOf(si),
                        fontVariantNumeric: 'tabular-nums',
                        animation: `ndFadeIn .35s ${300 + lapIdx * 35}ms ease both`,
                      }}
                    >
                      {Math.round(v)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* X-axis labels (lap numbers) */}
      {xTicks.map((t, i) => {
        const groupX = padX + (t - 1) * groupW + groupW / 2;
        return (
          <text key={`x-${i}`} x={groupX} y={H - 4}
            textAnchor="middle"
            style={{ fontSize: 9, fill: '#9CA3AF', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            L{t}
          </text>
        );
      })}
    </svg>
  );
}

// ─── multi-line SVG chart ─────────────────────────────────────────────────────
// Each session is a colored polyline; X = interval index (1..n), Y = metric.

function MultiLineChart({ sessions, metric, highlightId, onPointTap, hideWarmCool = false }) {
  const W = 320, H = 170, padX = 26, padY = 18;

  // Selection state — same pattern as SessionBarChart: tapped point shows
  // its details ABOVE the chart in a fixed info row.
  const [selected, setSelected] = useState(null);
  const clearSelection = () => setSelected(null);
  const fmtTooltipValue = (v) => {
    const unit = metric === 'power' ? 'W' : metric === 'heartRate' ? 'bpm' : metric === 'lactate' ? 'mmol' : '';
    return `${Math.round(v)}${unit ? ' ' + unit : ''}`;
  };

  // Build per-session data points carrying full per-lap details so the
  // SelectedLapInfo strip can show distance / time / pace / HR / lactate.
  const series = useMemo(() => {
    return sessions.map((s, i) => {
      const sportKey = normSport(s.sport);
      let intervals = getIntervals(s);
      if (hideWarmCool) {
        const total = intervals.length;
        intervals = intervals.filter((iv, i) => !isWarmupOrCooldown(iv, i, total));
      }
      const points = intervals.map((iv, idx) => {
        const v = getIntervalMetric(iv, metric);
        if (v == null) return null;
        return {
          x: idx + 1,
          y: v,
          lactate: intervalLactate(iv),
          durationSec: parseResultDurationSec(iv) || Number(iv.moving_time || iv.elapsed_time) || 0,
          hr: Number(iv.heartRate ?? iv.average_heartrate ?? iv.avgHeartRate) || null,
          dist: Number(iv.distanceMeters ?? iv.distance) || null,
          pace: (sportKey === 'run' || sportKey === 'swim') ? intervalPaceSec(iv, sportKey) : null,
          power: sportKey === 'bike'
            ? Number(iv.power ?? iv.average_watts ?? iv.avgPower) || null
            : null,
          rpe: Number(iv.RPE ?? iv.rpe) || null,
          sport: sportKey,
        };
      }).filter(Boolean);
      return {
        id: activityKey(s),
        date: getDate(s),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        points,
        meta: s,
      };
    }).filter(s => s.points.length >= 1);
  }, [sessions, metric, hideWarmCool]);

  // Domain
  const allXs = series.flatMap(s => s.points.map(p => p.x));
  const allYs = series.flatMap(s => s.points.map(p => p.y));
  if (allXs.length === 0 || allYs.length === 0) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 11 }}>
        No {metric === 'RPE' ? 'RPE' : metric} data in these sessions
      </div>
    );
  }

  const xMin = 1;
  const xMax = Math.max(...allXs, 2);
  const yMin = Math.min(...allYs);
  const yMax = Math.max(...allYs);
  const yPad = (yMax - yMin) * 0.1 || 1;
  const yLo = Math.max(0, yMin - yPad);
  const yHi = yMax + yPad;

  const px = (x) => padX + ((x - xMin) / (xMax - xMin || 1)) * (W - padX * 2);
  const py = (y) => H - padY - ((y - yLo) / (yHi - yLo || 1)) * (H - padY * 2);

  // Y-axis ticks (3)
  const ticks = [yLo, (yLo + yHi) / 2, yHi];
  // X-axis ticks (1, mid, max — only if integer)
  const xTicks = xMax >= 4
    ? [xMin, Math.round((xMin + xMax) / 2), xMax]
    : Array.from({ length: xMax }, (_, i) => i + 1);

  return (
    <div style={{ position: 'relative', width: '100%' }}
      onClick={(e) => { if (e.target.tagName !== 'circle') clearSelection(); }}
    >
    <SelectedLapInfo
      selected={selected}
      onOpen={() => {
        if (!selected) return;
        const s = selected.session;
        clearSelection();
        onPointTap && onPointTap(s);
      }}
      onClear={clearSelection}
      formatValue={fmtTooltipValue}
    />
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={s.id + '-g'} id={`mlc-fill-${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={s.color} stopOpacity=".18" />
            <stop offset="1" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {/* Y grid lines */}
      {ticks.map((t, i) => (
        <g key={`y-${i}`}>
          <line x1={padX} y1={py(t)} x2={W - padX} y2={py(t)}
            stroke="rgba(118,126,181,.08)" strokeDasharray="2 4" />
          <text x={padX - 4} y={py(t)} dy="3"
            textAnchor="end"
            style={{ fontSize: 8.5, fill: '#9CA3AF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(t)}
          </text>
        </g>
      ))}

      {/* X axis labels */}
      {xTicks.map((t, i) => (
        <text key={`x-${i}`} x={px(t)} y={H - 3}
          textAnchor="middle"
          style={{ fontSize: 8.5, fill: '#9CA3AF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {t}
        </text>
      ))}

      {/* Series — older sessions less prominent, newest bold */}
      {series.map((s, i) => {
        const isLast      = i === series.length - 1;
        const isHighlight = highlightId && s.id === highlightId;
        const dimmed      = highlightId && !isHighlight;
        const opacity     = dimmed ? 0.18 : 1;
        const strokeWidth = isHighlight ? 2.6 : (isLast ? 2.2 : 1.6);

        const pathD = s.points.length >= 2
          ? s.points.reduce((acc, p, idx) => acc + (idx === 0 ? `M${px(p.x)},${py(p.y)}` : ` L${px(p.x)},${py(p.y)}`), '')
          : '';

        return (
          <g key={s.id} style={{
            transition: 'opacity .25s ease',
            opacity,
          }}>
            {/* Soft fill below newest / highlighted line */}
            {(isLast || isHighlight) && pathD && (
              <path
                d={`${pathD} L${px(s.points[s.points.length - 1].x)},${H - padY} L${px(s.points[0].x)},${H - padY} Z`}
                fill={`url(#mlc-fill-${i})`}
                style={{ animation: 'ndFadeIn .55s ease both' }}
              />
            )}
            {/* Line */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 800,
                  strokeDashoffset: 800,
                  animation: `ndDrawLine .9s ${i * 80}ms cubic-bezier(.22,1,.36,1) forwards`,
                }}
              />
            )}
            {/* Points */}
            {s.points.map((p, pi) => {
              const isSelectedPoint = selected
                && selected.sessionId === s.id
                && selected.lapIdx === p.x;
              return (
                <circle
                  key={pi}
                  cx={px(p.x)} cy={py(p.y)}
                  r={isSelectedPoint ? 5.5 : (isHighlight ? 4 : 3.2)}
                  fill={isSelectedPoint ? s.color : '#fff'}
                  stroke={s.color}
                  strokeWidth={isSelectedPoint ? 2.4 : (isHighlight ? 1.8 : 1.4)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSelectedPoint) { clearSelection(); return; }
                    setSelected({
                      sessionId: s.id,
                      session: s.meta,
                      sessionDate: s.date,
                      sessionTitle: s.meta?.title || s.meta?.name || s.meta?.titleManual || 'Training',
                      sessionColor: s.color,
                      lapIdx: p.x,
                      lapCount: s.points.length,
                      value: p.y,
                      lactate: p.lactate,
                      durationSec: p.durationSec,
                      hr: p.hr,
                      dist: p.dist,
                      pace: p.pace,
                      power: p.power,
                      rpe: p.rpe,
                      sport: p.sport,
                    });
                  }}
                  style={{
                    cursor: 'pointer',
                    animation: `ndPopIn .3s ${300 + i * 80 + pi * 30}ms cubic-bezier(.22,1.4,.36,1) both`,
                    transition: 'r .15s ease, fill .15s ease',
                  }}
                />
              );
            })}
          </g>
        );
      })}
    </svg>

    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function NativeTrainingPage({
  user,
  trainings = [],
  athleteId = null,
  onPlannedWorkoutChanged,
}) {
  const navigate = useNavigate();
  const [selectedSport, setSelectedSport] = useState('all');
  const [showRecordLactate, setShowRecordLactate] = useState(false);

  // ── Field lactate measurements (Record button) ─────────────────────────────
  // Loaded once on mount and refreshed after each Record. Drives both the
  // "fresh measurement" hero card at the top of the page and the lactate
  // log table near the bottom.
  const [fieldLactates, setFieldLactates] = useState([]);
  const loadFieldLactates = useCallback(async () => {
    try {
      const r = await getFieldLactateMeasurements(athleteId || null, null);
      const list = Array.isArray(r) ? r : (Array.isArray(r?.data) ? r.data : []);
      setFieldLactates(list);
    } catch (e) {
      // Silent: list just stays empty.
    }
  }, [athleteId]);
  useEffect(() => { loadFieldLactates(); }, [loadFieldLactates]);

  const handleRecordLactate = async (data) => {
    await createFieldLactateMeasurement({
      ...data,
      athleteId: athleteId || undefined,
    });
    loadFieldLactates();
  };
  const handleDeleteFieldLactate = async (id) => {
    try {
      await deleteFieldLactateMeasurement(id);
      setFieldLactates(prev => prev.filter(m => String(m._id) !== String(id)));
    } catch (e) {
      console.warn('[field-lactate] delete failed:', e?.message);
    }
  };
  const [selectedMetric, setSelectedMetric] = useState('power');
  const [selectedTitle, setSelectedTitle] = useState(null); // workout title to compare
  const [highlightSessionId, setHighlightSessionId] = useState(null);
  const [chartType, setChartType] = useState('bars'); // 'bars' | 'line'
  // Training-history filters
  const [hideWarmCool, setHideWarmCool] = useState(false); // hide warmup + cooldown bars
  const [dateFrom, setDateFrom] = useState('');            // 'YYYY-MM-DD' (empty = no min)
  const [dateTo, setDateTo]     = useState('');            // 'YYYY-MM-DD' (empty = no max)
  const [showFilters, setShowFilters] = useState(false);   // toggles the filter row
  // Pagination for the session list under the chart
  const SESSION_PAGE_SIZE = 2;
  const [sessionPage, setSessionPage] = useState(0);
  // Sessions hidden from the chart (tap a Progress row to toggle visibility)
  const [hiddenSessionIds, setHiddenSessionIds] = useState(new Set());
  const toggleSessionVisibility = (id) => {
    // Clear hover-highlight too — otherwise the chart keeps `highlightId`
    // pointing at a now-hidden session and dims every remaining bar.
    setHighlightSessionId(prev => (String(prev) === String(id) ? null : prev));
    setHiddenSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(String(id))) next.delete(String(id));
      else next.add(String(id));
      return next;
    });
  };
  // Reset session page + visibility whenever the workout title changes
  useEffect(() => {
    setSessionPage(0);
    setHiddenSessionIds(new Set());
  }, [selectedTitle]);

  // ── Filtered list (sport + date range + sort) ────────────────────────────
  const filtered = useMemo(() => {
    let list = trainings.slice().sort((a, b) => getDate(b) - getDate(a));
    if (selectedSport !== 'all') {
      list = list.filter(t => normSport(t.sport) === selectedSport);
    }
    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00').getTime();
      if (Number.isFinite(from)) list = list.filter(t => getDate(t).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59').getTime();
      if (Number.isFinite(to)) list = list.filter(t => getDate(t).getTime() <= to);
    }
    return list;
  }, [trainings, selectedSport, dateFrom, dateTo]);

  // ── Pagination state (declared early — used by the slicing logic below) ───
  const PAGE_SIZE = 4;
  const [annotateLimit, setAnnotateLimit] = useState(PAGE_SIZE);   // "Add lactate" → Show More
  const [annotatedPage,  setAnnotatedPage]  = useState(0);          // "Lactate-tested" → prev/next pages
  const [expandedTestedId, setExpandedTestedId] = useState(null);   // which row in Lactate-tested is expanded
  const toggleExpanded = (id) => setExpandedTestedId(prev => (String(prev) === String(id) ? null : String(id)));
  useEffect(() => { setAnnotateLimit(PAGE_SIZE); setAnnotatedPage(0); }, [selectedSport]);

  // ── Lactate annotation queue (full list — pagination happens at render) ──
  const annotateQueueAll = useMemo(
    () => filtered.filter(t => hasLaps(t) && !hasLactate(t)),
    [filtered]
  );
  const annotateQueue = annotateQueueAll.slice(0, annotateLimit);

  // ── Group by title — used for the comparison chart ────────────────────────
  // Only sessions with intervals (and ideally with lactate) are useful for comparison.
  const grouped = useMemo(() => {
    const m = {};
    for (const t of filtered) {
      if (!hasLaps(t)) continue; // need intervals to compare
      const key = (t.title || t.name || 'Untitled').trim();
      if (!m[key]) m[key] = [];
      m[key].push(t);
    }
    // Sort each group chronologically (oldest → newest), then pick groups with ≥2 sessions
    Object.keys(m).forEach(k => {
      m[k].sort((a, b) => getDate(a) - getDate(b));
    });
    return Object.entries(m)
      .filter(([, arr]) => arr.length >= 2)
      // Prioritise titles that have lactate measurements — these are the
      // user's "tested" repeated workouts which are most valuable to compare.
      .sort((a, b) => {
        const aHasLac = a[1].some(hasLactate);
        const bHasLac = b[1].some(hasLactate);
        if (aHasLac !== bHasLac) return aHasLac ? -1 : 1;
        return b[1].length - a[1].length;
      });
  }, [filtered]);

  // Auto-select the most-repeated workout once data arrives
  useEffect(() => {
    if (selectedTitle && grouped.find(([t]) => t === selectedTitle)) return;
    if (grouped.length > 0) setSelectedTitle(grouped[0][0]);
  }, [grouped, selectedTitle]);

  const sessions = useMemo(() => {
    if (!selectedTitle) return [];
    const g = grouped.find(([t]) => t === selectedTitle);
    if (!g) return [];
    // chronological (oldest → newest) so newest line is "on top"
    return g[1].slice().sort((a, b) => getDate(a) - getDate(b));
  }, [grouped, selectedTitle]);

  // ── All annotated trainings (full list — pagination happens at render) ────
  const annotatedAll = useMemo(
    () => filtered.filter(t => hasLactate(t)),
    [filtered]
  );
  const annotatedTotalPages = Math.max(1, Math.ceil(annotatedAll.length / PAGE_SIZE));
  const annotatedPageClamped = Math.min(annotatedPage, annotatedTotalPages - 1);
  const annotated = annotatedAll.slice(
    annotatedPageClamped * PAGE_SIZE,
    annotatedPageClamped * PAGE_SIZE + PAGE_SIZE
  );

  // ── Activity full modal ───────────────────────────────────────────────────
  const [activityModal, setActivityModal] = useState(null);
  // ── TrainingForm sheet — opens directly when user taps "Add" lactate pill ──
  const [trainingFormActivity, setTrainingFormActivity] = useState(null);
  const openTrainingForm = async (act) => {
    if (!act) return;
    // Strip native-only / runtime fields and ensure date is parseable
    const { _animDelay, _ndKey, ...clean } = act;

    // Strava activities from the listing payload have no `laps` (server omits
    // them for performance). If the user opens the form for one without the
    // detail having been fetched yet, the form would render empty. Fetch the
    // detail now so we always end up with usable laps.
    const isStravaActivity =
      clean.type === 'strava' || !!clean.stravaId ||
      /^strava-/i.test(String(clean.id || ''));
    const hasUsableLaps = Array.isArray(clean.laps) && clean.laps.length > 0;
    const hasUsableResults = Array.isArray(clean.results) && clean.results.length > 0;
    if (isStravaActivity && !hasUsableLaps && !hasUsableResults) {
      try {
        const rawId = String(clean.stravaId || clean.id || '').replace(/^strava-/i, '');
        if (rawId) {
          const isCoachViewing = athleteId && user && String(athleteId) !== String(user._id || user.id || '');
          const integAthleteId = isCoachViewing ? String(athleteId) : null;
          const data = await getStravaActivityDetail(rawId, integAthleteId);
          if (Array.isArray(data?.laps) && data.laps.length > 0) {
            clean.laps = data.laps;
          }
          if (data?.titleManual && !clean.titleManual) clean.titleManual = data.titleManual;
          if (data?.category && !clean.category) clean.category = data.category;
          if (data?.description && !clean.description) clean.description = data.description;
        }
      } catch (_) {
        // Fall through — form will open empty, user can still add rows manually
      }
    }

    // TrainingForm needs `results` (intervals). Strava/FIT activities arrive
    // with `laps` instead — map them so the form has rows to annotate.
    if (!Array.isArray(clean.results) || clean.results.length === 0) {
      const laps = Array.isArray(clean.laps) ? clean.laps : [];
      const sportRaw = String(clean.sport || clean.sportType || '').toLowerCase();
      const sport = sportRaw.includes('swim') ? 'swim' : sportRaw.includes('run') ? 'run' : 'bike';
      const isRun = sport === 'run';
      const isSwim = sport === 'swim';
      const fmtDur = (sec) => {
        const s = Number(sec) || 0;
        const m = Math.floor(s / 60);
        const ss = Math.round(s % 60);
        return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      };
      clean.sport = sport;
      clean.results = laps.map((lap, idx) => {
        const durationSec = Math.round(
          lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? lap.duration ?? 0
        );
        const distM = Math.round(lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? 0);
        const speed = lap.average_speed ?? lap.avgSpeed ?? lap.avg_speed ?? lap.enhancedAvgSpeed ?? 0;
        let powerValue = '';
        if (isRun || isSwim) {
          const eff = speed > 0.05 ? speed : (distM > 0 && durationSec > 0 ? distM / durationSec : 0);
          if (eff > 0.05) {
            const paceSec = isSwim ? Math.round(100 / eff) : Math.round(1000 / eff);
            powerValue = fmtDur(paceSec);
          }
        } else {
          const w = lap.average_watts ?? lap.avgPower ?? lap.average_power ?? 0;
          powerValue = w > 0 ? String(Math.round(w)) : '';
        }
        const isSwimRest = isSwim && distM < 10;
        return {
          interval: idx + 1,
          power: powerValue,
          heartRate: String(Math.round(lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? 0) || ''),
          lactate: lap.lactate != null ? String(lap.lactate) : '',
          RPE: '',
          elevation: (() => {
            const g = lap.total_elevation_gain ?? lap.elevation_gain ?? null;
            return g != null && Number.isFinite(Number(g)) ? String(Math.round(Number(g))) : '';
          })(),
          duration: fmtDur(durationSec),
          durationSeconds: durationSec,
          durationType: 'time',
          distanceMeters: distM > 0 ? distM : undefined,
          repeatCount: 1,
          isRecovery: isSwimRest,
          isSelected: !isSwimRest,
        };
      });
    }

    setTrainingFormActivity(clean);
  };
  const closeTrainingForm = () => setTrainingFormActivity(null);
  const handleTrainingFormSubmit = async (formData) => {
    const targetAthleteId = athleteId || user?._id || user?.id;

    // Normalise lactate strings → Number so mongoose stores them cleanly and
    // downstream code (LapChart, calendar lap table) can compare numerically.
    const cleanedResults = Array.isArray(formData.results)
      ? formData.results.map((r) => {
          const out = { ...r };
          if (out.lactate === '' || out.lactate == null) {
            delete out.lactate;
          } else {
            const num = parseFloat(out.lactate);
            if (Number.isFinite(num)) out.lactate = num;
            else delete out.lactate;
          }
          return out;
        })
      : formData.results;

    const cleanedFormData = { ...formData, results: cleanedResults };

    if (formData?._id) {
      await updateTraining(formData._id, cleanedFormData);
    } else {
      await addTraining({ ...cleanedFormData, athleteId: targetAthleteId });
    }

    // Mirror lactate into the linked StravaActivity laps so the calendar
    // (which renders Strava laps, not Training results) shows them on PC.
    const stravaId = formData?.sourceStravaActivityId;
    if (stravaId && Array.isArray(cleanedResults)) {
      const lactateValues = cleanedResults
        .map((r) => {
          const lapIdx = Number.isInteger(r?.sourceLapIndex)
            ? r.sourceLapIndex
            : (Number(r?.interval) > 0 ? Number(r.interval) - 1 : null);
          if (lapIdx == null || !Number.isFinite(r?.lactate)) return null;
          return { lapIndex: lapIdx, lactate: r.lactate };
        })
        .filter(Boolean);
      if (lactateValues.length > 0) {
        try {
          await updateStravaLactateValues(stravaId, lactateValues);
        } catch (syncErr) {
          console.warn('[lactate] Strava sync failed (non-blocking):', syncErr?.message);
        }
      }
    }

    closeTrainingForm();
    onPlannedWorkoutChanged && onPlannedWorkoutChanged({ type: 'training-updated' });
  };

  // When the user taps a training in the workout-progress chart, prefer to open
  // the matching Strava/FIT activity (which has GPS/streams/laps from the actual
  // ride) over the bare regular training (which only has the manually logged
  // intervals). Match by SAME DAY + SAME SPORT.
  function findRelatedRichActivity(t) {
    if (!t) return null;
    const tDate = getDate(t);
    if (isNaN(tDate)) return null;
    const tSport = normSport(t.sport);
    const tDayKey = `${tDate.getFullYear()}-${tDate.getMonth()}-${tDate.getDate()}`;

    // Skip if `t` is already a rich activity
    const tHasGps = !!(t.stravaId || t.type === 'fit' || t.type === 'strava' ||
                       (Array.isArray(t.laps) && t.laps.length > 0));
    if (tHasGps) return null;

    // Find candidates: trainings on the same calendar day, same sport, that
    // have actual execution data (Strava/FIT laps).
    const sameDay = trainings.filter(other => {
      if (other === t) return false;
      const oDate = getDate(other);
      const oKey = `${oDate.getFullYear()}-${oDate.getMonth()}-${oDate.getDate()}`;
      if (oKey !== tDayKey) return false;
      if (normSport(other.sport) !== tSport) return false;
      // Has rich execution data?
      const isRich = !!(other.stravaId || other.type === 'fit' || other.type === 'strava' ||
                        (Array.isArray(other.laps) && other.laps.length > 0) ||
                        (Array.isArray(other.records) && other.records.length > 0));
      return isRich;
    });
    if (sameDay.length === 0) return null;
    // Prefer Strava (richest detail with GPS), then FIT, then anything else
    sameDay.sort((a, b) => {
      const score = (x) => x.stravaId ? 3 : x.type === 'fit' ? 2 : 1;
      return score(b) - score(a);
    });
    return sameDay[0];
  }

  const openActivity = (act) => {
    // Prefer the related rich activity (with GPS / streams / real laps)
    const rich = findRelatedRichActivity(act);
    const target = rich || act;
    setActivityModal({ activity: enrichForModal(target), plannedWorkout: null });
  };
  const closeActivityModal = () => setActivityModal(null);

  // (Pagination state moved above — declared before slicing logic uses it)

  // ── Scroll-snap ────────────────────────────────────────────────────────────
  const pageRef = useRef(null);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    const prev = {
      st: node.style.scrollSnapType,
      sp: node.style.scrollPaddingTop,
      sb: node.style.scrollBehavior,
    };
    node.style.scrollSnapType   = 'y proximity';
    node.style.scrollPaddingTop = '8px';
    node.style.scrollBehavior   = 'smooth';
    node.scrollTop = 0;
    return () => {
      node.style.scrollSnapType   = prev.st || '';
      node.style.scrollPaddingTop = prev.sp || '';
      node.style.scrollBehavior   = prev.sb || '';
    };
  }, []);
  const snap = { scrollSnapAlign: 'start', scrollSnapStop: 'normal' };

  // Fixed set — only the three triathlon sports plus All
  const sportToggles = ['all', 'swim', 'bike', 'run'];
  const METRICS = [
    { id: 'power',     label: 'Power' },
    { id: 'heartRate', label: 'HR' },
    { id: 'lactate',   label: 'Lactate' },
    { id: 'RPE',       label: 'RPE' },
  ];

  // For the metric label color in the chart legend
  const metricUnit = (m) => m === 'power' ? 'W' : m === 'heartRate' ? 'bpm' : m === 'lactate' ? 'mmol' : '';

  // Compute per-session summary for the legend (mean of the metric across intervals)
  function sessionAvg(s, metric) {
    const ivs = getIntervals(s);
    const vals = ivs.map(iv => getIntervalMetric(iv, metric)).filter(v => v != null);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  return (
    <>
      <style>{NATIVE_DASHBOARD_KEYFRAMES}</style>
      <div ref={pageRef} style={styles.page}>
        {/* Header */}
        <div style={{ ...styles.header, ...cardEntry(0), ...snap }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.title}>Trainings</div>
            <div style={styles.subtitle}>
              {filtered.length} {filtered.length === 1 ? 'session' : 'sessions'}
              {annotateQueueAll.length > 0 && (
                <> · <span style={{ color: '#7C3AED', fontWeight: 700 }}>
                  {annotateQueueAll.length} ready for lactate
                </span></>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowRecordLactate(true)}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
            onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
            onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
            onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
            style={{ ...styles.headerBtn, background: '#f5f3ff', color: '#7c3aed', width: 'auto', borderRadius: 18, padding: '0 12px', gap: 6, fontSize: 12, fontWeight: 700 }}
            title="Record a new lactate measurement"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3h6M10 3v6.5L4.5 19a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 9.5V3" />
            </svg>
            <span>Record</span>
          </button>
          <button
            onClick={() => navigate('/training?full=1')}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
            onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
            onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
            onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
            style={styles.headerBtn}
            title="Open full training page"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        {/* Record Lactate modal */}
        {showRecordLactate && ReactDOM.createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'auto' }}>
            <RecordLactateModal
              onClose={() => setShowRecordLactate(false)}
              onSave={async (data) => { await handleRecordLactate(data); setShowRecordLactate(false); }}
            />
          </div>,
          document.getElementById('app-modal-root') || document.body
        )}

        <div style={styles.body}>
          {/* ─── Fresh field-lactate hero (<24h old) ──────────────────────── */}
          {(() => {
            if (!fieldLactates.length) return null;
            const fresh = fieldLactates
              .map(m => ({ ...m, _ts: new Date(m.recordedAt || m.createdAt || 0).getTime() }))
              .sort((a, b) => b._ts - a._ts)
              .filter(m => (Date.now() - m._ts) < 24 * 60 * 60 * 1000);
            if (!fresh.length) return null;
            const m = fresh[0];
            const minsAgo = Math.max(0, Math.round((Date.now() - m._ts) / 60000));
            const ago = minsAgo < 1 ? 'just now'
                      : minsAgo < 60 ? `${minsAgo} min ago`
                      : `${Math.round(minsAgo / 60)} h ago`;
            const val = Number(m.value || 0);
            const valStr = Number.isFinite(val) ? val.toFixed(1) : '—';
            return (
              <div style={{ ...cardEntry(0), ...snap }}>
                <GlassCard style={{ padding: '12px 14px', background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', border: '1px solid rgba(124,58,237,.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px -2px rgba(124,58,237,.3)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 3h6M10 3v6.5L4.5 19a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 9.5V3" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: '#7c3aed', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Just measured
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: '#0A0E1A', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                          {valStr}
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed' }}>mmol/L</span>
                        <span style={{ fontSize: 10.5, color: '#6B7280', marginLeft: 'auto' }}>{ago}</span>
                      </div>
                      {m.notes && (
                        <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </div>
            );
          })()}

          {/* Sport filter — fixed: All / Swim / Bike / Run */}
          {(
            <div style={{ ...cardEntry(1), ...snap }}>
              <GlassCard style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <SectionTitle style={{ marginRight: 4 }}>Filter</SectionTitle>
                  {sportToggles.map((sp, idx) => {
                    const on = selectedSport === sp;
                    const tint = sp === 'all' ? '#5E6590' : (SPORT_TINT[sp] || SPORT_TINT.other);
                    const icon = SPORT_ICONS[sp];
                    return (
                      <button
                        key={sp}
                        onClick={() => { setSelectedSport(sp); setSelectedTitle(null); }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                        onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                        onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                        onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                        onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: icon ? '4px 10px 4px 7px' : '4px 12px',
                          borderRadius: 9999,
                          border: on ? `1px solid ${tint}` : '1px solid rgba(118,126,181,.18)',
                          background: on ? tint : 'rgba(255,255,255,.55)',
                          color: on ? '#fff' : '#6B7280',
                          fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'background .25s ease, color .25s ease, border-color .25s ease, transform .12s ease',
                          animation: `ndPopIn .4s ${idx * 50}ms cubic-bezier(.22,1.4,.36,1) both`,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >
                        {icon && (
                          <span style={{
                            width: 13, height: 13, display: 'block', flexShrink: 0,
                            background: on ? '#fff' : tint,
                            WebkitMaskImage: `url(${icon})`, maskImage: `url(${icon})`,
                            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                            WebkitMaskPosition: 'center', maskPosition: 'center',
                            WebkitMaskSize: 'contain', maskSize: 'contain',
                          }} />
                        )}
                        {sp === 'all' ? 'All' : sp.charAt(0).toUpperCase() + sp.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </GlassCard>
            </div>
          )}

          {/* ─── Training History — the visual comparison card ─── */}
          {grouped.length > 0 && (() => {
            // Workout title navigation (prev/next chevrons)
            const titleIdx = Math.max(0, grouped.findIndex(([t]) => t === selectedTitle));
            const goPrev = () => { const i = (titleIdx - 1 + grouped.length) % grouped.length; setSelectedTitle(grouped[i][0]); };
            const goNext = () => { const i = (titleIdx + 1) % grouped.length; setSelectedTitle(grouped[i][0]); };
            const totalTitles = grouped.length;
            const currentList = grouped[titleIdx]?.[1] || [];
            const currentSport = normSport(currentList[0]?.sport);

            return (
            <div style={{ ...cardEntry(2), ...snap }}>
              <GlassCard>
                {/* Header row — eyebrow + title chevrons */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 800, color: '#9CA3AF',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>
                    Training history
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShowFilters(v => !v)}
                      aria-label="Filters"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: 6,
                        border: 'none',
                        background: (showFilters || hideWarmCool || dateFrom || dateTo)
                          ? 'rgba(94,101,144,.18)' : 'transparent',
                        color: (showFilters || hideWarmCool || dateFrom || dateTo)
                          ? '#5E6590' : '#9CA3AF',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 5h18M6 12h12M10 19h4" />
                      </svg>
                    </button>
                    <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {titleIdx + 1}/{totalTitles}
                    </span>
                    <ChevronBtn dir="prev" onClick={goPrev} disabled={totalTitles <= 1} small />
                    <ChevronBtn dir="next" onClick={goNext} disabled={totalTitles <= 1} small />
                  </div>
                </div>

                {/* Workout selector — full width, big and clear */}
                <div style={{ marginBottom: 10 }}>
                  <select
                    value={selectedTitle || ''}
                    onChange={(e) => setSelectedTitle(e.target.value)}
                    style={{
                      width: '100%',
                      fontFamily: 'inherit', fontSize: 16, fontWeight: 800,
                      color: '#0A0E1A',
                      letterSpacing: '-0.02em',
                      padding: '6px 28px 6px 0',
                      borderRadius: 0,
                      border: 'none',
                      borderBottom: '1.5px solid rgba(118,126,181,.18)',
                      background: 'transparent',
                      outline: 'none',
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      cursor: 'pointer',
                      backgroundImage:
                        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235E6590' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 4px center',
                      backgroundSize: '14px 14px',
                    }}
                  >
                    {grouped.map(([title, list]) => (
                      <option key={title} value={title}>
                        {title} · ×{list.length}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter row — date range + hide warmup/cooldown toggle */}
                {showFilters && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 8,
                    padding: '8px 10px', marginBottom: 8,
                    background: 'rgba(118,126,181,.07)',
                    border: '1px solid rgba(118,126,181,.14)',
                    borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', minWidth: 32 }}>From</label>
                      <input
                        type="date"
                        value={dateFrom}
                        max={dateTo || undefined}
                        onChange={(e) => setDateFrom(e.target.value)}
                        style={{
                          flex: 1, minWidth: 110,
                          fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                          padding: '4px 8px', borderRadius: 6,
                          border: '1px solid rgba(118,126,181,.25)',
                          background: '#fff', color: '#0A0E1A',
                        }}
                      />
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', minWidth: 22 }}>To</label>
                      <input
                        type="date"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => setDateTo(e.target.value)}
                        style={{
                          flex: 1, minWidth: 110,
                          fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                          padding: '4px 8px', borderRadius: 6,
                          border: '1px solid rgba(118,126,181,.25)',
                          background: '#fff', color: '#0A0E1A',
                        }}
                      />
                      {(dateFrom || dateTo) && (
                        <button
                          type="button"
                          onClick={() => { setDateFrom(''); setDateTo(''); }}
                          style={{
                            border: 'none', background: 'transparent',
                            color: '#5E6590', fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', padding: '4px 6px',
                          }}
                        >Clear</button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setHideWarmCool(v => !v)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        alignSelf: 'flex-start',
                        border: 'none', background: 'transparent',
                        color: '#0A0E1A', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', padding: 0,
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, borderRadius: 4,
                        border: `1.5px solid ${hideWarmCool ? '#5E6590' : 'rgba(118,126,181,.4)'}`,
                        background: hideWarmCool ? '#5E6590' : 'transparent',
                        transition: 'background .15s ease, border-color .15s ease',
                      }}>
                        {hideWarmCool && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5 9-11" />
                          </svg>
                        )}
                      </span>
                      Hide warm-up &amp; cool-down
                    </button>
                  </div>
                )}

                {/* Metric toggle + chart-type toggle */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, marginTop: 4, marginBottom: 8, flexWrap: 'wrap',
                }}>
                  {/* Metric */}
                  <div style={{
                    display: 'inline-flex', padding: 2, borderRadius: 10,
                    background: 'rgba(118,126,181,.12)',
                  }}>
                    {METRICS.map(m => {
                      const on = selectedMetric === m.id;
                      // For run/swim the "power" slot represents PACE (sec/km
                      // or sec/100m). Show that as the label so the runners
                      // don't see "Power" with no values.
                      const label = m.id === 'power' && (currentSport === 'run' || currentSport === 'swim')
                        ? 'Pace'
                        : m.label;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMetric(m.id)}
                          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                          onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                          onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                          onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                          onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                          style={{
                            border: 'none', background: on ? '#5E6590' : 'transparent',
                            color: on ? '#fff' : '#6B7280',
                            fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                            padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                            boxShadow: on ? '0 2px 6px -2px rgba(94,101,144,.5)' : 'none',
                            transition: 'background .25s ease, color .25s ease, transform .12s ease',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Chart type — bars vs lines */}
                  <div style={{
                    display: 'inline-flex', padding: 2, borderRadius: 10,
                    background: 'rgba(118,126,181,.12)',
                  }}>
                    {[
                      { id: 'bars', label: 'Bars', icon: 'M3 20h2V10H3v10zm4 0h2V4H7v16zm4 0h2v-7h-2v7zm4 0h2V7h-2v13zm4 0h2v-4h-2v4z' },
                      { id: 'line', label: 'Line', icon: 'M3 17l6-6 4 4 8-8' },
                    ].map(({ id, label, icon }) => {
                      const on = chartType === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setChartType(id)}
                          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                          onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                          onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                          onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                          onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                          aria-label={label}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            border: 'none', background: on ? '#5E6590' : 'transparent',
                            color: on ? '#fff' : '#6B7280',
                            fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                            padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
                            boxShadow: on ? '0 2px 6px -2px rgba(94,101,144,.5)' : 'none',
                            transition: 'background .25s ease, color .25s ease, transform .12s ease',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d={icon} />
                          </svg>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chart — re-keys on type/title/metric change so each swap fades+animates in */}
                <div
                  key={`chart-${chartType}-${selectedTitle}-${selectedMetric}`}
                  style={{
                    background: 'rgba(255,255,255,.5)',
                    border: '1px solid rgba(118,126,181,.12)',
                    borderRadius: 12, padding: '8px 6px',
                    animation: 'ndFadeIn .35s cubic-bezier(.22,1,.36,1) both',
                  }}
                >
                  {(() => {
                    // Filter out sessions the user has hidden via the Progress list
                    const visibleSessions = sessions.filter(s => !hiddenSessionIds.has(activityKey(s)));
                    if (visibleSessions.length === 0) {
                      return (
                        <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 11, fontWeight: 600 }}>
                          All sessions hidden — tap a row below to show
                        </div>
                      );
                    }
                    // Only pass highlightId if it matches something visible —
                    // otherwise the chart dims everything (no match = nothing
                    // to highlight, all bars treated as "other").
                    const safeHighlight = visibleSessions.some(s => activityKey(s) === highlightSessionId)
                      ? highlightSessionId : null;
                    return chartType === 'bars'
                      ? <SessionBarChart
                          sessions={visibleSessions}
                          metric={selectedMetric}
                          sport={currentSport}
                          highlightId={safeHighlight}
                          hideWarmCool={hideWarmCool}
                          onSessionTap={(s) => openActivity(s)}
                          onLapEditLactate={(s) => openTrainingForm(s)}
                        />
                      : <MultiLineChart
                          sessions={visibleSessions}
                          metric={selectedMetric}
                          highlightId={safeHighlight}
                          hideWarmCool={hideWarmCool}
                          onPointTap={(s) => openActivity(s)}
                        />;
                  })()}
                </div>

                {/* ── Progress header + session pagination ── */}
                {(() => {
                  // Sessions are oldest → newest. Show NEWEST first in the list.
                  const reversed = sessions.slice().reverse();
                  const total = reversed.length;
                  const totalPages = Math.max(1, Math.ceil(total / SESSION_PAGE_SIZE));
                  const page = Math.min(sessionPage, totalPages - 1);
                  const start = page * SESSION_PAGE_SIZE;
                  const end   = Math.min(total, start + SESSION_PAGE_SIZE);
                  const slice = reversed.slice(start, end);
                  const goPrevPage = () => setSessionPage(p => Math.max(0, p - 1));
                  const goNextPage = () => setSessionPage(p => Math.min(totalPages - 1, p + 1));

                  // For delta vs first session of the workout
                  const firstAvg = sessionAvg(sessions[0], selectedMetric);
                  const isPaceMetric = (currentSport === 'run' || currentSport === 'swim') && selectedMetric === 'power';

                  return (
                    <>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginTop: 12, marginBottom: 6,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#0A0E1A' }}>Progress</span>
                          <span style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            {start + 1}–{end} of {total}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <ChevronBtn dir="prev" onClick={goPrevPage} disabled={page === 0} small />
                          <ChevronBtn dir="next" onClick={goNextPage} disabled={page >= totalPages - 1} small />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {slice.map((s) => {
                          const id = activityKey(s);
                          const avg = isPaceMetric
                            ? (() => {
                                const ivs = getIntervals(s);
                                const vals = ivs.map(iv => intervalPaceSec(iv, currentSport)).filter(v => v != null);
                                return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                              })()
                            : sessionAvg(s, selectedMetric);
                          const baseAvg = isPaceMetric
                            ? (() => {
                                const ivs = getIntervals(sessions[0]);
                                const vals = ivs.map(iv => intervalPaceSec(iv, currentSport)).filter(v => v != null);
                                return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                              })()
                            : firstAvg;
                          const delta = (avg != null && baseAvg != null) ? avg - baseAvg : null;
                          // For pace: lower = improvement. For power/HR: higher = improvement.
                          // Lactate is contextual; we show neutral arrow for it.
                          const better = delta == null ? null
                                       : isPaceMetric ? delta < 0
                                       : selectedMetric === 'lactate' ? null
                                       : delta > 0;
                          // SVG arrow direction: 'up' / 'down' / 'flat' / null
                          const arrowDir = delta == null ? null : better == null ? 'flat' : better ? 'up' : 'down';
                          const arrowColor = better == null ? '#9CA3AF' : better ? '#047857' : '#B84238';
                          const display = avg == null
                            ? '—'
                            : isPaceMetric
                              ? fmtPace(avg)
                              : `${Math.round(avg)} ${metricUnit(selectedMetric)}`.trim();
                          const isHidden = hiddenSessionIds.has(id);
                          return (
                            <div
                              key={id}
                              onMouseEnter={() => setHighlightSessionId(id)}
                              onMouseLeave={() => setHighlightSessionId(null)}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '20px 60px 1fr auto auto',
                                alignItems: 'center', gap: 8,
                                padding: '6px 8px', borderRadius: 10,
                                background: 'transparent',
                                opacity: isHidden ? 0.45 : 1,
                                transition: 'background .15s ease, opacity .2s ease',
                              }}
                            >
                              {/* Visibility checkbox — tap to hide/show in chart */}
                              <button
                                onClick={() => toggleSessionVisibility(id)}
                                aria-label={isHidden ? 'Show in chart' : 'Hide from chart'}
                                style={{
                                  width: 20, height: 20, borderRadius: '50%',
                                  background: isHidden ? 'rgba(118,126,181,.12)' : '#5E6590',
                                  border: isHidden ? '1.5px solid rgba(118,126,181,.3)' : '1.5px solid #5E6590',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#fff', cursor: 'pointer',
                                  transition: 'all .15s ease',
                                  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                                  padding: 0,
                                }}
                              >
                                {!isHidden && (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>

                              {/* Date — tap row body opens the activity */}
                              <button
                                onClick={() => openActivity(s)}
                                style={{
                                  background: 'transparent', border: 'none', padding: 0,
                                  fontFamily: 'inherit', cursor: 'pointer',
                                  fontSize: 11, fontWeight: 600, color: '#9CA3AF',
                                  fontVariantNumeric: 'tabular-nums',
                                  textAlign: 'left',
                                  WebkitTapHighlightColor: 'transparent',
                                  textDecoration: isHidden ? 'line-through' : 'none',
                                }}
                              >
                                {getDate(s).toLocaleDateString('en', { day: 'numeric', month: 'numeric', year: '2-digit' })}
                              </button>

                              <button
                                onClick={() => openActivity(s)}
                                style={{
                                  background: 'transparent', border: 'none', padding: 0,
                                  fontFamily: 'inherit', cursor: 'pointer',
                                  fontSize: 12, fontWeight: 600, color: '#374151',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  textAlign: 'left', minWidth: 0,
                                  WebkitTapHighlightColor: 'transparent',
                                  textDecoration: isHidden ? 'line-through' : 'none',
                                }}
                              >
                                {selectedTitle}
                              </button>

                              <button
                                onClick={() => openActivity(s)}
                                style={{
                                  background: 'transparent', border: 'none', padding: 0,
                                  fontFamily: 'inherit', cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  fontSize: 13, fontWeight: 800, color: '#0A0E1A',
                                  fontVariantNumeric: 'tabular-nums',
                                  WebkitTapHighlightColor: 'transparent',
                                }}
                              >
                                {display}
                                {arrowDir && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={arrowColor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    {arrowDir === 'up' && (<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>)}
                                    {arrowDir === 'down' && (<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>)}
                                    {arrowDir === 'flat' && (<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="14 7 19 12 14 17" /></>)}
                                  </svg>
                                )}
                              </button>

                              {/* Open chevron */}
                              <button
                                onClick={() => openActivity(s)}
                                aria-label="Open"
                                style={{
                                  background: 'transparent', border: 'none', padding: 4,
                                  color: '#9CA3AF', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  WebkitTapHighlightColor: 'transparent',
                                }}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </GlassCard>
            </div>
            );
          })()}

          {/* ─── Add lactate queue ─── */}
          <div style={{ ...cardEntry(3), ...snap }}>
            <GlassCard>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Beaker icon — 'Add lactate' */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9 2v6L4 18a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L15 8V2" />
                    <line x1="6.5" y1="13" x2="17.5" y2="13" />
                    <line x1="9" y1="2" x2="15" y2="2" />
                  </svg>
                  <SectionTitle>Add lactate</SectionTitle>
                </div>
                {annotateQueueAll.length > 0 && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 800,
                    padding: '3px 8px', borderRadius: 9999,
                    background: '#F3E8FF', color: '#7C3AED',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    {annotateQueueAll.length} ready
                  </span>
                )}
              </div>

              {annotateQueueAll.length === 0 ? (
                <div style={{ padding: '14px 0', textAlign: 'center' }}>
                  {/* Sparkles "all caught up" — clean outline */}
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }}>
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="8 12 11 15 16 9" />
                  </svg>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>All caught up</div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {annotateQueue.map((t, idx) => (
                      <ActivityRow
                        key={activityKey(t) + '-' + idx}
                        activity={t}
                        // Tapping the row OR the "Add" pill jumps straight
                        // to the TrainingForm so the user can record lactate
                        // without going through the read-only preview modal.
                        onTap={() => openTrainingForm(t)}
                        onAddLactate={(act) => openTrainingForm(act)}
                        delay={idx * 45}
                        showLactateAction
                      />
                    ))}
                  </div>
                  {annotateQueue.length < annotateQueueAll.length && (
                    <ShowMoreButton
                      shown={annotateQueue.length}
                      total={annotateQueueAll.length}
                      onClick={() => setAnnotateLimit(l => l + PAGE_SIZE * 2)}
                    />
                  )}
                </>
              )}
            </GlassCard>
          </div>

          {/* ─── Lactate-tested — paginated, with inline lap strips ─── */}
          {annotatedAll.length > 0 && (
            <div style={{ ...cardEntry(4), ...snap }}>
              <GlassCard>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Target / activity icon — 'Lactate-tested' */}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="9 12 11 14 15.5 9.5" />
                    </svg>
                    <SectionTitle>Lactate-tested</SectionTitle>
                    <span style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ({annotatedAll.length})
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {annotatedTotalPages > 1 ? `${annotatedPageClamped + 1}/${annotatedTotalPages}` : ''}
                    </span>
                    <ChevronBtn dir="prev"
                      onClick={() => setAnnotatedPage(p => Math.max(0, p - 1))}
                      disabled={annotatedPageClamped === 0} small
                    />
                    <ChevronBtn dir="next"
                      onClick={() => setAnnotatedPage(p => Math.min(annotatedTotalPages - 1, p + 1))}
                      disabled={annotatedPageClamped >= annotatedTotalPages - 1} small
                    />
                  </div>
                </div>
                <div
                  key={`tested-page-${annotatedPageClamped}`}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    animation: 'ndFadeIn .3s cubic-bezier(.22,1,.36,1) both',
                  }}
                >
                  {annotated.map((t, idx) => {
                    const id = activityKey(t);
                    const isExpanded = String(expandedTestedId) === String(id);
                    return (
                      <ExpandableLactateRow
                        key={id + '-' + idx}
                        activity={t}
                        delay={idx * 30}
                        expanded={isExpanded}
                        onToggle={() => toggleExpanded(id)}
                        onOpenFull={() => openActivity(t)}
                      />
                    );
                  })}
                </div>
              </GlassCard>
            </div>
          )}

          {/* ─── Lactate log — all field-lactate measurements ──────────── */}
          {fieldLactates.length > 0 && (() => {
            const log = fieldLactates
              .map(m => ({ ...m, _ts: new Date(m.recordedAt || m.createdAt || 0).getTime() }))
              .sort((a, b) => b._ts - a._ts);
            const fmtDate = (ts) => {
              const d = new Date(ts);
              const today = new Date();
              const sameDay = d.toDateString() === today.toDateString();
              const dayPart = sameDay
                ? 'Today'
                : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
              const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return `${dayPart} · ${timePart}`;
            };
            return (
              <div style={{ ...cardEntry(5), ...snap }}>
                <GlassCard>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M9 3h6M10 3v6.5L4.5 19a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 9.5V3" />
                    </svg>
                    <SectionTitle>Lactate log</SectionTitle>
                    <span style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      ({log.length})
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {log.slice(0, 12).map((m) => {
                      const val = Number(m.value || 0);
                      const valStr = Number.isFinite(val) ? val.toFixed(1) : '—';
                      const assigned = m.status === 'assigned' && m.assignment?.trainingTitle;
                      return (
                        <div key={m._id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 10,
                          background: 'rgba(255,255,255,.55)',
                          border: '1px solid rgba(118,126,181,.12)',
                        }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: 48, padding: '4px 6px', borderRadius: 8,
                            background: lapBarColor({ intervalType: null, lactate: val, sessionShade: '#a78bfa' }) + '22',
                            color: '#5b21b6',
                            fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                          }}>
                            {valStr}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#0A0E1A' }}>
                              {fmtDate(m._ts)}
                            </div>
                            <div style={{ fontSize: 10, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {assigned
                                ? `→ ${m.assignment.trainingTitle}${m.assignment.lapNumber ? ` · Lap ${m.assignment.lapNumber}` : ''}`
                                : (m.notes || 'Unassigned')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteFieldLactate(m._id)}
                            aria-label="Delete measurement"
                            style={{
                              border: 'none', background: 'transparent',
                              padding: 6, color: '#9CA3AF', cursor: 'pointer',
                              borderRadius: 6,
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 6l12 12M6 18L18 6" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              </div>
            );
          })()}

          <div style={{ height: 16 }} />
        </div>
      </div>

      {/* Activity full modal — lazy-loaded so CalendarView stays out of this chunk */}
      {activityModal && (
        <Suspense fallback={null}>
          <ActivityFullModal
            activity={activityModal.activity}
            plannedWorkout={activityModal.plannedWorkout}
            athleteId={athleteId || user?._id || user?.id}
            onClose={closeActivityModal}
            onPlannedSaved={(saved) => {
              setActivityModal(prev => prev ? { ...prev, plannedWorkout: saved } : prev);
              onPlannedWorkoutChanged && onPlannedWorkoutChanged({ type: 'updated', planned: saved });
            }}
            onAddLactate={(act) => {
              // ActivityFullModal calls this with the merged activity, then
              // its own onClose() runs right after — no need to call
              // closeActivityModal here. Doing both caused a double-render
              // race that occasionally swallowed the openTrainingForm state.
              openTrainingForm(act || activityModal.activity);
            }}
            onOpenFull={() => {
              const a = activityModal.activity;
              closeActivityModal();
              const id = a.stravaId || a._id || a.id;
              const prefix = a.type === 'fit' ? 'fit'
                           : (a.type === 'strava' || a.stravaId) ? 'strava'
                           : a.type === 'regular' ? 'regular' : 'training';
              navigate(`/training-calendar/${encodeURIComponent(`${prefix}-${id}`)}`);
            }}
          />
        </Suspense>
      )}

      {/* TrainingForm sheet — opens directly from the "Add lactate" pill so
          users can record values without going through the preview modal.
          TrainingForm itself reserves space for the native tab bar in its
          sticky footer, so the modal container can stay full-viewport. */}
      {trainingFormActivity && ReactDOM.createPortal(
        <div
          onClick={closeTrainingForm}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(10,14,26,.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            animation: 'ndFadeIn .2s ease both',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 640 }}
          >
            <Suspense fallback={null}>
              <TrainingForm
                onClose={closeTrainingForm}
                onSubmit={handleTrainingFormSubmit}
                initialData={trainingFormActivity}
                isEditing={!!trainingFormActivity._id}
              />
            </Suspense>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── ActivityRow ──────────────────────────────────────────────────────────────

function ActivityRow({ activity, onTap, onAddLactate, delay = 0, showLactateAction = false, showLactateBadge = false, showLapStrip = false }) {
  const t = activity;
  const sport = normSport(t.sport);
  const tint = SPORT_TINT[sport] || SPORT_TINT.other;
  const date = getDate(t);
  const secs = getSecs(t);
  const dist = getDist(t);
  const distStr = fmtDist(dist);
  const lapsCount = Array.isArray(t.laps) ? t.laps.length
                  : Array.isArray(t.results) ? t.results.length : 0;
  const title = t.title || t.name || t.titleManual || `${sport.charAt(0).toUpperCase() + sport.slice(1)} workout`;
  const lactateValue = (() => {
    if (t.lactate != null) return Number(t.lactate);
    if (Array.isArray(t.laps)) {
      const v = t.laps.find(l => l.lactate != null || l.lactateValue != null);
      if (v) return Number(v.lactate ?? v.lactateValue);
    }
    if (Array.isArray(t.results)) {
      const v = t.results.find(r => r.lactate != null || r.mmol != null);
      if (v) return Number(v.lactate ?? v.mmol);
    }
    return null;
  })();

  return (
    <button
      onClick={onTap}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.985)'; }}
      onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
      onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
      onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.985)'; }}
      onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '10px 11px', borderRadius: 13,
        background: 'rgba(255,255,255,.55)',
        border: '1px solid rgba(118,126,181,.14)',
        borderLeft: `3px solid ${tint}`,
        textAlign: 'left',
        cursor: 'pointer', fontFamily: 'inherit',
        animation: `ndFadeIn .35s ${delay}ms cubic-bezier(.22,1,.36,1) both`,
        transition: 'transform .12s ease',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      <SportTile sport={sport} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 700, color: '#0A0E1A',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
          {fmtRelativeDate(date)} · {fmtDuration(secs)}
          {distStr ? ` · ${distStr}` : ''}
          {lapsCount > 1 ? ` · ${lapsCount} laps` : ''}
        </div>
      </div>

      {/* Right side: action / lap strip + badge */}
      {showLactateAction && (
        <span
          // Render as a span (not a nested <button>) but make it act as one —
          // browsers don't allow <button> inside <button>. stopPropagation so
          // the outer row's onTap doesn't fire.
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            (onAddLactate || onTap)?.(activity);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              (onAddLactate || onTap)?.(activity);
            }
          }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 9px 5px 8px', borderRadius: 9999,
            background: '#F5F3FF', border: '1.5px solid #7C3AED',
            color: '#7C3AED', fontSize: 10.5, fontWeight: 800,
            flexShrink: 0, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 2v6L4 18a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L15 8V2" />
            <line x1="6.5" y1="13" x2="17.5" y2="13" />
          </svg>
          Add
        </span>
      )}

      {/* Inline lap strip + lactate badge — for the Lactate-tested card */}
      {showLapStrip && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3,
          flexShrink: 0,
        }}>
          {showLactateBadge && lactateValue != null && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: '#7C3AED',
              padding: '2px 7px', borderRadius: 9999,
              background: '#F3E8FF', fontVariantNumeric: 'tabular-nums',
            }}>
              {lactateValue.toFixed(1)} mmol
            </span>
          )}
          <LapStrip activity={activity} sport={sport} width={120} height={34} />
        </div>
      )}

      {/* Standalone lactate badge when no strip */}
      {!showLapStrip && showLactateBadge && lactateValue != null && (
        <span style={{
          fontSize: 11, fontWeight: 800, color: '#7C3AED',
          padding: '4px 9px', borderRadius: 9999,
          background: '#F3E8FF', fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}>
          {lactateValue.toFixed(1)} mmol
        </span>
      )}
      {!showLactateAction && !showLactateBadge && !showLapStrip && (
        // Chevron-right SVG — replaces › char
        <span style={{ flexShrink: 0, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      )}
    </button>
  );
}

// ─── ExpandableLactateRow — tap to expand inline lap details ─────────────────
// Used in the "Lactate-tested" card. Tap header → expands showing per-lap
// values + lactate. Tap "Open full training" → opens activity modal.

function ExpandableLactateRow({ activity, delay = 0, expanded, onToggle, onOpenFull }) {
  const t = activity;
  const sport = normSport(t.sport);
  const tint = SPORT_TINT[sport] || SPORT_TINT.other;
  const date = getDate(t);
  const secs = getSecs(t);
  const dist = getDist(t);
  const distStr = fmtDist(dist);
  const lapsCount = Array.isArray(t.laps) ? t.laps.length
                  : Array.isArray(t.results) ? t.results.length : 0;
  const title = t.title || t.name || t.titleManual || `${sport.charAt(0).toUpperCase() + sport.slice(1)} workout`;
  const isPaceSport = sport === 'run' || sport === 'swim';

  // Get headline lactate value
  const lactateValue = (() => {
    if (t.lactate != null) return Number(t.lactate);
    if (Array.isArray(t.laps)) {
      const v = t.laps.find(l => l && (l.lactate != null || l.lactateValue != null));
      if (v) return Number(v.lactate ?? v.lactateValue);
    }
    if (Array.isArray(t.results)) {
      const v = t.results.find(r => r && (r.lactate != null || r.mmol != null));
      if (v) return Number(v.lactate ?? v.mmol);
    }
    return null;
  })();

  // Build lap details list for the expanded view
  const lapDetails = (() => {
    const intervals = getIntervals(t);
    return intervals.map((iv, i) => {
      const power = Number(iv.power || iv.average_watts || iv.avgPower) || null;
      const hr    = Number(iv.heartRate || iv.average_heartrate || iv.avgHeartRate) || null;
      const lac   = intervalLactate(iv);
      const dur   = parseResultDurationSec(iv) || Number(iv.moving_time || iv.elapsed_time) || 0;
      const pace  = isPaceSport ? intervalPaceSec(iv, sport) : null;
      const intervalType = iv.intervalType || null;
      return { idx: i + 1, power, hr, lac, dur, pace, intervalType };
    });
  })();

  return (
    <div
      style={{
        borderRadius: 13,
        background: expanded ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.55)',
        border: '1px solid rgba(118,126,181,.14)',
        borderLeft: `3px solid ${tint}`,
        animation: `ndFadeIn .35s ${delay}ms cubic-bezier(.22,1,.36,1) both`,
        overflow: 'hidden',
        transition: 'background .2s ease',
      }}
    >
      {/* Header (always visible) — tap to toggle */}
      <button
        onClick={onToggle}
        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.99)'; }}
        onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
        onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
        onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.99)'; }}
        onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '10px 11px',
          background: 'transparent', border: 'none',
          textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
          transition: 'transform .12s ease',
          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        }}
      >
        <SportTile sport={sport} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 700, color: '#0A0E1A',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </div>
          <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
            {fmtRelativeDate(date)} · {fmtDuration(secs)}
            {distStr ? ` · ${distStr}` : ''}
            {lapsCount > 1 ? ` · ${lapsCount} laps` : ''}
          </div>
        </div>

        {/* Right-side: lap strip + lactate badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          {lactateValue != null && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: '#7C3AED',
              padding: '2px 7px', borderRadius: 9999,
              background: '#F3E8FF', fontVariantNumeric: 'tabular-nums',
            }}>
              {lactateValue.toFixed(1)} mmol
            </span>
          )}
          <LapStrip activity={activity} sport={sport} width={120} height={34} />
        </div>

        {/* Chevron — rotates 90° when expanded */}
        <span style={{
          fontSize: 14, color: tint, flexShrink: 0,
          marginLeft: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20,
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform .25s cubic-bezier(.22,1,.36,1)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </button>

      {/* Expanded lap details */}
      {expanded && (
        <div style={{
          padding: '0 11px 11px',
          animation: 'ndFadeIn .25s cubic-bezier(.22,1,.36,1) both',
        }}>
          {lapDetails.length > 0 && (
            <>
              {/* Header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr 50px 50px 50px',
                gap: 6, padding: '6px 4px 4px',
                fontSize: 8.5, fontWeight: 800, color: '#9CA3AF',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                borderTop: '1px solid rgba(118,126,181,.14)',
                marginTop: 2,
              }}>
                <span>#</span>
                <span>Dur</span>
                <span style={{ textAlign: 'right' }}>{isPaceSport ? 'Pace' : 'W'}</span>
                <span style={{ textAlign: 'right' }}>HR</span>
                <span style={{ textAlign: 'right', color: '#B45309' }}>mmol</span>
              </div>

              {/* Lap rows */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {lapDetails.map((l) => {
                  const isWork = l.intervalType === 'work';
                  const isRecovery = l.intervalType === 'recovery';
                  const labelColor = isWork ? '#0A0E1A' : isRecovery ? '#9CA3AF' : '#374151';
                  const value = isPaceSport && l.pace ? fmtPace(l.pace) : (l.power ? `${Math.round(l.power)}` : '—');
                  return (
                    <div
                      key={l.idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '24px 1fr 50px 50px 50px',
                        gap: 6, padding: '5px 4px',
                        fontSize: 11, fontWeight: 600,
                        color: labelColor,
                        fontVariantNumeric: 'tabular-nums',
                        borderBottom: '1px solid rgba(118,126,181,.06)',
                      }}
                    >
                      <span style={{ fontWeight: 800, color: '#9CA3AF' }}>{l.idx}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.dur > 0
                          ? (l.dur >= 60
                              ? `${Math.floor(l.dur / 60)}:${String(Math.round(l.dur % 60)).padStart(2, '0')}`
                              : `${Math.round(l.dur)}s`)
                          : '—'}
                        {isWork && <span style={{ marginLeft: 4, fontSize: 9, color: tint, fontWeight: 800 }}>WORK</span>}
                        {isRecovery && <span style={{ marginLeft: 4, fontSize: 9, color: '#9CA3AF', fontWeight: 700 }}>rec</span>}
                      </span>
                      <span style={{ textAlign: 'right', fontWeight: 800 }}>{value}</span>
                      <span style={{ textAlign: 'right' }}>{l.hr ? Math.round(l.hr) : '—'}</span>
                      <span style={{
                        textAlign: 'right',
                        fontWeight: 800,
                        color: l.lac != null ? '#B45309' : '#D1D5DB',
                      }}>
                        {l.lac != null ? Number(l.lac).toFixed(1) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Open full training CTA */}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenFull && onOpenFull(); }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.985)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
            onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
            onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.985)'; }}
            onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
            style={{
              marginTop: 10,
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 14px', borderRadius: 11,
              background: tint,
              border: 'none', color: '#fff',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 800,
              cursor: 'pointer',
              boxShadow: `0 3px 10px -3px ${tint}66`,
              transition: 'transform .12s ease',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            Open full training
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── LapStrip — inline mini bar chart showing a training's laps (TrainingLog-style) ──
// Bars colored by relative intensity (low=blue, mid=green/yellow, high=orange/red),
// with a small lactate badge floating above any lap that has a measured value.

function LapStrip({ activity, sport, height = 38, width = 130 }) {
  const intervals = getIntervals(activity);
  if (intervals.length < 2) return null;

  const sportIsPace = sport === 'run' || sport === 'swim';

  // Pick the metric that's actually populated: power for bike, pace for run/swim, HR fallback
  const lapData = intervals.map(iv => {
    let intensityValue = null;
    if (sportIsPace) {
      // Faster pace = higher intensity. Convert pace (sec/km) → "lower is harder".
      intensityValue = intervalPaceSec(iv, sport);
    } else {
      intensityValue = getIntervalMetric(iv, 'power') ?? getIntervalMetric(iv, 'heartRate');
    }
    return {
      v: intensityValue,
      lac: intervalLactate(iv),
      durationSec: parseResultDurationSec(iv) || Number(iv.moving_time || iv.elapsed_time) || 0,
    };
  }).filter(l => l.v != null && l.v > 0);

  if (lapData.length < 1) return null;

  // Domain — for pace, INVERT (faster = higher bar)
  const vMin = Math.min(...lapData.map(l => l.v));
  const vMax = Math.max(...lapData.map(l => l.v));
  const range = (vMax - vMin) || 1;

  // Normalize to 0..1 (1 = highest intensity)
  const intensityOf = (v) => {
    if (sportIsPace) return 1 - (v - vMin) / range; // smaller seconds → harder
    return (v - vMin) / range;                       // bigger watts/HR → harder
  };

  // 5-stop intensity color ramp (blue → green → yellow → orange → red)
  const colorAt = (t) => {
    if (t < 0.2) return '#60a5fa'; // blue
    if (t < 0.4) return '#34d399'; // green
    if (t < 0.6) return '#fbbf24'; // yellow
    if (t < 0.8) return '#fb923c'; // orange
    return '#ef4444';              // red
  };

  // Width per lap proportional to duration
  const totalDur = lapData.reduce((a, l) => a + (l.durationSec || 1), 0) || 1;
  const gap = 1;
  const innerW = width - gap * (lapData.length - 1);
  const minBarW = 2;
  let bars = lapData.map(l => (innerW * (l.durationSec || 1)) / totalDur);
  // Enforce min, redistribute
  const undersized = bars.filter(b => b < minBarW).length;
  if (undersized > 0) {
    const deficit = bars.reduce((acc, b) => acc + Math.max(0, minBarW - b), 0);
    const sumLarge = bars.reduce((acc, b) => acc + (b >= minBarW ? b : 0), 0) || 1;
    bars = bars.map(b => b < minBarW ? minBarW : Math.max(minBarW, b - deficit * (b / sumLarge)));
  }

  return (
    <div style={{
      position: 'relative', width, height,
      flexShrink: 0,
    }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}>
        {(() => {
          let runX = 0;
          return lapData.map((l, i) => {
            const w = bars[i];
            const t = intensityOf(l.v);
            // Bar height: scale by intensity, min 25% so even the lightest bar is visible
            const minH = height * 0.25;
            const h = minH + (height - minH) * t;
            const x = runX;
            runX += w + gap;
            const fill = colorAt(t);
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={height - h}
                  width={w}
                  height={h}
                  rx={Math.min(1.5, w / 2)}
                  fill={fill}
                  style={{
                    transformOrigin: `${x + w / 2}px ${height}px`,
                    animation: `ndBarGrow .45s ${i * 18}ms cubic-bezier(.22,1,.36,1) both`,
                  }}
                />
                {l.lac != null && (
                  <g style={{ animation: `ndPopIn .35s ${100 + i * 18}ms cubic-bezier(.22,1.4,.36,1) both` }}>
                    <circle
                      cx={x + w / 2}
                      cy={height - h - 6}
                      r="6"
                      fill="#fff"
                      stroke="#ef4444"
                      strokeWidth="1.2"
                    />
                    <text
                      x={x + w / 2}
                      y={height - h - 6}
                      dy="2"
                      textAnchor="middle"
                      style={{
                        fontSize: 7, fontWeight: 800, fill: '#ef4444',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {Number(l.lac).toFixed(1)}
                    </text>
                  </g>
                )}
              </g>
            );
          });
        })()}
      </svg>
    </div>
  );
}


// ─── ChevronBtn — small circular prev/next arrow used in the training history header ──

function ChevronBtn({ dir, onClick, disabled, small }) {
  const size = small ? 26 : 30;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(.92)'; }}
      onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
      onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
      onTouchStart={(e)=> { if (!disabled) e.currentTarget.style.transform = 'scale(.92)'; }}
      onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
      style={{
        width: size, height: size, borderRadius: 9999,
        border: '1px solid rgba(118,126,181,.2)',
        background: 'rgba(255,255,255,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: disabled ? '#D1D5DB' : '#5E6590',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        transition: 'transform .12s ease, background .15s ease, color .2s ease',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
      aria-label={dir === 'prev' ? 'Previous' : 'Next'}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'prev'
          ? <polyline points="15 18 9 12 15 6" />
          : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}

// ─── ShowMoreButton — pagination footer for the lactate cards ────────────────

function ShowMoreButton({ shown, total, onClick }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.985)'; }}
      onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
      onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
      onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.985)'; }}
      onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
      style={{
        marginTop: 8,
        width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '9px 12px', borderRadius: 11,
        background: 'rgba(255,255,255,.55)',
        border: '1px dashed rgba(118,126,181,.3)',
        color: '#5E6590',
        fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
        cursor: 'pointer',
        transition: 'transform .12s ease, background .15s ease',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
      Show more · <span style={{ color: '#9CA3AF', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {shown} of {total}
      </span>
    </button>
  );
}

const styles = {
  page: {
    display: 'flex', flexDirection: 'column', minHeight: '100%',
    background: 'linear-gradient(160deg, #EEF0F4 0%, #E8EAF0 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '22px 18px 10px',
  },
  title: { fontSize: 19, fontWeight: 800, color: '#0A0E1A', letterSpacing: '-0.02em', lineHeight: 1.25 },
  subtitle: { fontSize: 12, fontWeight: 600, color: '#6B7280', marginTop: 2 },
  headerBtn: {
    width: 36, height: 36, borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,.65)',
    color: '#5E6590',
    boxShadow: '0 1px 4px -1px rgba(10,14,26,.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'transform .12s ease, background .15s ease',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    flexShrink: 0,
  },
  body: {
    flex: 1, padding: '8px 14px 0',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
};
