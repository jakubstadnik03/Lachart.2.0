import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { formatSpeedForUser, resolveDistanceUnitSystem } from "../../utils/unitsConverter";
import { SearchableSelect } from "../SearchableSelect";
import { getStravaActivityDetail } from "../../services/api";
import { useCategories } from "../../context/CategoryContext";

const CATEGORY_OPTION_PREFIX = '__category__:';

/** Matches LapsBarChart / TrainingItem palette exactly. */
const INTERVAL_TYPE_BAR = {
  warmup:   { normal: '#fbbf24', hovered: '#f59e0b' },
  recovery: { normal: '#d1d5db', hovered: '#9ca3af' },
  cooldown: { normal: '#38bdf8', hovered: '#0ea5e9' },
};

/** Return only work intervals (or all if no types set).
 *  Treats explicit warmup / recovery / cooldown as non-work; untagged
 *  entries are kept when at least one tag exists so partially-annotated
 *  sessions still produce a sane average. */
function workOnly(results) {
  if (!results || results.length === 0) return [];
  const hasTypes = results.some(r => r && r.intervalType);
  if (!hasTypes) return results;
  const filtered = results.filter(r => {
    const t = r && r.intervalType;
    return t !== 'warmup' && t !== 'recovery' && t !== 'cooldown';
  });
  return filtered.length > 0 ? filtered : results;
}

const GRAPH_H = 120;

/* ── tiny helpers ──────────────────────────────────────────────────────────── */
function axisTickY(i, n, h = GRAPH_H) {
  return n <= 1 ? h / 2 : (i / (n - 1)) * h;
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
function BarTooltip({ barRef, barHeight, visible, index, power, heartRate, lactate, duration, durationType, distance, sport, user, intervalType = null }) {
  const [pos, setPos] = useState({ top: 0, left: 0, barCenterX: 0 });
  const tooltipRef = useRef(null);
  const unitSystem = resolveDistanceUnitSystem(user, "metric");

  useEffect(() => {
    if (!visible || !barRef.current) return;
    const upd = () => {
      const r = barRef.current?.getBoundingClientRect();
      if (!r) return;
      const TIP_W = 170, GAP = 8, MARGIN = 8;
      // bar is bottom-aligned inside the column container → compute its actual top edge
      const actualBarH = Math.max(barHeight || 0, 3);
      const barTop = r.bottom - actualBarH;
      const top = barTop - GAP; // tooltip sits just above the bar top
      const idealLeft = r.left + r.width / 2;
      const left = Math.max(TIP_W / 2 + MARGIN, Math.min(idealLeft, window.innerWidth - TIP_W / 2 - MARGIN));
      setPos({ top, left, barCenterX: idealLeft });
    };
    upd();
    window.addEventListener("scroll", upd, true);
    window.addEventListener("resize", upd);
    return () => { window.removeEventListener("scroll", upd, true); window.removeEventListener("resize", upd); };
  }, [visible, barRef, barHeight]);

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

function VerticalBar({ height, colorIdx, intervalType, power, pace, distance, heartRate, lactate, duration, durationType, index, isHovered, onHover, sport, user = null, widthPercent = null }) {
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
          className="absolute bottom-0 w-full rounded-t-sm"
          style={{
            height: `${Math.max(height, 3)}px`,
            backgroundColor: bg,
            opacity: hoverOpacity,
            transition: "opacity 0.15s",
          }}
        />
      </div>
      <BarTooltip
        barRef={barRef}
        barHeight={Math.max(height, 3)}
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
function Scale({ values, formatValue, height = GRAPH_H }) {
  return (
    <div className="relative shrink-0 w-8 sm:w-10 text-right" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="absolute right-0 left-0 flex items-center justify-end pr-1"
          style={{ top: `${axisTickY(i, values.length)}px`, transform: "translateY(-50%)" }}
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
  const isBike = normSport === "bike";

  /* Use only work intervals for averages (falls back to all if no types set) */
  const workResults  = workOnly(results);
  const workPrevRes  = workOnly(prevRes);

  const avg = (arr, fn) => {
    const vals = arr.map(fn).filter(x => x != null && x > 0);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : 0;
  };

  const curPow  = avg(workResults,  r => { const p = Number(r.power); return isNaN(p) ? null : p; });
  const prevPow = avg(workPrevRes,  r => { const p = Number(r.power); return isNaN(p) ? null : p; });
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

  const avgSpeed = Number(training.avgSpeed || 0);
  // Fallback for Strava swims: compute pace from average_speed (m/s → sec/100m)
  const stravaSpdMs = Number(training.average_speed || training.avgSpeed || 0);
  const swimPaceFromStrava = isSwim && stravaSpdMs > 0 ? Math.round(100 / stravaSpdMs) : 0;
  const metricStr = isRun
    ? fmtPace(curPace || 0)
    : isSwim
      ? fmtSwimPace(curPace || swimPaceFromStrava)
      : isBike && avgSpeed > 0
        ? formatSpeedForUser(avgSpeed, user)
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

/* ── Main component ────────────────────────────────────────────────────────── */
export function TrainingStats({
  trainings, selectedSport, onSportChange,
  selectedTitle, setSelectedTitle,
  selectedTrainingId, setSelectedTrainingId,
  isFullWidth = false, user = null,
  // Coach viewing another athlete: pass the athlete's id so the Strava
  // detail endpoint resolves their token, not the coach's.
  integrationAthleteId = null,
}) {
  const navigate   = useNavigate();
  const unitSystem = resolveDistanceUnitSystem(user, "metric");
  const { categories } = useCategories();

  const trainingsList = useMemo(
    () => (Array.isArray(trainings) ? trainings : []),
    [trainings]
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

  const [internalSelectedTitle, setInternalSelectedTitle] = useState(null);
  const currentSelectedTitle  = selectedTitle  !== undefined ? selectedTitle  : internalSelectedTitle;
  const setCurrentSelectedTitle = setSelectedTitle || setInternalSelectedTitle;

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
  const [chartHeight, setChartHeight] = useState(GRAPH_H);

  /* close settings on outside click */
  useEffect(() => {
    const h = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setIsSettingsOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* auto-select latest training (by date) only when there is no valid pick
     yet. Don't clobber a user's explicit choice just because it's a sport
     other than the current sport filter — that was making the dropdown
     snap back the moment they picked a swim title while filtering by run. */
  useEffect(() => {
    if (!trainingsList.length) return;
    const rel = currentSelectedSport === "all" ? trainingsList : trainingsList.filter(t => t.sport === currentSelectedSport);
    if (!rel.length) return;

    // Special sentinel options (lactate-only, category filter) are never
    // a real title — leave them as-is.
    const isSentinel = typeof currentSelectedTitle === 'string'
      && (currentSelectedTitle === LACTATE_OPTION
          || currentSelectedTitle.startsWith(CATEGORY_OPTION_PREFIX));
    if (isSentinel) return;

    // Keep the user's pick if it exists ANYWHERE in trainingsList — not just
    // in the sport-filtered slice.
    const titleExistsAnywhere = currentSelectedTitle
      && trainingsList.some(t => t.title === currentSelectedTitle);
    if (titleExistsAnywhere) return;

    // Otherwise fall back to the newest training in the current sport slice.
    const latest = [...rel].sort((a, b) => new Date(b.date || b.timestamp || 0) - new Date(a.date || a.timestamp || 0))[0];
    setCurrentSelectedTitle(latest.title);
    if (setSelectedTrainingId) setSelectedTrainingId(latest._id || latest.id);
  }, [trainingsList, currentSelectedSport, currentSelectedTitle, setCurrentSelectedTitle, setSelectedTrainingId]);

  // Sentinel option that surfaces every lactate-tagged training regardless
  // of its title — mirrors the mobile "Lactate-tested" panel so coaches /
  // athletes can see every export with lactate even if the original Strava
  // name differs.
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

  const trainingOptions = useMemo(() => {
    const sportFiltered = trainingsList.filter(t =>
      currentSelectedSport === "all" || normalizeSport(t.sport) === normalizeSport(currentSelectedSport)
    );
    const titles = [...new Set(sportFiltered.map(t => t.title).filter(Boolean))];
    const lactateCount = sportFiltered.filter(hasLactateValue).length;
    const opts = titles.map(t => ({ value: t, label: t }));

    // Build category options for categories that have at least one training
    const catCounts = new Map();
    sportFiltered.forEach(t => {
      if (t.category) catCounts.set(t.category, (catCounts.get(t.category) || 0) + 1);
    });
    const catOpts = categories
      .filter(c => (catCounts.get(c.id) || 0) > 0)
      .map(c => ({
        value: `${CATEGORY_OPTION_PREFIX}${c.id}`,
        label: `${c.label} (${catCounts.get(c.id)})`,
      }));

    if (lactateCount > 0) {
      opts.unshift({ value: LACTATE_OPTION, label: `Lactate trainings (${lactateCount})` });
    }
    return [...catOpts, ...opts];
  }, [trainingsList, currentSelectedSport, hasLactateValue, categories]);

  const filteredTrainings = useMemo(() => {
    const sportOk = (t) => currentSelectedSport === "all" || normalizeSport(t.sport) === normalizeSport(currentSelectedSport);
    const isCatOpt = typeof currentSelectedTitle === 'string' && currentSelectedTitle.startsWith(CATEGORY_OPTION_PREFIX);
    const list = currentSelectedTitle === LACTATE_OPTION
      ? trainingsList.filter(t => sportOk(t) && hasLactateValue(t))
      : isCatOpt
        ? (() => {
            const catId = currentSelectedTitle.slice(CATEGORY_OPTION_PREFIX.length);
            return trainingsList.filter(t => sportOk(t) && t.category === catId);
          })()
        : trainingsList.filter(t => sportOk(t) && t.title === currentSelectedTitle);
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [trainingsList, currentSelectedSport, currentSelectedTitle, hasLactateValue]);

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

  useEffect(() => { setProgressIndex(0); }, [filteredTrainings.length, currentSelectedTitle]);

  const handleTitleChange = (title) => {
    setCurrentSelectedTitle(title);
    // Sentinel options (Lactate-only / category) don't map to a single
    // training id — let downstream components pick their own. Just propagate
    // the new value and bail.
    if (title === LACTATE_OPTION || (typeof title === 'string' && title.startsWith(CATEGORY_OPTION_PREFIX))) {
      return;
    }
    // Match the title across the full set (regardless of sport filter) and
    // fall back to .id when .  _id is absent (Strava activities). Otherwise
    // the parent's selectedTraining would land on `undefined` and a sibling
    // sync effect could pick a default that doesn't match the new title.
    const matches = trainingsList
      .filter(t => t.title === title)
      .sort((a, b) => new Date(b.date || b.startDate || 0) - new Date(a.date || a.startDate || 0));
    if (matches.length && setSelectedTrainingId) {
      const pick = matches[0];
      setSelectedTrainingId(pick._id || pick.id || pick.stravaId || null);
    }
  };

  const visibleTrainings = useMemo(
    () => filteredTrainings.slice(visibleTrainingIndex, visibleTrainingIndex + displayCount),
    [filteredTrainings, visibleTrainingIndex, displayCount]
  );

  /* measure chart container */
  useEffect(() => {
    const upd = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
      if (chartBarsRef.current) {
        const h = chartBarsRef.current.clientHeight;
        if (h > 0) setChartHeight(Math.max(GRAPH_H, h));
      }
    };
    upd();
    const els = [containerRef.current, chartBarsRef.current].filter(Boolean);
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(upd)
      : null;
    els.forEach((el) => ro?.observe(el));
    window.addEventListener("resize", upd);
    return () => {
      window.removeEventListener("resize", upd);
      els.forEach((el) => ro?.unobserve(el));
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
    <div className="flex flex-col h-full min-h-[260px] sm:min-h-[280px] p-4 sm:p-4 bg-white rounded-2xl shadow-sm border border-gray-100 gap-3">

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
          <SearchableSelect
            value={currentSelectedTitle}
            options={trainingOptions}
            onChange={handleTitleChange}
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
      <div className="flex flex-1 min-h-0 gap-1 sm:gap-2 items-stretch w-full min-w-0">
        <Scale
          values={isPaceSport ? paceValues : powerValues}
          formatValue={isPaceSport ? formatPaceVal : null}
          height={chartHeight}
        />

        <div ref={containerRef} className="relative flex flex-1 min-w-0 min-h-0 flex-col" style={{ overflow: "visible" }}>
          {/* grid lines */}
          <div ref={chartBarsRef} className="relative flex-1 min-h-[100px] min-w-0">
          <div className="pointer-events-none absolute left-0 right-0 top-0 bottom-0 z-0">
            {(isPaceSport ? paceValues : powerValues).map((_, i, arr) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-gray-100"
                style={{ top: `${axisTickY(i, arr.length, chartHeight)}px`, transform: "translateY(-50%)" }}
              />
            ))}
          </div>

          {/* bar columns */}
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
                <div key={training._id || tIdx} className="flex flex-1 basis-0 min-w-0 h-full flex-col items-stretch overflow-visible">
                  <div
                    className="relative flex flex-1 min-h-0 w-full min-w-0 items-end overflow-visible"
                    style={{ gap: `${gapPx}px` }}
                  >
                    {results.map((r, rIdx) => {
                      let height = 0;
                      if (isPaceSport) {
                        const pace = parsePaceSecs(r.power);
                        if (pace && pace > 0) height = ((maxPace - pace) / (maxPace - minPace)) * chartHeight;
                      } else {
                        const pow = Number(r.power);
                        if (!isNaN(pow) && pow > 0) height = ((pow - minPower) / (maxPower - minPower)) * chartHeight;
                      }

                      return (
                        <VerticalBar
                          key={`${training._id||tIdx}-${rIdx}`}
                          height={height}
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
                  <div className="mt-1 w-full shrink-0 text-center text-xs text-gray-400 tabular-nums leading-tight">
                    {new Date(training.date).toLocaleDateString("en-US", { day:"numeric", month:"numeric", year:"2-digit" })}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      </div>

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
                trainingResults={getResults(t)}
                previousTraining={filteredTrainings[progressIndex + i + 1] ?? null}
                previousResults={getResults(filteredTrainings[progressIndex + i + 1] ?? null)}
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
