import React, { useCallback, useEffect, useMemo, useState } from 'react';
import EChartsModule from 'echarts-for-react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
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
import { getTsbStatus } from '../../utils/formFitnessMetrics';
import { TSS_DISPLAY_MODE_EVENT } from '../../utils/uiPrefs';
import { pmcAxisDomainsFromPoints, PMC_COLORS, PMC_VIEW_DAY_RANGES, PMC_MAX_VIEW_DAYS, pmcDefaultZoomWindow } from '../../utils/pmcChartAxes';
import FormFitnessHelpSheet from './FormFitnessHelpSheet';

const ReactECharts = EChartsModule?.default ?? EChartsModule;

const TIME_RANGES = PMC_VIEW_DAY_RANGES;

function deltaText(delta) {
  const n = Math.abs(Math.round(delta || 0));
  if (!n) return '—';
  return `${delta > 0 ? '↑' : '↓'} ${n} from yesterday`;
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
}) {
  const [viewDays, setViewDays] = useState(90);
  const [pmcActivities, setPmcActivities] = useState([]);
  const [loadingActs, setLoadingActs] = useState(true);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [zoomResetKey, setZoomResetKey] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tssTick, setTssTick] = useState(0);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [showProjection, setShowProjection] = useState(true);

  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );

  const reloadActivities = useCallback(async () => {
    if (!athleteId) {
      setPmcActivities([]);
      setLoadingActs(false);
      return;
    }

    const cached = readCalendarActivitiesCache(athleteId);
    if (cached.length > 0) {
      setPmcActivities(cached);
      setLoadingActs(false);
      return;
    }

    setLoadingActs(true);
    try {
      const list = await fetchCalendarActivitiesForPmc(api, athleteId);
      setPmcActivities(Array.isArray(list) ? list : []);
    } catch {
      setPmcActivities([]);
    } finally {
      setLoadingActs(false);
    }
  }, [athleteId]);

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
      sportFilter: 'all',
      tssUser: user,
    });
    return { fullSeries: series, todayMetrics: tm };
  }, [pmcActivities, profile, user, tssTick]);

  const projection = useMemo(() => {
    if (!showProjection || !fullSeries.length || !plannedWorkouts.length) return [];
    const plannedTssByDate = buildPlannedTssByDate(plannedWorkouts);
    return computePmcProjection(fullSeries, plannedTssByDate);
  }, [showProjection, fullSeries, plannedWorkouts]);

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

  const displayPoint = hoverIndex >= 0 ? chartSeries[hoverIndex] : null;
  const headline = todayMetrics || {
    fitness: displayPoint?.Fitness ?? 0,
    fatigue: displayPoint?.Fatigue ?? 0,
    form: displayPoint?.Form ?? 0,
    fitnessChange: 0,
    fatigueChange: 0,
    formChange: 0,
  };

  const showPoint = displayPoint || (chartSeries.length ? chartSeries[chartSeries.length - 1] : null);
  const tsbStatus = showPoint ? getTsbStatus(showPoint.Form) : null;

  const todayKey = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  const axisDomains = useMemo(
    () => pmcAxisDomainsFromPoints(chartSeries),
    [chartSeries],
  );

  const chartOption = useMemo(() => {
    if (!chartSeries.length) return null;

    const labels = chartSeries.map((d) => {
      if (d.dateLabel) return d.dateLabel;
      const [, m, day] = d.date.split('-');
      return `${day}.${m}.`;
    });

    const actualCount = chartSeries.filter((d) => !d.projected).length;
    const todayLabel = actualCount > 0
      ? labels[actualCount - 1]
      : null;

    const defaultWindow = pmcDefaultZoomWindow(viewDays, actualCount || chartSeries.length);
    const zoomStart = chartSeries.length > defaultWindow
      ? Math.round(((chartSeries.length - defaultWindow) / chartSeries.length) * 100)
      : 0;

    const legendItems = ['Fitness (CTL)', 'Fatigue (ATL)', 'Form (TSB)'];
    if (hasProjection) legendItems.push('Planned (projected)');

    return {
      backgroundColor: 'transparent',
      animation: false,
      legend: {
        data: legendItems,
        top: 0,
        left: 0,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { fontSize: isMobile ? 10 : 11, color: '#6b7280' },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', crossStyle: { color: '#94a3b8' } },
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
        textStyle: { fontSize: 12, color: '#111827' },
        formatter(params) {
          if (!Array.isArray(params) || !params[0]) return '';
          const idx = params[0].dataIndex;
          const d = chartSeries[idx];
          if (!d) return '';
          const planned = d.projected ? ' · Planned' : '';
          let html = `<div style="font-weight:600;margin-bottom:4px">${d.date}${planned}</div>`;
          if (d.projected) {
            if (d.fitnessProj != null) html += `<div><span style="color:#2563eb">●</span> Fitness (CTL): <b>${d.fitnessProj}</b></div>`;
            if (d.fatigueProj != null) html += `<div><span style="color:#db2777">●</span> Fatigue (ATL): <b>${d.fatigueProj}</b></div>`;
            if (d.formProj != null) html += `<div><span style="color:#f97316">●</span> Form (TSB): <b>${d.formProj}</b></div>`;
          } else {
            if (d.Fitness != null) html += `<div><span style="color:#2563eb">●</span> Fitness (CTL): <b>${d.Fitness}</b></div>`;
            if (d.Fatigue != null) html += `<div><span style="color:#db2777">●</span> Fatigue (ATL): <b>${d.Fatigue}</b></div>`;
            if (d.Form != null) html += `<div><span style="color:#f97316">●</span> Form (TSB): <b>${d.Form}</b></div>`;
          }
          if (d.TSS > 0) {
            html += `<div style="color:#6b7280;margin-top:2px">${d.projected ? 'Planned' : 'Daily'} TSS: ${d.TSS}</div>`;
          }
          return html;
        },
      },
      grid: {
        left: 48,
        right: 44,
        top: 36,
        bottom: isMobile ? 56 : 48,
        containLabel: false,
      },
      dataZoom: [
        {
          type: 'inside',
          start: zoomStart,
          end: 100,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
        },
        {
          type: 'slider',
          start: zoomStart,
          end: 100,
          height: 20,
          bottom: 4,
          borderColor: '#e5e7eb',
          fillerColor: 'rgba(94, 101, 144, 0.12)',
          handleStyle: { color: '#5E6590' },
          textStyle: { fontSize: 10, color: '#9ca3af' },
        },
      ],
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLabel: { fontSize: isMobile ? 9 : 10, color: '#9ca3af', interval: 'auto' },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          name: 'TSS/d',
          nameLocation: 'middle',
          nameGap: 34,
          nameTextStyle: { fontSize: 10, color: '#9ca3af' },
          min: 0,
          max: axisDomains.tssMax,
          interval: axisDomains.tssMax <= 150 ? 25 : 50,
          position: 'left',
          axisLabel: { fontSize: 10, color: '#9ca3af' },
          splitLine: { lineStyle: { color: '#f3f4f6' } },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        {
          type: 'value',
          name: 'Form (TSB)',
          nameLocation: 'middle',
          nameGap: 34,
          nameTextStyle: { fontSize: 10, color: PMC_COLORS.form },
          min: axisDomains.min,
          max: axisDomains.max,
          interval: axisDomains.max <= 60 ? 15 : 25,
          position: 'right',
          axisLabel: { fontSize: 10, color: PMC_COLORS.form },
          splitLine: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        },
      ],
      series: [
        {
          name: 'Fitness (CTL)',
          type: 'line',
          yAxisIndex: 0,
          smooth: 0.35,
          symbol: 'none',
          connectNulls: false,
          lineStyle: { color: PMC_COLORS.fitness, width: 2.5 },
          itemStyle: { color: PMC_COLORS.fitness },
          areaStyle: { color: 'rgba(37, 99, 235, 0.15)' },
          data: chartSeries.map((d) => (d.projected ? null : d.Fitness)),
          z: 3,
          markLine: todayLabel && hasProjection ? {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#94a3b8', type: 'dashed' },
            data: [{ xAxis: todayLabel, label: { formatter: 'Today', fontSize: 10, color: '#64748b' } }],
          } : undefined,
        },
        {
          name: 'Fatigue (ATL)',
          type: 'line',
          yAxisIndex: 0,
          smooth: 0.35,
          symbol: 'none',
          connectNulls: false,
          lineStyle: { color: PMC_COLORS.fatigue, width: 2.5 },
          itemStyle: { color: PMC_COLORS.fatigue },
          data: chartSeries.map((d) => (d.projected ? null : d.Fatigue)),
          z: 2,
        },
        {
          name: 'Form (TSB)',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.35,
          symbol: 'none',
          connectNulls: false,
          lineStyle: { color: PMC_COLORS.form, width: 2 },
          itemStyle: { color: PMC_COLORS.form },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#d1d5db', type: 'dashed' },
            data: [{ yAxis: 0 }],
            label: { show: false },
          },
          data: chartSeries.map((d) => (d.projected ? null : d.Form)),
          z: 1,
        },
        ...(hasProjection ? [
          {
            name: 'Planned (projected)',
            type: 'line',
            yAxisIndex: 0,
            smooth: 0.35,
            symbol: 'none',
            connectNulls: true,
            lineStyle: { color: PMC_COLORS.fitness, width: 2, type: [6, 4] },
            itemStyle: { color: PMC_COLORS.fitness },
            data: chartSeries.map((d) => d.fitnessProj ?? null),
            z: 0,
          },
          {
            name: 'Planned (projected)',
            type: 'line',
            yAxisIndex: 0,
            smooth: 0.35,
            symbol: 'none',
            connectNulls: true,
            lineStyle: { color: PMC_COLORS.fatigue, width: 2, type: [6, 4] },
            itemStyle: { color: PMC_COLORS.fatigue },
            data: chartSeries.map((d) => d.fatigueProj ?? null),
            z: 0,
          },
          {
            name: 'Planned (projected)',
            type: 'line',
            yAxisIndex: 1,
            smooth: 0.35,
            symbol: 'none',
            connectNulls: true,
            lineStyle: { color: PMC_COLORS.form, width: 2, type: [6, 4] },
            itemStyle: { color: PMC_COLORS.form },
            data: chartSeries.map((d) => d.formProj ?? null),
            z: 0,
          },
        ] : []),
      ],
    };
  }, [chartSeries, viewDays, isMobile, hasProjection, axisDomains]);

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
    globalout: () => {
      const actualCount = chartSeries.filter((d) => !d.projected).length;
      setHoverIndex(actualCount > 0 ? actualCount - 1 : Math.max(0, chartSeries.length - 1));
    },
  }), [chartSeries]);

  const Chart = typeof ReactECharts === 'function' ? ReactECharts : null;
  const chartHeight = isMobile ? 280 : 320;

  const dateLabel = (() => {
    if (!showPoint) return '';
    try {
      const d = new Date(`${showPoint.date}T12:00:00`);
      const short = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (showPoint.projected) return `${short} · Planned`;
      return showPoint.date === todayKey ? `${short} · Today` : short;
    } catch {
      return showPoint.date;
    }
  })();

  if (loadingActs) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 text-sm text-gray-400 text-center">
        Loading fitness data…
      </div>
    );
  }

  if (!chartOption) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 text-sm text-gray-400 text-center">
        Not enough training data to show Form &amp; Fitness.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-gray-900">Form &amp; Fitness</div>
            <p className="text-xs text-gray-500 mt-0.5">
              Solid = actual · dashed = planned TSS (8 weeks ahead)
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => setShowProjection((v) => !v)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                showProjection
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              {showProjection ? 'Projection on' : 'Projection off'}
            </button>
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setViewDays(r.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    viewDays === r.id ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setZoomResetKey((k) => k + 1); reloadActivities(); }}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
              title="Reset zoom & refresh"
              aria-label="Reset zoom and refresh"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="text-xs font-semibold text-primary hover:underline px-1"
            >
              Help
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50/60 rounded-xl px-3 py-2.5 border border-blue-100">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Fitness</div>
            <div className="text-xl font-bold text-blue-600 tabular-nums mt-0.5">
              {Math.round(headline.fitness)}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">{deltaText(headline.fitnessChange)}</div>
          </div>
          <div className="bg-orange-50/60 rounded-xl px-3 py-2.5 border border-orange-100">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Form</div>
            <div className={`text-xl font-bold tabular-nums mt-0.5 ${
              headline.form < 0 ? 'text-orange-600' : 'text-orange-500'
            }`}>
              {headline.form > 0 ? `+${Math.round(headline.form)}` : Math.round(headline.form)}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">{deltaText(headline.formChange)}</div>
          </div>
          <div className="bg-pink-50/60 rounded-xl px-3 py-2.5 border border-pink-100">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Fatigue</div>
            <div className="text-xl font-bold text-pink-600 tabular-nums mt-0.5">
              {Math.round(headline.fatigue)}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">{deltaText(headline.fatigueChange)}</div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 relative">
          {Chart && (
            <Chart
              key={zoomResetKey}
              option={chartOption}
              style={{ height: chartHeight, width: '100%' }}
              notMerge
              onEvents={chartEvents}
            />
          )}
          <p className="mt-1 text-[11px] text-gray-400 text-center">
            {dateLabel}
            {showPoint?.TSS > 0 ? ` · Daily TSS ${showPoint.TSS}` : ''}
            {tsbStatus ? ` · ${tsbStatus.label}` : ''}
          </p>
          <p className="text-[10px] text-gray-400 text-center mt-0.5">
            Scroll or drag the slider to zoom · dashed lines = future from planned workouts
          </p>
        </div>
      </div>

      <FormFitnessHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
