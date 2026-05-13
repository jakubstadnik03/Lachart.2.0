import React, { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, Activity, Waves, Zap } from "lucide-react";

// ── Sport helpers ─────────────────────────────────────────────────────────────
const normalizeSport = (raw) => {
  const s = String(raw || "").toLowerCase();
  if (["cycling", "bike", "ride", "virtualride", "mountainbikeride", "gravelride", "ebikeride"].includes(s)) return "bike";
  if (["running", "run", "trailrun"].includes(s)) return "run";
  if (["swimming", "swim", "openwatersports"].includes(s)) return "swim";
  return "other";
};

const SPORT_META = {
  bike:  { label: "Bike",  color: "#f97316", Icon: Bike },
  run:   { label: "Run",   color: "#6366f1", Icon: Activity },
  swim:  { label: "Swim",  color: "#06b6d4", Icon: Waves },
  other: { label: "Other", color: "#94a3b8", Icon: Zap },
};

// ── Activity nav helper (same pattern as TrainingTable / TrainingStats) ────────
const getActivityNavId = (a) => {
  if (a.type === "fit"     && a._id)              return `fit-${a._id}`;
  if (a.type === "strava"  && (a.stravaId || a.id)) return `strava-${a.stravaId || a.id}`;
  if (a.type === "regular" && a._id)              return `regular-${a._id}`;
  if (a.stravaId || a.id)                         return `strava-${a.stravaId || a.id}`;
  if (a._id)                                      return `training-${a._id}`;
  return null;
};

// ── Date helpers ──────────────────────────────────────────────────────────────
const toDateKey = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const getActivityDate = (activity) => {
  const raw = activity.date || activity.timestamp || activity.startDate || activity.start_date;
  if (!raw) return null;
  return toDateKey(raw);
};

const fmtDuration = (secs) => {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const fmtDate = (dateKey) => {
  const d = new Date(dateKey + "T12:00:00");
  return d.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
};

// ── Load intensity bucket (0–4) ───────────────────────────────────────────────
const loadBucket = (activities) => {
  if (!activities?.length) return 0;
  const totalLoad = activities.reduce((sum, a) => {
    const tss = a.tss ?? a.totalTSS ?? a.total_tss ?? null;
    if (tss) return sum + Number(tss);
    const secs = a.totalElapsedTime ?? a.totalTimerTime ?? a.movingTime ?? a.elapsedTime ?? 0;
    return sum + secs / 60;
  }, 0);
  if (totalLoad >= 150) return 4;
  if (totalLoad >= 90)  return 3;
  if (totalLoad >= 40)  return 2;
  if (totalLoad >= 5)   return 1;
  return 0;
};

// Hex opacity suffixes for sport colors: [none, 33, 66, aa, ff]
const OPACITY = ["", "33", "66", "aa", "ff"];

const WEEKS = 18;
const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// ── Component ─────────────────────────────────────────────────────────────────
export default function TrainingLoadHeatmap({ calendarData = [], trainings = [] }) {
  const navigate = useNavigate();
  const [popup,   setPopup]   = useState(null); // { key, acts, rect }
  const [tooltip, setTooltip] = useState(null); // { key, acts, x, y }
  const popupRef              = useRef(null);

  // Close popup on outside click
  useEffect(() => {
    if (!popup) return;
    const onDown = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setPopup(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [popup]);

  // Merge all activity sources (deduplicate)
  const allActivities = useMemo(() => {
    const seen = new Set();
    return [...calendarData, ...trainings].filter((a) => {
      const key = a._id || a.stravaId || a.id ||
        JSON.stringify({ d: getActivityDate(a), t: a.title || a.name });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [calendarData, trainings]);

  // date-key → [activities]
  const dayMap = useMemo(() => {
    const map = {};
    allActivities.forEach((a) => {
      const key = getActivityDate(a);
      if (!key) return;
      (map[key] = map[key] || []).push(a);
    });
    return map;
  }, [allActivities]);

  // Build grid: WEEKS columns × 7 rows, newest week rightmost
  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0
    const endOfGrid = new Date(today);
    endOfGrid.setHours(12, 0, 0, 0);
    // Start the grid on the Monday WEEKS-1 weeks ago, so row 0 = Monday and the
    // current week sits in the rightmost column. The previous formula shifted
    // the grid by an extra (7 - dayOfWeek - 1) days, so the row labelled "Su"
    // actually held the next Monday's activities.
    const startOfGrid = new Date(endOfGrid);
    startOfGrid.setDate(endOfGrid.getDate() - dayOfWeek - (WEEKS - 1) * 7);

    const weeks = [];
    const cursor = new Date(startOfGrid);
    const labels = [];
    let lastMonth = -1;

    for (let w = 0; w < WEEKS; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const key = toDateKey(cursor);
        const isFuture = cursor > today;
        days.push({ key, isFuture });
        if (cursor.getMonth() !== lastMonth) {
          labels.push({ month: cursor.toLocaleString("default", { month: "short" }), col: w });
          lastMonth = cursor.getMonth();
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(days);
    }
    return { weeks, monthLabels: labels };
  }, []);

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - WEEKS * 7);

    let totalTrainings = 0, totalSecs = 0;

    Object.entries(dayMap).forEach(([key, acts]) => {
      const d = new Date(key + "T12:00:00");
      if (d < cutoff) return;
      totalTrainings += acts.length;
      acts.forEach((a) => {
        totalSecs += Number(a.totalElapsedTime ?? a.totalTimerTime ?? a.movingTime ?? a.elapsedTime ?? 0) || 0;
      });
    });

    // This week
    const startOfWeek = new Date(now);
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    startOfWeek.setDate(now.getDate() - dow);
    startOfWeek.setHours(0, 0, 0, 0);
    let thisWeek = 0;
    Object.entries(dayMap).forEach(([key, acts]) => {
      if (new Date(key + "T12:00:00") >= startOfWeek) thisWeek += acts.length;
    });

    // Streak
    let streak = 0;
    const check = new Date(now);
    check.setHours(12, 0, 0, 0);
    if (!dayMap[toDateKey(check)]?.length) check.setDate(check.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      if (!dayMap[toDateKey(check)]?.length) break;
      streak++;
      check.setDate(check.getDate() - 1);
    }

    return { totalTrainings, totalHours: totalSecs / 3600, thisWeek, streak };
  }, [dayMap]);

  // Navigate to FitAnalysisPage for a single activity
  const goToActivity = (a) => {
    const navId = getActivityNavId(a);
    if (navId) navigate(`/training-calendar/${encodeURIComponent(navId)}`);
  };

  // Handle day cell click
  const handleDayClick = (key, acts, e) => {
    if (!acts?.length) return;
    if (acts.length === 1) {
      goToActivity(acts[0]);
      return;
    }
    // Multiple activities → show popup
    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({ key, acts, rect });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Training Load</h3>
          <p className="text-xs text-gray-400 mt-0.5">Last {WEEKS} weeks</p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
          <span>Less</span>
          {[0,1,2,3,4].map((b) => (
            <span
              key={b}
              className="w-3 h-3 rounded-sm border border-gray-200"
              style={{ backgroundColor: b === 0 ? "#f3f4f6" : `#6366f1${OPACITY[b]}` }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Trainings", value: stats.totalTrainings, sub: `last ${WEEKS}w` },
          { label: "Hours",     value: stats.totalHours.toFixed(1), sub: `last ${WEEKS}w` },
          { label: "This week", value: stats.thisWeek,      sub: "trainings" },
          { label: "Streak",    value: stats.streak,        sub: stats.streak === 1 ? "day" : "days" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-gray-50 rounded-xl px-3 py-2 text-center">
            <div className="text-base font-bold text-gray-800">{value}</div>
            <div className="text-[10px] font-medium text-gray-500">{label}</div>
            <div className="text-[9px] text-gray-400">{sub}</div>
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {/* Month labels */}
        <div className="flex mb-1 ml-7">
          {weeks.map((_, wi) => {
            const label = monthLabels.find((l) => l.col === wi);
            return (
              <div key={wi} className="flex-1 text-[9px] text-gray-400 font-medium truncate">
                {label ? label.month : ""}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="flex gap-0">
          {/* Day labels */}
          <div className="flex flex-col gap-1 mr-1">
            {DAY_LABELS.map((d, i) => (
              <div key={d} className="h-6 flex items-center text-[9px] text-gray-400 font-medium w-6 leading-none">
                {i % 2 === 0 ? d : ""}
              </div>
            ))}
          </div>

          {/* Week columns */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1 flex-1">
              {week.map(({ key, isFuture }) => {
                const acts    = dayMap[key] || [];
                const bucket  = loadBucket(acts);
                const sport   = acts.length > 0 ? normalizeSport(acts[0].sport) : null;
                const color   = sport ? SPORT_META[sport].color : "#6366f1";
                const hasActs = acts.length > 0 && !isFuture;

                return (
                  <div
                    key={key}
                    onClick={hasActs ? (e) => handleDayClick(key, acts, e) : undefined}
                    onMouseEnter={hasActs ? (e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTooltip({ key, acts, x: r.left + r.width / 2, y: r.top });
                    } : undefined}
                    onMouseLeave={hasActs ? () => setTooltip(null) : undefined}
                    className={`h-6 rounded transition-all relative
                      ${isFuture ? "bg-gray-50 opacity-30" : bucket === 0 ? "bg-gray-100" : ""}
                      ${hasActs ? "cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-primary/40 hover:brightness-110" : "cursor-default"}
                    `}
                    style={hasActs && bucket > 0 ? { backgroundColor: color + OPACITY[bucket] } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Sport legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {Object.entries(SPORT_META).map(([key, meta]) => (
          <div key={key} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: meta.color }} />
            <span className="text-[10px] text-gray-500">{meta.label}</span>
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {tooltip && <HoverTooltip tooltip={tooltip} />}

      {/* Multi-activity popup */}
      {popup && (
        <DayPopup
          ref={popupRef}
          popup={popup}
          onNavigate={goToActivity}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────
function HoverTooltip({ tooltip }) {
  const { key, acts, x, y } = tooltip;

  return (
    <div
      className="fixed z-[99998] pointer-events-none"
      style={{ left: x, top: y - 10, transform: "translate(-50%, -100%)" }}
    >
      <div className="bg-white border border-gray-100 rounded-xl shadow-xl px-3 py-2.5 min-w-[160px] max-w-[220px]">
        <p className="text-[10px] font-semibold text-gray-500 mb-1.5">{fmtDate(key)}</p>
        {acts.map((a, i) => {
          const sport = normalizeSport(a.sport);
          const meta  = SPORT_META[sport];
          const title = a.title || a.name || a.titleManual || a.titleAuto || "Training";
          const secs  = a.totalElapsedTime ?? a.totalTimerTime ?? a.movingTime ?? a.elapsedTime ?? 0;
          const tss   = a.tss ?? a.totalTSS ?? null;
          return (
            <div
              key={i}
              className={`flex items-start gap-1.5 ${i > 0 ? "mt-1.5 pt-1.5 border-t border-gray-100" : ""}`}
            >
              <meta.Icon size={14} className="mt-px shrink-0" style={{ color: meta.color }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 leading-tight truncate">{title}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[10px]" style={{ color: meta.color }}>{meta.label}</span>
                  {secs > 0 && (
                    <>
                      <span className="text-[10px] text-gray-300">·</span>
                      <span className="text-[10px] text-gray-500">{fmtDuration(secs)}</span>
                    </>
                  )}
                  {tss && (
                    <>
                      <span className="text-[10px] text-gray-300">·</span>
                      <span className="text-[10px] text-gray-500">{Math.round(tss)} TSS</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {acts.length === 1 && (
          <p className="text-[9px] text-gray-400 mt-1.5">Click to open</p>
        )}
        {acts.length > 1 && (
          <p className="text-[9px] text-gray-400 mt-1.5">Click to choose activity</p>
        )}
      </div>
      {/* Arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-2 overflow-hidden">
        <div className="w-2 h-2 bg-white border-r border-b border-gray-100 rotate-45 mx-auto -mt-1 shadow-sm" />
      </div>
    </div>
  );
}

// ── Day popup (shown when multiple activities on same day) ────────────────────
const DayPopup = React.forwardRef(function DayPopup({ popup, onNavigate, onClose }, ref) {
  const { key, acts, rect } = popup;

  // Position: try above the cell first, flip below if too close to top
  const spaceAbove = rect.top;
  const above = spaceAbove > 180;
  const left  = Math.min(
    Math.max(8, rect.left + rect.width / 2 - 140),
    window.innerWidth - 288
  );
  const top = above
    ? rect.top + window.scrollY - 8
    : rect.bottom + window.scrollY + 8;

  return (
    <div
      ref={ref}
      className="fixed z-[99999]"
      style={{
        left,
        top,
        transform: above ? "translateY(-100%)" : "translateY(0)",
        width: 280,
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-700 capitalize">{fmtDate(key)}</span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Activity list */}
        <div className="divide-y divide-gray-50">
          {acts.map((a, i) => {
            const sport  = normalizeSport(a.sport);
            const meta   = SPORT_META[sport];
            const title  = a.title || a.name || a.titleManual || a.titleAuto || "Training";
            const secs   = a.totalElapsedTime ?? a.totalTimerTime ?? a.movingTime ?? a.elapsedTime ?? 0;
            const tss    = a.tss ?? a.totalTSS ?? null;
            const navId  = getActivityNavId(a);

            return (
              <button
                key={i}
                onClick={() => { onNavigate(a); onClose(); }}
                disabled={!navId}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left group"
              >
                {/* Sport icon */}
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: meta.color + "20" }}
                >
                  <meta.Icon size={18} style={{ color: meta.color }} />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-primary transition-colors">
                    {title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">{meta.label}</span>
                    {secs > 0 && (
                      <>
                        <span className="text-[10px] text-gray-300">·</span>
                        <span className="text-[10px] text-gray-400">{fmtDuration(secs)}</span>
                      </>
                    )}
                    {tss && (
                      <>
                        <span className="text-[10px] text-gray-300">·</span>
                        <span className="text-[10px] text-gray-400">{Math.round(tss)} TSS</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                {navId && (
                  <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Arrow pointer */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 overflow-hidden ${above ? "bottom-0 translate-y-full rotate-180" : "-top-1.5"}`}
      >
        <div className="w-2 h-2 bg-white border-l border-t border-gray-100 rotate-45 mx-auto mt-1" />
      </div>
    </div>
  );
});
