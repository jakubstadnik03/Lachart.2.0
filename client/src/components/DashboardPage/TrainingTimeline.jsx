/**
 * TrainingTimeline — the shape of a block, three ways.
 *
 * Drawn with plain SVG rather than a chart library: the three views need very
 * different marks (bars, stacked bars, diverging bars) sharing one axis and one
 * hover state, and wiring that through a generic chart API costs more than
 * drawing it.
 *
 * The plan overlay is off by default on purpose. Most athletes are looking at
 * what they did; comparing it to what was planned is a separate question, and
 * showing both at once makes the common case harder to read.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { getTimelineZones } from '../../services/api';
import {
  SPORT_FILTERS,
  TIMELINE_VIEWS,
  ZONE_META,
  buildTrainingTimeline,
  formatHours,
} from '../../utils/trainingTimeline';
import { localCalendarDateKey } from '../../utils/calendarDateKeys';

const WINDOWS = [
  { id: 14, label: '2w' },
  { id: 42, label: '6w' },
  { id: 90, label: '3m' },
];

const PREFS_KEY = 'lachart:timelinePrefs';

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// ── Chart ──────────────────────────────────────────────────────────

const CHART_H = 150;
const PAD_TOP = 8;

function FlowChart({ timeline, showPlan, onHover, hovered }) {
  const { points, maxDailyTss, maxRolling } = timeline;
  const n = points.length;
  const slot = 100 / n;
  const barW = Math.max(0.8, slot * 0.62);

  // The rolling line uses its own scale — a 7-day total dwarfs a single day,
  // and forcing them onto one axis flattens the daily bars into nothing.
  const rollingY = (v) => PAD_TOP + (1 - v / maxRolling) * (CHART_H - PAD_TOP);
  const linePoints = points
    .map((p, idx) => (p.rolling7Complete ? `${idx * slot + slot / 2},${rollingY(p.rolling7)}` : null))
    .filter(Boolean)
    .join(' ');

  return (
    <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" className="w-full" style={{ height: CHART_H }}>
      {points.map((p, i) => {
        const x = i * slot + (slot - barW) / 2;
        const h = (p.actual / maxDailyTss) * (CHART_H - PAD_TOP);
        const planH = (p.planned / maxDailyTss) * (CHART_H - PAD_TOP);
        return (
          <g key={p.date} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
            {/* Full-height hit area — a 3px bar is impossible to hover */}
            <rect x={i * slot} y={0} width={slot} height={CHART_H} fill="transparent" />
            {p.isWeekStart ? (
              <line x1={i * slot} y1={0} x2={i * slot} y2={CHART_H} stroke="#E5E7EB" strokeWidth="0.15" />
            ) : null}
            {showPlan && p.planned > 0 ? (
              <rect
                x={x - barW * 0.18}
                y={CHART_H - planH}
                width={barW * 1.36}
                height={planH}
                fill="#CBD5E1"
                opacity={hovered === i ? 0.9 : 0.55}
                rx="0.4"
              />
            ) : null}
            <rect
              x={x}
              y={CHART_H - h}
              width={barW}
              height={h}
              fill={p.isToday ? '#4F46E5' : '#818CF8'}
              opacity={hovered === null || hovered === i ? 1 : 0.45}
              rx="0.4"
            />
          </g>
        );
      })}
      {linePoints ? (
        <polyline
          points={linePoints}
          fill="none"
          stroke="#F97316"
          strokeWidth="0.6"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

function BalanceChart({ timeline, onHover, hovered }) {
  const { points } = timeline;
  const n = points.length;
  const slot = 100 / n;
  const barW = Math.max(0.8, slot * 0.62);
  const maxSec = Math.max(600, ...points.map((p) => p.zoneTotalSec + p.unmeasuredSec));

  return (
    <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" className="w-full" style={{ height: CHART_H }}>
      {points.map((p, i) => {
        const x = i * slot + (slot - barW) / 2;
        let y = CHART_H;
        const segments = [];

        // Unmeasured sits at the bottom in grey, so a day with no HR strap
        // never masquerades as a day spent entirely in Z1.
        if (p.unmeasuredSec > 0) {
          const h = (p.unmeasuredSec / maxSec) * (CHART_H - PAD_TOP);
          y -= h;
          segments.push({ key: 'unmeasured', y, h, color: '#E5E7EB' });
        }
        for (const z of ZONE_META) {
          const secs = p.zones?.[z.key] || 0;
          if (secs <= 0) continue;
          const h = (secs / maxSec) * (CHART_H - PAD_TOP);
          y -= h;
          segments.push({ key: z.key, y, h, color: z.color });
        }

        return (
          <g key={p.date} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
            <rect x={i * slot} y={0} width={slot} height={CHART_H} fill="transparent" />
            {p.isWeekStart ? (
              <line x1={i * slot} y1={0} x2={i * slot} y2={CHART_H} stroke="#E5E7EB" strokeWidth="0.15" />
            ) : null}
            {segments.map((s) => (
              <rect
                key={s.key}
                x={x}
                y={s.y}
                width={barW}
                height={s.h}
                fill={s.color}
                opacity={hovered === null || hovered === i ? 1 : 0.45}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function PlanChart({ timeline, onHover, hovered }) {
  const { points } = timeline;
  const n = points.length;
  const slot = 100 / n;
  const barW = Math.max(0.8, slot * 0.62);
  const maxDelta = Math.max(20, ...points.map((p) => Math.abs(p.delta)));
  const mid = CHART_H / 2;

  return (
    <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" className="w-full" style={{ height: CHART_H }}>
      <line x1="0" y1={mid} x2="100" y2={mid} stroke="#CBD5E1" strokeWidth="0.2" />
      {points.map((p, i) => {
        const x = i * slot + (slot - barW) / 2;
        const h = (Math.abs(p.delta) / maxDelta) * (mid - PAD_TOP);
        const over = p.delta > 0;
        return (
          <g key={p.date} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
            <rect x={i * slot} y={0} width={slot} height={CHART_H} fill="transparent" />
            {p.delta !== 0 ? (
              <rect
                x={x}
                y={over ? mid - h : mid}
                width={barW}
                height={h}
                fill={over ? '#F97316' : '#60A5FA'}
                opacity={hovered === null || hovered === i ? 1 : 0.45}
                rx="0.4"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// ── Card ───────────────────────────────────────────────────────────

function Legend({ view }) {
  if (view === 'balance') {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {ZONE_META.map((z) => (
          <span key={z.key} className="inline-flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-sm" style={{ background: z.color }} />
            {z.label} {z.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
          <span className="w-2 h-2 rounded-sm bg-gray-200" /> No HR data
        </span>
      </div>
    );
  }
  if (view === 'plan') {
    return (
      <div className="flex gap-3 mt-2">
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2 h-2 rounded-sm bg-orange-500" /> Did more than planned
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          <span className="w-2 h-2 rounded-sm bg-blue-400" /> Did less
        </span>
      </div>
    );
  }
  return (
    <div className="flex gap-3 mt-2">
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
        <span className="w-2 h-2 rounded-sm bg-indigo-400" /> Daily TSS
      </span>
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
        <span className="w-3 h-[2px] bg-orange-500" /> Rolling 7 days
      </span>
    </div>
  );
}

function HoverDetail({ point }) {
  if (!point) return null;
  return (
    <div className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="font-bold text-gray-900">
          {point.weekday} {point.label}
          {point.isToday ? <span className="ml-1 text-indigo-600">· today</span> : null}
        </span>
        <span className="text-gray-500">
          {point.actual} TSS
          {point.planned > 0 ? <span className="text-gray-400"> / {point.planned} planned</span> : null}
        </span>
      </div>
      {point.sessions.length ? (
        <div className="text-gray-600 mt-0.5 truncate">
          {point.sessions.map((s) => s.title).join(' · ')}
        </div>
      ) : (
        <div className="text-gray-400 mt-0.5">No session</div>
      )}
      {point.zones ? (
        <div className="flex flex-wrap gap-x-2 mt-1">
          {ZONE_META.filter((z) => (point.zones[z.key] || 0) > 0).map((z) => (
            <span key={z.key} style={{ color: z.color }} className="font-semibold">
              {z.label} {formatHours(point.zones[z.key])}
            </span>
          ))}
        </div>
      ) : null}
      {point.rolling7Complete ? (
        <div className="text-gray-400 mt-0.5">Carrying {point.rolling7} TSS over 7 days</div>
      ) : null}
    </div>
  );
}

function Summary({ timeline, view }) {
  if (view === 'balance') {
    if (!timeline.split) {
      return (
        <p className="text-[11px] text-gray-500 mt-2">
          No heart-rate data in this window. Connect a watch, or set your heart-rate zones in Settings,
          and this view fills in.
        </p>
      );
    }
    return (
      <div className="mt-2">
        <div className="flex items-baseline gap-3 text-xs">
          <span><span className="font-bold text-emerald-600">{timeline.split.easyPct}%</span> <span className="text-gray-500">easy (Z1–2)</span></span>
          <span><span className="font-bold text-amber-600">{timeline.split.greyPct}%</span> <span className="text-gray-500">grey (Z3)</span></span>
          <span><span className="font-bold text-rose-600">{timeline.split.hardPct}%</span> <span className="text-gray-500">hard (Z4–5)</span></span>
        </div>
        {timeline.coverage.pct < 90 ? (
          <p className="text-[10px] text-gray-400 mt-1">
            Based on {timeline.coverage.pct}% of recorded time — the rest had no heart-rate data.
          </p>
        ) : null}
      </div>
    );
  }

  if (view === 'plan') {
    if (!timeline.compliance) {
      return <p className="text-[11px] text-gray-500 mt-2">Nothing planned in this window.</p>;
    }
    const c = timeline.compliance;
    return (
      <div className="mt-2 text-xs text-gray-600">
        <span className="font-bold text-gray-900">{c.pct}%</span> of planned load completed
        <span className="text-gray-400"> ({c.actualTss} of {c.plannedTss} TSS)</span>
        {c.missedDays > 0 ? <span className="text-blue-600"> · {c.missedDays} missed</span> : null}
        {c.extraDays > 0 ? <span className="text-orange-600"> · {c.extraDays} unplanned</span> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 text-xs text-gray-600">
      Carrying <span className="font-bold text-gray-900">{timeline.rolling7} TSS</span> over the last 7 days
      {timeline.rolling7Change !== null ? (
        <span className={timeline.rolling7Change >= 0 ? 'text-orange-600' : 'text-blue-600'}>
          {' '}({timeline.rolling7Change >= 0 ? '+' : ''}{timeline.rolling7Change}% vs a week ago)
        </span>
      ) : null}
    </div>
  );
}

export default function TrainingTimeline({
  athleteId = null,
  activities = [],
  plannedWorkouts = [],
  userProfile = null,
  user = null,
  loading = false,
}) {
  const saved = useMemo(readPrefs, []);
  const [view, setView] = useState(saved.view || 'flow');
  const [sportFilter, setSportFilter] = useState(saved.sportFilter || 'all');
  const [days, setDays] = useState(saved.days || 42);
  // Opt-in, off by default — see the file header.
  const [showPlan, setShowPlan] = useState(saved.showPlan === true);
  const [fullscreen, setFullscreen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [zoneDays, setZoneDays] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  useEffect(() => {
    writePrefs({ view, sportFilter, days, showPlan });
  }, [view, sportFilter, days, showPlan]);

  // Zone data is the only part that needs the server, so it is fetched only
  // when the Balance view actually asks for it.
  useEffect(() => {
    if (view !== 'balance' || !athleteId) return undefined;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    let cancelled = false;
    setZonesLoading(true);
    getTimelineZones(athleteId, localCalendarDateKey(start), localCalendarDateKey(end), sportFilter)
      .then((data) => { if (!cancelled) setZoneDays(data?.days || []); })
      .catch(() => { if (!cancelled) setZoneDays([]); })
      .finally(() => { if (!cancelled) setZonesLoading(false); });
    return () => { cancelled = true; };
  }, [view, athleteId, days, sportFilter]);

  const timeline = useMemo(
    () => buildTrainingTimeline({
      activities, plannedWorkouts, zoneDays, userProfile, user, days, sportFilter,
    }),
    [activities, plannedWorkouts, zoneDays, userProfile, user, days, sportFilter],
  );

  const onHover = useCallback((i) => setHovered(i), []);
  const hoveredPoint = hovered !== null ? timeline.points[hovered] : null;

  const body = (
    <div className={fullscreen ? 'p-4 sm:p-6' : ''}>
      {/* View tabs + fullscreen */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex p-0.5 rounded-lg bg-gray-100">
          {TIMELINE_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              title={v.hint}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                view === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFullscreen((f) => !f)}
          className="p-1.5 hover:bg-gray-100 rounded-lg"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
        >
          {fullscreen
            ? <ArrowsPointingInIcon className="w-4 h-4 text-gray-400" />
            : <ArrowsPointingOutIcon className="w-4 h-4 text-gray-400" />}
        </button>
      </div>

      {/* Settings row — its own set in full screen, same controls either way */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <div className="inline-flex gap-1">
          {SPORT_FILTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSportFilter(s.id)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                sportFilter === s.id
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setDays(w.id)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                days === w.id
                  ? 'border-gray-800 bg-gray-800 text-white'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        {view === 'flow' ? (
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPlan}
              onChange={(e) => setShowPlan(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5"
            />
            Overlay plan
          </label>
        ) : null}
      </div>

      {/* Chart */}
      <div className="relative">
        {loading || (view === 'balance' && zonesLoading) ? (
          <div className="animate-pulse bg-gray-100 rounded-lg" style={{ height: CHART_H }} />
        ) : view === 'flow' ? (
          <FlowChart timeline={timeline} showPlan={showPlan} onHover={onHover} hovered={hovered} />
        ) : view === 'balance' ? (
          <BalanceChart timeline={timeline} onHover={onHover} hovered={hovered} />
        ) : (
          <PlanChart timeline={timeline} onHover={onHover} hovered={hovered} />
        )}
      </div>

      {/* Axis — first, today, and the weeks between */}
      <div className="flex justify-between text-[9px] text-gray-400 mt-1">
        <span>{timeline.points[0]?.label}</span>
        <span>{timeline.points[timeline.points.length - 1]?.label}</span>
      </div>

      <Legend view={view} />
      <Summary timeline={timeline} view={view} />
      <HoverDetail point={hoveredPoint} />
    </div>
  );

  if (fullscreen) {
    return ReactDOM.createPortal(
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[60] bg-white overflow-y-auto"
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4">
            <h3 className="text-lg font-bold text-gray-900">Training Timeline</h3>
          </div>
          {body}
        </div>
      </motion.div>,
      document.body,
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-lg">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-base font-bold text-gray-900 whitespace-nowrap">Training Timeline</h3>
        {/* Hidden on phones: at that width it wraps the title onto two lines and
            squeezes itself onto two more, for a sentence the view tabs and the
            summary line underneath already convey. */}
        <span className="hidden sm:flex text-[10px] text-gray-400 items-center gap-1 text-right">
          <InformationCircleIcon className="w-3.5 h-3.5 shrink-0" />
          {TIMELINE_VIEWS.find((v) => v.id === view)?.hint}
        </span>
      </div>
      {body}
    </div>
  );
}
