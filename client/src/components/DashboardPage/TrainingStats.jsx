import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { resolveDistanceUnitSystem } from "../../utils/unitsConverter";
import { getStravaActivityDetail } from "../../services/api";
import { useCategories } from "../../context/CategoryContext";
import { filterWorkResults, getWorkLapMetricValue } from "../../utils/workLapFilter";
import { enrichTrainingsWithCategory, normalizeCategoryKey } from "../../utils/trainingCategory";

const CATEGORY_OPTION_PREFIX = '__category__:';
const PICKER_ALL = "__all__";
const PICKER_LACTATE = "__lactate__";
const PICKER_UNCATEGORIZED = "__uncategorized__";

function trainingKey(t) {
  if (!t) return "";
  return String(t._id || t.id || t.stravaId || `${t.title || "training"}-${t.date || t.timestamp || ""}`);
}

function formatTrainingPickerDate(t) {
  const d = t?.date || t?.startDate || t?.timestamp;
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "2-digit" });
}

/** Matches LapsBarChart / TrainingItem palette exactly. */
const INTERVAL_TYPE_BAR = {
  warmup:   { normal: '#fbbf24', hovered: '#f59e0b' },
  recovery: { normal: '#d1d5db', hovered: '#9ca3af' },
  cooldown: { normal: '#38bdf8', hovered: '#0ea5e9' },
};

/* ── tiny helpers ──────────────────────────────────────────────────────────── */
function axisTickPercent(i, n) {
  return n <= 1 ? 50 : (i / (n - 1)) * 100;
}
/** Pin top/bottom ticks to chart edges so 0 aligns with the bar baseline. */
function axisTickStyle(i, n) {
  if (n <= 1) return { top: "50%", transform: "translateY(-50%)" };
  if (i === 0) return { top: "0%", transform: "translateY(0)" };
  if (i === n - 1) return { top: "100%", transform: "translateY(-100%)" };
  return { top: `${axisTickPercent(i, n)}%`, transform: "translateY(-50%)" };
}
function trainingResultsOf(t) {
  return Array.isArray(t?.results) ? t.results : [];
}
function parsePaceSecs(v) {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const p = v.split(":");
    if (p.length === 2) {
      const m = parseInt(p[0], 10), s = parseInt(p[1], 10);
      if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
    }
    const n = Number(v);
    if (!isNaN(n)) return n;
  }
  return null;
}
function parseDistMeters(d) {
  if (!d) return 0;
  if (typeof d === "number") return d > 100 ? d : d * 1000;
  const s = String(d).trim().toLowerCase();
  const km = s.match(/^([\d.]+)\s*km$/); if (km) return parseFloat(km[1]) * 1000;
  const m  = s.match(/^([\d.]+)\s*m$/);  if (m)  return parseFloat(m[1]);
  const n = parseFloat(s);
  if (!isNaN(n)) return n > 100 && n % 1 === 0 && !s.includes(".") ? n : n * 1000;
  return 0;
}
/** Normalize sport string → 'run' | 'bike' | 'swim' | original lowercase | '' */
function normalizeSport(sport) {
  const s = String(sport || '').toLowerCase();
  if (!s) return '';
  if (s.includes('run') || s.includes('běh') || s.includes('beh')) return 'run';
  if (s.includes('swim') || s.includes('plav')) return 'swim';
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl') || s.includes('kolo')) return 'bike';
  return s;
}

/** Resolve a training's sport with fallbacks (sport → type → activityType → title). */
function resolveTrainingSport(t) {
  if (!t) return '';
  const candidates = [t.sport, t.sport_type, t.activityType, t.type, t.title, t.titleManual, t.name];
  for (const c of candidates) {
    const n = normalizeSport(c);
    if (n === 'run' || n === 'swim' || n === 'bike') return n;
  }
  return '';
}

function parseDurationSecs(r) {
  if (!r || typeof r !== "object") return 0;
  for (const k of ["moving_time","totalTimerTime","total_timer_time","totalElapsedTime","total_elapsed_time","elapsed_time","duration"]) {
    const v = r[k];
    if (v == null) continue;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      if (v.includes(":")) {
        const p = v.split(":").map(Number);
        if (p.length === 2) return p[0]*60+p[1];
        if (p.length === 3) return p[0]*3600+p[1]*60+p[2];
      }
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return 0;
}

/* ── Bar tooltip ───────────────────────────────────────────────────────────── */
function BarTooltip({ barRef, visible, index, power, heartRate, lactate, duration, durationType, distance, sport, user, intervalType = null }) {
  const [pos, setPos] = useState({ top: 0, left: 0, barCenterX: 0 });
  const tooltipRef = useRef(null);
  const unitSystem = resolveDistanceUnitSystem(user, "metric");

  useEffect(() => {
    if (!visible || !barRef.current) return;
    const upd = () => {
      const r = barRef.current?.getBoundingClientRect();
      if (!r) return;
      const TIP_W = 170, GAP = 8, MARGIN = 8;
      const fillEl = barRef.current?.querySelector('[data-bar-fill]');
      const fillRect = fillEl?.getBoundingClientRect();
      const barTop = fillRect?.top ?? r.top;
      const top = barTop - GAP;
      const idealLeft = r.left + r.width / 2;
      const left = Math.max(TIP_W / 2 + MARGIN, Math.min(idealLeft, window.innerWidth - TIP_W / 2 - MARGIN));
      setPos({ top, left, barCenterX: idealLeft });
    };
    upd();
    window.addEventListener("scroll", upd, true);
    window.addEventListener("resize", upd);
    return () => { window.removeEventListener("scroll", upd, true); window.removeEventListener("resize", upd); };
  }, [visible, barRef]);

  if (!visible || !pos.top) return null;

  const fmtDur = (v) => {
    if (!v) return null;
    if (typeof v === "string" && /[km]/i.test(v)) return v;
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, "0")}`;
  };
  const fmtPace = (v) => {
    const s = parsePaceSecs(v);
    if (!s) return null;
    const adj = unitSystem === "imperial" ? s * 1.60934 : s;
    return `${Math.floor(adj / 60)}:${String(Math.round(adj % 60)).padStart(2, "0")}${unitSystem === "imperial" ? "/mi" : "/km"}`;
  };
  const fmtSwimPace = (v) => {
    const s = parsePaceSecs(v);
    if (!s) return null;
    return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}${unitSystem === "imperial" ? "/100yd" : "/100m"}`;
  };
  const fmtDist = (v) => {
    const m = parseDistMeters(v);
    if (!m) return null;
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km`;
  };

  const rows = [
    durationType === "distance" && duration ? { label: "Distance", value: fmtDist(duration) } : null,
    durationType !== "distance" && duration ? { label: "Time",     value: fmtDur(duration)  } : null,
    distance && durationType !== "distance"  ? { label: "Distance", value: fmtDist(distance) } : null,
    sport === "run"                     && power ? { label: "Pace",  value: fmtPace(power)     } : null,
    sport === "swim"                    && power ? { label: "Pace",  value: fmtSwimPace(power) } : null,
    sport !== "run" && sport !== "swim" && power ? { label: "Power", value: `${power} W`       } : null,
    heartRate                 ? { label: "HR",      value: `${heartRate} bpm`  } : null,
    lactate                   ? { label: "Lactate", value: `${lactate} mmol/L`, isLactate: true } : null,
  ].filter(Boolean);

  // Arrow offset: use actual measured tooltip width so the arrow points exactly at the bar center
  const tipW = tooltipRef.current?.offsetWidth || 160;
  const arrowLeft = Math.max(10, Math.min(pos.barCenterX - (pos.left - tipW / 2), tipW - 10));

  const tooltip = (
    <div
      ref={tooltipRef}
      className="pointer-events-none fixed z-[99999]"
      style={{
        top:  `${pos.top}px`,
        left: `${pos.left}px`,
        transform: "translate(-50%, -100%)", // always above
      }}
    >
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-100 overflow-visible"
           style={{ minWidth: 150, maxWidth: 190 }}>

        {/* Arrow pointing down toward the bar top */}
        <div style={{
          position: "absolute", bottom: -7, left: `${arrowLeft}px`,
          width: 0, height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "7px solid white",
          filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.08))",
          transform: "translateX(-50%)",
        }} />

        {/* Header — interval number + (when set) the work/warmup/cooldown/recovery tag */}
        <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-100 flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold text-gray-700 tracking-wide">
            Interval #{index + 1}
          </span>
          {intervalType && (() => {
            const META = {
              warmup:   { label: 'Warm-up',  bg: '#fef3c7', fg: '#92400e' },
              work:     { label: 'Work',     bg: '#ede9fe', fg: '#6d28d9' },
              recovery: { label: 'Recovery', bg: '#f3f4f6', fg: '#4b5563' },
              cooldown: { label: 'Cool-down',bg: '#e0f2fe', fg: '#0369a1' },
            };
            const m = META[String(intervalType).toLowerCase()];
            if (!m) return null;
            return (
              <span
                className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ backgroundColor: m.bg, color: m.fg }}
              >
                {m.label}
              </span>
            );
          })()}
        </div>

        {/* Rows */}
        <div className="px-3 py-2 space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400 whitespace-nowrap">{row.label}</span>
              <span className={`text-[13px] font-semibold whitespace-nowrap ${
                row.isLactate ? "text-orange-500" : "text-gray-800"
              }`}>
                {row.value}
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <span className="text-xs text-gray-400">No data</span>
          )}
        </div>
      </div>
    </div>
  );

  // Render via portal so position: fixed is always relative to the viewport,
  // regardless of any CSS transform on ancestor elements.
  return ReactDOM.createPortal(tooltip, document.body);
}

/* ── VerticalBar ───────────────────────────────────────────────────────────── */
// Violet shades from darkest (rank 0 = highest value) to lightest
const BAR_COLORS = ["#4c1d95","#5b21b6","#6d28d9","#7c3aed","#8b5cf6","#a78bfa","#c4b5fd"];
// Amber/orange shades for bars with lactate data
const BAR_LACTATE_COLORS = ["#92400e","#b45309","#d97706","#f59e0b","#fbbf24","#fcd34d","#fde68a"];

function VerticalBar({ heightPercent, colorIdx, intervalType, power, pace, distance, heartRate, lactate, duration, durationType, index, isHovered, onHover, sport, user = null, widthPercent = null }) {
  const barRef = useRef(null);

  /* intervalType-based color overrides (warmup / recovery / cooldown) */
  let bg;
  if (intervalType && INTERVAL_TYPE_BAR[intervalType]) {
    bg = isHovered ? INTERVAL_TYPE_BAR[intervalType].hovered : INTERVAL_TYPE_BAR[intervalType].normal;
  } else {
    const palette = lactate ? BAR_LACTATE_COLORS : BAR_COLORS;
    bg = palette[Math.min(Math.max(colorIdx, 0), palette.length - 1)];
  }

  const hoverOpacity = (intervalType && INTERVAL_TYPE_BAR[intervalType]) ? 1 : (isHovered ? 1 : 0.75);

  const style = widthPercent != null
    ? { flexBasis: `${Math.max(widthPercent, 0.3)}%`, width: `${Math.max(widthPercent, 0.3)}%`, minWidth: "2px", flexShrink: 1, flexGrow: 0 }
    : { flex: "1 1 0", minWidth: "2px" };

  return (
    <>
      <div
        ref={barRef}
        className="relative h-full shrink-0 cursor-pointer"
        style={style}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onTouchStart={(e) => { e.preventDefault(); onHover(true); }}
        onTouchEnd={() => setTimeout(() => onHover(false), 1800)}
      >
        <div
          data-bar-fill
          className="absolute bottom-0 w-full rounded-t-sm"
          style={{
            height: `${Math.max(heightPercent, 0.8)}%`,
            backgroundColor: bg,
            opacity: hoverOpacity,
            transition: "opacity 0.15s",
          }}
        />
      </div>
      <BarTooltip
        barRef={barRef}
        visible={isHovered}
        index={index}
        intervalType={intervalType}
        power={power}
        heartRate={heartRate}
        lactate={lactate}
        duration={duration}
        durationType={durationType}
        distance={distance}
        sport={sport}
        user={user}
      />
    </>
  );
}

/* ── Y-axis scale ──────────────────────────────────────────────────────────── */
function Scale({ values, formatValue }) {
  return (
    <div className="relative shrink-0 w-9 sm:w-11 text-right h-full min-h-[128px] self-stretch">
      {values.map((v, i) => (
        <div
          key={i}
          className="absolute right-0 left-0 flex items-center justify-end pr-1"
          style={axisTickStyle(i, values.length)}
        >
          <span className="text-[11px] text-gray-400 bg-white pl-0.5 leading-none whitespace-nowrap">
            {formatValue ? formatValue(v) : v}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Training comparison row ───────────────────────────────────────────────── */
function TrainingComparison({ training, trainingResults, previousTraining, previousResults, sport, onTrainingClick, user }) {
  const unitSystem = resolveDistanceUnitSystem(user, "metric");
  const results    = trainingResults ?? trainingResultsOf(training);
  const prevRes    = previousResults ?? trainingResultsOf(previousTraining);

  const normSport = normalizeSport(sport);
  const isRun  = normSport === "run";
  const isSwim = normSport === "swim";
  const workResults  = filterWorkResults(results, sport);
  const workPrevRes  = filterWorkResults(prevRes, sport);

  const avg = (arr, fn) => {
    const vals = arr.map(fn).filter(x => x != null && x > 0);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : 0;
  };

  const lapPower = (r) => getWorkLapMetricValue(r);
  const curPow  = avg(workResults, lapPower);
  const prevPow = avg(workPrevRes, lapPower);
  const curPace  = avg(workResults, r => parsePaceSecs(r.power));
  const prevPace = avg(workPrevRes, r => parsePaceSecs(r.power));

  const fmtPace = (s) => {
    if (!s) return "—";
    const adj = unitSystem === "imperial" ? s * 1.60934 : s;
    return `${Math.floor(adj / 60)}:${String(Math.round(adj % 60)).padStart(2, "0")}${unitSystem === "imperial" ? "/mi" : "/km"}`;
  };
  const fmtSwimPace = (s) => {
    if (!s) return "—";
    return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}${unitSystem === "imperial" ? "/100yd" : "/100m"}`;
  };

  const stravaSpdMs = Number(training.average_speed || training.avgSpeed || 0);
  const swimPaceFromStrava = isSwim && stravaSpdMs > 0 ? Math.round(100 / stravaSpdMs) : 0;
  const metricStr = isRun
    ? fmtPace(curPace || 0)
    : isSwim
      ? fmtSwimPace(curPace || swimPaceFromStrava)
      : `${curPow} W`;

  const isPaceMetric = isRun || isSwim;
  const rawDiff  = isPaceMetric ? (prevPace ? curPace - prevPace : null) : (prevPow ? curPow - prevPow : null);
  const improved = rawDiff == null ? null : isPaceMetric ? rawDiff < 0 : rawDiff > 0;
  const icon     = rawDiff == null || rawDiff === 0 ? null : improved ? "↑" : "↓";
  const iconCls  = improved == null ? "" : improved ? "text-green-500" : "text-red-400";

  return (
    <button
      type="button"
      onClick={() => onTrainingClick?.(training)}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-50 transition-colors"
    >
      <span className="shrink-0 text-[13px] text-gray-400 w-14 tabular-nums">
        {new Date(training.date).toLocaleDateString("en-US", { day: "numeric", month: "numeric", year: "2-digit" })}
      </span>
      <span className="flex-1 min-w-0 text-[13px] text-gray-600 truncate">{training.title}</span>
      <span className="shrink-0 text-[13px] font-semibold text-gray-800 flex items-center gap-0.5">
        {metricStr}
        {icon && <span className={`text-xs ${iconCls}`}>{icon}</span>}
      </span>
    </button>
  );
}

/* ── Category + multi-select session picker ───────────────────────────────── */
function TrainingHistoryPicker({
  categories = [],
  categoryCounts = {},
  trainings = [],
  selectedCategoryId,
  onCategoryChange,
  selectedKeys = [],
  onSelectionChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 320 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  const DROPDOWN_W = 320;
  const MARGIN = 8;

  useEffect(() => {
    if (!open) return;
    const onMouse = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    };
    const onScroll = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const dropW = Math.max(r.width, DROPDOWN_W);
    const wouldOverflowRight = r.left + dropW > window.innerWidth - MARGIN;
    let left = wouldOverflowRight
      ? r.right + window.scrollX - dropW
      : r.left + window.scrollX;
    setDropPos({
      top: r.bottom + window.scrollY + 4,
      left: Math.max(MARGIN + window.scrollX, left),
      width: dropW,
    });
  }, [open]);

  const categoryOptions = useMemo(() => {
    const opts = [{ id: PICKER_ALL, label: "All sessions", color: "#6b7280", count: categoryCounts[PICKER_ALL] }];
    categories.forEach((c) => {
      opts.push({ id: c.id, label: c.label, color: c.color, count: categoryCounts[c.id] || 0 });
    });
    if (categoryCounts[PICKER_LACTATE] > 0) {
      opts.push({ id: PICKER_LACTATE, label: "Lactate tested", color: "#f97316", count: categoryCounts[PICKER_LACTATE] });
    }
    if (categoryCounts[PICKER_UNCATEGORIZED] > 0) {
      opts.push({ id: PICKER_UNCATEGORIZED, label: "Uncategorized", color: "#9ca3af", count: categoryCounts[PICKER_UNCATEGORIZED] });
    }
    return opts;
  }, [categories, categoryCounts]);

  const activeCategory = categoryOptions.find(c => c.id === selectedCategoryId) || categoryOptions[0];

  const pickerTrainings = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trainings;
    return trainings.filter(t =>
      String(t.title || "").toLowerCase().includes(q) ||
      formatTrainingPickerDate(t).toLowerCase().includes(q)
    );
  }, [trainings, query]);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const allVisibleSelected = pickerTrainings.length > 0
    && pickerTrainings.every(t => selectedSet.has(trainingKey(t)));
  const someSelected = selectedKeys.length > 0;

  const toggleKey = (key) => {
    if (selectedSet.has(key)) {
      onSelectionChange(selectedKeys.filter(k => k !== key));
    } else {
      onSelectionChange([...selectedKeys, key]);
    }
  };

  const selectAllVisible = () => {
    const merged = new Set(selectedKeys);
    pickerTrainings.forEach(t => merged.add(trainingKey(t)));
    onSelectionChange([...merged]);
  };

  const buttonLabel = someSelected
    ? `${activeCategory?.label || "Sessions"} · ${selectedKeys.length}`
    : (activeCategory?.label || "Select sessions");

  const dropdown = open ? ReactDOM.createPortal(
    <div
      ref={panelRef}
      className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ position: "absolute", top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 99999 }}
    >
      <div className="p-2.5 border-b border-gray-100 bg-gray-50/80">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Category</p>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {categoryOptions.map((c) => {
            const active = c.id === selectedCategoryId;
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onCategoryChange(c.id)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                  active
                    ? "bg-white border-gray-300 text-gray-900 shadow-sm"
                    : "bg-white/60 border-transparent text-gray-600 hover:bg-white hover:border-gray-200"
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="truncate max-w-[120px]">{c.label}</span>
                {c.count != null && (
                  <span className="text-[10px] text-gray-400 tabular-nums">{c.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-2 border-b border-gray-100 flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions…"
          className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-violet-400/30 placeholder-gray-400"
        />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={selectAllVisible}
          className="text-[11px] font-medium text-violet-600 hover:text-violet-800 whitespace-nowrap">All</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onSelectionChange([])}
          className="text-[11px] font-medium text-gray-400 hover:text-gray-600 whitespace-nowrap">Clear</button>
      </div>

      <div className="px-2.5 py-1.5 text-[10px] text-gray-400 border-b border-gray-50 flex justify-between">
        <span>{pickerTrainings.length} in category</span>
        <span className="tabular-nums">{selectedKeys.length} selected</span>
      </div>

      <div className="overflow-y-auto max-h-56 py-1">
        {pickerTrainings.length === 0 ? (
          <div className="px-3 py-6 text-xs text-gray-400 text-center">No sessions in this category</div>
        ) : pickerTrainings.map((t) => {
          const key = trainingKey(t);
          const checked = selectedSet.has(key);
          return (
            <label
              key={key}
              className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                checked ? "bg-violet-50/80" : "hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleKey(key)}
                className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-400"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-gray-800 truncate">{t.title || "Untitled"}</span>
                <span className="block text-[10px] text-gray-400 mt-0.5 tabular-nums">
                  {formatTrainingPickerDate(t)}
                  {t.sport ? ` · ${t.sport}` : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {trainings.length > 0 && (
        <div className="p-2 border-t border-gray-100 bg-gray-50/50 flex justify-end">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!allVisibleSelected) selectAllVisible();
              setOpen(false);
            }}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
          >
            {someSelected ? "Done" : "Select all & close"}
          </button>
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 max-w-[220px] transition-colors"
      >
        {activeCategory?.color && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeCategory.color }} />
        )}
        <span className="truncate">{buttonLabel}</span>
        {someSelected && (
          <span className="shrink-0 text-[10px] font-semibold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-full tabular-nums">
            {selectedKeys.length}
          </span>
        )}
        <svg className="w-3 h-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────────── */
export function TrainingStats({
  trainings, selectedSport, onSportChange,
  selectedTitle, setSelectedTitle,
  selectedTrainingId, setSelectedTrainingId,
  isFullWidth = false, user = null,
  // Coach viewing another athlete: pass the athlete's id so the Strava
  // detail endpoint resolves their token, not the coach's.
  integrationAthleteId = null,
  /** Full trainings list (incl. Strava/FIT) — used to inherit calendar category tags. */
  categoryCatalog = null,
}) {
  const navigate   = useNavigate();
  const unitSystem = resolveDistanceUnitSystem(user, "metric");
  const { categories } = useCategories();

  const trainingsList = useMemo(
    () => enrichTrainingsWithCategory(
      Array.isArray(trainings) ? trainings : [],
      categoryCatalog || trainings
    ),
    [trainings, categoryCatalog]
  );

  const availableSports = [...new Set(trainingsList.map(t => t.sport))].filter(Boolean);

  const [internalSelectedSport, setInternalSelectedSport] = useState(() => {
    if (selectedSport != null) return selectedSport;
    return localStorage.getItem("trainingStats_selectedSport") || "all";
  });
  const currentSelectedSport = selectedSport != null ? selectedSport : internalSelectedSport;

  const handleSportChange = (sport) => {
    if (selectedSport == null) {
      localStorage.setItem("trainingStats_selectedSport", sport);
      setInternalSelectedSport(sport);
    }
    onSportChange?.(sport);
  };

  const [, setInternalSelectedTitle] = useState(null);
  const setCurrentSelectedTitle = setSelectedTitle || setInternalSelectedTitle;

  const [pickerCategoryId, setPickerCategoryId] = useState(() => {
    try { return localStorage.getItem("trainingStats_category") || PICKER_ALL; } catch { return PICKER_ALL; }
  });
  const [selectedTrainingKeys, setSelectedTrainingKeys] = useState(null);
  const categorySelectionRef = useRef({ categoryId: null, sport: null });

  useEffect(() => {
    try { localStorage.setItem("trainingStats_category", pickerCategoryId); } catch {}
  }, [pickerCategoryId]);

  const [hoveredBar,          setHoveredBar]          = useState(null);
  const [visibleTrainingIndex, setVisibleTrainingIndex] = useState(0);
  const [isSettingsOpen,      setIsSettingsOpen]      = useState(false);
  const [displayCount,        setDisplayCount]        = useState(() => window.innerWidth < 768 ? 3 : 6);
  const [hideWarmCool,        setHideWarmCool]        = useState(() => {
    try { return localStorage.getItem('trainingStats_hideWarmCool') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('trainingStats_hideWarmCool', hideWarmCool ? '1' : '0'); } catch {}
  }, [hideWarmCool]);
  const [progressIndex,       setProgressIndex]       = useState(0);

  const settingsRef  = useRef(null);
  const containerRef = useRef(null);
  const chartBarsRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  /* close settings on outside click */
  useEffect(() => {
    const h = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setIsSettingsOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const LACTATE_OPTION = '__lactate__';
  const hasLactateValue = useCallback((t) => {
    if (!t) return false;
    if (t.lactate != null && Number(t.lactate) > 0) return true;
    if (Array.isArray(t.results)) {
      if (t.results.some(r => r && (r.lactate != null || r.mmol != null))) return true;
    }
    if (Array.isArray(t.laps)) {
      if (t.laps.some(l => l && (l.lactate != null || l.lactateValue != null))) return true;
    }
    return false;
  }, []);

  const sportFilteredTrainings = useMemo(() => {
    return trainingsList.filter(t =>
      currentSelectedSport === "all" || normalizeSport(t.sport) === normalizeSport(currentSelectedSport)
    );
  }, [trainingsList, currentSelectedSport]);

  const categoryCounts = useMemo(() => {
    const counts = { [PICKER_ALL]: sportFilteredTrainings.length };
    sportFilteredTrainings.forEach(t => {
      const cat = normalizeCategoryKey(t.category);
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
      else counts[PICKER_UNCATEGORIZED] = (counts[PICKER_UNCATEGORIZED] || 0) + 1;
    });
    const lactateN = sportFilteredTrainings.filter(hasLactateValue).length;
    if (lactateN > 0) counts[PICKER_LACTATE] = lactateN;
    return counts;
  }, [sportFilteredTrainings, hasLactateValue]);

  const categoryPool = useMemo(() => {
    const sportOk = (t) => currentSelectedSport === "all" || normalizeSport(t.sport) === normalizeSport(currentSelectedSport);
    let list;
    if (pickerCategoryId === PICKER_LACTATE) {
      list = trainingsList.filter(t => sportOk(t) && hasLactateValue(t));
    } else if (pickerCategoryId === PICKER_UNCATEGORIZED) {
      list = trainingsList.filter(t => sportOk(t) && !normalizeCategoryKey(t.category));
    } else if (pickerCategoryId === PICKER_ALL) {
      list = trainingsList.filter(sportOk);
    } else {
      list = trainingsList.filter(t => sportOk(t) && normalizeCategoryKey(t.category) === pickerCategoryId);
    }
    return list.sort((a, b) => new Date(b.date || b.startDate || 0) - new Date(a.date || a.startDate || 0));
  }, [trainingsList, currentSelectedSport, pickerCategoryId, hasLactateValue]);

  /* Default: only the newest session in the pool. */
  useEffect(() => {
    if (categoryPool.length === 0) return;
    const prev = categorySelectionRef.current;
    const filterChanged = prev.categoryId !== pickerCategoryId || prev.sport !== currentSelectedSport;
    if (!filterChanged && selectedTrainingKeys !== null) return;

    categorySelectionRef.current = { categoryId: pickerCategoryId, sport: currentSelectedSport };
    const newest = categoryPool[0];
    const keys = newest ? [trainingKey(newest)] : [];
    setSelectedTrainingKeys(keys);
    setVisibleTrainingIndex(0);
    setProgressIndex(0);
    if (newest) {
      if (newest.title) setCurrentSelectedTitle(newest.title);
      if (setSelectedTrainingId) setSelectedTrainingId(newest._id || newest.id || newest.stravaId || null);
    }
  }, [pickerCategoryId, currentSelectedSport, categoryPool, selectedTrainingKeys, setSelectedTrainingId, setCurrentSelectedTitle]);

  const filteredTrainings = useMemo(() => {
    const keys = selectedTrainingKeys === null
      ? (categoryPool[0] ? [trainingKey(categoryPool[0])] : [])
      : selectedTrainingKeys;
    if (!keys.length) return [];
    const selected = new Set(keys);
    return categoryPool.filter(t => selected.has(trainingKey(t)));
  }, [categoryPool, selectedTrainingKeys]);

  const effectiveSelectedKeys = selectedTrainingKeys === null
    ? (categoryPool[0] ? [trainingKey(categoryPool[0])] : [])
    : selectedTrainingKeys;

  const handleCategoryChange = (catId) => {
    setPickerCategoryId(catId);
    if (catId === PICKER_LACTATE) {
      setCurrentSelectedTitle(LACTATE_OPTION);
    } else if (catId !== PICKER_ALL) {
      setCurrentSelectedTitle(`${CATEGORY_OPTION_PREFIX}${catId}`);
    }
  };

  const handleSelectionChange = (keys) => {
    setSelectedTrainingKeys(keys);
    setVisibleTrainingIndex(0);
    setProgressIndex(0);
    if (keys.length === 1) {
      const t = categoryPool.find(x => trainingKey(x) === keys[0]);
      if (t?.title) {
        setCurrentSelectedTitle(t.title);
        if (setSelectedTrainingId) setSelectedTrainingId(t._id || t.id || t.stravaId || null);
      }
    }
  };

  // Lazy-fetch Strava laps for filtered trainings that have no results
  const [stravaLapsCache, setStravaLapsCache] = useState({}); // { stravaId: [...results] }

  const stravaLapToResult = useCallback((lap, sport) => {
    const s = String(sport || '').toLowerCase();
    const isRun  = s === 'run' || s === 'running';
    const isSwim = s === 'swim' || s === 'swimming';
    let power = null;
    const speedMps = lap.average_speed ?? 0;
    if (isRun  && speedMps > 0) power = Math.round(1000  / speedMps);
    else if (isSwim && speedMps > 0) power = Math.round(100 / speedMps);
    else power = lap.average_watts ?? lap.watts ?? null;
    return {
      power,
      heartRate: lap.average_heartrate ?? null,
      distance: lap.distance ?? null,
      durationSeconds: lap.elapsed_time ?? lap.moving_time ?? null,
      moving_time: lap.moving_time ?? null,
      intervalType: null,
    };
  }, []);

  useEffect(() => {
    const stravaNeeded = filteredTrainings.filter(t => {
      // Strava activities from /api/integrations/activities have source='strava';
      // t.type holds the sport (Ride/Swim/Run), so checking it was a no-op.
      const isStrava = t.source === 'strava' || t.type === 'strava' || !!t.stravaId
                       || String(t.id || '').startsWith('strava-');
      if (!isStrava) return false;
      if (Array.isArray(t.results) && t.results.length > 0) return false;
      const rawId = String(t.stravaId || t.id || '').replace(/^strava-/, '');
      if (!rawId) return false;
      return !(rawId in stravaLapsCache);
    });
    if (!stravaNeeded.length) return;
    let cancelled = false;
    stravaNeeded.forEach(t => {
      const rawId = String(t.stravaId || t.id || '').replace(/^strava-/, '');
      getStravaActivityDetail(rawId, integrationAthleteId).then(raw => {
        if (cancelled) return;
        const laps = raw?.laps ?? [];
        const results = laps.map(lap => stravaLapToResult(lap, t.sport));
        setStravaLapsCache(prev => ({ ...prev, [rawId]: results }));
      }).catch(() => {
        if (!cancelled) setStravaLapsCache(prev => ({ ...prev, [rawId]: [] }));
      });
    });
    return () => { cancelled = true; };
  }, [filteredTrainings, stravaLapsCache, stravaLapToResult, integrationAthleteId]);

  // Enrich a training's results with fetched Strava laps when needed.
  // When "Hide warm-up & cool-down" is on, drop explicit warmup/recovery/
  // cooldown intervals AND apply a first/last-lap heuristic for raw Strava
  // laps (which have no intervalType field), so the bar chart focuses on
  // the work portion of the session.
  const filterWarmCool = useCallback((arr) => {
    if (!hideWarmCool || !Array.isArray(arr) || arr.length === 0) return arr;
    const total = arr.length;
    const filtered = arr.filter((r, i) => {
      const t = String(r?.intervalType || '').toLowerCase();
      if (t === 'warmup' || t === 'cooldown' || t === 'recovery') return false;
      if (r?.isRecovery === true) return false;
      // Heuristic for laps lacking intervalType: drop first + last of 3+-lap sessions.
      const anyTyped = arr.some(x => x && x.intervalType);
      if (!anyTyped && total >= 3 && (i === 0 || i === total - 1)) return false;
      return true;
    });
    // Don't return an empty array — keep originals so the chart doesn't blank.
    return filtered.length > 0 ? filtered : arr;
  }, [hideWarmCool]);

  const getResults = useCallback((t) => {
    if (Array.isArray(t?.results) && t.results.length > 0) return filterWarmCool(t.results);
    const isStrava = t?.source === 'strava' || t?.type === 'strava' || !!t?.stravaId
                     || String(t?.id || '').startsWith('strava-');
    if (isStrava) {
      const rawId = String(t.stravaId || t.id || '').replace(/^strava-/, '');
      if (rawId && stravaLapsCache[rawId]) return filterWarmCool(stravaLapsCache[rawId]);
    }
    return [];
  }, [stravaLapsCache, filterWarmCool]);

  const getWorkResults = useCallback((t) => {
    const sport = resolveTrainingSport(t) || normalizeSport(currentSelectedSport) || 'bike';
    return filterWorkResults(getResults(t), sport);
  }, [getResults, currentSelectedSport]);

  useEffect(() => { setProgressIndex(0); }, [filteredTrainings.length, pickerCategoryId, effectiveSelectedKeys.length]);

  const visibleTrainings = useMemo(
    () => filteredTrainings.slice(visibleTrainingIndex, visibleTrainingIndex + displayCount),
    [filteredTrainings, visibleTrainingIndex, displayCount]
  );

  /* measure chart container width */
  useEffect(() => {
    const upd = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };
    upd();
    const el = containerRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(upd) : null;
    ro?.observe(el);
    window.addEventListener("resize", upd);
    return () => {
      window.removeEventListener("resize", upd);
      if (el) ro?.unobserve(el);
    };
  }, [visibleTrainings.length, filteredTrainings.length, visibleTrainingIndex, displayCount]);

  /* navigation */
  const canLeft  = visibleTrainingIndex > 0;
  const canRight = visibleTrainingIndex + displayCount < filteredTrainings.length;
  const canProgL = progressIndex > 0;
  const canProgR = progressIndex + 2 < filteredTrainings.length;

  /* scale values — decide pace vs power from the *filtered* trainings.
     The sport dropdown may say "bike" while the title filter pulls a run
     (e.g. selectedSport='bike' but selectedTitle='Ranní běh'), so trust the
     actual sport of the trainings being charted. */
  const sportCounts = filteredTrainings.reduce((acc, t) => {
    const s = resolveTrainingSport(t);
    if (s) acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const normSelectedSport = normalizeSport(currentSelectedSport);
  // Use the dominant sport of the filtered set; fall back to the dropdown.
  const dominantSport = Object.entries(sportCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || normSelectedSport;
  const isRun  = dominantSport === "run";
  const isSwim = dominantSport === "swim";
  const isPaceSport = isRun || isSwim;

  const formatPaceVal = (s) => {
    const adj = unitSystem === "imperial" ? s * 1.60934 : s;
    return `${Math.floor(adj / 60)}:${String(Math.round(adj % 60)).padStart(2, "0")}`;
  };

  const { powerValues, paceValues, minPower, maxPower, minPace, maxPace } = useMemo(() => {
    if (!filteredTrainings.length) return { powerValues:[], paceValues:[], minPower:0, maxPower:100, minPace:0, maxPace:600 };

    if (isPaceSport) {
      const allPaces = filteredTrainings.flatMap(t =>
        getResults(t).map(r => parsePaceSecs(r.power))
      ).filter(p => p != null && p > 0);
      const rawMin = allPaces.length ? Math.min(...allPaces) : 180;
      const rawMax = allPaces.length ? Math.max(...allPaces) : 600;
      const minP = Math.floor(rawMin / 30) * 30;
      const maxP = Math.ceil((rawMax + 30) / 30) * 30;
      return {
        powerValues: [],
        paceValues: Array.from({ length: 6 }, (_, i) => Math.round(minP + (i * (maxP - minP)) / 5)),
        minPower: 0, maxPower: 100, minPace: minP, maxPace: maxP,
      };
    } else {
      const allPowers = filteredTrainings.flatMap(t =>
        getResults(t).map(r => { const p = Number(r.power); return !isNaN(p) && p > 0 ? p : null; })
      ).filter(Boolean);
      const rawMin = allPowers.length ? Math.min(...allPowers) : 0;
      const rawMax = allPowers.length ? Math.max(...allPowers) : 100;
      const minP = Math.max(0, Math.floor((rawMin - 50) / 10) * 10);
      const maxP = Math.ceil((rawMax + 15) / 10) * 10;
      return {
        powerValues: Array.from({ length: 6 }, (_, i) => Math.round(minP + (i * (maxP - minP)) / 5)).reverse(),
        paceValues: [],
        minPower: minP, maxPower: maxP, minPace: 0, maxPace: 600,
      };
    }
  }, [filteredTrainings, isPaceSport, getResults]);

  /* per-column width in px */
  const colCount         = Math.max(visibleTrainings.length, 1);
  const chartInnerPx     = containerWidth > 0 ? containerWidth : 320;
  const perColPx         = Math.max(36, chartInnerPx / colCount - (colCount > 1 ? 6 : 0));

  /* navigate to training detail */
  const handleTrainingClick = (t) => {
    if (t.type === "fit" && t._id)               return navigate(`/training-calendar/${encodeURIComponent(`fit-${t._id}`)}`);
    if (t.type === "strava" && (t.stravaId||t.id)) return navigate(`/training-calendar/${encodeURIComponent(`strava-${t.stravaId||t.id}`)}`);
    if (t.type === "regular" && t._id)           return navigate(`/training-calendar/${encodeURIComponent(`regular-${t._id}`)}`);
    if (t.stravaId || t.id)                      return navigate(`/training-calendar/${encodeURIComponent(`strava-${t.stravaId||t.id}`)}`);
    if (t._id)                                   return navigate(`/training-calendar/${encodeURIComponent(`training-${t._id}`)}`);
  };

  /* ── render ── */
  return (
    <div className="flex flex-col h-full min-h-[280px] sm:min-h-[300px] p-4 sm:p-4 bg-white rounded-2xl shadow-sm border border-gray-100 gap-3">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 leading-none">
            Training History
          </h2>
          {filteredTrainings.length > 0 && (
            <span className="text-[13px] text-gray-400 font-normal">({filteredTrainings.length})</span>
          )}
          {/* chart navigation */}
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => canLeft && setVisibleTrainingIndex(i => Math.max(0, i-1))} disabled={!canLeft}
              className={`p-1 rounded-full transition-colors ${canLeft ? "hover:bg-gray-100 text-gray-600" : "text-gray-300 cursor-not-allowed"}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button onClick={() => canRight && setVisibleTrainingIndex(i => i+1)} disabled={!canRight}
              className={`p-1 rounded-full transition-colors ${canRight ? "hover:bg-gray-100 text-gray-600" : "text-gray-300 cursor-not-allowed"}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TrainingHistoryPicker
            categories={categories}
            categoryCounts={categoryCounts}
            trainings={categoryPool}
            selectedCategoryId={pickerCategoryId}
            onCategoryChange={handleCategoryChange}
            selectedKeys={effectiveSelectedKeys}
            onSelectionChange={handleSelectionChange}
          />
          {/* settings gear */}
          <div className="relative" ref={settingsRef}>
            <button onClick={() => setIsSettingsOpen(o => !o)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
              <EllipsisVerticalIcon className="w-4 h-4 text-gray-500" />
            </button>
            {isSettingsOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 z-50 p-3 flex flex-col gap-3">
                <div>
                  <label className="block text-[13px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Sport</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                    value={currentSelectedSport || "all"}
                    onChange={e => handleSportChange(e.target.value)}
                  >
                    <option value="all">All Sports</option>
                    {availableSports.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-500 mb-1 uppercase tracking-wide">Visible</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                    value={displayCount}
                    onChange={e => { setDisplayCount(Number(e.target.value)); setVisibleTrainingIndex(0); }}
                  >
                    {[1,3,6,9,12].map(n => <option key={n} value={n}>{n} training{n!==1?"s":""}</option>)}
                  </select>
                </div>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideWarmCool}
                    onChange={(e) => setHideWarmCool(e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-violet-500 focus:ring-violet-400"
                  />
                  <span className="text-[13px] text-gray-700 leading-tight">
                    Hide warm-up &amp; cool-down
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      {filteredTrainings.length === 0 ? (
        <div className="flex flex-1 min-h-[120px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 text-center">
          <p className="text-sm text-gray-400">
            {categoryPool.length === 0
              ? "No sessions in this category"
              : "Select one or more sessions in the picker above"}
          </p>
        </div>
      ) : (
      <div className="flex flex-1 min-h-0 flex-col gap-0 w-full min-w-0">
        <div className="flex flex-1 min-h-0 gap-1 sm:gap-2 items-stretch w-full min-w-0">
        <Scale
          values={isPaceSport ? paceValues : powerValues}
          formatValue={isPaceSport ? formatPaceVal : null}
        />

        <div ref={containerRef} className="relative flex flex-1 min-w-0 min-h-0 flex-col" style={{ overflow: "visible" }}>
          <div ref={chartBarsRef} className="relative flex-1 min-h-[128px] min-w-0">
          <div className="pointer-events-none absolute left-0 right-0 top-0 bottom-0 z-0">
            {(isPaceSport ? paceValues : powerValues).map((_, i, arr) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-gray-100"
                style={axisTickStyle(i, arr.length)}
              />
            ))}
          </div>

          {/* bar columns — full chart height; dates live in the row below */}
          <div
            className="relative z-10 flex h-full w-full items-stretch gap-1 sm:gap-1.5"
            style={{ overflow: "visible" }}
          >
            {visibleTrainings.map((training, tIdx) => {
              const results = getResults(training);

              /* compute proportional widths for intervals within column */
              const hasDistData = results.some(r => {
                const d = r.distance || (r.durationType === "distance" ? r.duration : null);
                return d && parseDistMeters(d) > 0;
              });
              const totalDist = results.reduce((s, r) => {
                const d = r.distance || (r.durationType === "distance" ? r.duration : null);
                return s + parseDistMeters(d);
              }, 0);
              const totalDur = results.reduce((s, r) => s + parseDurationSecs(r), 0);
              const useDist  = hasDistData && totalDist > 0;
              const totalVal = useDist ? totalDist : totalDur;

              const gapPx    = 3;
              const gapCnt   = Math.max(0, results.length - 1);
              const gapPct   = perColPx > 0 && gapCnt > 0 ? Math.min(35, (gapCnt * gapPx / perColPx) * 100) : 0;
              const availPct = Math.max(55, 100 - gapPct);
              const equalShare = availPct / Math.max(results.length, 1);

              const intervalWidths = results.map(r => {
                const d  = r.distance || (r.durationType === "distance" ? r.duration : null);
                const val = useDist ? parseDistMeters(d) : parseDurationSecs(r);
                return totalVal > 0 ? (val / totalVal) * availPct : equalShare;
              });

              /* color ranking: highest power/pace = darkest */
              const powerPaceVals = results.map((r, i) => ({
                val: isPaceSport ? parsePaceSecs(r.power) : Number(r.power),
                i,
              })).filter(x => x.val != null && x.val > 0);
              if (isPaceSport) powerPaceVals.sort((a,b) => a.val - b.val); // lowest pace = fastest = darkest
              else             powerPaceVals.sort((a,b) => b.val - a.val); // highest power = darkest
              const colorMap = new Map(powerPaceVals.map((x, rank) => [x.i, rank]));

              return (
                <div key={training._id || tIdx} className="flex flex-1 basis-0 min-w-0 h-full items-end overflow-visible">
                  <div
                    className="relative flex h-full w-full min-w-0 items-end overflow-visible"
                    style={{ gap: `${gapPx}px` }}
                  >
                    {results.map((r, rIdx) => {
                      let heightPercent = 0;
                      const denom = isPaceSport ? (maxPace - minPace) : (maxPower - minPower);
                      if (denom > 0) {
                        if (isPaceSport) {
                          const pace = parsePaceSecs(r.power);
                          if (pace && pace > 0) heightPercent = ((maxPace - pace) / denom) * 100;
                        } else {
                          const pow = Number(r.power);
                          if (!isNaN(pow) && pow > 0) heightPercent = ((pow - minPower) / denom) * 100;
                        }
                      }

                      return (
                        <VerticalBar
                          key={`${training._id||tIdx}-${rIdx}`}
                          heightPercent={heightPercent}
                          colorIdx={colorMap.get(rIdx) ?? rIdx}
                          intervalType={r.intervalType || null}
                          power={r.power}
                          pace={isPaceSport ? r.power : r.pace}
                          distance={r.distance || (isPaceSport && r.durationType === "distance" ? r.duration : null)}
                          lactate={r.lactate}
                          heartRate={r.heartRate}
                          duration={r.duration}
                          durationType={r.durationType || "time"}
                          index={rIdx}
                          isHovered={hoveredBar?.tIdx === tIdx && hoveredBar?.rIdx === rIdx}
                          onHover={h => setHoveredBar(h ? { tIdx, rIdx } : null)}
                          sport={resolveTrainingSport(training) || normalizeSport(currentSelectedSport) || "bike"}
                          user={user}
                          widthPercent={intervalWidths[rIdx]}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
        </div>

        {/* Date labels — below chart so Y-axis 0 lines up with bar baseline */}
        <div className="flex gap-1 sm:gap-2 w-full min-w-0 pl-9 sm:pl-11 shrink-0">
          {visibleTrainings.map((training, tIdx) => (
            <div
              key={`date-${training._id || tIdx}`}
              className="flex-1 basis-0 min-w-0 text-center text-xs text-gray-400 tabular-nums leading-tight"
            >
              {new Date(training.date).toLocaleDateString("en-US", { day: "numeric", month: "numeric", year: "2-digit" })}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Training Progress */}
      {filteredTrainings.length > 0 && (
        <div className="mt-auto shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-700">
              Progress
              {filteredTrainings.length > 2 && (
                <span className="ml-1.5 text-[13px] font-normal text-gray-400">
                  {progressIndex + 1}–{Math.min(progressIndex + 2, filteredTrainings.length)} of {filteredTrainings.length}
                </span>
              )}
            </span>
            {filteredTrainings.length > 2 && (
              <div className="flex items-center gap-0.5">
                <button onClick={() => canProgL && setProgressIndex(i => Math.max(0,i-2))} disabled={!canProgL}
                  className={`p-1 rounded transition-colors ${canProgL ? "hover:bg-gray-100 text-gray-500" : "text-gray-300 cursor-not-allowed"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button onClick={() => canProgR && setProgressIndex(i => Math.min(filteredTrainings.length-2,i+2))} disabled={!canProgR}
                  className={`p-1 rounded transition-colors ${canProgR ? "hover:bg-gray-100 text-gray-500" : "text-gray-300 cursor-not-allowed"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {filteredTrainings.slice(progressIndex, progressIndex + 2).map((t, i) => (
              <TrainingComparison
                key={t._id || t.id || i}
                training={t}
                trainingResults={getWorkResults(t)}
                previousTraining={filteredTrainings[progressIndex + i + 1] ?? null}
                previousResults={getWorkResults(filteredTrainings[progressIndex + i + 1] ?? null)}
                sport={resolveTrainingSport(t) || normalizeSport(currentSelectedSport) || "bike"}
                onTrainingClick={handleTrainingClick}
                user={user}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrainingStats;
