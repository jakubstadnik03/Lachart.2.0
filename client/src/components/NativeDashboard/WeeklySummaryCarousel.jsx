/**
 * WeeklySummaryCarousel
 * ─────────────────────
 * Swipeable weekly-summary strip for the top of the native dashboard.
 *   • Swipe left/right between cards: Performance Insights · This week · By sport · Training load · Streak.
 *   • ‹ › in the card header browses weeks — back into history (actual) and
 *     forward into what's planned in the calendar.
 *   • The data cards compare ACTUAL vs PLANNED (from plannedWorkouts).
 *
 * Reads the dashboard's existing activities / plannedWorkouts / sparklineData,
 * so it needs no extra fetch.
 */
import React, { useMemo, useRef, useState, useEffect, lazy, Suspense } from 'react';
import { Flame, RotateCcw, Share2 } from 'lucide-react';
import SportIcon from '../shared/SportIcon';
import PerformanceInsightsSlide from './PerformanceInsightsSlide';
import { resolveActivityTss } from '../../utils/computeTss';
import { useAuth } from '../../context/AuthProvider';
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
const actDate = (a) => new Date(a?.date || a?.startDate || a?.timestamp || 0);
const actSecs = (a) => Number(a?.totalTime || a?.duration || a?.movingTime || a?.moving_time || a?.elapsedTime || a?.elapsed_time || a?.totalTimerTime || 0);
const actDist = (a) => Number(a?.distance || a?.totalDistance || 0);
// Planned-workout accessors
const planDate = (p) => { const s = String(p?.date || ''); return new Date(s.length === 10 ? `${s}T12:00:00` : (s || 0)); };
const planSecs = (p) => Number(p?.plannedDuration || 0);
const planDist = (p) => Number(p?.plannedDistance || 0);
const planTss  = (p) => Number(p?.targetTss || 0);
function normSport(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('ride') || v.includes('cycle') || v.includes('bike') || v.includes('virtual')) return 'bike';
  if (v.includes('run') || v.includes('walk') || v.includes('hike')) return 'run';
  if (v.includes('swim')) return 'swim';
  return 'other';
}

// ─── formatting ──────────────────────────────────────────────────────────────
const fmtKm = (m) => {
  const km = (m || 0) / 1000;
  if (km <= 0) return '0';
  return km >= 100 ? `${Math.round(km)}` : `${km.toFixed(1)}`;
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
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Day plan-compliance colours for the streak card.
const DAY_STATUS = {
  done:    { bg: '#10b981', fg: '#fff', mark: '✓', ring: 'none' },                          // green — plan done
  missed:  { bg: '#ef4444', fg: '#fff', mark: '✕', ring: 'none' },                          // red — missed
  pending: { bg: 'rgba(245,158,11,.14)', fg: '#f59e0b', mark: '•', ring: '1.5px solid #f59e0b' }, // amber — to do
  extra:   { bg: '#0A0E1A', fg: '#fff', mark: '✓', ring: 'none' },                          // navy — trained, no plan
  rest:    { bg: 'rgba(10,14,26,.06)', fg: '#9ca3af', mark: '', ring: 'none' },             // grey — rest
};

export default function WeeklySummaryCarousel({
  activities = [],
  plannedWorkouts = [],
  sparklineData = [],
  kpis = null,
  tests = [],
  todayMetrics = {},
  loading = false,
  onReadinessPress = null,
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const scrollRef = useRef(null);
  const [page, setPage] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dir, setDir] = useState(1); // 1 = moved forward, -1 = back (drives the slide-in direction)
  const { user } = useAuth() || {};
  const [metricsTick, setMetricsTick] = useState(0);
  useEffect(() => {
    const bump = () => setMetricsTick((t) => t + 1);
    window.addEventListener('activityMetricsUpdated', bump);
    window.addEventListener(TSS_DISPLAY_MODE_EVENT, bump);
    return () => {
      window.removeEventListener('activityMetricsUpdated', bump);
      window.removeEventListener(TSS_DISPLAY_MODE_EVENT, bump);
    };
  }, []);
  const data = useMemo(() => {
    const actTss = (a) => (resolveActivityTss(a, user, { user }) || 0) + metricsTick * 0;
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

    // Per-day plan compliance for the current week (streak card). Each day:
    //   done    — a planned workout that day was completed   → green
    //   missed  — planned but not done, day already past     → red
    //   pending — planned but not done yet (today / future)  → amber
    //   extra   — trained with no plan for the day           → navy ✓
    //   rest    — nothing planned, nothing done              → grey
    const curWb = getWeekBounds(now);
    const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(curWb.monday); d.setDate(curWb.monday.getDate() + i); d.setHours(0, 0, 0, 0);
      const ds = d.toDateString();
      const done = activities.some((a) => actDate(a).toDateString() === ds);
      const planned = plannedWorkouts.some((p) => planDate(p).toDateString() === ds);
      const isPast = d.getTime() < today0.getTime();
      let status;
      if (planned && done) status = 'done';
      else if (planned && !done && isPast) status = 'missed';
      else if (planned && !done) status = 'pending';
      else if (!planned && done) status = 'extra';
      else status = 'rest';
      return status;
    });
    let streak = 0;
    for (let w = 0; w < 260; w++) {
      const r = new Date(now); r.setDate(now.getDate() - w * 7);
      const b = getWeekBounds(r);
      const has = activities.some((a) => { const t = actDate(a).getTime(); return t >= b.monday.getTime() && t <= b.sunday.getTime(); });
      if (has) streak++; else break;
    }

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
      weekDays,
      streak,
      curActs,
      range: `${wb.monday.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${wb.sunday.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
    };
  }, [activities, plannedWorkouts, weekOffset, user, metricsTick]);

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

  const PAGES = 5;

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
      streak: data.streak,
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
        <div style={SLIDE}>
          <PerformanceInsightsSlide
            todayMetrics={todayMetrics}
            sparklineData={sparklineData}
            loading={loading}
            onReadinessPress={onReadinessPress}
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
              <Stat label="Distance" value={`${fmtKm(data.act.dist)} km`}
                delta={<Delta value={Math.round((data.act.dist - data.prev.dist) / 1000)} unit="km" />} />
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
                  <div className="text-lg font-black text-gray-900 tabular-nums leading-tight">{fmtKm(s.dist)}<span className="text-[10px] text-gray-400 font-semibold ml-0.5">km</span></div>
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

        {/* ── Card 4: Streak (always current) ───────────────────────────── */}
        <div style={SLIDE}>
          <div style={CARD}>
            <div className="flex items-center justify-between mb-2 min-h-[28px] gap-1">
              <span className="text-[13px] font-bold text-gray-900 truncate flex-1 min-w-0">Streak</span>
              <div className="flex items-center gap-2 shrink-0">
                {shareBtn}
                <div className="hidden sm:flex items-center gap-2 text-[9px] text-gray-400 font-semibold">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} />done</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} />to&nbsp;do</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444' }} />missed</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <Flame className="w-5 h-5 text-orange-500" fill="#fb923c" strokeWidth={1.8} />
                <div className="leading-none">
                  <span className="text-lg font-black text-gray-900 tabular-nums">{data.streak}</span>
                  <span className="text-[9px] text-gray-400 font-semibold uppercase ml-1">wks</span>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-between">
                {data.weekDays.map((st, i) => {
                  const c = DAY_STATUS[st] || DAY_STATUS.rest;
                  return (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ background: c.bg, color: c.fg, border: c.ring }}>
                        {c.mark}
                      </div>
                      <span className="text-[9px] text-gray-400 font-semibold">{DOW[i]}</span>
                    </div>
                  );
                })}
              </div>
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
