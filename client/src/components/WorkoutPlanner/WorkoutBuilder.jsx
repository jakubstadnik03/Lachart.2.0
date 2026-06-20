/**
 * WorkoutBuilder
 * ──────────────
 * Full workout step editor with:
 *  - Add / edit / delete / reorder steps
 *  - Power targets: watts, % FTP, % LT1, % LT2, zone Z1-Z5, LT1, LT2, open
 *  - HR targets (same types)
 *  - Repeat groups (wrap steps in "repeat N times")
 *  - Quick Interval Block builder (e.g. 10×5min LT2 + 1min recovery)
 *  - Live SVG chart preview with hover tooltips, power labels, drag-to-resize bars
 *  - Workout summary: duration, estimated TSS, zone time breakdown
 *
 * Exports:
 *  - default WorkoutBuilder
 *  - PRESET_CATALOG  – metadata for built-in presets (used in Templates tab)
 *  - buildPresetSteps(key) – returns step array for a given preset key
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon,
         ArrowPathIcon, XMarkIcon, Bars3Icon } from '@heroicons/react/24/outline';

/** Normalize drag/drop ids — dataset attrs are always strings. */
function normalizeReorderId(id) {
  if (id == null || id === '') return null;
  if (typeof id === 'string' && id.startsWith('g:')) return id;
  const n = Number(id);
  return Number.isNaN(n) ? id : n;
}

function DragHandle({ dragHandleProps = {}, label = 'Drag to reorder' }) {
  const { onDragStart, onDragEnd, onTouchStart, ...rest } = dragHandleProps;
  return (
    <div
      {...rest}
      draggable={rest.draggable ?? true}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        onDragStart?.(e);
      }}
      className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 shrink-0 touch-none select-none flex items-center justify-center w-8 h-8 -ml-1"
      style={{ touchAction: 'none' }}
      title={label}
      aria-label={label}
    >
      <Bars3Icon className="w-5 h-5" />
    </div>
  );
}

function ReorderButtons({ index, total, onMoveUp, onMoveDown, onDelete }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <div className="flex flex-col border border-slate-100 rounded-lg overflow-hidden bg-slate-50">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index <= 0}
          className="w-8 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-25"
          aria-label="Move up"
        >
          <ChevronUpIcon className="w-4 h-4" />
        </button>
        <div className="h-px bg-slate-100" />
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index >= total - 1}
          className="w-8 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-25"
          aria-label="Move down"
        >
          <ChevronDownIcon className="w-4 h-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="w-8 h-8 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center"
        aria-label="Delete step"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Colours ────────────────────────────────────────────────────────────────
const STEP_COLORS = {
  warmup:   { bg: '#fbbf24', light: '#fef3c7', text: '#92400e' },
  work:     { bg: '#767EB5', light: '#ede9fe', text: '#4c1d95' },
  recovery: { bg: '#6ee7b7', light: '#d1fae5', text: '#065f46' },
  cooldown: { bg: '#38bdf8', light: '#e0f2fe', text: '#0c4a6e' },
  rest:     { bg: '#d1d5db', light: '#f3f4f6', text: '#374151' },
};

const ZONE_COLORS = ['#93c5fd','#86efac','#fde68a','#fb923c','#f87171'];

// ─── Helpers ────────────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => `step-${Date.now()}-${++_uid}`;

export function fmtDuration(secs) {
  if (!secs) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export function fmtShort(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  return `${m}m`;
}

export function parseDuration(str) {
  if (!str) return 0;
  const trimmed = String(str).trim();
  // Bare number → treat as minutes (e.g. "35" = 35min, "90" = 1h30m)
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10) * 60;
  const parts = trimmed.split(':').map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

/** Mid-point of a zone object {min, max} — falls back to min when max is absent/Infinity */
function zoneMid(z) {
  if (!z) return null;
  const min = z.min ?? 0;
  const max = (z.max != null && z.max !== Infinity && z.max > 0) ? z.max : min * 1.08;
  return (min + max) / 2;
}

export function resolveTargetWatts(target, context) {
  if (!target || target.type === 'open') return context.ftp ? context.ftp * 0.5 : 150;
  const { ftp = 250, lt1Power = null, lt2Power = null, cyclingZones = null } = context;
  const mid = (t) => t.useRange ? (t.rangeMin + t.rangeMax) / 2 : (t.value || 0);
  if (target.type === 'watts')        return mid(target);
  if (target.type === 'percent_ftp')  return ftp * (mid(target) / 100);
  if (target.type === 'percent_lt1')  return (lt1Power || ftp * 0.75) * (mid(target) / 100);
  if (target.type === 'percent_lt2')  return (lt2Power || ftp) * (mid(target) / 100);
  if (target.type === 'lt1')          return target.override ?? (lt1Power || cyclingZones?.lt1 || ftp * 0.75);
  if (target.type === 'lt2')          return target.override ?? (lt2Power || cyclingZones?.lt2 || ftp);
  if (target.type === 'zone') {
    if (target.override != null) return target.override;
    const z = target.value || 2;
    // Use actual profile zone midpoint when available
    const profileMid = cyclingZones ? zoneMid(cyclingZones[`zone${z}`]) : null;
    if (profileMid != null && profileMid > 0) return profileMid;
    // Fallback: calculate from thresholds
    const lt2 = lt2Power || ftp;
    const lt1 = lt1Power || ftp * 0.75;
    return [lt1 * 0.8, lt1, lt2 * 0.95, lt2, lt2 * 1.1][Math.min(z - 1, 4)];
  }
  return 0;
}

/**
 * Resolve a power target to pace (sec/km) for running.
 * Returns null if no pace context is available.
 * Note: for pace, higher value = slower. Zones from profile are stored as sec/km.
 */
export function resolveTargetPace(target, context) {
  const { lt1Pace = null, lt2Pace = null, runningZones = null } = context;
  // Need at least one reference point
  const lt2p = lt2Pace || runningZones?.lt2 || null;
  if (!lt2p) return null;
  if (!target || target.type === 'open') return lt2p * 1.25; // easy jog
  const mid = (t) => t.useRange ? (t.rangeMin + t.rangeMax) / 2 : (t.value || 0);
  const lt1p = lt1Pace || runningZones?.lt1 || lt2p * 1.12;
  if (target.type === 'lt1')         return target.override ?? lt1p;
  if (target.type === 'lt2')         return target.override ?? lt2p;
  // For % targets: 100% LT2 = lt2Pace, 105% LT2 means 5% faster (÷1.05 to get sec/km)
  if (target.type === 'percent_lt1') return lt1p / (mid(target) / 100);
  if (target.type === 'percent_lt2') return lt2p / (mid(target) / 100);
  if (target.type === 'percent_ftp') return lt2p / (mid(target) / 100);
  if (target.type === 'zone') {
    if (target.override != null) return target.override;
    const z = target.value || 2;
    // Use actual profile zone midpoint when available
    const pz = runningZones?.[`zone${z}`];
    if (pz) {
      const min = pz.min ?? 0;
      const max = (pz.max != null && pz.max !== Infinity && pz.max > 0) ? pz.max : min * 1.08;
      return (min + max) / 2;
    }
    // Fallback: calculate from thresholds
    return [lt2p * 1.30, lt1p, lt2p * 1.04, lt2p, lt2p * 0.93][Math.min(z - 1, 4)];
  }
  return null;
}

/**
 * Resolve a power target to pace (sec/100m) for swimming.
 */
export function resolveTargetSwimPace(target, context) {
  const { lt1Swim = null, lt2Swim = null, swimmingZones = null } = context;
  const lt2p = lt2Swim || swimmingZones?.lt2 || null;
  if (!lt2p) return null;
  if (!target || target.type === 'open') return lt2p * 1.2;
  const mid = (t) => t.useRange ? (t.rangeMin + t.rangeMax) / 2 : (t.value || 0);
  const lt1p = lt1Swim || swimmingZones?.lt1 || lt2p * 1.10;
  if (target.type === 'lt1')         return target.override ?? lt1p;
  if (target.type === 'lt2')         return target.override ?? lt2p;
  if (target.type === 'percent_lt1') return lt1p / (mid(target) / 100);
  if (target.type === 'percent_lt2') return lt2p / (mid(target) / 100);
  if (target.type === 'percent_ftp') return lt2p / (mid(target) / 100);
  if (target.type === 'zone') {
    if (target.override != null) return target.override;
    const z = target.value || 2;
    const pz = swimmingZones?.[`zone${z}`];
    if (pz) {
      const min = pz.min ?? 0;
      const max = (pz.max != null && pz.max !== Infinity && pz.max > 0) ? pz.max : min * 1.08;
      return (min + max) / 2;
    }
    return [lt2p * 1.25, lt1p, lt2p * 1.04, lt2p, lt2p * 0.92][Math.min(z - 1, 4)];
  }
  return null;
}

/** Format sec/km → "M:SS" */
export function fmtPace(sec) {
  if (!sec || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

/** Parse distance string like "400m", "1.5km", "400" → meters */
export function parseDistance(str) {
  if (!str) return 0;
  const s = String(str).trim().toLowerCase();
  if (s.endsWith('km')) return Math.round(parseFloat(s) * 1000);
  if (s.endsWith('m'))  return Math.round(parseFloat(s));
  return Math.round(parseFloat(s)) || 0;
}

/** Format meters → "400m" / "1.5 km" */
export function fmtDistance(m) {
  if (!m || m <= 0) return '0m';
  if (m >= 1000) {
    const km = m / 1000;
    return km === Math.floor(km) ? `${km} km` : `${km.toFixed(1)} km`;
  }
  return `${m}m`;
}

/**
 * Get the sport-specific pace/unit label for a resolved pace value.
 * Returns { label: string, unit: string } or null if not applicable.
 */
export function resolvePaceForSport(target, context) {
  const sport = context.sport;
  if (sport === 'run') {
    const p = resolveTargetPace(target, context);
    return p ? { pace: p, unit: '/km', label: fmtPace(p) } : null;
  }
  if (sport === 'swim') {
    const p = resolveTargetSwimPace(target, context);
    return p ? { pace: p, unit: '/100m', label: fmtPace(p) } : null;
  }
  return null;
}

export function formatTargetLabel(target) {
  if (!target || target.type === 'open') return '';
  if (target.type === 'lt1') return 'LT1';
  if (target.type === 'lt2') return 'LT2';
  if (target.type === 'zone') return `Z${target.value}`;
  if (target.type === 'watts') return target.useRange ? `${target.rangeMin}-${target.rangeMax}W` : `${target.value}W`;
  const sfx = { percent_ftp:'FTP', percent_lt1:'LT1', percent_lt2:'LT2' }[target.type] || '';
  if (target.useRange) return `${target.rangeMin}-${target.rangeMax}%`;
  return `${target.value}%${sfx}`;
}

/** Compute estimated TSS for a set of steps given a context (ftp, lt1Power, lt2Power, cyclingZones…) */
export function computeEstTSS(steps, context) {
  const ftp = context?.lt2Power || context?.cyclingZones?.lt2 || context?.ftp || 250;
  const exp = expandSteps(steps);
  let tss = 0;
  exp.forEach(s => {
    const dur = s.durationSeconds || 0;
    const w   = resolveTargetWatts(s.powerTarget, context);
    tss += (dur / 3600) * (w / ftp) ** 2 * 100;
  });
  return Math.round(tss);
}

export function expandSteps(steps) {
  const expanded = [];
  const visited = new Set();
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.groupId) { expanded.push({ ...s, repeat: 1 }); continue; }
    if (visited.has(s.groupId)) continue;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const header = group.find(x => x.isGroupHeader) || group[0];
    const reps = header.groupRepeat || 1;
    for (let r = 0; r < reps; r++) group.forEach(gs => expanded.push({ ...gs, repeat: reps }));
  }
  return expanded;
}

function totalDuration(steps) {
  return expandSteps(steps).reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
}

// ─── Built-in preset catalog (exported for Templates tab) ────────────────────
export const PRESET_CATALOG = [
  // ── Bike ────────────────────────────────────────────────────────────────────
  { key: 'threshold_intervals', name: 'Threshold Intervals', sport: 'bike', desc: '5×8min @LT2',           color: '#767EB5' },
  { key: 'sweet_spot',          name: 'Sweet Spot',          sport: 'bike', desc: '3×15min @88-93%FTP',    color: '#f97316' },
  { key: 'vo2max',              name: 'VO2max Bike',         sport: 'bike', desc: '6×4min @Z5',             color: '#ef4444' },
  { key: 'zone2',               name: 'Zone 2 Ride',         sport: 'bike', desc: '60min steady Z2',        color: '#22c55e' },
  { key: 'over_under',          name: 'Over-Unders',         sport: 'bike', desc: '3×(3+2min)',             color: '#a855f7' },
  { key: 'pyramid',             name: 'Pyramid',             sport: 'bike', desc: '2-4-6-4-2min @LT2',     color: '#f59e0b' },
  { key: 'tempo',               name: 'Tempo',               sport: 'bike', desc: '2×20min @90%LT2',       color: '#dc2626' },
  { key: 'lactate',             name: 'Lactate Staircase',   sport: 'bike', desc: 'Z2→Z5 steps',           color: '#6366f1' },

  // ── Run ─────────────────────────────────────────────────────────────────────
  { key: 'run_easy',            name: 'Easy Run',            sport: 'run',  desc: '45min @Z2',              color: '#86efac' },
  { key: 'run_long',            name: 'Long Run',            sport: 'run',  desc: '90min @Z1-Z2',           color: '#22c55e' },
  { key: 'run_threshold',       name: 'Threshold Run',       sport: 'run',  desc: '2×15min @LT2',           color: '#f97316' },
  { key: 'run_tempo',           name: 'Tempo Run',           sport: 'run',  desc: '20min @90%LT2',          color: '#dc2626' },
  { key: 'run_vo2max',          name: 'VO2max Run',          sport: 'run',  desc: '6×3min @Z5 + jog',       color: '#ef4444' },
  { key: 'run_fartlek',         name: 'Fartlek',             sport: 'run',  desc: '10×1min fast + 1min jog', color: '#a855f7' },
  { key: 'run_hills',           name: 'Hill Repeats',        sport: 'run',  desc: '8×60sec @Z5 + 2min',     color: '#6366f1' },
  { key: 'run_progressive',     name: 'Progressive Run',     sport: 'run',  desc: 'Z2→LT2 build',           color: '#f59e0b' },

  // ── Swim ────────────────────────────────────────────────────────────────────
  { key: 'swim_endurance',      name: 'Endurance Set',       sport: 'swim', desc: '30min steady @Z2',       color: '#38bdf8' },
  { key: 'swim_threshold',      name: 'Threshold Set',       sport: 'swim', desc: '10×100m @LT2',           color: '#0ea5e9' },
  { key: 'swim_sprint',         name: 'Sprint Set',          sport: 'swim', desc: '12×25m @Z5 + 30s rest',  color: '#ef4444' },
  { key: 'swim_pyramid',        name: 'Pyramid',             sport: 'swim', desc: '400-300-200-100m @LT2',  color: '#6366f1' },
  { key: 'swim_pull',           name: 'Pull Set',            sport: 'swim', desc: '3×400m @90%LT2',         color: '#a855f7' },
  { key: 'swim_warmup_drills',  name: 'Drill Focus',         sport: 'swim', desc: 'WU + 8×50m drills + CD', color: '#22c55e' },
];

export function buildPresetSteps(preset) {
  const p = () => `ps-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const WU  = (dur=600)  => ({ clientId:p(), stepType:'warmup',   isRamp:true, durationSeconds:dur, powerTarget:{type:'zone',value:2} });
  const CD  = (dur=600)  => ({ clientId:p(), stepType:'cooldown', isRamp:true, durationSeconds:dur, powerTarget:{type:'zone',value:1} });
  const WRK = (dur, pt)  => ({ clientId:p(), stepType:'work',                  durationSeconds:dur, powerTarget:pt });
  const REC = (dur=120)  => ({ clientId:p(), stepType:'recovery',              durationSeconds:dur, powerTarget:{type:'zone',value:1} });

  // Helper: build a repeat group (header + work + optional recovery)
  const GROUP = (reps, workDur, workPt, recDur=null, recPt={type:'zone',value:1}) => {
    const gid = p();
    const out = [
      { clientId:p(), groupId:gid, isGroupHeader:true, groupRepeat:reps, stepType:'work', durationSeconds:workDur, powerTarget:workPt },
    ];
    if (recDur) out.push({ clientId:p(), groupId:gid, stepType:'recovery', durationSeconds:recDur, powerTarget:recPt });
    return out;
  };

  // ── Bike ────────────────────────────────────────────────────────────────────
  if (preset === 'threshold_intervals')
    return [WU(900), ...GROUP(5, 480, {type:'lt2'}, 180), CD(600)];
  if (preset === 'sweet_spot')
    return [WU(900), ...GROUP(3, 900, {type:'percent_ftp',useRange:true,rangeMin:88,rangeMax:93}, 300), CD(600)];
  if (preset === 'vo2max')
    return [WU(900), ...GROUP(6, 240, {type:'zone',value:5}, 240), CD(600)];
  if (preset === 'zone2')
    return [WU(600), WRK(3600,{type:'zone',value:2}), CD(600)];
  if (preset === 'over_under') {
    // Each set: 3×(3min under + 2min over), 3 sets with 5min rest
    const gid = p();
    const set = [
      { clientId:p(), groupId:gid, isGroupHeader:true, groupRepeat:3, stepType:'work', durationSeconds:180, powerTarget:{type:'percent_lt2',value:95} },
      { clientId:p(), groupId:gid, stepType:'work', durationSeconds:120, powerTarget:{type:'percent_lt2',value:105} },
    ];
    return [WU(900), ...set, REC(300), ...set, REC(300), ...set, CD(600)];
  }
  if (preset === 'pyramid') {
    // Each effort is standalone (different durations) — use individual steps
    const steps = [WU(900)];
    [120,240,360,240,120].forEach((dur,i,arr) => { steps.push(WRK(dur,{type:'lt2'})); if(i<arr.length-1) steps.push(REC(120)); });
    steps.push(CD(600)); return steps;
  }
  if (preset === 'tempo')
    return [WU(900), ...GROUP(2, 1200, {type:'percent_lt2',value:90}, 300), CD(600)];
  if (preset === 'lactate') {
    // Staircase — different zones, no grouping possible (each is different)
    const steps = [WU(600)];
    [2,2,3,3,4,5].forEach(z => { steps.push(WRK(360,{type:'zone',value:z})); steps.push(REC(60)); });
    steps.push(CD(600)); return steps;
  }

  // ── Run ─────────────────────────────────────────────────────────────────────
  if (preset === 'run_easy')
    return [WU(300), WRK(2700,{type:'zone',value:2}), CD(300)];
  if (preset === 'run_long')
    return [WU(600), WRK(4800,{type:'zone',value:2}), WRK(600,{type:'zone',value:1}), CD(600)];
  if (preset === 'run_threshold')
    return [WU(600), ...GROUP(2, 900, {type:'lt2'}, 300), CD(600)];
  if (preset === 'run_tempo')
    return [WU(600), WRK(1200,{type:'percent_lt2',value:90}), CD(600)];
  if (preset === 'run_vo2max')
    return [WU(600), ...GROUP(6, 180, {type:'zone',value:5}, 180), CD(600)];
  if (preset === 'run_fartlek')
    return [WU(600), ...GROUP(10, 60, {type:'zone',value:4}, 60), CD(300)];
  if (preset === 'run_hills') {
    const steps = [WU(600)];
    for (let i = 0; i < 8; i++) { steps.push(WRK(60,{type:'zone',value:5})); if(i<7) steps.push(REC(120)); }
    steps.push(CD(600)); return steps;
  }
  if (preset === 'run_progressive') {
    const steps = [WU(600)];
    // 4 progressive blocks: Z2 → Z3 → Z4 → LT2
    [{type:'zone',value:2},{type:'zone',value:3},{type:'zone',value:4},{type:'lt2'}].forEach(pt => {
      steps.push(WRK(600, pt));
    });
    steps.push(CD(300)); return steps;
  }

  // ── Swim (distance-based: durationType='distance', distanceMeters) ──────────
  // Estimate ~2:00/100m = 120 sec/100m for chart sizing
  const swDist = (m) => Math.round(m * 1.2); // approx durationSeconds from meters
  const SWU = (dist=400, pt={type:'zone',value:1}) => ({
    clientId:p(), stepType:'warmup', isRamp:true,
    durationType:'distance', distanceMeters:dist, durationSeconds:swDist(dist), powerTarget:pt,
  });
  const SCD = (dist=200, pt={type:'zone',value:1}) => ({
    clientId:p(), stepType:'cooldown', isRamp:true,
    durationType:'distance', distanceMeters:dist, durationSeconds:swDist(dist), powerTarget:pt,
  });
  const SWRK = (dist, pt) => ({
    clientId:p(), stepType:'work',
    durationType:'distance', distanceMeters:dist, durationSeconds:swDist(dist), powerTarget:pt,
  });
  // Rest between reps stays time-based (e.g. 20s, 30s)
  const SRST = (secs=20) => ({ clientId:p(), stepType:'rest', durationSeconds:secs, powerTarget:{type:'open'} });

  // Swim group helper (distance-based work + time-based rest)
  const SGROUP = (reps, dist, workPt, restSecs=20) => {
    const gid = p();
    return [
      { clientId:p(), groupId:gid, isGroupHeader:true, groupRepeat:reps, stepType:'work',
        durationType:'distance', distanceMeters:dist, durationSeconds:swDist(dist), powerTarget:workPt },
      { clientId:p(), groupId:gid, stepType:'rest', durationSeconds:restSecs, powerTarget:{type:'open'} },
    ];
  };

  if (preset === 'swim_endurance')
    return [SWU(400), SWRK(1600,{type:'zone',value:2}), SCD(200)];

  if (preset === 'swim_threshold')
    return [SWU(400), ...SGROUP(10, 100, {type:'lt2'}, 20), SCD(200)];

  if (preset === 'swim_sprint')
    return [SWU(400), ...SGROUP(12, 25, {type:'zone',value:5}, 30), SCD(200)];

  if (preset === 'swim_pyramid') {
    const steps = [SWU(400)];
    [400,300,200,100].forEach((dist,i,arr) => {
      steps.push(SWRK(dist,{type:'lt2'}));
      if (i < arr.length-1) steps.push(SRST(20));
    });
    steps.push(SCD(200)); return steps;
  }

  if (preset === 'swim_pull')
    return [SWU(400), ...SGROUP(3, 400, {type:'percent_lt2',value:90}, 30), SCD(200)];

  if (preset === 'swim_warmup_drills')
    return [SWU(400), ...SGROUP(8, 50, {type:'zone',value:2}, 20), SCD(200)];
  return [];
}

// ─── Power Target Editor ────────────────────────────────────────────────────
const TARGET_TYPES = [
  { value: 'open',        label: 'Open / Easy' },
  { value: 'zone',        label: 'Zone (Z1-Z5)' },
  { value: 'lt1',         label: 'LT1' },
  { value: 'lt2',         label: 'LT2 / Threshold' },
  { value: 'percent_lt1', label: '% of LT1' },
  { value: 'percent_lt2', label: '% of LT2' },
  { value: 'percent_ftp', label: '% of FTP' },
  { value: 'watts',       label: 'Exact watts' },
];

function TargetEditor({ value = {}, onChange, label = 'Power target' }) {
  const t = value || {};
  const set = (k, v) => onChange({ ...t, [k]: v });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide w-full">{label}</span>
      <select value={t.type||'open'} onChange={e=>onChange({type:e.target.value,value:null,useRange:false})}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary">
        {TARGET_TYPES.map(tt=><option key={tt.value} value={tt.value}>{tt.label}</option>)}
      </select>
      {t.type==='zone' && (
        <>
          <select value={t.value||2} onChange={e=>set('value',Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
            {[1,2,3,4,5].map(z=><option key={z} value={z}>Z{z}</option>)}
          </select>
          <input
            type="number" step={1} min={1}
            className="w-16 text-xs border border-slate-200 rounded-lg px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="W"
            value={t.override != null ? t.override : ''}
            onChange={e => {
              const w = e.target.value === '' ? undefined : Number(e.target.value);
              set('override', w != null && w > 0 ? w : undefined);
            }}
          />
          {t.override > 0 && <span className="text-xs text-slate-400">W</span>}
        </>
      )}
      {['percent_ftp','percent_lt1','percent_lt2'].includes(t.type) && (
        <div className="flex items-center gap-1">
          {t.useRange ? (
            <>
              <input type="number" step={1} min={1} max={300} className="w-14 text-xs border border-slate-200 rounded-lg px-1.5 py-1 text-center" placeholder="min" value={t.rangeMin||''} onChange={e=>set('rangeMin',Number(e.target.value))}/>
              <span className="text-xs text-slate-400">-</span>
              <input type="number" step={1} min={1} max={300} className="w-14 text-xs border border-slate-200 rounded-lg px-1.5 py-1 text-center" placeholder="max" value={t.rangeMax||''} onChange={e=>set('rangeMax',Number(e.target.value))}/>
              <span className="text-xs text-slate-400">%</span>
            </>
          ) : (
            <><input type="number" step={1} min={1} max={300} className="w-14 text-xs border border-slate-200 rounded-lg px-1.5 py-1 text-center" placeholder="%" value={t.value||''} onChange={e=>set('value',Number(e.target.value))}/><span className="text-xs text-slate-400">%</span></>
          )}
          <button onClick={()=>set('useRange',!t.useRange)} className="text-[10px] text-primary hover:underline">{t.useRange?'Fixed':'Range'}</button>
        </div>
      )}
      {t.type==='watts' && (
        <div className="flex items-center gap-1">
          {t.useRange ? (
            <>
              <input type="number" step={1} min={1} className="w-16 text-xs border border-slate-200 rounded-lg px-1.5 py-1 text-center" placeholder="min W" value={t.rangeMin||''} onChange={e=>set('rangeMin',Number(e.target.value))}/>
              <span className="text-xs text-slate-400">-</span>
              <input type="number" step={1} min={1} className="w-16 text-xs border border-slate-200 rounded-lg px-1.5 py-1 text-center" placeholder="max W" value={t.rangeMax||''} onChange={e=>set('rangeMax',Number(e.target.value))}/>
              <span className="text-xs text-slate-400">W</span>
            </>
          ) : (
            <><input type="number" step={1} min={1} className="w-20 text-xs border border-slate-200 rounded-lg px-1.5 py-1 text-center" placeholder="watts" value={t.value||''} onChange={e=>set('value',Number(e.target.value))}/><span className="text-xs text-slate-400">W</span></>
          )}
          <button onClick={()=>set('useRange',!t.useRange)} className="text-[10px] text-primary hover:underline">{t.useRange?'Fixed':'Range'}</button>
        </div>
      )}
    </div>
  );
}

// ─── Workout Preview Chart – hover tooltips, power labels, drag-to-resize ────
export function WorkoutChart({ steps, context, onStepResize, onStepClick }) {
  const svgRef = useRef(null);
  const [hoveredInfo, setHoveredInfo]   = useState(null);
  const [dragState,   setDragState]     = useState(null);  // { clientId, startX, startDur, initTotal, svgPxW }
  const [dragPreview, setDragPreview]   = useState(null);  // { clientId, newDur }

  const expanded = useMemo(() => expandSteps(steps), [steps]);

  // Apply drag override when computing durations
  const getDur = useCallback((s) =>
    dragPreview?.clientId === s.clientId ? dragPreview.newDur : (s.durationSeconds || 0)
  , [dragPreview]);

  const total = useMemo(() => expanded.reduce((sum, s) => sum + getDur(s), 0), [expanded, getDur]);

  // Window-level drag handlers
  useEffect(() => {
    if (!dragState) return;
    const move = (e) => {
      const dx = e.clientX - dragState.startX;
      const secsPerPx = dragState.initTotal / dragState.svgPxW;
      const newDur = Math.max(15, Math.round(dragState.startDur + dx * secsPerPx));
      setDragPreview({ clientId: dragState.clientId, newDur });
      setHoveredInfo(null);
    };
    const up = (e) => {
      const dx = e.clientX - dragState.startX;
      const secsPerPx = dragState.initTotal / dragState.svgPxW;
      const newDur = Math.max(15, Math.round(dragState.startDur + dx * secsPerPx));
      onStepResize?.(dragState.clientId, newDur);
      setDragState(null);
      setDragPreview(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [dragState, onStepResize]);

  if (!total || expanded.length === 0) return (
    <div className="flex items-center justify-center h-24 text-xs text-slate-300">Add steps to see the workout preview</div>
  );

  const W = 600, H = 120;
  const allWatts = expanded.map(s => resolveTargetWatts(s.powerTarget, context));
  const maxW = Math.max(...allWatts, 1);
  const FLOOR = 0.06;

  let cx = 0;
  const bars = expanded.map((s, i) => {
    const dur = getDur(s);
    const w   = Math.max(1, (dur / total) * W);
    const watts = resolveTargetWatts(s.powerTarget, context);
    const barH  = Math.max(FLOOR, watts / maxW) * H;
    const x = cx; cx += w;
    const bw = Math.max(1, w - 1);
    let fill = STEP_COLORS[s.stepType]?.bg || '#94a3b8';
    if (s.powerTarget?.type === 'zone') fill = ZONE_COLORS[Math.min((s.powerTarget.value||1)-1, 4)];
    return { s, i, x, w, bw, barH, watts: Math.round(watts), fill, dur, powerLabel: formatTargetLabel(s.powerTarget) };
  });

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 120, cursor: dragState ? 'ew-resize' : 'default' }}
        onMouseLeave={() => { if (!dragState) setHoveredInfo(null); }}
      >
        {bars.map(({ s, i, x, w, bw, barH, watts, fill, dur, powerLabel }) => {
          const xc = x + w / 2;
          const isDragging = dragState?.clientId === s.clientId;

          let shape;
          if (s.isRamp && s.stepType === 'warmup') {
            shape = <polygon key={`sh${i}`} points={`${x},${H} ${x+bw},${H-barH} ${x+bw},${H}`} fill={fill} opacity={isDragging ? 1 : 0.85} />;
          } else if (s.isRamp && s.stepType === 'cooldown') {
            shape = <polygon key={`sh${i}`} points={`${x},${H-barH} ${x},${H} ${x+bw},${H}`} fill={fill} opacity={isDragging ? 1 : 0.85} />;
          } else {
            shape = <rect key={`sh${i}`} x={x} y={H-barH} width={bw} height={barH} fill={fill} rx={2} opacity={isDragging ? 1 : 0.85} />;
          }

          return (
            <g
              key={i}
              style={{ cursor: onStepClick ? 'pointer' : 'default' }}
              onMouseEnter={() => { if (!dragState) setHoveredInfo({ xPct: (xc/W)*100, s, watts, powerLabel, dur: fmtDuration(dur), barH }); }}
              onTouchStart={(e) => {
                // Show tooltip on tap (mobile)
                e.preventDefault();
                setHoveredInfo({ xPct: (xc/W)*100, s, watts, powerLabel, dur: fmtDuration(dur), barH });
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                // Brief delay so tooltip is visible, then dismiss
                setTimeout(() => setHoveredInfo(null), 1800);
                if (!dragState && onStepClick) onStepClick(s.clientId);
              }}
              onClick={() => { if (!dragState && onStepClick) onStepClick(s.clientId); }}
            >
              {shape}

              {/* Duration label above bar */}
              {w > 32 && (
                <text x={xc} y={Math.max(H-barH-4, 10)} textAnchor="middle" fontSize={10} fill={isDragging ? '#1e293b' : '#475569'} fontWeight="600" fontFamily="system-ui,sans-serif">
                  {fmtDuration(dur)}
                </text>
              )}

              {/* Power label inside bar */}
              {w > 28 && barH > 18 && powerLabel && (
                <text x={xc} y={H-barH/2+4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.97)" fontWeight="bold" fontFamily="system-ui,sans-serif">
                  {powerLabel}
                </text>
              )}

              {/* Resize handle – right edge of bar */}
              {onStepResize && (
                <rect
                  x={x + w - 5} y={0} width={10} height={H}
                  fill="transparent"
                  style={{ cursor: 'ew-resize' }}
                  onMouseEnter={() => setHoveredInfo(null)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const svgPxW = svgRef.current?.getBoundingClientRect().width || 600;
                    setDragState({ clientId: s.clientId, startX: e.clientX, startDur: dur, initTotal: total, svgPxW });
                  }}
                />
              )}
            </g>
          );
        })}

        {/* LT reference lines with watt labels */}
        {context.lt2Power && (() => {
          const y = H - (context.lt2Power / maxW) * H;
          return (
            <g>
              <line x1={0} y1={y} x2={W} y2={y} stroke="#f87171" strokeWidth={1} strokeDasharray="5 4" opacity={0.7}/>
              <rect x={W - 52} y={y - 9} width={50} height={12} rx={3} fill="#fef2f2" opacity={0.9}/>
              <text x={W - 27} y={y + 0.5} textAnchor="middle" fontSize={8} fill="#ef4444" fontWeight="700" fontFamily="system-ui,sans-serif">
                LT2 {Math.round(context.lt2Power)}W
              </text>
            </g>
          );
        })()}
        {context.lt1Power && (() => {
          const y = H - (context.lt1Power / maxW) * H;
          return (
            <g>
              <line x1={0} y1={y} x2={W} y2={y} stroke="#34d399" strokeWidth={1} strokeDasharray="5 4" opacity={0.7}/>
              <rect x={W - 52} y={y - 9} width={50} height={12} rx={3} fill="#f0fdf4" opacity={0.9}/>
              <text x={W - 27} y={y + 0.5} textAnchor="middle" fontSize={8} fill="#16a34a" fontWeight="700" fontFamily="system-ui,sans-serif">
                LT1 {Math.round(context.lt1Power)}W
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Hover tooltip (hidden during drag) */}
      {hoveredInfo && !dragState && (() => {
        const stepCol = STEP_COLORS[hoveredInfo.s.stepType] || STEP_COLORS.work;
        return (
          <div
            className="absolute pointer-events-none z-20"
            style={{
              left: `${Math.min(Math.max(hoveredInfo.xPct, 8), 92)}%`,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              // Anchor to the bar's top edge: barH px from bottom of SVG (120px tall) + 6px gap
              bottom: `${(hoveredInfo.barH ?? 40) + 6}px`,
            }}
          >
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden min-w-[120px]"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)' }}>
              {/* Colored accent top */}
              <div className="h-1.5 w-full" style={{ backgroundColor: stepCol.bg }}/>
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stepCol.bg }}/>
                  <span className="text-xs font-bold capitalize" style={{ color: stepCol.text }}>
                    {hoveredInfo.s.label || hoveredInfo.s.stepType}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 font-medium">
                      {hoveredInfo.s.durationType === 'distance' ? 'Distance' : 'Duration'}
                    </div>
                    <div className="font-bold text-slate-800 text-sm">
                      {hoveredInfo.s.durationType === 'distance'
                        ? fmtDistance(hoveredInfo.s.distanceMeters || 0)
                        : hoveredInfo.dur}
                    </div>
                  </div>
                  {hoveredInfo.powerLabel && (() => {
                    const paceInfo = resolvePaceForSport(hoveredInfo.s.powerTarget, context);
                    const isBike = !paceInfo && (context.sport === 'bike' || !context.sport);
                    return (
                      <div className="text-center border-l border-slate-100 pl-3">
                        <div className="text-[10px] text-slate-400 font-medium">
                          {paceInfo ? 'Pace' : 'Power'}
                        </div>
                        <div className="font-bold text-sm" style={{ color: stepCol.bg }}>{hoveredInfo.powerLabel}</div>
                        {paceInfo
                          ? <div className="text-[10px] text-slate-400">~{paceInfo.label} {paceInfo.unit}</div>
                          : isBike && hoveredInfo.watts > 0 && <div className="text-[10px] text-slate-400">~{hoveredInfo.watts} W</div>
                        }
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-3 h-2 overflow-hidden">
                <div className="w-3 h-3 bg-white border-r border-b border-slate-100 rotate-45 -translate-y-1.5 mx-auto"/>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Live drag label */}
      {dragState && dragPreview && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 mb-1 bg-violet-700 text-white text-[10px] font-bold rounded px-2 py-0.5 pointer-events-none z-20">
          {fmtDuration(dragPreview.newDur)}
        </div>
      )}
    </div>
  );
}

// ─── Workout Summary (duration, TSS, zone time) ──────────────────────────────
function WorkoutSummary({ steps, context }) {
  const { ftp = 250, lt1Power, lt2Power, cyclingZones } = context;
  // Prefer profile lt1/lt2, then explicit context values, then calculated fallback
  const lt1 = cyclingZones?.lt1 || lt1Power || ftp * 0.75;
  const lt2 = cyclingZones?.lt2 || lt2Power || ftp;

  const stats = useMemo(() => {
    const exp = expandSteps(steps);
    let totalSecs = 0, tssSum = 0, workSecs = 0, belowLt1 = 0, lt1Zone = 0, lt2Zone = 0, wattsSec = 0;
    exp.forEach(s => {
      const dur = s.durationSeconds || 0; totalSecs += dur;
      const w   = resolveTargetWatts(s.powerTarget, context);
      tssSum   += (dur / 3600) * (w / (ftp||250)) ** 2 * 100;
      wattsSec += w * dur;
      if (s.stepType === 'work') workSecs += dur;
      if (w >= lt2) lt2Zone += dur; else if (w >= lt1) lt1Zone += dur; else belowLt1 += dur;
    });
    const avgPower = totalSecs > 0 ? Math.round(wattsSec / totalSecs) : null;
    return { totalSecs, tss: Math.round(tssSum), workSecs, belowLt1, lt1Zone, lt2Zone, avgPower };
  }, [steps, ftp, lt1, lt2]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stats.totalSecs) return null;
  const T = stats.totalSecs;

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 text-center mb-2">
        {[
          ['Duration',  fmtShort(stats.totalSecs)],
          ['Est. TSS',  `~${stats.tss}`],
          ['Work time', fmtShort(stats.workSecs)],
          ['Avg power', stats.avgPower ? `~${stats.avgPower} W` : '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <div className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</div>
            <div className="text-sm font-bold text-slate-700">{val}</div>
          </div>
        ))}
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
        {stats.belowLt1 > 0 && <div style={{ width:`${(stats.belowLt1/T)*100}%`, backgroundColor:'#93c5fd' }}/>}
        {stats.lt1Zone  > 0 && <div style={{ width:`${(stats.lt1Zone/T)*100}%`,  backgroundColor:'#fbbf24' }}/>}
        {stats.lt2Zone  > 0 && <div style={{ width:`${(stats.lt2Zone/T)*100}%`,  backgroundColor:'#f87171' }}/>}
      </div>
      <div className="flex justify-between mt-1 text-[9px]">
        <span className="text-blue-400">Below LT1: {fmtShort(stats.belowLt1)}</span>
        <span className="text-amber-400">LT1-LT2: {fmtShort(stats.lt1Zone)}</span>
        <span className="text-red-400">Above LT2: {fmtShort(stats.lt2Zone)}</span>
      </div>
    </div>
  );
}

// ─── Quick Interval Block Builder ────────────────────────────────────────────

/**
 * TargetRow renders the "Work / Recovery" line in the Quick Interval Block
 * builder. CRITICAL: this component MUST live at module scope, not inside
 * QuickIntervalAdder. When it was nested as a local function, every keystroke
 * triggered a parent re-render, which created a brand-new TargetRow function
 * reference, which React treated as a different component type → it
 * unmounted the entire row and remounted it. Each remount blew away the
 * focused <input>, so after typing one character the cursor jumped out.
 * Hoisting it here keeps the function identity stable across renders, so
 * inputs keep their focus and selection while you type.
 */
function TargetRow({ context, label, color, dur, setDur, target, setTarget }) {
  const showOverride = ['lt1', 'lt2', 'zone', 'percent_ftp', 'percent_lt1', 'percent_lt2'].includes(target.type);
  const calcW = showOverride ? Math.round(resolveTargetWatts(target, context)) : null;
  const hasOverride = target.override != null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`text-xs font-semibold w-16 shrink-0 ${color}`}>{label}</span>
      <input type="text" value={dur} onChange={e=>setDur(e.target.value)}
        className="w-16 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" placeholder="mm:ss"/>
      <span className="text-xs text-slate-400">@</span>
      <select value={target.type} onChange={e=>setTarget({type:e.target.value, value:target.value||4, override:undefined})}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
        {TARGET_TYPES.filter(t=>t.value!=='open').map(tt=><option key={tt.value} value={tt.value}>{tt.label}</option>)}
      </select>
      {target.type==='zone' && (
        <select value={target.value||4} onChange={e=>setTarget({...target,value:Number(e.target.value),override:undefined})}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
          {[1,2,3,4,5].map(z=><option key={z} value={z}>Z{z}</option>)}
        </select>
      )}
      {['percent_ftp','percent_lt1','percent_lt2'].includes(target.type) && (
        <div className="flex items-center gap-1">
          <input type="number" step={1} min={1} max={300} value={target.value||90} onChange={e=>setTarget({...target,value:Number(e.target.value),override:undefined})}
            className="w-14 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none bg-white" placeholder="%"/>
          <span className="text-xs text-slate-400">%</span>
        </div>
      )}
      {target.type==='watts' && (
        <div className="flex items-center gap-1">
          <input type="number" step={1} min={1} value={target.value||''} onChange={e=>setTarget({...target,value:Number(e.target.value)})}
            className="w-16 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none bg-white" placeholder="W"/>
          <span className="text-xs text-slate-400">W</span>
        </div>
      )}
      {/* Editable exact-watts override for calculated targets */}
      {showOverride && calcW != null && calcW > 0 && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            step={1}
            min={1}
            value={hasOverride ? target.override : ''}
            placeholder={String(calcW)}
            onChange={e => {
              const v = e.target.value;
              setTarget({ ...target, override: v === '' ? undefined : Number(v) });
            }}
            className={`w-16 text-xs text-center rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-violet-300 bg-white transition-colors ${
              hasOverride
                ? 'border-2 border-violet-400 font-semibold text-violet-700'
                : 'border border-dashed border-slate-300 text-slate-400 placeholder:text-slate-300'
            }`}
          />
          <span className="text-xs text-slate-400">W</span>
          {hasOverride && (
            <button
              onClick={() => setTarget({ ...target, override: undefined })}
              title="Reset to calculated value"
              className="text-[10px] text-slate-400 hover:text-violet-600 leading-none"
            >↺</button>
          )}
        </div>
      )}
    </div>
  );
}

function QuickIntervalAdder({ context, onAdd }) {
  const [open, setOpen] = useState(false);
  const [reps, setReps] = useState(5);
  const [workDur, setWorkDur] = useState('5:00');
  const [workTarget, setWorkTarget] = useState({ type: 'lt2' });
  const [recDur, setRecDur] = useState('2:00');
  const [recTarget, setRecTarget] = useState({ type: 'zone', value: 1 });

  const wSecs = parseDuration(workDur);
  const rSecs = parseDuration(recDur);

  const handleAdd = () => {
    if (!wSecs || reps < 1) return;
    const gid = uid();
    const newSteps = [
      { clientId:uid(), groupId:gid, isGroupHeader:true, groupRepeat:reps, stepType:'work', durationSeconds:wSecs, powerTarget:{...workTarget} },
      ...(rSecs > 0 ? [{ clientId:uid(), groupId:gid, stepType:'recovery', durationSeconds:rSecs, powerTarget:{...recTarget} }] : []),
    ];
    onAdd(newSteps);
    setOpen(false);
  };

  if (!open) return (
    <button onClick={()=>setOpen(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-violet-200 text-violet-500 text-xs font-semibold hover:bg-violet-50 hover:border-violet-300 transition-colors w-full justify-center">
      <ArrowPathIcon className="w-3.5 h-3.5"/>
      Quick interval block
    </button>
  );

  return (
    <div className="rounded-xl border-2 border-violet-200 bg-violet-50/30 p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <ArrowPathIcon className="w-3.5 h-3.5 text-violet-500 shrink-0"/>
        <span className="text-xs font-bold text-violet-700">Quick Interval Block</span>
        <button onClick={()=>setOpen(false)} className="ml-auto p-0.5 rounded hover:bg-violet-100 text-slate-400 hover:text-slate-600">
          <XMarkIcon className="w-3.5 h-3.5"/>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 font-medium w-16 shrink-0">Repeat</span>
        <input type="number" min={1} max={99} step={1} value={reps} onChange={e=>setReps(Math.max(1,Number(e.target.value)))}
          className="w-14 text-xs text-center border border-violet-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"/>
        <span className="text-xs text-slate-400">x times</span>
      </div>
      <TargetRow context={context} label="Work" color="text-violet-600" dur={workDur} setDur={setWorkDur} target={workTarget} setTarget={setWorkTarget}/>
      <TargetRow context={context} label="Recovery" color="text-emerald-600" dur={recDur} setDur={setRecDur} target={recTarget} setTarget={setRecTarget}/>
      {wSecs > 0 && (() => {
        const wW = resolveTargetWatts(workTarget, context);
        const rW = resolveTargetWatts(recTarget, context);
        const totalSecs = wSecs + (rSecs > 0 ? rSecs : 0);
        const avgW = totalSecs > 0 ? Math.round((wW * wSecs + (rSecs > 0 ? rW * rSecs : 0)) / totalSecs) : null;
        return (
          <div className="text-[10px] text-violet-500 bg-violet-50 rounded-lg px-2 py-1.5 flex items-center gap-2 flex-wrap">
            <span>{reps} x ({fmtDuration(wSecs)} work{rSecs>0?` + ${fmtDuration(rSecs)} recovery`:''}) = <strong>{fmtShort(reps*(wSecs+(rSecs||0)))}</strong> total</span>
            {avgW != null && avgW > 0 && (
              <span className="ml-auto text-violet-600 font-semibold">~{avgW} W avg</span>
            )}
          </div>
        );
      })()}
      <div className="flex gap-2 justify-end pt-0.5">
        <button onClick={()=>setOpen(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={handleAdd} disabled={!wSecs||reps<1}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-40 rounded-lg flex items-center gap-1.5 transition-colors">
          <PlusIcon className="w-3 h-3"/>
          Add {reps} intervals
        </button>
      </div>
    </div>
  );
}

// ─── Progressive Ramp Builder (warmup / cooldown in N steps) ─────────────────
function QuickProgressiveAdder({ context, onAdd }) {
  const [open, setOpen] = useState(false);
  const [rampType, setRampType] = useState('warmup'); // 'warmup' | 'cooldown'
  const [steps, setSteps] = useState(4);
  const [stepDur, setStepDur] = useState('3:00');
  const [fromType, setFromType] = useState('zone');
  const [fromVal, setFromVal] = useState(1);
  const [toType, setToType] = useState('lt2');
  const [toVal, setToVal] = useState(4);

  const durSecs = parseDuration(stepDur);

  const fromWatts = resolveTargetWatts({ type: fromType, value: fromVal }, context);
  const toWatts   = resolveTargetWatts({ type: toType,   value: toVal   }, context);

  const handleAdd = () => {
    if (!durSecs || steps < 2) return;
    const newSteps = Array.from({ length: steps }, (_, i) => {
      const frac = steps > 1 ? i / (steps - 1) : 1;
      const w = Math.round(rampType === 'warmup'
        ? fromWatts + (toWatts - fromWatts) * frac
        : toWatts + (fromWatts - toWatts) * frac
      );
      return {
        clientId: uid(),
        stepType: rampType,
        isRamp: false,
        durationSeconds: durSecs,
        powerTarget: { type: 'watts', value: w },
        label: `${rampType.charAt(0).toUpperCase() + rampType.slice(1)} ${i + 1}`,
      };
    });
    onAdd(newSteps);
    setOpen(false);
  };

  const ZoneSelect = ({ val, setVal, type, setType }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={type} onChange={e => { setType(e.target.value); setVal(type === 'zone' ? 1 : null); }}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
        {TARGET_TYPES.filter(t => !['open','percent_ftp','percent_lt1','percent_lt2'].includes(t.value))
          .map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
      </select>
      {type === 'zone' && (
        <select value={val || 1} onChange={e => setVal(Number(e.target.value))}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
          {[1,2,3,4,5].map(z => <option key={z} value={z}>Z{z}</option>)}
        </select>
      )}
      {type === 'watts' && (
        <input type="number" value={val || ''} onChange={e => setVal(Number(e.target.value))} placeholder="W"
          className="w-16 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none bg-white"/>
      )}
      {context.ftp && (type === 'lt1' || type === 'lt2' || type === 'zone') && (
        <span className="text-[10px] text-slate-400">~{Math.round(resolveTargetWatts({ type, value: val }, context))} W</span>
      )}
    </div>
  );

  const col = rampType === 'warmup' ? { border:'border-amber-200', bg:'bg-amber-50/40', text:'text-amber-700', accent:'bg-amber-500' } : { border:'border-blue-200', bg:'bg-blue-50/40', text:'text-blue-700', accent:'bg-blue-500' };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-amber-200 text-amber-600 text-xs font-semibold hover:bg-amber-50 hover:border-amber-300 transition-colors w-full justify-center">
      <svg viewBox="0 0 14 10" className="w-3.5 h-2.5" fill="currentColor"><polygon points="0,10 14,0 14,10"/></svg>
      Progressive ramp
    </button>
  );

  return (
    <div className={`rounded-xl border-2 ${col.border} ${col.bg} p-3 flex flex-col gap-2.5`}>
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 14 10" className="w-3.5 h-2.5 shrink-0 text-amber-500" fill="currentColor"><polygon points="0,10 14,0 14,10"/></svg>
        <span className={`text-xs font-bold ${col.text}`}>Progressive Ramp</span>
        <button onClick={() => setOpen(false)} className="ml-auto p-0.5 rounded hover:bg-amber-100 text-slate-400 hover:text-slate-600">
          <XMarkIcon className="w-3.5 h-3.5"/>
        </button>
      </div>

      {/* Type toggle */}
      <div className="flex gap-1">
        {['warmup','cooldown'].map(t => (
          <button key={t} onClick={() => setRampType(t)}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all capitalize ${rampType === t ? `${col.accent} text-white` : 'bg-white border border-slate-200 text-slate-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Steps count + duration */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-600 font-medium shrink-0">Steps</span>
          <input type="number" min={2} max={10} value={steps} onChange={e => setSteps(Math.max(2, Number(e.target.value)))}
            className="w-14 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none bg-white"/>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-600 font-medium shrink-0">Each</span>
          <input type="text" value={stepDur} onChange={e => setStepDur(e.target.value)} placeholder="mm:ss"
            className="w-16 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none bg-white"/>
          <span className="text-[10px] text-slate-400">min</span>
        </div>
      </div>

      {/* From → To power */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium w-10 shrink-0">Start</span>
          <ZoneSelect type={fromType} setType={setFromType} val={fromVal} setVal={setFromVal}/>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium w-10 shrink-0">End</span>
          <ZoneSelect type={toType} setType={setToType} val={toVal} setVal={setToVal}/>
        </div>
      </div>

      {/* Preview */}
      {durSecs > 0 && steps >= 2 && (
        <div className={`text-[10px] ${col.text} bg-white/70 rounded-lg px-2 py-1.5 border ${col.border}`}>
          {steps} steps × {fmtDuration(durSecs)} = <strong>{fmtShort(steps * durSecs)}</strong>
          {' · '}~{Math.round(fromWatts)} W {rampType === 'warmup' ? '→' : '→'} ~{Math.round(toWatts)} W
        </div>
      )}

      <div className="flex gap-2 justify-end pt-0.5">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={handleAdd} disabled={!durSecs || steps < 2}
          className={`px-4 py-1.5 text-xs font-semibold text-white ${col.accent} hover:opacity-90 disabled:opacity-40 rounded-lg flex items-center gap-1.5 transition-colors`}>
          <PlusIcon className="w-3 h-3"/>
          Add {steps} steps
        </button>
      </div>
    </div>
  );
}

// ─── Inline power / zone editor ─────────────────────────────────────────────
function InlinePowerEditor({ value = {}, onChange, onClose, context }) {
  const t = value || {};
  const set = (k, v) => onChange({ ...t, [k]: v });
  const isSwim = context.sport === 'swim';
  const isRun  = context.sport === 'run';

  // Override: for zone/lt1/lt2 the user can pin a custom value (pace or watts)
  const isOverridable = t.type === 'zone' || t.type === 'lt1' || t.type === 'lt2';
  const [overrideInput, setOverrideInput] = useState(() => {
    if (t.override == null) return '';
    if (isSwim || isRun) return fmtPace(t.override);
    return String(Math.round(t.override));
  });

  const commitOverride = (raw) => {
    const s = String(raw).trim();
    if (!s) { const n = { ...t }; delete n.override; onChange(n); return; }
    // Accept mm:ss as pace, or plain number as watts
    if (s.includes(':')) {
      const secs = parseDuration(s);
      if (secs > 0) { onChange({ ...t, override: secs }); return; }
    }
    const num = parseFloat(s);
    if (!isNaN(num) && num > 0) onChange({ ...t, override: num });
    else { const n = { ...t }; delete n.override; onChange(n); }
  };

  const paceInfo = resolvePaceForSport(t, context);
  const watts    = Math.round(resolveTargetWatts(t, context));

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-primary/5 border-t border-primary/10">
      {/* Type selector */}
      <select
        value={t.type || 'open'}
        onChange={e => onChange({ type: e.target.value, value: null, useRange: false })}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
      >
        {TARGET_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
      </select>

      {/* Zone picker */}
      {t.type === 'zone' && (
        <div className="flex gap-1">
          {[1,2,3,4,5].map(z => (
            <button key={z} onClick={() => set('value', z)}
              className={`w-7 h-7 rounded-lg text-xs font-bold border transition-all ${t.value===z ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-600 hover:border-primary/50'}`}>
              Z{z}
            </button>
          ))}
        </div>
      )}

      {/* Percent inputs */}
      {['percent_ftp','percent_lt1','percent_lt2'].includes(t.type) && (
        <div className="flex items-center gap-1.5">
          {t.useRange ? (
            <>
              <input type="number" autoFocus value={t.rangeMin||''} onChange={e=>set('rangeMin',Number(e.target.value))}
                className="w-14 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" placeholder="min"/>
              <span className="text-slate-400 text-xs">-</span>
              <input type="number" value={t.rangeMax||''} onChange={e=>set('rangeMax',Number(e.target.value))}
                className="w-14 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" placeholder="max"/>
              <span className="text-xs text-slate-400">%</span>
            </>
          ) : (
            <>
              <input type="number" autoFocus value={t.value||''} onChange={e=>set('value',Number(e.target.value))}
                className="w-16 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white" placeholder="%"/>
              <span className="text-xs text-slate-400">%</span>
            </>
          )}
          <button onClick={()=>set('useRange',!t.useRange)}
            className="text-[10px] text-primary border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10">
            {t.useRange ? 'Single' : 'Range'}
          </button>
        </div>
      )}

      {/* Exact watts / pace */}
      {t.type === 'watts' && (
        <div className="flex items-center gap-1.5">
          {t.useRange ? (
            <>
              <input type="number" autoFocus value={t.rangeMin||''} onChange={e=>set('rangeMin',Number(e.target.value))}
                className="w-16 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                placeholder={isSwim || isRun ? 'fast' : 'min W'}/>
              <span className="text-slate-400 text-xs">-</span>
              <input type="number" value={t.rangeMax||''} onChange={e=>set('rangeMax',Number(e.target.value))}
                className="w-16 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                placeholder={isSwim || isRun ? 'slow' : 'max W'}/>
              <span className="text-xs text-slate-400">{isSwim ? '/100m' : isRun ? '/km' : 'W'}</span>
            </>
          ) : (
            <>
              <input type="number" autoFocus value={t.value||''} onChange={e=>set('value',Number(e.target.value))}
                className="w-20 text-xs text-center border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                placeholder={isSwim || isRun ? 'mm:ss' : 'watts'}/>
              <span className="text-xs text-slate-400">{isSwim ? '/100m' : isRun ? '/km' : 'W'}</span>
            </>
          )}
          <button onClick={()=>set('useRange',!t.useRange)}
            className="text-[10px] text-primary border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10">
            {t.useRange ? 'Single' : 'Range'}
          </button>
        </div>
      )}

      {/* Override input for zone/lt1/lt2 — keep the label, pin custom pace/watts */}
      {isOverridable && (
        <div className="flex items-center gap-1 border-l border-primary/20 pl-2 ml-1">
          <span className="text-[10px] text-slate-400">Override:</span>
          <input
            type="text"
            value={overrideInput}
            onChange={e => setOverrideInput(e.target.value)}
            onBlur={e => commitOverride(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commitOverride(overrideInput)}
            placeholder={isSwim || isRun ? 'mm:ss' : 'W'}
            className="w-16 text-xs text-center border border-primary/30 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
          />
          <span className="text-[10px] text-slate-400">{isSwim ? '/100m' : isRun ? '/km' : 'W'}</span>
          {t.override != null && (
            <button onClick={() => { const n={...t}; delete n.override; onChange(n); setOverrideInput(''); }}
              className="text-[10px] text-slate-400 hover:text-red-400 leading-none" title="Reset to auto">×</button>
          )}
        </div>
      )}

      {/* Resolved preview — skip for watts (value already shown in the label) */}
      {t.type !== 'open' && t.type !== 'watts' && (
        paceInfo
          ? <span className="text-[10px] text-slate-400 ml-1">~{paceInfo.label}{paceInfo.unit}</span>
          : context.ftp && <span className="text-[10px] text-slate-400 ml-1">~{watts} W</span>
      )}

      {/* Done */}
      <button onClick={onClose}
        className="ml-auto px-3 py-1 text-[10px] font-bold bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
        Done
      </button>
    </div>
  );
}

// ─── Single step row ────────────────────────────────────────────────────────
function DurationStepper({ value, display, onDisplayChange, onCommit, onBump, isDistMode, distDisplay, onDistChange, onDistCommit, onToggleMode }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
        <button
          type="button"
          onClick={() => onBump(-30)}
          className="px-2 py-2 text-sm font-bold text-slate-500 active:bg-slate-200 min-w-[36px]"
          aria-label="Shorter"
        >
          −
        </button>
        {isDistMode ? (
          <input
            type="text"
            value={distDisplay}
            onChange={(e) => onDistChange(e.target.value)}
            onBlur={onDistCommit}
            onKeyDown={(e) => e.key === 'Enter' && onDistCommit()}
            className="w-[4.5rem] text-sm text-center border-0 bg-transparent py-2 focus:outline-none tabular-nums"
            placeholder="400m"
          />
        ) : (
          <input
            type="text"
            value={display}
            onChange={(e) => onDisplayChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => e.key === 'Enter' && onCommit()}
            className="w-[4.5rem] text-sm text-center border-0 bg-transparent py-2 focus:outline-none tabular-nums"
            placeholder="mm:ss"
          />
        )}
        <button
          type="button"
          onClick={() => onBump(30)}
          className="px-2 py-2 text-sm font-bold text-slate-500 active:bg-slate-200 min-w-[36px]"
          aria-label="Longer"
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={onToggleMode}
        title={isDistMode ? 'Switch to time' : 'Switch to distance'}
        className={`text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-all ${
          isDistMode ? 'bg-sky-50 border-sky-300 text-sky-600' : 'border-slate-200 text-slate-500'
        }`}
      >
        {isDistMode ? 'dist' : 'time'}
      </button>
    </div>
  );
}

function StepRow({ step, index, total, onUpdate, onDelete, onMoveUp, onMoveDown, context, highlighted = false, dragHandleProps = {} }) {
  const [powerOpen, setPowerOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const col = STEP_COLORS[step.stepType] || STEP_COLORS.work;

  const isDistMode = step.durationType === 'distance';
  const [durInput, setDurInput] = useState(fmtDuration(step.durationSeconds));
  const [distInput, setDistInput] = useState(fmtDistance(step.distanceMeters || 0));

  useEffect(() => { setDurInput(fmtDuration(step.durationSeconds)); }, [step.durationSeconds]);
  useEffect(() => { setDistInput(fmtDistance(step.distanceMeters || 0)); }, [step.distanceMeters]);

  const commitDur = () => {
    const secs = parseDuration(durInput);
    if (secs > 0) onUpdate({ ...step, durationSeconds: secs });
    else setDurInput(fmtDuration(step.durationSeconds));
  };

  const commitDist = () => {
    const meters = parseDistance(distInput);
    if (meters > 0) {
      const pi = resolvePaceForSport(step.powerTarget, context);
      const estSecs = pi ? Math.round((meters / (context.sport === 'swim' ? 100 : 1000)) * pi.pace) : Math.round(meters * 0.36);
      onUpdate({ ...step, distanceMeters: meters, durationSeconds: estSecs });
    } else setDistInput(fmtDistance(step.distanceMeters || 0));
  };

  const toggleDurType = () => {
    onUpdate({ ...step, durationType: isDistMode ? 'time' : 'distance' });
  };

  const bumpDur = (delta) => {
    if (isDistMode) return;
    const secs = Math.max(30, (step.durationSeconds || 0) + delta);
    onUpdate({ ...step, durationSeconds: secs });
  };

  const STEP_TYPES = ['warmup', 'work', 'recovery', 'cooldown', 'rest'];
  const watts = resolveTargetWatts(step.powerTarget, context);
  const powerLabel = formatTargetLabel(step.powerTarget);
  const paceInfo = resolvePaceForSport(step.powerTarget, context);
  const isBike = context.sport === 'bike' || !context.sport;

  return (
    <div
      data-step-id={step.clientId}
      className={`rounded-xl border bg-white overflow-hidden shadow-xs transition-all duration-300 ${
        highlighted ? 'ring-2 ring-primary ring-offset-1 shadow-md border-primary/30' : 'border-slate-100'
      }`}
    >
      <div className="h-1" style={{ backgroundColor: col.bg }} />
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {/* Row 1 — drag, type, reorder (duration on its own row so controls don't overlap) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <DragHandle dragHandleProps={dragHandleProps} />
          <select
            value={step.stepType}
            onChange={(e) => onUpdate({ ...step, stepType: e.target.value })}
            className="text-xs font-semibold px-2.5 py-2 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer flex-1 min-w-0 max-w-[8.5rem]"
            style={{ backgroundColor: col.light, color: col.text }}
          >
            {STEP_TYPES.map((t) => (
              <option key={t} value={t} style={{ backgroundColor: '#fff', color: '#374151' }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <ReorderButtons
            index={index}
            total={total}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDelete={onDelete}
          />
        </div>
        <div className="pl-1">
          <DurationStepper
            value={step.durationSeconds}
            display={durInput}
            onDisplayChange={setDurInput}
            onCommit={commitDur}
            onBump={bumpDur}
            isDistMode={isDistMode}
            distDisplay={distInput}
            onDistChange={setDistInput}
            onDistCommit={commitDist}
            onToggleMode={toggleDurType}
          />
        </div>

        {/* Row 2 — intensity target (full width, easy tap) */}
        <button
          type="button"
          onClick={() => { setPowerOpen((v) => !v); setNoteOpen(false); }}
          className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-all ${
            powerOpen
              ? 'bg-primary text-white border-primary'
              : step.powerTarget && step.powerTarget.type !== 'open'
                ? 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wide ${powerOpen ? 'text-white/80' : 'text-slate-400'}`}>
            Intensity
          </span>
          <span className={`text-sm font-semibold truncate ${powerOpen ? 'text-white' : 'text-slate-800'}`}>
            {step.powerTarget && step.powerTarget.type !== 'open' ? (
              <>
                {powerLabel}
                {paceInfo && (
                  <span className={`font-normal ml-1 ${powerOpen ? 'text-white/70' : 'text-slate-400'}`}>
                    · ~{paceInfo.label}{paceInfo.unit}
                  </span>
                )}
                {!paceInfo && isBike && context.ftp && step.powerTarget?.type !== 'watts' && (
                  <span className={`font-normal ml-1 ${powerOpen ? 'text-white/70' : 'text-slate-400'}`}>
                    · ~{Math.round(watts)}W
                  </span>
                )}
              </>
            ) : (
              <span className={powerOpen ? 'text-white/90' : 'text-slate-400'}>Tap to set target</span>
            )}
          </span>
          <ChevronDownIcon className={`w-4 h-4 shrink-0 transition-transform ${powerOpen ? 'rotate-180 text-white' : 'text-slate-400'}`} />
        </button>

        {/* Optional note — collapsed by default */}
        {(noteOpen || step.notes) && (
          <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-2">
            {!noteOpen && step.notes ? (
              <button type="button" onClick={() => setNoteOpen(true)} className="w-full text-left text-xs text-slate-500 truncate">
                📝 {step.notes}
              </button>
            ) : (
              <textarea
                autoFocus={noteOpen}
                value={step.notes || ''}
                onChange={(e) => onUpdate({ ...step, notes: e.target.value })}
                rows={2}
                placeholder="Coach note for this step…"
                className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300 resize-none bg-white"
              />
            )}
          </div>
        )}
        {!noteOpen && !step.notes && (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="text-[11px] text-slate-400 hover:text-slate-600 text-left"
          >
            + Add note
          </button>
        )}
      </div>

      {powerOpen && (
        <InlinePowerEditor
          value={step.powerTarget}
          onChange={(pt) => onUpdate({ ...step, powerTarget: pt })}
          onClose={() => setPowerOpen(false)}
          context={context}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main WorkoutBuilder
// ═══════════════════════════════════════════════════════════════════════════
export default function WorkoutBuilder({ initialSteps = [], context = {}, sport = 'bike', onChange, stickyPreview = true }) {
  const [steps, setSteps] = useState(initialSteps.length > 0 ? initialSteps : []);
  // Merge sport into context so sub-components can detect run/swim/bike
  const ctx = useMemo(() => ({ ...context, sport }), [context, sport]);

  const notify = useCallback((newSteps) => { setSteps(newSteps); onChange?.(newSteps); }, [onChange]);

  // Drag-and-drop reorder state.
  //
  // `dragIdx` is either:
  //   • a number — dragging a single (non-group) step at that index
  //   • a string "g:<groupId>" — dragging an entire repeat block as one unit
  //
  // Treating groups as a single draggable block keeps `groupId` cohesion
  // intact — if we only moved the header step, the recovery sibling would
  // get left behind and the group would silently fall apart.
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const handleDragStart = useCallback((id) => setDragIdx(normalizeReorderId(id)), []);
  const handleDragOver  = useCallback((id) => setDragOverIdx(normalizeReorderId(id)), []);
  const handleDrop      = useCallback((dropId) => {
    const drop = normalizeReorderId(dropId);
    if (dragIdx == null || dragIdx === drop) { setDragIdx(null); setDragOverIdx(null); return; }

    // Helper: contiguous indices for a given drag target. For a single step
    // that's just [idx]; for a group it's every step sharing the groupId.
    const idsOf = (target) => {
      if (typeof target === 'string' && target.startsWith('g:')) {
        const gid = target.slice(2);
        return steps.map((x, i) => x.groupId === gid ? i : -1).filter(i => i >= 0);
      }
      return [Number(target)];
    };

    const srcIdxs = idsOf(dragIdx);
    const dstIdxs = idsOf(drop);
    if (srcIdxs.length === 0 || dstIdxs.length === 0) {
      setDragIdx(null); setDragOverIdx(null); return;
    }

    // Pull the moving slice out, then splice it back in at the destination.
    // Destination is computed AFTER removal so the index lines up cleanly.
    const moved = srcIdxs.map(i => steps[i]);
    const remaining = steps.filter((_, i) => !srcIdxs.includes(i));
    const dstFirst  = dstIdxs[0];
    const removedBeforeDst = srcIdxs.filter(i => i < dstFirst).length;
    const insertAt = dstFirst - removedBeforeDst;
    remaining.splice(insertAt, 0, ...moved);
    notify(remaining);
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, steps, notify]);
  const handleDragEnd   = useCallback(() => { setDragIdx(null); setDragOverIdx(null); }, []);

  // Touch drag on iOS — HTML5 draggable doesn't fire there; track finger globally.
  useEffect(() => {
    if (dragIdx == null) return;
    const onTouchMove = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const zone = el?.closest('[data-reorder-id]');
      if (!zone) return;
      handleDragOver(zone.getAttribute('data-reorder-id'));
    };
    const finishTouch = () => {
      if (dragOverIdx != null && dragIdx !== dragOverIdx) handleDrop(dragOverIdx);
      else handleDragEnd();
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', finishTouch, { passive: true });
    document.addEventListener('touchcancel', finishTouch, { passive: true });
    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', finishTouch);
      document.removeEventListener('touchcancel', finishTouch);
    };
  }, [dragIdx, dragOverIdx, handleDrop, handleDragOver, handleDragEnd]);

  const addStep = (type='work') => {
    // Swim and run default to distance-based steps; bike defaults to time
    const distMode = sport === 'swim' || sport === 'run' ? 'distance' : undefined;
    const distDefaults = {
      warmup:   { distanceMeters: sport==='swim' ? 400 : 1000 },
      work:     { distanceMeters: sport==='swim' ? 100 : 1000 },
      recovery: { distanceMeters: sport==='swim' ? 100 : 400  },
      cooldown: { distanceMeters: sport==='swim' ? 200 : 800  },
      rest:     { distanceMeters: 0 },
    };
    const defaults = {
      warmup:   { durationSeconds:600,  powerTarget:{type:'zone',value:1} },
      work:     { durationSeconds:300,  powerTarget:{type:'zone',value:4} },
      recovery: { durationSeconds:120,  powerTarget:{type:'zone',value:1} },
      cooldown: { durationSeconds:600,  powerTarget:{type:'zone',value:1} },
      rest:     { durationSeconds:60,   powerTarget:{type:'open'} },
    };
    const extra = distMode ? { durationType: distMode, ...distDefaults[type] } : {};
    notify([...steps, { clientId:uid(), stepType:type, ...defaults[type], ...extra }]);
  };

  const updateStep   = (idx, u)  => { const n=[...steps]; n[idx]=u; notify(n); };
  const deleteStep   = (idx)     => notify(steps.filter((_,i)=>i!==idx));
  const moveStep     = (idx,dir) => {
    const n=[...steps], t=idx+dir;
    if (t<0||t>=n.length) return;
    [n[idx],n[t]]=[n[t],n[idx]]; notify(n);
  };

  // Drag-resize callback from WorkoutChart
  const handleStepResize = useCallback((clientId, newDur) => {
    notify(steps.map(s => s.clientId===clientId ? {...s, durationSeconds:newDur} : s));
  }, [steps, notify]);

  // Click-to-scroll: highlight the step row when clicking a chart bar
  const [highlightedStepId, setHighlightedStepId] = useState(null);
  const handleChartStepClick = useCallback((clientId) => {
    setHighlightedStepId(clientId);
    // Find the step element and scroll it into view
    const el = document.querySelector(`[data-step-id="${clientId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Clear highlight after 1.5s
    setTimeout(() => setHighlightedStepId(null), 1500);
  }, []);

  // Repeat groups
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const toggleSelect = (idx) => setSelectedIndices(prev => { const n=new Set(prev); n.has(idx)?n.delete(idx):n.add(idx); return n; });
  const groupSelected = () => {
    if (selectedIndices.size < 2) return;
    const gid = uid();
    const sorted = [...selectedIndices].sort((a,b)=>a-b);
    notify(steps.map((s,i) => sorted.includes(i) ? {...s, groupId:gid, isGroupHeader:i===sorted[0], groupRepeat:i===sorted[0]?3:s.groupRepeat} : s));
    setSelectedIndices(new Set());
  };
  const ungroupGroup     = (gid) => notify(steps.map(s=>s.groupId===gid?{...s,groupId:undefined,isGroupHeader:false,groupRepeat:1}:s));
  const updateGroupRepeat = (gid,reps) => notify(steps.map(s=>s.groupId===gid&&s.isGroupHeader?{...s,groupRepeat:reps}:s));

  const totalSecs = useMemo(() => totalDuration(steps), [steps]);

  return (
    <div className="flex flex-col gap-4">
      {/* Sticky chart preview — stays visible while scrolling through steps */}
      <div className={stickyPreview
        ? 'sticky top-0 z-20 -mx-5 px-5 py-2 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm'
        : ''}>
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Workout Preview</span>
            <span className="text-[10px] text-slate-400">{fmtDuration(totalSecs)} total</span>
          </div>
          <WorkoutChart steps={steps} context={ctx} onStepResize={handleStepResize} onStepClick={handleChartStepClick}/>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {Object.entries(STEP_COLORS).map(([k,v])=>(
              <span key={k} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{backgroundColor:v.bg}}/>{k}
              </span>
            ))}
            {(ctx.lt2Power || ctx.lt1Power) && (
              <span className="flex items-center gap-2 ml-auto text-[10px] text-slate-400">
                {ctx.lt2Power && <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-red-400 border-dashed"/><span className="text-red-400">LT2 = {Math.round(ctx.lt2Power)}W</span></span>}
                {ctx.lt1Power && <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-emerald-400 border-dashed"/><span className="text-emerald-600">LT1 = {Math.round(ctx.lt1Power)}W</span></span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {steps.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-xs -mt-2">
          <WorkoutSummary steps={steps} context={ctx}/>
        </div>
      )}

      {/* Quick builders — collapsed when steps already exist */}
      <details className="rounded-xl border border-slate-100 bg-slate-50/50 open:bg-white open:border-slate-200">
        <summary className="px-3 py-2.5 text-xs font-semibold text-slate-500 cursor-pointer list-none flex items-center justify-between">
          <span>Quick add blocks</span>
          <ChevronDownIcon className="w-4 h-4 text-slate-400" />
        </summary>
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-slate-100">
          <QuickIntervalAdder context={ctx} onAdd={(ns) => notify([...steps, ...ns])} />
          <QuickProgressiveAdder context={ctx} onAdd={(ns) => notify([...steps, ...ns])} />
        </div>
      </details>

      {/* Step list */}
      <div className="flex flex-col gap-2">
        {steps.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
            Add steps or load a template
          </div>
        )}
        {(() => {
          const rendered = [];
          const renderedGroups = new Set();
          steps.forEach((s, idx) => {
            if (s.groupId) {
              if (!renderedGroups.has(s.groupId)) {
                renderedGroups.add(s.groupId);
                const gIdxs = steps.map((x,i)=>x.groupId===s.groupId?i:-1).filter(i=>i>=0);
                const reps  = steps.find(x=>x.groupId===s.groupId&&x.isGroupHeader)?.groupRepeat||1;
                const lapSecs = gIdxs.reduce((sum,gi)=>sum+(steps[gi].durationSeconds||0),0);
                {
                  const dragId = `g:${s.groupId}`;
                  const isBeingDragged = dragIdx === dragId;
                  const isDropTarget = dragOverIdx === dragId && dragIdx !== dragId;
                  rendered.push(
                  <div
                    key={`g-${s.groupId}`}
                    data-reorder-id={dragId}
                    className={`rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/20 transition-opacity ${isBeingDragged ? 'opacity-40' : ''} ${isDropTarget ? 'ring-2 ring-primary/40' : ''}`}
                    onDragOver={e => { e.preventDefault(); handleDragOver(dragId); }}
                    onDrop={() => handleDrop(dragId)}
                  >
                    {/* Repeat header IS the drag handle for the whole group. */}
                    <div
                      className="flex flex-col gap-2 py-2 px-3 cursor-grab active:cursor-grabbing select-none border-b border-violet-100"
                      draggable
                      style={{ touchAction: 'none' }}
                      onDragStart={() => handleDragStart(dragId)}
                      onDragEnd={handleDragEnd}
                      onTouchStart={(e) => { e.stopPropagation(); handleDragStart(dragId); }}
                      title="Drag to reorder the entire repeat block"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Bars3Icon className="w-5 h-5 text-slate-300 shrink-0" aria-hidden />
                        <ArrowPathIcon className="w-4 h-4 text-violet-500 shrink-0" />
                        <span className="text-sm font-bold text-violet-600">Repeat</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={reps}
                          onChange={(e) => updateGroupRepeat(s.groupId, Math.max(1, Number(e.target.value)))}
                          className="w-14 text-sm text-center border border-violet-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                        />
                        <span className="text-sm text-violet-500">×</span>
                        <button
                          type="button"
                          onClick={() => ungroupGroup(s.groupId)}
                          className="ml-auto text-xs font-semibold text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50"
                        >
                          Ungroup
                        </button>
                      </div>
                      {lapSecs > 0 && (
                        <div className="text-xs text-slate-500 pl-7">
                          {fmtDuration(lapSecs)} per lap · <span className="font-semibold text-slate-700">{fmtShort(reps * lapSecs)}</span> total
                        </div>
                      )}
                    </div>
                    <div className="px-2 pb-2 flex flex-col gap-1.5">
                      {gIdxs.map(gi=>(
                        <StepRow key={steps[gi].clientId||gi} step={steps[gi]} index={gi} total={steps.length}
                          onUpdate={u=>updateStep(gi,u)} onDelete={()=>deleteStep(gi)}
                          onMoveUp={()=>moveStep(gi,-1)} onMoveDown={()=>moveStep(gi,1)} context={ctx}
                          highlighted={highlightedStepId === steps[gi].clientId}/>
                      ))}
                    </div>
                  </div>
                );
                }
              }
            } else {
              rendered.push(
                <div
                  key={s.clientId||idx}
                  data-reorder-id={idx}
                  className={`flex gap-2 items-start transition-opacity ${dragIdx === idx ? 'opacity-40' : ''} ${dragOverIdx === idx && dragIdx !== idx ? 'ring-2 ring-primary/40 rounded-xl' : ''}`}
                  onDragOver={e => { e.preventDefault(); handleDragOver(idx); }}
                  onDrop={() => handleDrop(idx)}
                >
                  <input type="checkbox" className="mt-3 w-3.5 h-3.5 accent-violet-500 shrink-0 cursor-pointer"
                    checked={selectedIndices.has(idx)} onChange={()=>toggleSelect(idx)}/>
                  <div className="flex-1 min-w-0">
                    <StepRow step={s} index={idx} total={steps.length}
                      onUpdate={u=>updateStep(idx,u)} onDelete={()=>deleteStep(idx)}
                      onMoveUp={()=>moveStep(idx,-1)} onMoveDown={()=>moveStep(idx,1)} context={ctx}
                      highlighted={highlightedStepId === s.clientId}
                      dragHandleProps={{
                        draggable: true,
                        onDragStart: () => handleDragStart(idx),
                        onDragEnd: handleDragEnd,
                        onTouchStart: (e) => { e.stopPropagation(); },
                      }}
                    />
                  </div>
                </div>
              );
            }
          });
          return rendered;
        })()}
      </div>

      {selectedIndices.size >= 2 && (
        <div className="flex justify-center">
          <button onClick={groupSelected}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-sm font-semibold hover:bg-violet-100 transition-colors">
            <ArrowPathIcon className="w-4 h-4"/>
            Group {selectedIndices.size} steps as repeat block
          </button>
        </div>
      )}

      {/* Add step buttons — horizontal scroll on mobile */}
      <div className="border-t border-slate-100 pt-3 -mx-1 px-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-2 min-w-max pb-1">
          {['warmup', 'work', 'recovery', 'cooldown', 'rest'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addStep(type)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors bg-white min-h-[44px]"
              style={{ borderColor: `${STEP_COLORS[type]?.bg}99`, color: STEP_COLORS[type]?.text }}
            >
              <PlusIcon className="w-4 h-4" />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
