/**
 * WeeklySummaryCarousel
 * ─────────────────────
 * Swipeable weekly-summary strip for the top of the native dashboard.
 *   • Swipe left/right between cards: Performance Insights · This week · By sport · Training load.
 *   • ‹ › in the card header browses weeks — back into history (actual) and
 *     forward into what's planned in the calendar.
 *   • The data cards compare ACTUAL vs PLANNED (from plannedWorkouts).
 *
 * Reads the dashboard's existing activities / plannedWorkouts / sparklineData,
 * so it needs no extra fetch.
 */
import React, { useMemo, useRef, useState, useEffect, lazy, Suspense } from 'react';
import { RotateCcw, Share2 } from 'lucide-react';
import SportIcon from '../shared/SportIcon';
import PerformanceInsightsSlide from './PerformanceInsightsSlide';
import { resolveActivityTss } from '../../utils/computeTss';
import { mergeProfileZones } from '../../utils/inferThresholdsFromActivities';
import { activityCalendarDateKey } from '../../utils/formFitnessFromActivities';
import { plannedDistanceMetres } from '../../utils/plannedWorkoutDistance';
import { useAuth } from '../../context/AuthProvider';
import { formatDistance, resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import { TSS_DISPLAY_MODE_EVENT } from '../../utils/uiPrefs';
const ActivityShareSheet = lazy(() => import('../sharing/ActivityShareSheet'));

// ─── glass card look (matches the rest of the dashboard) ─────────────────────
const CARD = {
  background: 'rgba(255,255,255,.65)',
  backdropFilter: 'blur(22px) saturate(170%)',
  WebkitBackdropFilter: 'blur(22px) saturate(170%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
  borderRadius: 18,
  padding: '10px 14px 18px',   // compact; bottom leaves room for the dots
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
};
const SLIDE = { flex: '0 0 100%', scrollSnapAlign: 'start', display: 'flex' };

// ─── data helpers ────────────────────────────────────────────────────────────
function getWeekBounds(ref) {
  const d = new Date(ref);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  const monday = new Date(d); monday.setDate(d.getDate() - dow); monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}
const actDate = (a) => {
  const k = activityCalendarDateKey(a);
  return k ? new Date(`${k}T12:00:00`) : new Date(0);
};
const actSecs = (a) => Number(a?.totalTime || a?.duration || a?.movingTime || a?.moving_time || a?.elapsedTime || a?.elapsed_time || a?.totalTimerTime || 0);
const actDist = (a) => Number(a?.distance || a?.totalDistance || 0);
// Planned-workout accessors
const planDate = (p) => { const s = String(p?.date || ''); return new Date(s.length === 10 ? `${s}T12:00:00` : (s || 0)); };
const planSecs = (p) => Number(p?.plannedDuration || 0);
const planDist = (p) => plannedDistanceMetres(p);
const planTss  = (p) => Number(p?.targetTss || 0);
function normSport(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('ride') || v.includes('cycle') || v.includes('bike') || v.includes('virtual')) return 'bike';
  if (v.includes('run') || v.includes('walk') || v.includes('hike')) return 'run';
  if (v.includes('swim')) return 'swim';
  return 'other';
}

// ─── formatting ──────────────────────────────────────────────────────────────
const fmtDistValue = (m, user) => {
  if (!m) return '0';
  const unitSystem = resolveDistanceUnitSystem(user);
  const { value, unit, formatted } = formatDistance(m, unitSystem);
  if (unit !== 'km' && unit !== 'mi') return formatted; // m / ft — already whole
  // Shed decimals as the number grows so long distances (e.g. 120.58 km) stay
  // on one line in the narrow by-sport columns; small values keep their detail.
  if (value >= 100) return `${Math.round(value)} ${unit}`;
  if (value >= 10) return `${Number(value.toFixed(1))} ${unit}`;
  return formatted;
};
const fmtDistDelta = (meters, user) => {
  if (!meters) return '0';
  const unitSystem = resolveDistanceUnitSystem(user);
  const { value, unit } = formatDistance(Math.abs(meters), unitSystem);
  const rounded = unit === 'mi'
    ? (Math.abs(value) >= 10 ? Math.round(value) : Number(value.toFixed(1)))
    : (unit === 'km' ? Math.round(value) : Math.round(value));
  return `${rounded} ${unit}`;
};
const fmtTime = (s) => {
  // Round to whole minutes FIRST, then split — otherwise 23h59.5m rounds the
  // minutes to 60 and shows "23h 60m" instead of rolling over to "24h".
  const totalMin = Math.max(0, Math.round((s || 0) / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
};
function weekLabel(offset, monday, sunday) {
  if (offset === 0) return 'This week';
  if (offset === -1) return 'Last week';
  if (offset === 1) return 'Next week';
  const f = (d) => d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return `${f(monday)} – ${f(sunday)}`;
}

// week-over-week delta chip (▲ more / ▼ less than last week).
// When `fmt` is given, `value` is fed to it (e.g. seconds → "14h 6m") instead
// of being shown as a raw number + unit.
function Delta({ value, unit = '', fmt = null }) {
  const minMeaningful = fmt ? 60 : 1; // time delta: ignore < 1 min
  if (value == null || Math.abs(value) < minMeaningful) return <span className="text-[10px] text-gray-300 font-semibold">— vs last wk</span>;
  const up = value > 0;
  const text = fmt ? fmt(Math.abs(value)) : `${Math.abs(value)}${unit ? ` ${unit}` : ''}`;
  return (
    <span className="text-[10px] font-bold tabular-nums" style={{ color: up ? '#10b981' : '#9ca3af' }}>
      {up ? '▲' : '▼'} {text}
    </span>
  );
}

function Stat({ label, value, planned, sub, delta }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide truncate">{label}</div>
      <div className="text-lg font-black text-gray-900 tabular-nums leading-tight mt-0.5 truncate">{value}</div>
      {(planned != null || delta || sub) && (
        <div className="flex items-center gap-1 mt-0.5 min-w-0">
          {planned != null && <span className="text-[10px] text-gray-400 truncate">of {planned}</span>}
          {delta}
          {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function WeekNav({ label, offset = 0, onPrev, onNext, onReset, trailing = null }) {
  const btn = 'w-6 h-6 rounded-full flex items-center justify-center text-gray-500 text-sm font-bold active:bg-black/5 shrink-0';
  return (
    <div className="flex items-center justify-between mb-2 gap-1 min-h-[28px]">
      <button onClick={onPrev} className={btn} style={{ background: 'rgba(10,14,26,.05)' }} aria-label="Previous week">‹</button>
      {offset === 0 ? (
        <span className="text-[13px] font-bold text-gray-900 truncate text-center flex-1 min-w-0 px-1">{label}</span>
      ) : (
        <button onClick={onReset} className="flex items-center justify-center gap-1 text-[13px] font-bold text-primary active:opacity-70 flex-1 min-w-0 px-1 truncate" aria-label="Back to this week">
          <RotateCcw className="w-3 h-3 shrink-0" strokeWidth={2.5} />
          <span className="truncate">{label}</span>
        </button>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {trailing}
        <button onClick={onNext} className={btn} style={{ background: 'rgba(10,14,26,.05)' }} aria-label="Next week">›</button>
      </div>
    </div>
  );
}

const SPORTS = [
  { key: 'bike', label: 'Bike', color: '#7c6cf0' },
  { key: 'run',  label: 'Run',  color: '#f97316' },
  { key: 'swim', label: 'Swim', color: '#06b6d4' },
];

export default function WeeklySummaryCarousel({
  activities = [],
  plannedWorkouts = [],
  sparklineData = [],
  kpis = null,
  tests = [],
  todayMetrics = {},
  loading = false,
  userProfile = null,
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const scrollRef = useRef(null);
  const [page, setPage] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dir, setDir] = useState(1); // 1 = moved forward, -1 = back (drives the slide-in direction)
  const { user } = useAuth() || {};
  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );
  const [metricsTick, setMetricsTick] = useState(0);
  useEffect(() => {
    const bump = () => setMetricsTick((t) => t + 1);
    const onMetricsUpdated = (e) => {
      if (!e?.detail?.id) return;
      bump();
    };
    window.addEventListener('activityMetricsUpdated', onMetricsUpdated);
    window.addEventListener(TSS_DISPLAY_MODE_EVENT, bump);
    return () => {
      window.removeEventListener('activityMetricsUpdated', onMetricsUpdated);
      window.removeEventListener(TSS_DISPLAY_MODE_EVENT, bump);
    };
  }, []);
  const data = useMemo(() => {
    const actTss = (a) => (resolveActivityTss(a, profile, { user }) || 0) + metricsTick * 0;
    const now = new Date();
    const ref = new Date(now); ref.setDate(now.getDate() + weekOffset * 7);
    const wb = getWeekBounds(ref);
    const inWeek = (t) => {
      const ms = (t instanceof Date ? t : new Date(t)).getTime();
      return ms >= wb.monday.getTime() && ms <= wb.sunday.getTime();
    };

    const curActs = activities.filter((a) => inWeek(actDate(a)));
    const curPlans = plannedWorkouts.filter((p) => inWeek(planDate(p)));
    const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

    // Previous week (relative to the selected one) — for the "vs last week" deltas.
    const prevRef = new Date(now); prevRef.setDate(now.getDate() + (weekOffset - 1) * 7);
    const pwb = getWeekBounds(prevRef);
    const inPrev = (t) => {
      const ms = (t instanceof Date ? t : new Date(t)).getTime();
      return ms >= pwb.monday.getTime() && ms <= pwb.sunday.getTime();
    };
    const prevActs = activities.filter((a) => inPrev(actDate(a)));

    // Weekly TSS from activities (respects per-workout TSS mode + manual overrides).
    const actTssTotal = Math.round(sum(curActs, actTss));
    const prevTssTotal = Math.round(sum(prevActs, actTss));

    const bySport = SPORTS.map((s) => {
      const acts = curActs.filter((a) => normSport(a.sport) === s.key);
      return { ...s, count: acts.length, dist: sum(acts, actDist), secs: sum(acts, actSecs) };
    });

    return {
      label: weekLabel(weekOffset, wb.monday, wb.sunday),
      act: {
        count: curActs.length,
        secs: sum(curActs, actSecs),
        dist: sum(curActs, actDist),
        tss: actTssTotal,
      },
      plan: {
        count: curPlans.length,
        secs: sum(curPlans, planSecs),
        dist: sum(curPlans, planDist),
        tss: sum(curPlans, planTss),
      },
      prev: {
        count: prevActs.length,
        secs: sum(prevActs, actSecs),
        dist: sum(prevActs, actDist),
        tss: prevTssTotal,
      },
      bySport,
      curActs,
      range: `${wb.monday.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${wb.sunday.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
    };
  }, [activities, plannedWorkouts, weekOffset, profile, user, metricsTick]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / (el.clientWidth || 1)));
  };
  const goTo = (i) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const prevWeek = () => { setDir(-1); setWeekOffset((w) => Math.max(-104, w - 1)); };
  const nextWeek = () => { setDir(1); setWeekOffset((w) => Math.min(26, w + 1)); };
  const goCurrent = () => { setDir(weekOffset > 0 ? -1 : 1); setWeekOffset(0); };

  // Re-keyed + re-animated whenever the week changes, so the figures slide in.
  const contentAnim = { animation: `${dir >= 0 ? 'ndWkInR' : 'ndWkInL'} .3s cubic-bezier(.22,1,.36,1) both` };

  const PAGES = 4;

  // Build the shareable weekly-summary payload (IG-story card) from the
  // currently-selected week. KPIs (Fitness/Form/Fatigue) come from the parent.
  const shareSummary = useMemo(() => {
    const now = new Date();
    const ref = new Date(now);
    ref.setDate(now.getDate() + weekOffset * 7);
    const wb = getWeekBounds(ref);
    const rangeShort = `${wb.monday.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${wb.sunday.getDate()}`;

    return {
      label: 'Weekly summary',
      title: data.label,
      subtitle: data.range,
      rangeShort,
      monday: wb.monday.toISOString(),
      sunday: wb.sunday.toISOString(),
      kpis: kpis || null,
      totals: { count: data.act.count, secs: data.act.secs, distM: data.act.dist, tss: data.act.tss },
      activities: data.curActs || [],
      allActivities: activities,
      sparklineData,
      tests,
      allTests: tests,
    };
  }, [data, kpis, weekOffset, activities, sparklineData, tests]);

  const shareBtn = (
    <button
      onClick={() => setShareOpen(true)}
      aria-label="Share weekly summary"
      className="flex items-center justify-center w-6 h-6 rounded-full active:scale-95 transition-transform shrink-0"
      style={{ background: 'rgba(10,14,26,.05)' }}
    >
      <Share2 className="w-3 h-3 text-gray-500" strokeWidth={2.2} />
    </button>
  );

  return (
    <div style={{ position: 'relative' }}>
      {shareOpen && (
        <Suspense fallback={null}>
          <ActivityShareSheet open={shareOpen} summary={shareSummary} accent="#5E6590" onClose={() => setShareOpen(false)} />
        </Suspense>
      )}
      <style>{`
        .nd-wsc::-webkit-scrollbar{display:none}
        @keyframes ndWkInR { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
        @keyframes ndWkInL { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: none; } }
      `}</style>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="nd-wsc"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
          gap: 10,
        }}
      >
        {/* ── Card 0: Performance Insights (Fitness / Form / Fatigue) ─── */}
        <div style={{ ...SLIDE, alignSelf: 'flex-start' }}>
          <PerformanceInsightsSlide
            activities={activities}
            userProfile={profile}
            todayMetrics={todayMetrics}
            sparklineData={sparklineData}
            plannedWorkouts={plannedWorkouts}
            loading={loading}
          />
        </div>

        {/* ── Card 1: This week (actual vs planned) ─────────────────────── */}
        <div style={SLIDE}>
          <div style={CARD}>
            <WeekNav label={data.label} offset={weekOffset} onPrev={prevWeek} onNext={nextWeek} onReset={goCurrent} trailing={shareBtn} />
            <div key={weekOffset} style={contentAnim} className="grid grid-cols-3 gap-2">
              <Stat label="Activities" value={data.act.count}
                delta={<Delta value={data.act.count - data.prev.count} />} />
              <Stat label="Time" value={fmtTime(data.act.secs)}
                delta={<Delta value={data.act.secs - data.prev.secs} fmt={fmtTime} />} />
              <Stat label="Distance" value={fmtDistValue(data.act.dist, user)}
                delta={<Delta value={data.act.dist - data.prev.dist} fmt={(v) => fmtDistDelta(v, user)} />} />
            </div>
          </div>
        </div>

        {/* ── Card 2: By sport ──────────────────────────────────────────── */}
        <div style={SLIDE}>
          <div style={CARD}>
            <WeekNav label={`${data.label} · by sport`} offset={weekOffset} onPrev={prevWeek} onNext={nextWeek} onReset={goCurrent} trailing={shareBtn} />
            <div key={weekOffset} style={contentAnim} className="grid grid-cols-3 gap-2">
              {data.bySport.map((s) => (
                <div key={s.key} className="rounded-xl px-2 py-2" style={{ background: `${s.color}12` }}>
                  <div className="flex items-center gap-1 mb-1">
                    <SportIcon sport={s.key} className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
                  </div>
                  <div className="text-lg font-black text-gray-900 tabular-nums leading-tight">{fmtDistValue(s.dist, user)}</div>
                  <div className="text-[10px] text-gray-400 tabular-nums">{s.count} · {fmtTime(s.secs)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Card 3: Training load (actual vs planned) ─────────────────── */}
        <div style={SLIDE}>
          <div style={CARD}>
            <WeekNav label={`${data.label} · load`} offset={weekOffset} onPrev={prevWeek} onNext={nextWeek} onReset={goCurrent} trailing={shareBtn} />
            <div key={weekOffset} style={contentAnim} className="grid grid-cols-3 gap-2">
              <Stat label="TSS" value={Math.round(data.act.tss)}
                delta={<Delta value={Math.round(data.act.tss - data.prev.tss)} />} />
              <Stat label="Sessions" value={data.act.count}
                delta={<Delta value={data.act.count - data.prev.count} />} />
              <Stat label="Avg/day" value={Math.round(data.act.tss / 7)} sub="TSS" />
            </div>
          </div>
        </div>
      </div>

      {/* Dots — inside the box, pinned to the bottom centre */}
      <div className="absolute left-0 right-0 flex items-center justify-center gap-1.5" style={{ bottom: 6 }}>
        {Array.from({ length: PAGES }, (_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Card ${i + 1}`}
            className="rounded-full transition-all"
            style={{
              width: page === i ? 18 : 6,
              height: 6,
              background: page === i ? '#7c6cf0' : 'rgba(10,14,26,.18)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
