import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EChartsModule from 'echarts-for-react';
import api, { getTodayMetrics } from '../../services/api';
import { getPlannedWorkouts } from '../../services/workoutPlannerApi';
import {
  computePmcFromActivities,
  computePmcProjection,
  buildPlannedTssByDate,
} from '../../utils/formFitnessFromActivities';
import {
  readCalendarActivitiesCache,
  fetchCalendarActivitiesForPmc,
  CALENDAR_DATA_EVENT,
} from '../../utils/calendarActivitiesForPmc';
import { mergeProfileZones } from '../../utils/inferThresholdsFromActivities';
import { matchesCalendarSportFilter } from '../../utils/calendarDayOrdering';
import { getTsbStatus } from '../../utils/formFitnessMetrics';
import { TSS_DISPLAY_MODE_EVENT } from '../../utils/uiPrefs';
import { pmcAxisDomainsFromPoints, PMC_COLORS, PMC_VIEW_DAY_RANGES, PMC_MAX_VIEW_DAYS } from '../../utils/pmcChartAxes';
import { buildPmcChartOption, PMC_CHROME, PMC_FONT } from '../../utils/pmcChartOption';
import FormFitnessHelpSheet from './FormFitnessHelpSheet';

const ReactECharts = EChartsModule?.default ?? EChartsModule;

const TIME_RANGES = PMC_VIEW_DAY_RANGES;

/** Ids match the sportFilter computePmcFromActivities already accepts. */
const SPORT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'bike', label: 'Bike' },
  { id: 'run', label: 'Run' },
  { id: 'swim', label: 'Swim' },
];

const IOS = PMC_CHROME;
const FONT = PMC_FONT;

function deltaText(delta) {
  const n = Math.abs(Math.round(delta || 0));
  if (!n) return 'same as yesterday';
  return `${delta > 0 ? '↑' : '↓'} ${n} vs yesterday`;
}

/**
 * An iOS segmented control. `dense` is the small variant for a filter that
 * sits beside a title rather than under a chart.
 */
function Segmented({ value, options, onChange, dense = false, ariaLabel }) {
  return (
    <div
      className="flex gap-0.5 rounded-[9px] p-0.5"
      style={{ background: IOS.fill, fontFamily: FONT }}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`${dense ? 'min-h-[26px] px-2 text-[12px]' : 'min-h-[30px] flex-1 px-2 text-[13px]'} rounded-[7px] font-semibold transition-colors touch-manipulation ${on ? 'bg-white' : ''}`}
            style={on
              ? { color: IOS.label, boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)' }
              : { color: IOS.secondary }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One of the three headline numbers, coloured like its line. */
function Stat({ label, value, sub, color }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: IOS.secondary }}>
        {label}
      </div>
      <div className="text-[24px] font-semibold leading-tight tracking-[-0.02em] tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] tabular-nums truncate min-h-[15px]" style={{ color: IOS.secondary }}>
        {sub}
      </div>
    </div>
  );
}

/**
 * Combined CTL / ATL / TSB chart — reads the same calendarData_* cache the
 * dashboard writes, uses the same PMC math, one zoomable chart.
 */
export default function PmcCombinedChart({
  athleteId = null,
  userProfile = null,
  user = null,
  isMobile = false,
  /** Optional pre-merged & deduped activity list — when provided (non-empty),
   *  used directly instead of the calendarData_* cache / own fetch, so the
   *  chart always matches the page that supplied it. */
  activities = null,
}) {
  const [viewDays, setViewDays] = useState(90);
  const [sportFilter, setSportFilter] = useState('all');
  const [pmcActivities, setPmcActivities] = useState([]);
  const [loadingActs, setLoadingActs] = useState(true);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [zoomResetKey, setZoomResetKey] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tssTick, setTssTick] = useState(0);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const chartRef = useRef(null);
  /**
   * Fitness / Form / Fatigue as the server computes them.
   *
   * This chart used to headline its own numbers from computePmcFromActivities
   * while the dashboard headlines the server's calculateFormFitnessData — two
   * implementations of one metric, so the same athlete read differently on two
   * pages. The server is the agreed source of truth; the local series still
   * draws the curve (it has the full zoom range and feeds the planned-TSS
   * projection, neither of which the metrics endpoint provides).
   */
  const [serverMetrics, setServerMetrics] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const target = athleteId || user?._id || null;
    if (!target) { setServerMetrics(null); return undefined; }
    getTodayMetrics(target)
      .then((res) => {
        const d = res?.data ?? res;
        if (!cancelled && d && Number.isFinite(Number(d.fitness))) setServerMetrics(d);
      })
      // Fall back to the local numbers rather than showing nothing.
      .catch(() => { if (!cancelled) setServerMetrics(null); });
    return () => { cancelled = true; };
  }, [athleteId, user?._id]);

  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );

  const reloadActivities = useCallback(async () => {
    if (Array.isArray(activities) && activities.length > 0) {
      setPmcActivities(activities);
      setLoadingActs(false);
      return;
    }
    if (!athleteId) {
      setPmcActivities([]);
      setLoadingActs(false);
      return;
    }

    // Paint the cache immediately, then fetch and keep whichever set is
    // larger.
    //
    // This used to return on a cache hit and never look again, so the chart
    // could sit on a set written days ago while the dashboard rebuilt from
    // live data — and the two then disagreed about the same athlete's Fitness
    // and Form. CTL and ATL are exponential averages over a 252-day warmup, so
    // a shorter history reads high: 138/-8/139 here against 145/+9/119 there.
    //
    // Larger wins rather than newer, for the same reason as the dashboard's
    // guard: a fetch that returns less than the cache is a partial answer, not
    // a correction.
    const cached = readCalendarActivitiesCache(athleteId);
    if (cached.length > 0) {
      setPmcActivities(cached);
      setLoadingActs(false);
    } else {
      setLoadingActs(true);
    }

    try {
      const list = await fetchCalendarActivitiesForPmc(api, athleteId);
      const fetched = Array.isArray(list) ? list : [];
      setPmcActivities((prev) => (fetched.length >= prev.length ? fetched : prev));
    } catch {
      if (!cached.length) setPmcActivities([]);
    } finally {
      setLoadingActs(false);
    }
  }, [athleteId, activities]);

  // Future planned TSS — same 8-week window as the dashboard Form & Fitness card.
  useEffect(() => {
    let cancelled = false;
    if (!athleteId) {
      setPlannedWorkouts([]);
      return undefined;
    }
    (async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const from = new Date(today);
        from.setDate(from.getDate() + 1);
        const to = new Date(today);
        to.setDate(to.getDate() + 56);
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const data = await getPlannedWorkouts({ from: iso(from), to: iso(to), athleteId });
        if (!cancelled) setPlannedWorkouts(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPlannedWorkouts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [athleteId, tssTick]);

  useEffect(() => {
    reloadActivities();
  }, [reloadActivities, tssTick]);

  useEffect(() => {
    const onTssMode = () => setTssTick((t) => t + 1);
    const onCalendar = (e) => {
      if (!e?.detail?.athleteId || String(e.detail.athleteId) !== String(athleteId)) return;
      const cached = readCalendarActivitiesCache(athleteId);
      if (cached.length > 0) setPmcActivities(cached);
    };
    const onStorage = (e) => {
      if (!e.key || !e.key.startsWith('calendarData_')) return;
      if (String(e.key) !== `calendarData_${athleteId}`) return;
      const cached = readCalendarActivitiesCache(athleteId);
      if (cached.length > 0) setPmcActivities(cached);
    };

    window.addEventListener(TSS_DISPLAY_MODE_EVENT, onTssMode);
    window.addEventListener(CALENDAR_DATA_EVENT, onCalendar);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(TSS_DISPLAY_MODE_EVENT, onTssMode);
      window.removeEventListener(CALENDAR_DATA_EVENT, onCalendar);
      window.removeEventListener('storage', onStorage);
    };
  }, [athleteId]);

  const { fullSeries, todayMetrics } = useMemo(() => {
    void tssTick; // recompute when TSS display mode changes
    if (!pmcActivities.length || !profile) {
      return { fullSeries: [], todayMetrics: null };
    }
    const { series, todayMetrics: tm } = computePmcFromActivities(pmcActivities, profile, {
      displayDays: PMC_MAX_VIEW_DAYS,
      sportFilter,
      tssUser: user,
    });
    return { fullSeries: series, todayMetrics: tm };
  }, [pmcActivities, profile, user, tssTick, sportFilter]);

  const projection = useMemo(() => {
    if (!fullSeries.length || !plannedWorkouts.length) return [];
    // Filter the plan the same way as the history. A run-only Fitness line
    // projected forward on every planned session — bike and swim included —
    // would rise for training the line does not count.
    const planned = sportFilter === 'all'
      ? plannedWorkouts
      : plannedWorkouts.filter((w) => matchesCalendarSportFilter(w, sportFilter));
    if (!planned.length) return [];
    const plannedTssByDate = buildPlannedTssByDate(planned);
    return computePmcProjection(fullSeries, plannedTssByDate);
  }, [fullSeries, plannedWorkouts, sportFilter]);

  const chartSeries = useMemo(() => {
    if (!fullSeries.length) return [];
    const actual = fullSeries.slice(-viewDays);
    if (!projection.length) {
      return actual.map((d) => ({ ...d, projected: false }));
    }

    const lastIdx = actual.length - 1;
    const base = actual.map((p, i) => ({
      ...p,
      projected: false,
      fitnessProj: i === lastIdx ? p.Fitness : null,
      fatigueProj: i === lastIdx ? p.Fatigue : null,
      formProj: i === lastIdx ? p.Form : null,
    }));

    const proj = projection.map((p) => ({
      date: p.date,
      dateLabel: p.dateLabel,
      Fitness: null,
      Fatigue: null,
      Form: null,
      fitnessProj: p.Fitness,
      fatigueProj: p.Fatigue,
      formProj: p.Form,
      projected: true,
      TSS: p.PlannedTSS,
    }));

    return [...base, ...proj];
  }, [fullSeries, viewDays, projection]);

  const hasProjection = projection.length > 0;

  useEffect(() => {
    const actualCount = chartSeries.filter((d) => !d.projected).length;
    setHoverIndex(actualCount > 0 ? actualCount - 1 : Math.max(0, chartSeries.length - 1));
    setZoomResetKey((k) => k + 1);
  }, [chartSeries, viewDays]);

  const actualCount = useMemo(() => chartSeries.filter((d) => !d.projected).length, [chartSeries]);
  const restIndex = actualCount > 0 ? actualCount - 1 : Math.max(0, chartSeries.length - 1);
  const displayPoint = hoverIndex >= 0 ? chartSeries[hoverIndex] : null;
  // Scrubbing: a finger or pointer resting on any day but the last one.
  const scrubbing = displayPoint != null && hoverIndex !== restIndex;

  // The server computes across every sport, so it cannot answer "my running
  // Fitness". Under a sport filter the local series is the only thing that
  // knows, and showing the all-sport headline above a run-only curve would be
  // the same two-numbers-one-metric problem this chart already had.
  const restHeadline = (sportFilter === 'all' ? serverMetrics : null) || todayMetrics || {
    fitness: displayPoint?.Fitness ?? 0,
    fatigue: displayPoint?.Fatigue ?? 0,
    form: displayPoint?.Form ?? 0,
    fitnessChange: 0,
    fatigueChange: 0,
    formChange: 0,
  };
  // While scrubbing, the numbers are the day under the finger — the way a
  // Health or Stocks chart reads — and the date line says which day that is.
  const headline = scrubbing
    ? {
      fitness: displayPoint.projected ? displayPoint.fitnessProj : displayPoint.Fitness,
      fatigue: displayPoint.projected ? displayPoint.fatigueProj : displayPoint.Fatigue,
      form: displayPoint.projected ? displayPoint.formProj : displayPoint.Form,
    }
    : restHeadline;

  const showPoint = displayPoint || (chartSeries.length ? chartSeries[chartSeries.length - 1] : null);
  const tsbStatus = showPoint && Number.isFinite(Number(headline.form)) ? getTsbStatus(headline.form) : null;

  const todayKey = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  const axisDomains = useMemo(
    () => pmcAxisDomainsFromPoints(chartSeries),
    [chartSeries],
  );

  const chartOption = useMemo(
    () => buildPmcChartOption({ chartSeries, viewDays, isMobile, hasProjection, axisDomains, actualCount }),
    [chartSeries, viewDays, isMobile, hasProjection, axisDomains, actualCount],
  );

  const chartEvents = useMemo(() => ({
    updateAxisPointer: (event) => {
      const xInfo = event?.axesInfo?.find((a) => a.axisDim === 'x');
      if (xInfo == null) return;
      let idx = -1;
      if (typeof xInfo.value === 'number' && Number.isFinite(xInfo.value)) {
        idx = xInfo.value;
      } else if (typeof xInfo.value === 'string') {
        idx = chartSeries.findIndex((d) => {
          const [, m, day] = d.date.split('-');
          return `${day}.${m}.` === xInfo.value;
        });
      }
      if (idx >= 0 && idx < chartSeries.length) setHoverIndex(idx);
    },
    globalout: () => setHoverIndex(restIndex),
  }), [chartSeries, restIndex]);

  // A finger lifting off is the phone's "mouse left": the numbers go back to
  // today, and the hairline goes with them. Without this the last touched
  // day would stay in the headline until the next scroll.
  const releaseScrub = useCallback(() => {
    setHoverIndex(restIndex);
    try { chartRef.current?.getEchartsInstance?.()?.dispatchAction({ type: 'hideTip' }); } catch { /* chart gone */ }
  }, [restIndex]);

  const Chart = typeof ReactECharts === 'function' ? ReactECharts : null;
  const chartHeight = isMobile ? 230 : 320;

  const dateLine = (() => {
    if (!showPoint) return '';
    let when = showPoint.date;
    try {
      const d = new Date(`${showPoint.date}T12:00:00`);
      when = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    } catch { /* keep the ISO date */ }
    const parts = [];
    if (showPoint.projected) parts.push(`${when} · Planned`);
    else if (!scrubbing || showPoint.date === todayKey) parts.push(`Today · ${when}`);
    else parts.push(when);
    if (tsbStatus) parts.push(tsbStatus.label);
    if (showPoint.TSS > 0) parts.push(`${showPoint.projected ? 'Planned' : 'Daily'} TSS ${showPoint.TSS}`);
    return parts.join(' · ');
  })();

  const fmtForm = (v) => {
    const n = Math.round(Number(v) || 0);
    return n > 0 ? `+${n}` : String(n);
  };

  if (loadingActs) {
    return (
      <div className="rounded-xl p-6 text-sm text-center" style={{ background: IOS.fill, color: IOS.secondary, fontFamily: FONT }}>
        Loading fitness data…
      </div>
    );
  }

  if (!chartOption) {
    return (
      <div className="rounded-xl p-6 text-sm text-center" style={{ background: IOS.fill, color: IOS.secondary, fontFamily: FONT }}>
        Not enough training data to show Form &amp; Fitness.
      </div>
    );
  }

  return (
    <>
      <div style={{ fontFamily: FONT }}>
        {/* Title, the sport filter, and the one place the explanations live */}
        <div className="flex items-center gap-2">
          <div className="text-[15px] font-semibold tracking-[-0.01em] flex-1 min-w-0 truncate" style={{ color: IOS.label }}>
            Form &amp; Fitness
          </div>
          {/* Fitness for one discipline. A triathlete's cycling CTL and
              running CTL move independently, and the combined line hides
              which one is actually building. */}
          <Segmented dense value={sportFilter} options={SPORT_FILTERS} onChange={setSportFilter} ariaLabel="Sport" />
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="What Fitness, Fatigue and Form mean"
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[13px] font-semibold touch-manipulation"
            style={{ background: IOS.fill, color: IOS.secondary }}
          >
            i
          </button>
        </div>

        {/* The day being read, then its three numbers */}
        <div className="mt-2.5 text-[11px] tabular-nums truncate" style={{ color: IOS.secondary }}>
          {dateLine}
        </div>
        <div className="mt-1 grid grid-cols-3 gap-3">
          <Stat
            label="Fitness"
            value={Math.round(headline.fitness ?? 0)}
            sub={scrubbing ? '' : deltaText(restHeadline.fitnessChange)}
            color={PMC_COLORS.fitness}
          />
          <Stat
            label="Form"
            value={fmtForm(headline.form)}
            sub={scrubbing ? '' : deltaText(restHeadline.formChange)}
            color={PMC_COLORS.form}
          />
          <Stat
            label="Fatigue"
            value={Math.round(headline.fatigue ?? 0)}
            sub={scrubbing ? '' : deltaText(restHeadline.fatigueChange)}
            color={PMC_COLORS.fatigue}
          />
        </div>

        {/* The chart — to the card's edge on a phone */}
        <div
          className={isMobile ? '-mx-3 mt-2' : 'mt-3'}
          style={{ touchAction: 'pan-y' }}
          onTouchEnd={releaseScrub}
          onTouchCancel={releaseScrub}
        >
          {Chart && (
            <Chart
              ref={chartRef}
              key={isMobile ? 'pmc' : zoomResetKey}
              option={chartOption}
              style={{ height: chartHeight, width: '100%' }}
              notMerge
              onEvents={chartEvents}
            />
          )}
        </div>

        {/* How far back the curve goes */}
        <div className="mt-2">
          <Segmented value={viewDays} options={TIME_RANGES} onChange={setViewDays} ariaLabel="Range" />
        </div>
      </div>

      <FormFitnessHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
