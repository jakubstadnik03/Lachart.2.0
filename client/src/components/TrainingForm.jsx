"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, useDragControls } from "framer-motion";
import ReactDOM from "react-dom";
import { getTrainingTitles } from "../services/api";
import { useNotification } from '../context/NotificationContext';
import { mapSportForTrainingForm } from "../utils/trainingLactateModal";
import { isCapacitorNative } from "../utils/isNativeApp";
import { sanitizeLactateInput, parseLactateValue } from "../utils/lactateInput";
import LapsBarChart from "./FitAnalysis/LapsBarChart";
import { Zap, TrendingUp, TrendingDown, RotateCcw } from 'lucide-react';

const ACTIVITIES = [
  {
    id: "swim",
    label: "Swim",
    icon: "/icon/swim.svg"
  },
  {
    id: "bike",
    label: "Bike",
    icon: "/icon/bike.svg"
  },
  {
    id: "run",
    label: "Run",
    icon: "/icon/run.svg"
  }
];

const TERRAIN_OPTIONS = {
  bike: ["track", "road", "trail", "indoor"],
  run: ["track", "road", "trail", "indoor"],
  swim: []
};

const WEATHER_OPTIONS = ["sunny", "indoor", "rainy", "windy"];
// ── Category icon components ──────────────────────────────────────────────────
const CatIcon = ({ children, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
       style={{ flexShrink: 0, display: 'block' }}>
    {children}
  </svg>
);

const CAT_ICONS = {
  // Sine wave = steady aerobic rhythm
  endurance: <CatIcon><path d="M2 12 C5.5 6 8.5 6 12 12 C15.5 18 18.5 18 22 12" /></CatIcon>,
  // Lactate curve: gentle bend + circle at LT1 inflection
  lt1: <CatIcon>
    <polyline points="3,19 9,16 14,10 20,5" />
    <circle cx="14" cy="10" r="2.2" fill="currentColor" stroke="none" />
  </CatIcon>,
  // Stopwatch
  tempo: <CatIcon>
    <circle cx="12" cy="13" r="8" />
    <polyline points="12,9 12,13 15,15" />
    <line x1="9" y1="2" x2="15" y2="2" />
    <line x1="12" y1="2" x2="12" y2="5" />
  </CatIcon>,
  // Lactate curve: steeper bend + circle at LT2
  lt2: <CatIcon>
    <polyline points="3,19 7,18 10,15 13,9 19,4" />
    <circle cx="13" cy="9" r="2.2" fill="currentColor" stroke="none" />
  </CatIcon>,
  // Heart with small EKG pulse inside
  zone2: <CatIcon strokeWidth="1.8">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    <polyline points="8,12 10,10 11,14 13,10 14,12" strokeWidth="1.2" />
  </CatIcon>,
  // Upward arrow burst = VO2max
  vo2max: <CatIcon>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5,12 12,5 19,12" />
    <line x1="8" y1="19" x2="8" y2="16" strokeWidth="1.2" />
    <line x1="12" y1="21" x2="12" y2="19" strokeWidth="1.2" />
    <line x1="16" y1="19" x2="16" y2="16" strokeWidth="1.2" />
  </CatIcon>,
  // Mountain elevation profile
  hills: <CatIcon>
    <polyline points="2,20 7,10 11,15 15,8 19,13 22,20" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </CatIcon>,
};

const CATEGORY_CONFIG = [
  { id: 'endurance', label: 'Endurance', idle: 'bg-blue-50   border-blue-200   text-blue-700',   on: 'bg-blue-500   border-blue-500   text-white' },
  { id: 'lt1',       label: 'LT1',       idle: 'bg-sky-50    border-sky-200     text-sky-700',    on: 'bg-sky-500    border-sky-500     text-white' },
  { id: 'tempo',     label: 'Tempo',     idle: 'bg-orange-50  border-orange-200  text-orange-700', on: 'bg-orange-500  border-orange-500  text-white' },
  { id: 'lt2',       label: 'LT2',       idle: 'bg-violet-50  border-violet-200  text-violet-700', on: 'bg-violet-500  border-violet-500  text-white' },
  { id: 'zone2',     label: 'Zone 2',    idle: 'bg-green-50   border-green-200   text-green-700',  on: 'bg-green-500   border-green-500   text-white' },
  { id: 'vo2max',    label: 'VO₂max',    idle: 'bg-red-50     border-red-200     text-red-700',    on: 'bg-red-500     border-red-500     text-white' },
  { id: 'hills',     label: 'Hills',     idle: 'bg-amber-50   border-amber-200   text-amber-700',  on: 'bg-amber-500   border-amber-500   text-white' },
];

/** Pace/duration display: avoid float garbage (e.g. 14.699999999999989) from JS % and division. */
const formatSecondsToMMSS = (seconds) => {
  if (seconds === null || seconds === undefined || seconds === "") return "";
  if (typeof seconds === "string" && seconds.includes(":")) {
    const parts = seconds.split(":");
    if (parts.length >= 2) {
      const m = parseInt(parts[0], 10) || 0;
      const s = parseFloat(parts[1]) || 0;
      const total = Math.round(m * 60 + s);
      const M = Math.floor(total / 60);
      const S = total % 60;
      return `${String(M).padStart(2, "0")}:${String(S).padStart(2, "0")}`;
    }
  }
  const n = typeof seconds === "string" ? parseFloat(seconds) : Number(seconds);
  if (!Number.isFinite(n) || n < 0) return "";
  const total = Math.round(n);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

/** Interval type config — used in auto-detection and interval cards UI */
const INTERVAL_TYPES = [
  { id: 'work',     label: 'Work',      shortLabel: 'Work', icon: <Zap size={14} />, bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  { id: 'warmup',   label: 'Warm-up',   shortLabel: 'WU',   icon: <TrendingUp size={14} />,   bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200' },
  { id: 'cooldown', label: 'Cool-down', shortLabel: 'CD',   icon: <TrendingDown size={14} />, bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200' },
  { id: 'recovery', label: 'Rest',      shortLabel: 'Rest', icon: <RotateCcw size={14} />,    bg: 'bg-gray-100',   text: 'text-gray-500',   border: 'border-gray-200' },
];

/** Parse raw seconds from a form result (durationSeconds or MM:SS string). */
function parseIntervalDurSec(r) {
  if (!r) return 0;
  const ds = Number(r.durationSeconds);
  if (ds > 0) return ds;
  if (!r.duration) return 0;
  if (typeof r.duration === 'number') return r.duration;
  const parts = String(r.duration).split(':');
  if (parts.length === 2) return (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
  if (parts.length === 3) return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseFloat(parts[2]) || 0);
  return parseFloat(String(r.duration)) || 0;
}

/**
 * Auto-classify results into warmup / work / recovery / cooldown.
 *
 * Detection priority:
 *   1. Keep any manually-set intervalType as-is.
 *   2. Migrate legacy isRecovery:true → 'recovery'.
 *   3. Find the "work cluster" — intervals with similar distance, then
 *      similar duration, then similar HR/power intensity.
 *      Clustering picks the value that appears most often (within tolerance).
 *   4. Intervals BEFORE the first work interval → warmup.
 *   5. Intervals AFTER the last work interval  → cooldown.
 *   6. Intervals INSIDE the work range but NOT in the cluster AND significantly
 *      shorter than the average work duration → recovery; otherwise → work.
 *   7. If no cluster can be found at all → everything is work.
 */
function autoDetectIntervalTypes(results) {
  if (!results || results.length === 0) return results;

  // Step 0 — migrate legacy flag; honour already-set manual types
  const migrated = results.map(r => ({
    ...r,
    intervalType: r.intervalType || (r.isRecovery ? 'recovery' : undefined),
  }));
  if (migrated.every(r => r.intervalType)) return migrated;

  const n = migrated.length;
  // Too few intervals to classify meaningfully → all work
  if (n <= 2) return migrated.map(r => ({ ...r, intervalType: r.intervalType || 'work' }));

  // Helper: parse "MM:SS" pace string → seconds (returns 0 if not a valid pace)
  function parsePaceSec(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val > 0 ? val : 0;
    const s = String(val);
    if (!s.includes(':')) return parseFloat(s) || 0;
    const parts = s.split(':');
    if (parts.length === 2) return (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
    return 0;
  }

  // Helper: extract per-interval metadata
  const meta = migrated.map(r => {
    const dist  = Number(r.distanceMeters ?? r.distance ?? 0);
    const dur   = parseIntervalDurSec(r);
    const hr    = Number(r.heartRate) || 0;
    const pw    = Number(r.power)     || 0;
    // For run/swim, power is stored as a pace string "MM:SS".
    // Convert to sec/unit so we can do intensity comparisons.
    // Use inverted pace (1000/pace) so FASTER = higher value (like power).
    const paceRaw = parsePaceSec(r.power);
    const paceInv = paceRaw > 0 ? 1000 / paceRaw : 0; // higher = faster
    return {
      dist:     dist > 0 ? dist : null,
      dur:      dur  > 0 ? dur  : null,
      hr:       hr   > 0 ? hr   : null,
      power:    pw   > 0 ? pw   : null,
      paceInv:  paceInv > 0 ? paceInv : null,
      paceRaw:  paceRaw > 0 ? paceRaw : null, // sec/km, higher = slower
    };
  });

  /**
   * Find the best cluster of similar values within `tol` relative tolerance.
   *
   * `preferHigh` (use for intensity metrics): among clusters of near-equal size
   * (within 1 member of the max), pick the one with the HIGHEST average value.
   * This ensures work intervals (high power/HR) beat recovery intervals (low
   * power/HR) when both form clusters of similar size — fixing the bug where
   * the lap with the highest watts was mislabelled as "rest".
   *
   * Without `preferHigh` (distance/duration): prefer the largest cluster, with
   * a tiebreak that avoids clusters anchored to the first/last interval (those
   * are usually warmup/cooldown, not repeated work intervals).
   */
  function findCluster(vals, tol, { preferHigh = false } = {}) {
    const pairs = vals.map((v, i) => ({ i, v })).filter(x => x.v !== null);
    if (pairs.length < 2) return null;

    // Build one cluster per pivot point
    const clusters = pairs.map(pivot =>
      pairs.filter(x => Math.abs(x.v - pivot.v) / pivot.v <= tol)
    ).filter(c => c.length >= 2);

    if (clusters.length === 0) return null;

    const maxLen = Math.max(...clusters.map(c => c.length));
    // Candidates: all clusters within 1 member of the largest
    const topClusters = clusters.filter(c => c.length >= maxLen - 1);

    let best;
    if (preferHigh) {
      // For intensity: pick the cluster with the highest average value
      // (work intervals always have higher power/HR than recovery intervals)
      best = topClusters.reduce((a, b) => {
        const avgA = a.reduce((s, x) => s + x.v, 0) / a.length;
        const avgB = b.reduce((s, x) => s + x.v, 0) / b.length;
        return avgB > avgA ? b : a;
      });
    } else {
      // For distance/duration: largest cluster wins; tiebreak avoids edge indices
      best = topClusters.reduce((a, b) => {
        if (b.length > a.length) return b;
        if (b.length === a.length) {
          // Prefer the cluster that doesn't touch index 0 or n-1 (likely WU/CD)
          const aHasEdge = a.some(x => x.i === 0 || x.i === n - 1);
          const bHasEdge = b.some(x => x.i === 0 || x.i === n - 1);
          if (aHasEdge && !bHasEdge) return b;
        }
        return a;
      });
    }

    return best.length >= 2 ? new Set(best.map(x => x.i)) : null;
  }

  // Step 1 — distance cluster (best signal for swim/run repeats)
  let workSet = findCluster(meta.map(m => m.dist), 0.15);

  // Step 2 — duration cluster (best signal for bike intervals)
  if (!workSet) workSet = findCluster(meta.map(m => m.dur), 0.25);

  // Step 3 — intensity cluster (HR, power, or inverted pace for run/swim).
  // Use preferHigh so the fast/high-watt cluster wins over the slow/low-watt cluster.
  if (!workSet) {
    // For runs/swims: use inverted pace (higher = faster) as intensity proxy
    const intensities = meta.map(m => m.power || m.hr || m.paceInv);
    if (intensities.filter(Boolean).length >= Math.ceil(n / 2)) {
      workSet = findCluster(intensities, 0.12, { preferHigh: true });
    }
  }

  // Step 4 — positional heuristic: if edge intervals differ from the bulk by
  //          duration, peel them off as warmup/cooldown.
  if (!workSet) {
    const durs = meta.map(m => m.dur);
    const midDurs = durs.slice(1, -1).filter(Boolean);
    if (midDurs.length >= 2) {
      const midAvg = midDurs.reduce((a, b) => a + b, 0) / midDurs.length;
      const firstDur = durs[0], lastDur = durs[n - 1];
      const edgeTol = 0.4;
      const firstIsEdge = firstDur != null && (firstDur < midAvg * (1 - edgeTol) || firstDur > midAvg * (1 + edgeTol));
      const lastIsEdge  = lastDur  != null && (lastDur  < midAvg * (1 - edgeTol) || lastDur  > midAvg * (1 + edgeTol));
      const start = firstIsEdge ? 1 : 0;
      const end   = lastIsEdge  ? n - 2 : n - 1;
      if (start <= end && (firstIsEdge || lastIsEdge)) {
        workSet = new Set(Array.from({ length: end - start + 1 }, (_, i) => i + start));
      }
    }
  }

  // No cluster at all → everything is work
  if (!workSet) return migrated.map(r => ({ ...r, intervalType: r.intervalType || 'work' }));

  const firstWork = Math.min(...workSet);
  const lastWork  = Math.max(...workSet);

  // Average duration + intensity of confirmed work intervals
  const workDurs = [...workSet].map(i => parseIntervalDurSec(migrated[i])).filter(d => d > 0);
  const avgWorkDur = workDurs.length ? workDurs.reduce((a, b) => a + b, 0) / workDurs.length : 0;

  // For intensity: prefer pace (inverted) for run/swim, otherwise power or HR
  const workIntensities = [...workSet].map(i =>
    meta[i].power || meta[i].paceInv || meta[i].hr || 0
  ).filter(v => v > 0);
  const avgWorkIntensity = workIntensities.length
    ? workIntensities.reduce((a, b) => a + b, 0) / workIntensities.length
    : 0;

  // Average distance of work intervals (for small-distance recovery detection)
  const workDists = [...workSet].map(i => meta[i].dist || 0).filter(d => d > 0);
  const avgWorkDist = workDists.length ? workDists.reduce((a, b) => a + b, 0) / workDists.length : 0;

  // Average pace of work intervals (sec/unit, lower = faster)
  const workPaces = [...workSet].map(i => meta[i].paceRaw || 0).filter(p => p > 0);
  const avgWorkPace = workPaces.length ? workPaces.reduce((a, b) => a + b, 0) / workPaces.length : 0;

  // Step 5 — assign final types
  return migrated.map((r, i) => {
    if (r.intervalType) return r;               // manually set → never overwrite
    if (i < firstWork)  return { ...r, intervalType: 'warmup' };
    if (i > lastWork)   return { ...r, intervalType: 'cooldown' };
    if (workSet.has(i)) return { ...r, intervalType: 'work' };

    // Inside work range but not in the work cluster — decide work vs recovery.
    const dur       = parseIntervalDurSec(r);
    const dist      = meta[i].dist || 0;
    const intensity = meta[i].power || meta[i].paceInv || meta[i].hr || 0;
    const paceRaw   = meta[i].paceRaw || 0;

    // Guard 1: if pace/power/HR is >= 90% of work average → definitely work
    if (avgWorkIntensity > 0 && intensity >= avgWorkIntensity * 0.90) {
      return { ...r, intervalType: 'work' };
    }

    // Guard 2: if pace is explicitly much slower than work pace → recovery
    // e.g. rest at 13:40/km vs work at 3:21/km → paceRaw is 4× higher
    const isSlowPace = avgWorkPace > 0 && paceRaw > 0 && paceRaw > avgWorkPace * 1.6;

    // Guard 3: very small distance relative to work distance → recovery
    const isSmallDist = avgWorkDist > 0 && dist > 0 && dist < avgWorkDist * 0.35;

    const isShort        = avgWorkDur       > 0 && dur  > 0 && dur  < avgWorkDur  * 0.65;
    const isLowIntensity = avgWorkIntensity > 0 && intensity > 0 && intensity < avgWorkIntensity * 0.75;

    return { ...r, intervalType: (isShort || isSlowPace || isSmallDist || isLowIntensity) ? 'recovery' : 'work' };
  });
}

/* ─── Title combobox ───────────────────────────────────────────────────────── */
function TitleCombobox({ value, options, onChange, placeholder, hasWarning }) {
  const [open, setOpen]       = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Filter options
  const filtered = !value
    ? options.slice(0, 10)
    : options.filter(o => o.toLowerCase().includes(value.toLowerCase())).slice(0, 10);

  const showCreate = value && !options.some(o => o.toLowerCase() === value.toLowerCase());

  // Update dropdown position (fixed → no scrollY needed)
  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  // Reposition on open
  useEffect(() => {
    if (!open) return;
    updatePos();
  }, [open]);

  // Reposition on scroll/resize (keep dropdown anchored to input while scrolling)
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  // Close only on outside CLICK — not on mousedown/pointerdown so scroll gestures
  // never accidentally trigger a close + re-render that interrupts the scroll.
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (inputRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('click', close, true);
    return () => document.removeEventListener('click', close, true);
  }, [open]);

  const dropdown = open && (filtered.length > 0 || showCreate)
    ? ReactDOM.createPortal(
        <div
          ref={panelRef}
          className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 99999 }}
        >
          <div
            className="overflow-y-auto max-h-56 py-1"
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          >
            {filtered.map(o => (
              <button
                key={o}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(o); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                  o === value ? 'font-semibold text-primary bg-primary/5' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {o}
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(value); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm text-primary font-semibold hover:bg-primary/5 border-t border-gray-100 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="truncate">Use &ldquo;{value}&rdquo;</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`w-full rounded-xl border bg-white pl-3 pr-9 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary min-h-[44px] transition-colors ${
            hasWarning ? 'border-amber-300' : 'border-gray-200'
          }`}
        />
        {/* Search chevron / clear */}
        {value ? (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { onChange(''); inputRef.current?.focus(); setOpen(true); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        )}
      </div>
      {dropdown}
    </>
  );
}

/* ─── Default-title detection ──────────────────────────────────────────────── */
const DEFAULT_TITLE_PATTERNS = [
  /^(morning|afternoon|evening|lunch|night)\s+(run|ride|swim|workout|activity|bike|cycle|cycling)$/i,
  /^(easy|slow|long|hard|quick)\s+(run|ride|swim|workout)$/i,
  /^(run|ride|swim|bike|cycle|workout|activity|training|session)$/i,
  /^virtual\s+ride$/i,
  /^indoor\s+(cycling|trainer|ride|run|rowing)$/i,
  /^treadmill\s+(run|workout)$/i,
  /^zwift.*$/i,
];

function isDefaultTitle(title) {
  if (!title) return false;
  return DEFAULT_TITLE_PATTERNS.some(p => p.test(title.trim()));
}

/* ─── Smart title generator ─────────────────────────────────────────────────── */
function fmtDist(d) {
  if (!d) return null;
  const s = String(d).trim().toLowerCase().replace(/\s/g, '');
  if (s.endsWith('km')) return s;
  if (s.endsWith('m') && !s.endsWith('km')) return s;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}km`;
  return `${Math.round(n)}m`;
}

function metersFromResult(r) {
  const raw = r?.distanceMeters ?? r?.distance;
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'string') {
    const parsed = fmtDist(raw);
    if (!parsed) return 0;
    const s = parsed.toLowerCase();
    if (s.endsWith('km')) return parseFloat(s) * 1000;
    if (s.endsWith('m')) return parseFloat(s);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 100 ? n : n * 1000;
}

function fmtDistMeters(meters, sport) {
  if (!meters || meters <= 0) return null;
  if (sport === 'swim') {
    if (meters >= 1000) return `${(meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 1)}km`;
    return `${Math.round(meters)}m`;
  }
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}

function parseDurationToSeconds(dur) {
  if (dur == null || dur === '') return null;
  if (typeof dur === 'string' && dur.includes(':')) {
    const parts = dur.split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const n = parseFloat(dur);
  return Number.isFinite(n) ? n : null;
}

function generateTrainingTitle(sport, category, results) {
  const sportLabel = { bike: 'ride', run: 'run', swim: 'swim' }[sport] || 'workout';

  // Full zone label map — covers all categories including LT1/LT2/Zone2
  const CAT_ZONE = {
    recovery:  'Recovery',
    endurance: 'Endurance',
    zone2:     'Z2',
    lt1:       'LT1',
    tempo:     'Tempo',
    lt2:       'LT2',
    threshold: 'Threshold',
    vo2max:    'VO₂max',
    anaerobic: 'Anaerobic',
    hills:     'Hills',
    race:      'Race',
  };
  const zoneLabel = CAT_ZONE[category] || null;



  // Format duration rounded to whole minutes: "5min" / "30s"
  const fmtDurLabel = (dur) => {
    const totalSec = parseDurationToSeconds(dur);
    if (totalSec == null || totalSec <= 0) return null;
    if (totalSec < 60) return `${Math.round(totalSec)}s`;
    return `${Math.round(totalSec / 60)}min`;
  };

  // Format power/pace target from first work interval
  const fmtTarget = (r) => {
    const pw = r?.power;
    if (pw === '' || pw === null || pw === undefined) return null;
    if (sport === 'bike') {
      const w = parseFloat(pw);
      if (!isNaN(w) && w > 0) return `@${Math.round(w / 10) * 10}w`;
    } else {
      // run / swim: pace stored as MM:SS string or raw seconds
      if (typeof pw === 'string' && pw.includes(':')) {
        const unit = sport === 'swim' ? '/100m' : '/km';
        return `@${pw}${unit}`;
      }
      const secs = parseFloat(pw);
      if (!isNaN(secs) && secs > 0) {
        const m = Math.floor(secs / 60);
        const s = Math.round(secs % 60);
        const unit = sport === 'swim' ? '/100m' : '/km';
        return `@${m}:${String(s).padStart(2, '0')}${unit}`;
      }
    }
    return null;
  };

  // Work intervals only — rest no longer surfaced in the title
  const workResults = (results || []).filter(r => !r.intervalType || r.intervalType === 'work');

  // No structured intervals → simple label
  if (workResults.length === 0) {
    if (category === 'recovery') return `recovery ${sportLabel}`;
    if (category === 'endurance') return `long ${sportLabel}`;
    if (category === 'hills') return `hill ${sportLabel}`;
    return zoneLabel ? `${zoneLabel.toLowerCase()} ${sportLabel}` : sportLabel;
  }

  // Total reps
  const totalReps = workResults.reduce((s, r) => s + (Number(r.repeatCount) || 1), 0);
  const first = workResults[0];
  const preferDistance = sport === 'run' || sport === 'swim';

  // Build work interval string: e.g. "8x5min", "6x800m", or "10.5km"
  let workStr = null;
  const firstMeters = metersFromResult(first);

  if (preferDistance) {
    const repDistances = workResults.map(metersFromResult).filter((m) => m > 0);
    const totalMeters = repDistances.reduce((s, m) => s + m, 0);
    const uniformReps = repDistances.length > 0
      && repDistances.every((m) => Math.abs(m - firstMeters) <= Math.max(5, firstMeters * 0.02));

    if (uniformReps && firstMeters > 0) {
      const d = fmtDistMeters(firstMeters, sport);
      if (d) workStr = `${totalReps}x${d}`;
    } else if (totalMeters > 0) {
      const d = fmtDistMeters(totalMeters, sport);
      if (d) workStr = d;
    }
  }

  if (!workStr && first.durationType === 'distance' && first.duration) {
    const d = fmtDist(first.duration) || fmtDistMeters(metersFromResult(first), sport);
    if (d) workStr = `${totalReps}x${d}`;
  } else if (!workStr && (first.distance || first.distanceMeters)) {
    const d = fmtDistMeters(firstMeters, sport) || fmtDist(first.distance);
    if (d) workStr = `${totalReps}x${d}`;
  }
  if (!workStr && first.duration) {
    const t = fmtDurLabel(first.duration);
    if (t) workStr = `${totalReps}x${t}`;
  }
  if (!workStr) workStr = `${totalReps}x int`;

  // Power/pace target
  const targetStr = fmtTarget(first);

  // Assemble: "8x5min @350w lt2 ride"
  const parts = [workStr];
  if (targetStr) parts.push(targetStr);
  if (zoneLabel) parts.push(zoneLabel.toLowerCase());
  parts.push(sportLabel);

  return parts.join(' ');
}

/* ─────────────────────────────────────────────────────────────────────────── */

const TrainingForm = ({
  onClose,
  onSubmit,
  initialData = null,
  isEditing = false,
  isLoading = false,
  initialSelectedLap = null,
}) => {
  const { addNotification } = useNotification();
  const dragControls = useDragControls();
  const [formData, setFormData] = useState(() => {
    const defaults = {
      sport: "bike",
      type: "interval",
      category: "",
      title: "",
      customTitle: "",
      description: "",
      date: new Date().toISOString().slice(0, 16),
      specifics: { specific: "", weather: "", customSpecific: "", customWeather: "" },
      results: [],
    };
    if (!initialData) return defaults;
    // Callers (NativeTrainingPage, ActivityFullModal, …) may pass a raw activity
    // that lacks `results`/`specifics`. Reading `.results.length` on undefined
    // crashes the form, so normalize defensively.
    return {
      ...defaults,
      ...initialData,
      specifics: { ...defaults.specifics, ...(initialData.specifics || {}) },
      results: Array.isArray(initialData.results) ? initialData.results : [],
    };
  });

  const [trainingTitles, setTrainingTitles] = useState([]);
  const [autoDetectEnabled, setAutoDetectEnabled] = useState(true);
  const [isCustomTitle, setIsCustomTitle] = useState(initialData?.customTitle ? true : false);
  const [isCustomWeather, setIsCustomWeather] = useState(initialData?.specifics?.customWeather ? true : false);
  const [isCustomSpecific, setIsCustomSpecific] = useState(initialData?.specifics?.customSpecific ? true : false);
  const [editingIntervalIndex, setEditingIntervalIndex] = useState(null);
  const [tempRepeatCount, setTempRepeatCount] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [specificsOpen, setSpecificsOpen] = useState(false);
  const [selectedChartLap, setSelectedChartLap] = useState(null);
  const [typePickerOpenIdx, setTypePickerOpenIdx] = useState(null);
  const intervalRefs = useRef([]);
  const scrollBodyRef = useRef(null);
  const chartPanelRef = useRef(null);
  /** Format raw seconds → "M:SS" or "H:MM:SS" */
  const fmtDur = (val) => {
    const n = typeof val === "string" ? parseFloat(val) : Number(val);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = Math.round(n % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${m}:${String(s).padStart(2,"0")}`;
  };

  useEffect(() => {
    const loadTrainingTitles = async () => {
      try {
        const titles = await getTrainingTitles();
        setTrainingTitles(titles || []);
      } catch (error) {
        console.error("Error loading training titles:", error);
        setTrainingTitles([]);
      }
    };
    loadTrainingTitles();
  }, []);

  useEffect(() => {
    if (!initialData) return;
    const sportKey = mapSportForTrainingForm(initialData.sport);
    console.log("Editing training:", initialData);
    const rawResults = Array.isArray(initialData.results) ? initialData.results : [];
    const showPace = sportKey === "run" || sportKey === "swim";

    const formattedData = {
      ...initialData,
      sport: sportKey,
      date: new Date(initialData.date).toISOString().slice(0, 16),
      results: rawResults.map((result) => {
        let powerValue = result.power;
        if (
          showPace &&
          result.power !== undefined &&
          result.power !== null &&
          result.power !== ""
        ) {
          if (typeof result.power === "string" && result.power.includes(":")) {
            powerValue = formatSecondsToMMSS(result.power);
          } else {
            const seconds =
              typeof result.power === "string" ? parseFloat(result.power) : result.power;
            powerValue = formatSecondsToMMSS(seconds);
          }
        }

        const durType = result.durationType || "time";
        let durationValue = result.duration;
        if (
          durType === "time" &&
          result.duration !== undefined &&
          result.duration !== null &&
          result.duration !== ""
        ) {
          if (typeof result.duration === "string" && result.duration.includes(":")) {
            durationValue = formatSecondsToMMSS(result.duration);
          } else {
            const seconds =
              typeof result.duration === "string" ? parseFloat(result.duration) : result.duration;
            durationValue = formatSecondsToMMSS(seconds);
          }
        }

        const rawElev =
          result.elevation ?? result.total_elevation_gain ?? result.elevation_gain;
        let elevationDisp = "";
        if (rawElev !== undefined && rawElev !== null && rawElev !== "") {
          const e = Number(rawElev);
          if (Number.isFinite(e)) elevationDisp = String(Math.round(e));
        }

        return {
          ...result,
          durationType: durType,
          power: powerValue,
          duration: durationValue,
          elevation: elevationDisp,
          repeatCount: result.repeatCount ?? 1,
          distanceMeters: result.distanceMeters ?? undefined,
        };
      }),
    };
    const processedResults = autoDetectEnabled
      ? autoDetectIntervalTypes(formattedData.results)
      : formattedData.results;

    // Auto-generate title if empty or a generic default name
    const plannedTitle = String(formattedData.plannedWorkoutTitle || '').trim();
    const existingTitle = formattedData.customTitle || formattedData.title || '';
    const needsTitle = !existingTitle || isDefaultTitle(existingTitle);

    if (plannedTitle && needsTitle) {
      setIsCustomTitle(true);
      setFormData({
        ...formattedData,
        results: processedResults,
        customTitle: plannedTitle,
        title: '',
      });
    } else if (needsTitle) {
      const generated = generateTrainingTitle(sportKey, formattedData.category, processedResults);
      setIsCustomTitle(true);
      setFormData({
        ...formattedData,
        results: processedResults,
        customTitle: generated,
        title: '',
      });
    } else {
      setFormData({ ...formattedData, results: processedResults });
    }
  }, [initialData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate title for brand-new (non-edit) forms with no title
  useEffect(() => {
    if (initialData) return; // handled above
    if (formData.title || formData.customTitle) return;
    if (formData.results.length === 0) return;
    const generated = generateTrainingTitle(formData.sport, formData.category, formData.results);
    setIsCustomTitle(true);
    setFormData(prev => ({ ...prev, customTitle: generated, title: '' }));
  }, [formData.results.length, formData.sport, formData.category]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaceChange = (index, value) => {
    // Povolíme pouze čísla a dvojtečku
    const cleanValue = value.replace(/[^\d:]/g, '');

    // Automatické formátování
    let formattedValue = cleanValue;

    // Pokud uživatel zadá číslo bez dvojtečky
    if (cleanValue.length > 0 && !cleanValue.includes(':')) {
      // Přidáme dvojtečku po druhém čísle
      if (cleanValue.length >= 2) {
        formattedValue = `${cleanValue.slice(0, 2)}:${cleanValue.slice(2, 4)}`;
      }
    }

    // Validace formátu MM:SS
    const paceRegex = /^([0-5]?[0-9]):?([0-5]?[0-9])?$/;
    if (formattedValue && !paceRegex.test(formattedValue)) return;

    const newResults = [...formData.results];
    newResults[index].power = formattedValue;
    setFormData(prev => ({ ...prev, results: newResults }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    try {
      const dataToSubmit = { ...formData };

      if (dataToSubmit.lactate !== undefined && dataToSubmit.lactate !== null && dataToSubmit.lactate !== '') {
        const lactate = parseLactateValue(dataToSubmit.lactate);
        dataToSubmit.lactate = lactate != null ? String(lactate) : '';
      }

      // Rozepsání opakujících se intervalů
      if (dataToSubmit.results) {
        const expandedResults = [];
        dataToSubmit.results.forEach((interval, index) => {
          const repeatCount = parseInt(interval.repeatCount) || 1;
          for (let i = 0; i < repeatCount; i++) {
            expandedResults.push({
              ...interval,
              interval: expandedResults.length + 1,
              repeatCount: undefined // Odstraníme pole repeatCount z rozepsaných intervalů
            });
          }
        });
        dataToSubmit.results = expandedResults;
      }

      // Převod pace na sekundy pro run a swim
      if ((formData.sport === 'run' || formData.sport === 'swim') && dataToSubmit.results) {
        dataToSubmit.results = dataToSubmit.results.map(interval => {
          const updatedInterval = { ...interval };

          // Převod power (pace) z MM:SS na sekundy
          if (interval.power && interval.power.includes(':')) {
            const parts = interval.power.split(':');
            const minutes = parseInt(parts[0], 10) || 0;
            const seconds = parseFloat(parts[1]) || 0;
            updatedInterval.power = String(Math.round(minutes * 60 + seconds));
          }

          return updatedInterval;
        });
      }

      // Zpracování duration pro všechny intervaly
      if (dataToSubmit.results) {
        console.log('Processing durations before conversion:', dataToSubmit.results.map(r => ({
          interval: r.interval,
          duration: r.duration,
          durationType: r.durationType
        })));

        dataToSubmit.results = dataToSubmit.results.map(interval => {
          const updatedInterval = { ...interval };

          // Pokud je durationType "time"
          if (interval.durationType === "time") {
            // Pokud je duration prázdné, nastavíme výchozí hodnotu 0
            if (!interval.duration) {
              updatedInterval.duration = "0";
            }
            // Pokud duration obsahuje ":", převedeme na sekundy
            else if (interval.duration.includes(':')) {
              const parts = interval.duration.split(':');
              const minutes = parseInt(parts[0], 10) || 0;
              const seconds = parseFloat(parts[1]) || 0;
              updatedInterval.duration = String(Math.round(minutes * 60 + seconds));
            }
            // Pokud je zadáno pouze číslo bez dvojtečky, převedeme na sekundy
            else {
              const minutes = parseInt(interval.duration);
              if (!isNaN(minutes)) {
                updatedInterval.duration = (minutes * 60).toString();
              } else {
                updatedInterval.duration = "0";
              }
            }
          }
          // Pro distance typ, zajistíme, že máme hodnotu
          else if (interval.durationType === "distance") {
            if (!interval.duration) {
              updatedInterval.duration = "0";
            }
          }

          // Zajistíme, že duration není undefined nebo null
          if (updatedInterval.duration === undefined || updatedInterval.duration === null) {
            updatedInterval.duration = "0";
          }

          // Zajistíme, že durationType je vždy nastaven
          if (!updatedInterval.durationType) {
            updatedInterval.durationType = "time";
          }

          return updatedInterval;
        });

        console.log('Processed durations after conversion:', dataToSubmit.results.map(r => ({
          interval: r.interval,
          duration: r.duration,
          durationType: r.durationType
        })));
      }

      if (isCustomTitle && formData.customTitle) {
        dataToSubmit.title = formData.customTitle;
      }

      if (isCustomSpecific && formData.specifics.customSpecific) {
        dataToSubmit.specifics.specific = formData.specifics.customSpecific;
      }

      if (isCustomWeather && formData.specifics.customWeather) {
        dataToSubmit.specifics.weather = formData.specifics.customWeather;
      }

      // Přidáme ID pokud editujeme
      if (isEditing && initialData?._id) {
        dataToSubmit._id = initialData._id;
      }

      // Persist an EXPLICIT intervalType on every result + keep isRecovery in
      // sync. Without this, a result that only carries the legacy isRecovery
      // flag (or nothing) is saved without intervalType — and on the next edit
      // auto-classify re-guesses ALL laps (its "keep saved types" shortcut only
      // fires when every lap has one), which flips e.g. a late work lap to
      // "cooldown". Filling it here makes the classification round-trip stable.
      if (dataToSubmit.results) {
        dataToSubmit.results = dataToSubmit.results.map(interval => {
          const intervalType = interval.intervalType || (interval.isRecovery ? 'recovery' : 'work');
          return { ...interval, intervalType, isRecovery: intervalType === 'recovery' };
        });
      }

      // Duration default + elevation (one pass so elevation is never skipped)
      if (dataToSubmit.results) {
        dataToSubmit.results = dataToSubmit.results.map((interval) => {
          const updatedInterval = { ...interval };
          if (!updatedInterval.duration) {
            updatedInterval.duration = "0";
          }
          if (
            updatedInterval.elevation !== undefined &&
            updatedInterval.elevation !== null &&
            updatedInterval.elevation !== ""
          ) {
            const elevation = Number(updatedInterval.elevation);
            updatedInterval.elevation = Number.isFinite(elevation)
              ? Math.round(elevation)
              : undefined;
          } else {
            delete updatedInterval.elevation;
          }
          if (updatedInterval.lactate !== undefined && updatedInterval.lactate !== null && updatedInterval.lactate !== '') {
            const lactate = parseLactateValue(updatedInterval.lactate);
            updatedInterval.lactate = lactate != null ? String(lactate) : '';
          }
          return updatedInterval;
        });
      }

      console.log('Submitting training data:', dataToSubmit);

      await onSubmit(dataToSubmit);

      // Počkáme krátkou chvíli, aby se data stihla aktualizovat na serveru
      await new Promise(resolve => setTimeout(resolve, 500));

      // Broadcast the update so calendar / list views that aren't owned by
      // the form's parent can patch their cached copy without a full reload.
      // We reuse the existing 'activityTitleUpdated' / 'activityCategoryUpdated'
      // window events that DashboardPage already listens for (around line 280).
      // Only dispatch when we have a stable id to patch on — new trainings
      // come back via the parent's loadTrainings refetch instead.
      try {
        const updateId = dataToSubmit._id || initialData?._id
          || initialData?.id || initialData?.stravaId || null;
        if (updateId) {
          if (dataToSubmit.title !== undefined && dataToSubmit.title !== initialData?.title) {
            window.dispatchEvent(new CustomEvent('activityTitleUpdated', {
              detail: { id: updateId, title: dataToSubmit.title },
            }));
          }
          // Category is the common drift: TrainingForm sets it, but the
          // weekly-calendar tile keeps showing the old badge until reload.
          // Always dispatch (incl. null = cleared) so listeners can patch
          // their state regardless of whether title also changed.
          window.dispatchEvent(new CustomEvent('activityCategoryUpdated', {
            detail: { id: updateId, category: dataToSubmit.category ?? null },
          }));
        }
      } catch {
        // CustomEvent unavailable in very old environments — ignore.
      }

      addNotification(isEditing ? 'Training updated successfully' : 'Training added successfully', 'success');

      // Zavřeme formulář
      onClose();
    } catch (error) {
      console.error('Form submission error:', error);
      addNotification('Failed to save training data', 'error');
    }
  };

  const handleAddInterval = () => {
    setFormData(prev => ({
      ...prev,
      results: [
        ...prev.results,
        {
          interval: prev.results.length + 1,
          intervalType: 'work',
          power: "",
          heartRate: "",
          lactate: "",
          RPE: "",
          elevation: "",
          duration: "00:00",
          durationType: "time",
          repeatCount: 1
        }
      ]
    }));
  };

  const handleEditRepeatCount = (index) => {
    setEditingIntervalIndex(index);
    const rc = formData.results[index]?.repeatCount;
    setTempRepeatCount(rc != null && rc !== "" ? String(rc) : "1");
  };

  const handleSaveRepeatCount = () => {
    if (editingIntervalIndex !== null && tempRepeatCount) {
      const newResults = [...formData.results];
      newResults[editingIntervalIndex].repeatCount = Math.max(1, parseInt(tempRepeatCount) || 1);
      setFormData(prev => ({ ...prev, results: newResults }));
      setEditingIntervalIndex(null);
      setTempRepeatCount("");
    }
  };

  const handleCancelEditRepeatCount = () => {
    setEditingIntervalIndex(null);
    setTempRepeatCount("");
  };

  // Build chart-compatible laps from current formData.results
  const chartLaps = formData.results.map((interval, idx) => {
    const isSwim = formData.sport === 'swim';
    const isRun = formData.sport === 'run';
    let average_watts = 0;
    let average_speed = 0;
    if (formData.sport === 'bike') {
      average_watts = parseFloat(interval.power) || 0;
    } else {
      // parse MM:SS pace → m/s
      const raw = String(interval.power || '');
      const parts = raw.split(':');
      if (parts.length === 2) {
        const totalSec = (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
        if (totalSec > 0) average_speed = isSwim ? 100 / totalSec : 1000 / totalSec;
      }
      // Fallback: compute speed from distance / duration if pace field empty.
      // Use parseIntervalDurSec so MM:SS duration strings and durationSeconds
      // are both handled (manually-created intervals only have duration MM:SS).
      if (average_speed === 0 && (isRun || isSwim)) {
        const dist = parseFloat(interval.distanceMeters) || 0;
        const dur = parseIntervalDurSec(interval);
        if (dist > 0 && dur > 0) average_speed = dist / dur;
      }
    }
    const durSec = parseIntervalDurSec(interval);
    return {
      lapNumber: idx + 1,
      average_watts,
      average_speed,
      average_heartrate: parseFloat(interval.heartRate) || 0,
      lactate: parseLactateValue(interval.lactate),
      distance: interval.distanceMeters || 0,
      moving_time: durSec,
      elapsed_time: durSec,
      intervalType: interval.intervalType || (interval.isRecovery ? 'recovery' : 'work'),
    };
  });

  // Auto-scroll to initial lap after form data is loaded
  useEffect(() => {
    if (initialSelectedLap == null || formData.results.length === 0) return;
    const lapNum = initialSelectedLap;
    setSelectedChartLap(lapNum);
    // Wait for layout then scroll
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = intervalRefs.current[lapNum - 1];
        const scrollEl = scrollBodyRef.current;
        if (el && scrollEl) {
          const chartHeight = chartPanelRef.current?.offsetHeight || 0;
          const elRect = el.getBoundingClientRect();
          const containerRect = scrollEl.getBoundingClientRect();
          const targetScroll = scrollEl.scrollTop + (elRect.top - containerRect.top) - chartHeight - 8;
          scrollEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedLap, formData.results.length]);

  const handleChartSelect = (lapNumber) => {
    const next = selectedChartLap === lapNumber ? null : lapNumber;
    setSelectedChartLap(next);
    if (next != null) {
      const el = intervalRefs.current[next - 1];
      const scrollEl = scrollBodyRef.current;
      if (el && scrollEl) {
        // Use getBoundingClientRect so the sticky chart height is automatically accounted for
        requestAnimationFrame(() => {
          const chartHeight = chartPanelRef.current?.offsetHeight || 0;
          const elRect = el.getBoundingClientRect();
          const containerRect = scrollEl.getBoundingClientRect();
          const currentScroll = scrollEl.scrollTop;
          // Position the card just below the sticky chart with 8px breathing room
          const targetScroll = currentScroll + (elRect.top - containerRect.top) - chartHeight - 8;
          scrollEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        });
      }
    }
  };

  /** Change one interval type and keep legacy isRecovery / isSelected in sync.
   *  A lap re-classified to a non-recovery type must become selected, otherwise
   *  the export step (which drops isSelected===false laps) would silently throw
   *  away the work lap the user just set. */
  const handleSetIntervalType = (index, type) => {
    const nextResults = [...formData.results];
    nextResults[index] = {
      ...nextResults[index],
      intervalType: type,
      isRecovery: type === 'recovery',
      isSelected: type === 'recovery' ? nextResults[index].isSelected : true,
    };
    setFormData((prev) => ({ ...prev, results: nextResults }));
    setTypePickerOpenIdx(null);
  };

  /** Re-run interval type auto-detection from scratch (ignores manual overrides). */
  const handleAutoDetect = () => {
    const cleared = formData.results.map((r) => ({ ...r, intervalType: undefined, isRecovery: false }));
    setFormData((prev) => ({ ...prev, results: autoDetectIntervalTypes(cleared) }));
  };

  /** Toggle auto-detect on/off. When turned on, immediately re-run detection. */
  const handleToggleAutoDetect = () => {
    const next = !autoDetectEnabled;
    setAutoDetectEnabled(next);
    if (next) {
      const cleared = formData.results.map(r => ({ ...r, intervalType: undefined, isRecovery: false }));
      setFormData(prev => ({ ...prev, results: autoDetectIntervalTypes(cleared) }));
    }
  };

  // Shared input classes
  const inputBase =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary min-h-[44px]";
  const selectBase =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none min-h-[44px] pr-8";
  const labelBase = "block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide";

  // ChevronDown inline SVG
  const ChevronDown = ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  return (
    <motion.div
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 80 || info.velocity.y > 400) onClose();
      }}
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl flex flex-col relative shadow-xl overflow-hidden"
      style={{
        // The form sheet now extends to the bottom of the screen on native
        // (covers the tab bar — modal portal sits above it via z-index). Only
        // pad the inside of the sticky Save/Cancel footer with the home-
        // indicator safe area; see footer styling.
        maxHeight: isCapacitorNative()
          ? 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)'
          : 'calc(95vh - env(safe-area-inset-top, 0px))',
      }}
    >

      {/* Drag handle — mobile only; touching it starts the swipe-to-close drag */}
      <div
        className="flex justify-center pt-2.5 pb-0 sm:hidden shrink-0 cursor-grab active:cursor-grabbing touch-none"
        aria-hidden="true"
        onPointerDown={(e) => dragControls.start(e)}
      >
        <div className="h-1 w-10 rounded-full bg-gray-300" />
      </div>

      {/* ── Header (always visible) ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-20">
        {/* Title */}
        <h2 className="flex-1 text-base font-semibold text-gray-900 truncate">
          {isEditing ? "Edit Training" : "New Training"}
        </h2>

        {/* Sport pills */}
        <div className="flex items-center gap-1">
          {ACTIVITIES.map((activity) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => {
                const newResults = formData.results.map(result => ({
                  ...result,
                  power: activity.id === 'bike' ? result.power : formatSecondsToMMSS(result.power)
                }));
                setFormData(prev => ({
                  ...prev,
                  sport: activity.id,
                  results: newResults
                }));
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors min-h-[36px] ${
                formData.sport === activity.id
                  ? "bg-primary text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              <img
                src={activity.icon}
                alt=""
                className={`w-4 h-4 ${formData.sport === activity.id ? "brightness-0 invert" : ""}`}
              />
              <span>{activity.label}</span>
            </button>
          ))}
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div ref={scrollBodyRef} className="flex-1 overflow-y-auto min-h-0 overflow-x-hidden">
        <form id="training-form" noValidate onSubmit={handleFormSubmit}>

          {/* ── Top section ── */}
          <div className="px-4 pt-4 pb-2 space-y-4 min-w-0">

              {/* Date — full width */}
              <div className="min-w-0 w-full">
                <label className={labelBase}>Date</label>
                <input
                  type="datetime-local"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className={inputBase}
                  style={{ maxWidth: '100%', boxSizing: 'border-box' }}
                />
              </div>

              {/* Category — pill selector */}
              <div>
                <label className={labelBase}>Category</label>
                <div
                  className="flex gap-2 pb-0.5"
                  style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', touchAction: 'pan-x' }}
                >
                  {CATEGORY_CONFIG.map(({ id, label, idle, on }) => {
                    const isActive = formData.category === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, category: isActive ? '' : id }))}
                        style={{ touchAction: 'pan-x manipulation', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all min-h-[40px] whitespace-nowrap ${
                          isActive ? on : idle
                        }`}
                      >
                        {CAT_ICONS[id]}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Training title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelBase} style={{ marginBottom: 0 }}>Training title</label>
                  <div className="flex items-center gap-1.5">
                    {/* Auto-generate button */}
                    <button
                      type="button"
                      onClick={() => {
                        const generated = generateTrainingTitle(formData.sport, formData.category, formData.results);
                        setIsCustomTitle(true);
                        setFormData(prev => ({ ...prev, customTitle: generated, title: '' }));
                      }}
                      title="Auto-generate title from intervals"
                      className="flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/8 hover:bg-primary/15 border border-primary/20 rounded-full px-2 py-0.5 transition-colors"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Generate
                    </button>
                    {!formData.title && !formData.customTitle && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 animate-pulse">
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                        </svg>
                        Set a title
                      </span>
                    )}
                  </div>
                </div>

                {/* Default-name banner */}
                {isDefaultTitle(formData.title || formData.customTitle) && (
                  <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                      </svg>
                      <span className="text-[11px] text-amber-700 font-medium truncate">
                        Generic name detected — give it a better title
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const generated = generateTrainingTitle(formData.sport, formData.category, formData.results);
                        setIsCustomTitle(true);
                        setFormData(prev => ({ ...prev, customTitle: generated, title: '' }));
                      }}
                      className="shrink-0 text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
                    >
                      Auto-rename →
                    </button>
                  </div>
                )}

                {/* Combobox — type freely or pick from existing titles */}
                <TitleCombobox
                  value={formData.customTitle || formData.title || ''}
                  options={trainingTitles}
                  hasWarning={!formData.title && !formData.customTitle}
                  placeholder="Type or select a training title…"
                  onChange={(val) => {
                    setIsCustomTitle(true);
                    setFormData(prev => ({ ...prev, customTitle: val, title: '' }));
                  }}
                />
              </div>

              {/* Description — collapsible */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDescriptionOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <span>Description {formData.description ? <span className="text-primary">•</span> : null}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${descriptionOpen ? "rotate-180" : ""}`} />
                </button>
                {descriptionOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Write some notes about this training…"
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">RPE (1–10)</label>
                        <input type="number" inputMode="numeric" min="1" max="10"
                          placeholder="—"
                          value={formData.rpe || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, rpe: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wide block mb-1" style={{ color: '#7c3aed' }}>Lactate (mmol/L)</label>
                        <input type="text" inputMode="decimal"
                          placeholder="—"
                          value={formData.lactate || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, lactate: sanitizeLactateInput(e.target.value) }))}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': '#7c3aed' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Specifics — collapsible */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSpecificsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <span>
                    Specifics{" "}
                    {(formData.specifics?.specific || formData.specifics?.weather) ? <span className="text-primary">•</span> : null}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${specificsOpen ? "rotate-180" : ""}`} />
                </button>
                {specificsOpen && (
                  <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                    {/* Terrain / pool length */}
                    <div>
                      <label className={labelBase}>
                        {formData.sport === "swim" ? "Pool Length" : "Terrain"}
                      </label>
                      {!isCustomSpecific ? (
                        <div className="relative">
                          <select
                            value={formData.specifics.specific}
                            onChange={(e) => {
                              if (e.target.value === "custom") {
                                setIsCustomSpecific(true);
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  specifics: { ...prev.specifics, specific: e.target.value }
                                }));
                              }
                            }}
                            className={selectBase}
                          >
                            <option value="">
                              Select {formData.sport === "swim" ? "pool length" : "terrain"}
                            </option>
                            {formData.sport === "swim" ? (
                              <>
                                <option value="25m">25m</option>
                                <option value="50m">50m</option>
                                <option value="custom">+ Custom length</option>
                              </>
                            ) : (
                              <>
                                {TERRAIN_OPTIONS[formData.sport]?.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                                <option value="custom">+ Custom terrain</option>
                              </>
                            )}
                          </select>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <ChevronDown />
                          </span>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={formData.specifics.customSpecific}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              specifics: { ...prev.specifics, customSpecific: e.target.value }
                            }))}
                            placeholder={`Custom ${formData.sport === "swim" ? "length" : "terrain"}`}
                            className={inputBase}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomSpecific(false);
                              setFormData(prev => ({
                                ...prev,
                                specifics: { ...prev.specifics, customSpecific: "" }
                              }));
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Weather */}
                    <div>
                      <label className={labelBase}>Weather</label>
                      {!isCustomWeather ? (
                        <div className="relative">
                          <select
                            value={formData.specifics.weather}
                            onChange={(e) => {
                              if (e.target.value === "custom") {
                                setIsCustomWeather(true);
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  specifics: { ...prev.specifics, weather: e.target.value }
                                }));
                              }
                            }}
                            className={selectBase}
                          >
                            <option value="">Select weather</option>
                            {WEATHER_OPTIONS.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                            <option value="custom">+ Custom weather</option>
                          </select>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <ChevronDown />
                          </span>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={formData.specifics.customWeather}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              specifics: { ...prev.specifics, customWeather: e.target.value }
                            }))}
                            placeholder="Custom weather"
                            className={inputBase}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomWeather(false);
                              setFormData(prev => ({
                                ...prev,
                                specifics: { ...prev.specifics, customWeather: "" }
                              }));
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          {/* ── Laps bar chart — sticky once scrolled into view ── */}
          {formData.results.length > 0 && (
            <div ref={chartPanelRef} className="sticky top-0 z-10 bg-white border-y border-gray-100 px-4 pt-3 pb-2">
              <LapsBarChart
                laps={chartLaps}
                selectedLapNumber={selectedChartLap}
                onSelect={handleChartSelect}
                sport={formData.sport}
                disableZoom
              />
            </div>
          )}

          {/* ── Interval cards ── */}
          <div className="px-4 pt-4 pb-4 space-y-3">

              {/* Title nudge banner — only when intervals exist but title is still empty */}
              {formData.results.length > 0 && !formData.title && !formData.customTitle && (
                <button
                  type="button"
                  onClick={() => scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium hover:bg-amber-100 transition-colors text-left"
                >
                  <svg className="w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                  </svg>
                  <span>Don't forget to set a training title ↑</span>
                </button>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-700">Intervals</h3>

                  {/* Auto-detect toggle */}
                  <button
                    type="button"
                    onClick={handleToggleAutoDetect}
                    title={autoDetectEnabled ? 'Auto-classify is ON — click to disable' : 'Auto-classify is OFF — click to enable'}
                    className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                      autoDetectEnabled
                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {/* Magic wand icon */}
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l1.5 1.5M12 3v2M19 3l-1.5 1.5M3 12h2M19 12h2M5 21l1.5-1.5M12 19v2M19 21l-1.5-1.5M9 9l6 6" />
                    </svg>
                    Auto
                    {/* On/off dot */}
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${autoDetectEnabled ? 'bg-primary' : 'bg-gray-300'}`} />
                  </button>

                  {/* Manual re-run — only shown when auto is ON and there are intervals */}
                  {autoDetectEnabled && formData.results.length > 2 && (
                    <button
                      type="button"
                      onClick={handleAutoDetect}
                      title="Re-run auto-detection (resets all manual overrides)"
                      className="text-[11px] px-2 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors font-medium"
                    >
                      Re-detect
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddInterval}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors min-h-[36px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add interval
                </button>
              </div>

              {formData.results.map((interval, index) => {
                const itype = interval.intervalType || (interval.isRecovery ? 'recovery' : 'work');
                const tc = INTERVAL_TYPES.find(t => t.id === itype) || INTERVAL_TYPES[0];
                const isWork = itype === 'work';
                const isChartSelected = selectedChartLap === index + 1;
                const isPickerOpen = typePickerOpenIdx === index;

                /* Shared type-picker dropdown rendered inline */
                const TypePicker = () => (
                  <div className="relative" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTypePickerOpenIdx(isPickerOpen ? null : index); }}
                      className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold transition-colors ${tc.bg} ${tc.text}`}
                    >
                      {tc.icon} {tc.shortLabel} ▾
                    </button>
                    {isPickerOpen && (
                      <div className="absolute right-0 bottom-full mb-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-1 flex flex-col gap-0.5 min-w-[120px]">
                        {INTERVAL_TYPES.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleSetIntervalType(index, t.id); }}
                            className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${itype === t.id ? `${t.bg} ${t.text}` : 'text-gray-600 hover:bg-gray-50'}`}
                          >
                            <span>{t.icon}</span>
                            <span>{t.label}</span>
                            {itype === t.id && <span className="ml-auto opacity-50 text-[9px]">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );

                return (
                  <div
                    key={index}
                    ref={el => { intervalRefs.current[index] = el; }}
                    onFocus={() => setSelectedChartLap(index + 1)}
                    className={`rounded-xl border transition-all ${
                      !isWork
                        ? `border-dashed ${tc.border} bg-gray-50/40`
                        : isChartSelected
                          ? "border-primary bg-white shadow-md ring-2 ring-primary/20"
                          : "border-gray-200 bg-white shadow-sm"
                    }`}
                  >
                    {!isWork ? (
                      /* ── Compact row: warmup / cooldown / recovery ──
                         flex-wrap so that on narrow phones (≤375 px) the
                         TypePicker + delete-X don't get pushed off the
                         right edge by the dur/hr/la pills. Honza reported
                         the delete button being completely invisible on
                         iOS — fix is to wrap the trailing actions to a
                         second line when there's no horizontal room. */
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1.5 px-3 py-1.5">
                        <span className={`text-xs shrink-0 ${tc.text}`}>{tc.icon}</span>
                        <span className={`text-[11px] font-medium shrink-0 ${tc.text}`}>
                          {tc.label} {index + 1}
                        </span>
                        {/* Duration — same smart parser as the full Work card;
                            a number that looks like a distance (km/m suffix,
                            decimal, or > 60 colonless) routes into
                            distanceMeters and switches durationType to
                            'distance'. */}
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5">
                          <span className="text-[9px] text-gray-400 uppercase leading-none shrink-0">dur</span>
                          <input
                            type="text" inputMode="decimal" placeholder="MM:SS"
                            value={interval.durationType === 'distance' && interval.distanceMeters
                              ? (interval.distanceMeters >= 1000
                                  ? `${(interval.distanceMeters/1000)}km`
                                  : `${interval.distanceMeters}m`)
                              : (interval.duration || '')}
                            onChange={(e) => {
                              const r=[...formData.results];
                              const raw = e.target.value;
                              const cleaned = raw.replace(/[^\d:.,kmKM ]/g, '');
                              const lower = cleaned.toLowerCase();
                              const hasUnit = /km|\bm\b|m$/.test(lower);
                              const hasDecimal = /[.,]/.test(cleaned);
                              const justDigits = /^\d+$/.test(cleaned);
                              const tooBigForTime = justDigits && Number(cleaned) > 60;
                              if (hasUnit || hasDecimal || tooBigForTime) {
                                const numStr = lower.replace(',', '.').replace(/[^0-9.]/g, '');
                                const num = parseFloat(numStr);
                                if (Number.isFinite(num) && num > 0) {
                                  let meters;
                                  if (/km/.test(lower))            meters = num * 1000;
                                  else if (/\bm\b|m$/.test(lower)) meters = num;
                                  else if (num < 50)               meters = num * 1000;
                                  else                              meters = num;
                                  if (formData.sport !== 'swim' && meters >= 200) {
                                    const km = meters / 1000;
                                    if (Math.abs(km - Math.round(km)) <= 0.02) meters = Math.round(km) * 1000;
                                  }
                                  r[index].distanceMeters = Math.round(meters);
                                  r[index].durationType = 'distance';
                                  r[index].duration = String(Math.round(meters));
                                  setFormData(p=>({...p,results:r}));
                                  return;
                                }
                              }
                              let v = cleaned.replace(/[^\d:]/g,'');
                              if (v.length>0 && !v.includes(':') && v.length>=2) v=`${v.slice(0,2)}:${v.slice(2,4)}`;
                              r[index].duration=v;
                              r[index].durationType='time';
                              setFormData(p=>({...p,results:r}));
                            }}
                            className="w-16 text-[11px] text-gray-700 bg-transparent outline-none placeholder-gray-300"
                          />
                        </div>
                        {/* HR */}
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5">
                          <span className="text-[9px] text-gray-400 uppercase leading-none shrink-0">hr</span>
                          <input
                            type="number" inputMode="numeric" placeholder="—"
                            value={interval.heartRate || ''}
                            onChange={(e) => { const r=[...formData.results]; r[index].heartRate=e.target.value; setFormData(p=>({...p,results:r})); }}
                            className="w-10 text-[11px] text-gray-700 bg-transparent outline-none placeholder-gray-300"
                          />
                        </div>
                        {/* Lactate — shown even on compact (non-work) rows so values are always visible */}
                        <div className="flex items-center gap-1 bg-primary/10 rounded px-1.5 py-0.5">
                          <span className="text-[9px] text-primary uppercase leading-none shrink-0">la</span>
                          <input
                            id={`training-form-lactate-compact-${index}`}
                            type="text" inputMode="decimal" placeholder="—"
                            value={interval.lactate ?? ''}
                            onChange={(e) => { const r=[...formData.results]; r[index].lactate=sanitizeLactateInput(e.target.value); setFormData(p=>({...p,results:r})); }}
                            className="w-10 text-[11px] text-primary font-semibold bg-transparent outline-none placeholder-gray-300"
                          />
                        </div>
                        {/* Trailing actions group — stays together even when
                            wrapped onto a 2nd line. `ml-auto` pushes the
                            group to the right edge whether wrapped or not,
                            replacing the old flex-1 spacer (which collapsed
                            to 0 when content overflowed and let the X get
                            clipped offscreen). */}
                        <div className="flex items-center gap-1 ml-auto">
                          <TypePicker />
                          <button type="button" onClick={() => { setFormData(p=>({...p,results:p.results.filter((_,i)=>i!==index)})); }}
                            className="w-5 h-5 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* ── Full work card ── */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                          <span className="flex-1 text-xs font-semibold text-gray-700">
                            Interval {index + 1}
                            {parseIntervalDurSec(interval) > 0 && (
                              <span className="text-gray-400 font-normal ml-1.5">{fmtDur(parseIntervalDurSec(interval))}</span>
                            )}
                            {interval.distanceMeters > 0 && (
                              <span className="text-gray-400 font-normal ml-1.5">· {fmtDist(interval.distanceMeters)}</span>
                            )}
                          </span>
                          <TypePicker />
                          <button type="button" onClick={() => handleEditRepeatCount(index)}
                            className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold ${interval.repeatCount > 1 ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                          >×{interval.repeatCount > 1 ? interval.repeatCount : 1}</button>
                          <button type="button" onClick={() => { setFormData(p=>({...p,results:p.results.filter((_,i)=>i!==index)})); }}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>

                        {/* Fields grid — 2 cols mobile, 3 on sm+ */}
                        <div className="grid gap-px bg-gray-100 rounded-b-xl overflow-hidden grid-cols-2 sm:grid-cols-3">
                          {/* Power / Pace */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>{formData.sport === "bike" ? "Power W" : formData.sport === "swim" ? "Pace /100m" : "Pace /km"}</label>
                            {formData.sport === "bike" ? (
                              <input type="number" inputMode="numeric" placeholder="—" value={interval.power}
                                onChange={(e) => { const r=[...formData.results]; r[index].power=e.target.value; setFormData(p=>({...p,results:r})); }}
                                className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                            ) : (
                              <input type="text" inputMode="numeric" placeholder="MM:SS" value={interval.power}
                                onChange={(e) => handlePaceChange(index, e.target.value)}
                                className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                            )}
                          </div>
                          {/* HR */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>HR bpm</label>
                            <input type="number" inputMode="numeric" placeholder="—" value={interval.heartRate}
                              onChange={(e) => { const r=[...formData.results]; r[index].heartRate=e.target.value; setFormData(p=>({...p,results:r})); }}
                              className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                          </div>
                          {/* Lactate */}
                          <div className="px-3 py-2.5 bg-primary/5 border-l-2 border-primary">
                            <label className={`${labelBase} text-primary`}>Lactate</label>
                            <input id={`training-form-lactate-${index}`} type="text" inputMode="decimal" placeholder="—" value={interval.lactate}
                              onChange={(e) => { const r=[...formData.results]; r[index].lactate=sanitizeLactateInput(e.target.value); setFormData(p=>({...p,results:r})); }}
                              className="w-full text-sm bg-transparent outline-none placeholder-gray-300 min-h-[36px] font-semibold text-primary" />
                          </div>
                          {/* RPE */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>RPE</label>
                            <input type="number" inputMode="numeric" placeholder="—" value={interval.RPE}
                              onChange={(e) => { const r=[...formData.results]; r[index].RPE=e.target.value; setFormData(p=>({...p,results:r})); }}
                              className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                          </div>
                          {/* Duration — auto-detects when user accidentally types a
                              distance ("3km", "3.03", "997") and routes it into
                              distanceMeters instead. */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>Duration</label>
                            <input type="text" inputMode="decimal" placeholder="MM:SS"
                              value={interval.durationType === 'distance' ? '' : (interval.duration || '')}
                              onChange={(e) => {
                                const r=[...formData.results];
                                const raw = e.target.value;
                                // Allow digits, colon, dot, comma, k, m — strip the rest.
                                const cleaned = raw.replace(/[^\d:.,kmKM ]/g, '');
                                const lower = cleaned.toLowerCase();
                                // Detect distance-looking input: km/m suffix, decimal
                                // separator, or a colonless number that can't sit in MM:SS
                                // (MM ≤ 60). 997 / 1005 / 3.03 / "1km" all match.
                                const hasUnit = /km|\bm\b|m$/.test(lower);
                                const hasDecimal = /[.,]/.test(cleaned);
                                const justDigits = /^\d+$/.test(cleaned);
                                const tooBigForTime = justDigits && Number(cleaned) > 60;
                                if (hasUnit || hasDecimal || tooBigForTime) {
                                  // Parse like the Distance field does.
                                  const numStr = lower.replace(',', '.').replace(/[^0-9.]/g, '');
                                  const num = parseFloat(numStr);
                                  if (Number.isFinite(num) && num > 0) {
                                    let meters;
                                    if (/km/.test(lower))            meters = num * 1000;
                                    else if (/\bm\b|m$/.test(lower)) meters = num;
                                    else if (num < 50)               meters = num * 1000;
                                    else                              meters = num;
                                    // Snap to whole km within 2 %.
                                    if (formData.sport !== 'swim' && meters >= 200) {
                                      const km = meters / 1000;
                                      if (Math.abs(km - Math.round(km)) <= 0.02) meters = Math.round(km) * 1000;
                                    }
                                    r[index].distanceMeters = Math.round(meters);
                                    r[index].durationType = 'distance';
                                    r[index].duration = String(Math.round(meters));
                                    setFormData(p=>({...p,results:r}));
                                    return;
                                  }
                                }
                                // Time path — keep digits + colon, auto-insert colon
                                // after 2 digits so the user can type "0345" and get
                                // "03:45".
                                let v = cleaned.replace(/[^\d:]/g,'');
                                if (v.length>0 && !v.includes(':') && v.length>=2) v=`${v.slice(0,2)}:${v.slice(2,4)}`;
                                r[index].duration=v;
                                r[index].durationType='time';
                                setFormData(p=>({...p,results:r}));
                              }}
                              className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                          </div>
                          {/* Distance — accepts "3", "3km", "3.03", "3,03", "997", "1005"… */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>{formData.sport === "swim" ? "Dist m" : "Dist"}</label>
                            <input type="text" inputMode="decimal" placeholder={formData.sport === "swim" ? "e.g. 400" : "e.g. 1km"}
                              // Display priority: explicit distanceMeters → duration when
                              // durationType is 'distance' (legacy storage). Always shown
                              // as the human-friendly form ("1 km", "997 m", "3 km").
                              value={(() => {
                                const meters = Number(interval.distanceMeters) > 0
                                  ? Number(interval.distanceMeters)
                                  : (interval.durationType === 'distance' && interval.duration
                                      ? (() => {
                                          const n = parseFloat(String(interval.duration).replace(',', '.'));
                                          if (!Number.isFinite(n) || n <= 0) return 0;
                                          // < 50 with decimals → km, else metres
                                          return (n < 50) ? Math.round(n * 1000) : Math.round(n);
                                        })()
                                      : 0);
                                if (!meters) return '';
                                // Snap to nearest km / 100 m so 997 reads as "1 km" and
                                // 3030 reads as "3 km".
                                if (formData.sport !== 'swim' && meters >= 200) {
                                  const km = meters / 1000;
                                  const roundedKm = Math.round(km * 100) / 100;
                                  // Within 2% of a whole km → display as round km
                                  if (Math.abs(km - Math.round(km)) <= 0.02) {
                                    return `${Math.round(km)} km`;
                                  }
                                  return `${roundedKm} km`;
                                }
                                return `${meters} m`;
                              })()}
                              onChange={(e) => {
                                const r=[...formData.results];
                                const raw = e.target.value.trim();
                                if (!raw) {
                                  r[index].distanceMeters = undefined;
                                  // Also clear the legacy distance-in-duration storage.
                                  if (r[index].durationType === 'distance') r[index].duration = '';
                                  setFormData(p=>({...p,results:r}));
                                  return;
                                }
                                // Detect explicit unit; otherwise infer from magnitude.
                                const s = raw.toLowerCase().replace(',', '.');
                                const num = parseFloat(s);
                                if (!Number.isFinite(num) || num <= 0) {
                                  setFormData(p=>({...p,results:r}));
                                  return;
                                }
                                let meters;
                                if (/km\b/.test(s)) {
                                  meters = num * 1000;
                                } else if (/\bm\b/.test(s) || /[\d.]+m$/.test(s)) {
                                  meters = num;
                                } else if (num < 50) {
                                  // No unit, small decimal — almost always km (e.g. 3, 3.03, 5).
                                  meters = num * 1000;
                                } else {
                                  // No unit, big integer — metres (e.g. 400, 991, 1005).
                                  meters = num;
                                }
                                // Snap to nearest whole km when within 2 % so 991 → 1000, 3030 → 3000.
                                if (formData.sport !== 'swim' && meters >= 200) {
                                  const km = meters / 1000;
                                  if (Math.abs(km - Math.round(km)) <= 0.02) meters = Math.round(km) * 1000;
                                }
                                r[index].distanceMeters = Math.round(meters);
                                // Keep `duration` consistent — if the lap was stored as
                                // distance-mode, mirror the new value so old code paths
                                // that still read it don't fall behind.
                                if (r[index].durationType === 'distance') {
                                  r[index].duration = String(Math.round(meters));
                                }
                                setFormData(p=>({...p,results:r}));
                              }}
                              className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {formData.results.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-400">
                  No intervals yet. Tap &ldquo;Add interval&rdquo; to get started.
                </div>
              )}
            </div>

          {/* Bottom spacer so sticky footer doesn't overlap last card */}
          <div className="h-2" />
        </form>
      </div>

      {/* ── Sticky footer ── */}
      <div
        className="shrink-0 bg-white border-t border-gray-100 px-4 flex gap-3"
        style={{
          paddingTop: '0.75rem',
          // Footer now sits at the very bottom of the screen on native (sheet
          // covers the tab bar). Add safe-area inset so the Save/Cancel buttons
          // clear the iOS home indicator.
          paddingBottom: isCapacitorNative()
            ? 'calc(0.75rem + env(safe-area-inset-bottom, 0px))'
            : '0.75rem',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="training-form"
          disabled={isLoading}
          className="flex-1 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          {isLoading ? "Saving…" : isEditing ? "Update" : "Save Training"}
        </button>
      </div>

      {/* ── Repeat-count modal — portaled so it appears above tab bar ── */}
      {editingIntervalIndex !== null && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[9999] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs shadow-xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-0 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>
            <div className="px-5 pt-4 pb-4">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Repeat count</h3>
              <label className={labelBase}>Number of repetitions</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={tempRepeatCount}
                onChange={(e) => setTempRepeatCount(e.target.value)}
                className={inputBase}
                autoFocus
              />
            </div>
            <div
              className="flex gap-2 px-5"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
            >
              <button
                type="button"
                onClick={handleCancelEditRepeatCount}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 min-h-[44px]"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRepeatCount}
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 min-h-[44px]"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
};

export default TrainingForm;
