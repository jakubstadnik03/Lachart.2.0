import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Line } from 'recharts';
import { InformationCircleIcon, ChevronDownIcon, EllipsisHorizontalIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { getFormFitnessData, getTodayMetrics, getRaceEvents } from '../../services/api';
import { getPlannedWorkouts } from '../../services/workoutPlannerApi';
import { fetchWellness } from '../../services/wellnessData';
import { useAuth } from '../../context/AuthProvider';
import TrainingGlossary from './TrainingGlossary';
import { TSS_DISPLAY_MODE_EVENT, clearFormFitnessCache } from '../../utils/uiPrefs';
import { computePmcFromActivities } from '../../utils/formFitnessFromActivities';
import { enrichProfileForTss, hasInferredThresholds, mergeProfileZones } from '../../utils/inferThresholdsFromActivities';
import { requestTrainingZonesModal, profileNeedsTrainingZones } from '../../utils/trainingZonesSetup';
import { pmcAxisDomainsFromPoints, PMC_COLORS, FORM_FITNESS_TIME_RANGES, FORM_FITNESS_TIME_RANGE_VALUES, daysFromFormFitnessTimeRange } from '../../utils/pmcChartAxes';

// Total planned duration in seconds (respects interval-group repeats).
const planStepTotalSecs = (steps) => {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach((s) => {
    if (!s.groupId) { total += s.durationSeconds || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const reps = (group.find((x) => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach((gs) => { total += (gs.durationSeconds || 0) * reps; });
  });
  return total;
};

// Estimate a planned session's TSS when no explicit targetTss was set.
// Falls back to duration × ~50 TSS/h (≈ endurance IF 0.7) so the projection
// still reacts to planned volume.
const estimatePlannedTss = (pw) => {
  const explicit = Number(pw?.targetTss || 0);
  if (explicit > 0) return explicit;
  let secs = Number(pw?.plannedDuration || 0);
  if (!secs && Array.isArray(pw?.steps)) {
    secs = planStepTotalSecs(pw.steps) || 0;
  }
  if (secs > 0 && secs < 24 * 3600) return (secs / 3600) * 50;
  return 0;
};

const FormFitnessChart = ({ athleteId, activities = null, userProfile = null, activitiesLoading = false, headlineMetrics = null }) => {
  const { user } = useAuth();
  const profile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );
  const calendarDriven = activities != null;
  const isCoachView = !!user?._id && athleteId && String(athleteId) !== String(user._id);
  const [wellness, setWellness] = useState([]);
  const [showRecovery, setShowRecovery] = useState(() => {
    try { return localStorage.getItem('formFitnessShowRecovery') === 'true'; } catch { return false; }
  });
  const [showGlossary, setShowGlossary] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('Form & Fitness');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [showSettings, setShowSettings] = useState(false);
  const [usingInferredZones, setUsingInferredZones] = useState(false);

  const [todayMetrics, setTodayMetrics] = useState({
    fitness: 0,
    fatigue: 0,
    form: 0,
    fitnessChange: 0,
    fatigueChange: 0,
    formChange: 0
  });
  
  // Load time range from localStorage or default to 60 days
  const getStoredTimeRange = () => {
    try {
      const stored = localStorage.getItem('formFitnessTimeRange');
      if (stored && FORM_FITNESS_TIME_RANGE_VALUES.includes(stored)) {
        return stored;
      }
    } catch (error) {
      console.error('Error reading from localStorage:', error);
    }
    return '60 days';
  };

  // Load sport filter from localStorage or default to 'all'
  const getStoredSportFilter = () => {
    try {
      const stored = localStorage.getItem('formFitnessSportFilter');
      if (stored && ['all', 'bike', 'run', 'swim'].includes(stored)) {
        return stored;
      }
    } catch (error) {
      console.error('Error reading from localStorage:', error);
    }
    return 'all';
  };
  
  const [timeRange, setTimeRange] = useState(getStoredTimeRange());
  const [sportFilter, setSportFilter] = useState(getStoredSportFilter());
  const [chartData, setChartData] = useState([]);
  const [plannedTssByDate, setPlannedTssByDate] = useState({}); // future planned TSS keyed by YYYY-MM-DD
  const [showProjection, setShowProjection] = useState(() => {
    try { return localStorage.getItem('formFitnessShowProjection') !== 'false'; } catch { return true; }
  });
  const [raceTarget, setRaceTarget] = useState(null); // next race with a CTL target → drawn as a reference line
  const [loading, setLoading] = useState(true);
  const [tssModeTick, setTssModeTick] = useState(0);
  const [zoomRange, setZoomRange] = useState(null); // { start: number, end: number } indices in chartData
  const [refAreaLeft, setRefAreaLeft] = useState(null); // global index in chartData
  const [refAreaRight, setRefAreaRight] = useState(null); // global index in chartData
  const selectionStartRef = useRef(null); // global index (doesn't cause rerenders on simple click)

  const [deltaMode, setDeltaMode] = useState(() => {
    try {
      return localStorage.getItem('formFitnessDeltaMode') || 'yesterday';
    } catch (e) {
      return 'yesterday';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('formFitnessDeltaMode', deltaMode);
    } catch (e) {
      // ignore
    }
  }, [deltaMode]);
  
  // Save time range to localStorage when it changes
  const handleTimeRangeChange = (newTimeRange) => {
    setTimeRange(newTimeRange);
    try {
      localStorage.setItem('formFitnessTimeRange', newTimeRange);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  // Save sport filter to localStorage when it changes
  const handleSportFilterChange = (newSportFilter) => {
    setSportFilter(newSportFilter);
    try {
      localStorage.setItem('formFitnessSportFilter', newSportFilter);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  useEffect(() => {
    const onTssModeChange = () => {
      clearFormFitnessCache();
      setTssModeTick((t) => t + 1);
    };
    const onMetricsUpdated = () => {
      clearFormFitnessCache();
      setTssModeTick((t) => t + 1);
    };
    window.addEventListener(TSS_DISPLAY_MODE_EVENT, onTssModeChange);
    window.addEventListener('activityMetricsUpdated', onMetricsUpdated);
    return () => {
      window.removeEventListener(TSS_DISPLAY_MODE_EVENT, onTssModeChange);
      window.removeEventListener('activityMetricsUpdated', onMetricsUpdated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!athleteId) {
        if (cancelled) return;
        setChartData([]);
        setTodayMetrics({
          fitness: 0,
          fatigue: 0,
          form: 0,
          fitnessChange: 0,
          fatigueChange: 0,
          formChange: 0
        });
        setLoading(false);
        return;
      }

      // Convert time range to days
      const days = daysFromFormFitnessTimeRange(timeRange);

      // Dashboard: wait for calendar — never paint stale API/cache while loading.
      if (calendarDriven) {
        if (activitiesLoading || !profile) {
          if (!cancelled) setLoading(true);
          return;
        }
        if (Array.isArray(activities) && activities.length > 0) {
          setUsingInferredZones(
            profileNeedsTrainingZones(profile)
            && hasInferredThresholds(enrichProfileForTss(profile, activities)),
          );
          const { series, todayMetrics: tm } = computePmcFromActivities(activities, profile, {
            displayDays: days,
            sportFilter,
            tssUser: user,
          });
          if (cancelled) return;
          setChartData(series.length ? series : []);
          if (tm) setTodayMetrics(tm);
          setLoading(false);
          return;
        }
        if (!cancelled) {
          setChartData([]);
          setLoading(false);
        }
        return;
      }

      // Prefer calendar activities when passed without explicit calendar-driven flag.
      if (Array.isArray(activities) && activities.length > 0 && profile) {
        setUsingInferredZones(
          profileNeedsTrainingZones(profile)
          && hasInferredThresholds(enrichProfileForTss(profile, activities)),
        );
        const { series, todayMetrics: tm } = computePmcFromActivities(activities, profile, {
          displayDays: days,
          sportFilter,
          tssUser: user,
        });
        if (cancelled) return;
        if (series.length) {
          setChartData(series);
          if (tm) setTodayMetrics(tm);
          setLoading(false);
          return;
        }
      }

      const cacheKeySeries = `formFitness_series_${athleteId}_${days}_${sportFilter}`;
      const cacheKeyToday = `formFitness_today_${athleteId}`;
      const tsSeries = `${cacheKeySeries}_ts`;
      const tsToday = `${cacheKeyToday}_ts`;
      const SERIES_TTL = 10 * 60 * 1000; // 10 minutes
      const TODAY_TTL = 5 * 60 * 1000;   // 5 minutes

      let usedCache = false;

      // Dashboard calendar-driven mode: skip stale localStorage — wait for live calendar or API.
      if (!calendarDriven) {
      // 1) Try to paint from cache first
      try {
        const now = Date.now();

        const cachedSeries = localStorage.getItem(cacheKeySeries);
        const tsS = localStorage.getItem(tsSeries);
        if (cachedSeries && tsS) {
          const age = now - parseInt(tsS, 10);
          if (!Number.isNaN(age) && age < SERIES_TTL) {
            const parsed = JSON.parse(cachedSeries);
            if (Array.isArray(parsed)) {
              setChartData(parsed);
              usedCache = true;
            }
          }
        }

        const cachedToday = localStorage.getItem(cacheKeyToday);
        const tsT = localStorage.getItem(tsToday);
        if (cachedToday && tsT) {
          const age = now - parseInt(tsT, 10);
          if (!Number.isNaN(age) && age < TODAY_TTL) {
            const parsed = JSON.parse(cachedToday);
            if (parsed && typeof parsed === 'object') {
              setTodayMetrics(parsed);
            }
          }
        }

        if (usedCache) {
          setLoading(false);
        }
      } catch (e) {
        console.warn('Error reading form & fitness cache:', e);
      }
      }

      try {
        if (!usedCache) {
          setLoading(true);
        }

        const [ffResponse, todayResponse] = await Promise.all([
          getFormFitnessData(athleteId, days, sportFilter),
          getTodayMetrics(athleteId)
        ]);

        if (cancelled) return;

        if (ffResponse && ffResponse.data) {
          setChartData(ffResponse.data);
          // cache time series
          try {
            const payload = JSON.stringify(ffResponse.data);
            if (payload.length < 150000) {
              localStorage.setItem(cacheKeySeries, payload);
              localStorage.setItem(tsSeries, Date.now().toString());
            }
          } catch (e) {
            console.warn('Error saving form & fitness series cache:', e);
          }
        } else {
          setChartData([]);
        }

        if (todayResponse && todayResponse.data) {
          setTodayMetrics(todayResponse.data);
          try {
            const payload = JSON.stringify(todayResponse.data);
            if (payload.length < 20000) {
              localStorage.setItem(cacheKeyToday, payload);
              localStorage.setItem(tsToday, Date.now().toString());
            }
          } catch (e) {
            console.warn('Error saving today metrics cache:', e);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading form fitness data:', error);
          setChartData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [athleteId, timeRange, sportFilter, tssModeTick, activities, profile, activitiesLoading, calendarDriven, user]);

  // Next race with a CTL target → draw it as a horizontal reference line so the
  // athlete sees the fitness they're building toward (TrainingPeaks-style).
  useEffect(() => {
    let cancelled = false;
    if (!athleteId) { setRaceTarget(null); return undefined; }
    (async () => {
      try {
        const from = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        const { data } = await getRaceEvents(athleteId, { from });
        const next = (Array.isArray(data) ? data : []).find(r => r.targetCTL != null);
        if (!cancelled) setRaceTarget(next ? { ctl: Number(next.targetCTL), name: next.name } : null);
      } catch { if (!cancelled) setRaceTarget(null); }
    })();
    return () => { cancelled = true; };
  }, [athleteId]);

  useEffect(() => {
    try { localStorage.setItem('formFitnessShowProjection', String(showProjection)); } catch { /* ignore */ }
  }, [showProjection]);

  useEffect(() => {
    try { localStorage.setItem('formFitnessShowRecovery', String(showRecovery)); } catch { /* ignore */ }
  }, [showRecovery]);

  // Load Apple Health recovery (resting HR / HRV) for the overlay. Works for
  // the logged-in user and for coaches viewing a linked athlete (?athleteId).
  useEffect(() => {
    let cancelled = false;
    if (!athleteId) { setWellness([]); return undefined; }
    const n = Math.min(Math.max(parseInt(timeRange, 10) || 60, 7), 90);
    (async () => {
      try {
        const w = await fetchWellness(n, isCoachView ? athleteId : null);
        if (!cancelled) setWellness(w.days || []);
      } catch { if (!cancelled) setWellness([]); }
    })();
    return () => { cancelled = true; };
  }, [athleteId, isCoachView, timeRange]);

  // Load FUTURE planned workouts so the chart can project Fitness/Form/Fatigue
  // forward from their planned TSS (up to ~8 weeks ahead).
  useEffect(() => {
    let cancelled = false;
    if (!athleteId) { setPlannedTssByDate({}); return undefined; }
    (async () => {
      try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const from = new Date(today); from.setDate(from.getDate() + 1);
        const to = new Date(today); to.setDate(to.getDate() + 56);
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const data = await getPlannedWorkouts({ from: iso(from), to: iso(to), athleteId });
        const list = Array.isArray(data) ? data : [];
        const map = {};
        list.forEach((pw) => {
          if (pw?.status === 'completed' || pw?.status === 'skipped') return;
          const sport = (pw?.sport || '').toLowerCase();
          if (sportFilter !== 'all' && sport !== sportFilter) return;
          const day = typeof pw?.date === 'string' ? pw.date.slice(0, 10) : '';
          if (!day) return;
          map[day] = (map[day] || 0) + estimatePlannedTss(pw);
        });
        if (!cancelled) setPlannedTssByDate(map);
      } catch { if (!cancelled) setPlannedTssByDate({}); }
    })();
    return () => { cancelled = true; };
  }, [athleteId, sportFilter]);

  // Detect mobile for carousel behavior
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const timeframeLabel = useMemo(() => {
    const days = daysFromFormFitnessTimeRange(timeRange);
    return `${days} days`;
  }, [timeRange]);

  // Headline CTL/ATL/TSB — always all sports, same source as native Performance Insights.
  const headlinePmc = useMemo(() => {
    // Calendar-driven: always derive KPIs locally with the user's zones (matches mobile app).
    if (calendarDriven && Array.isArray(activities) && activities.length && profile) {
      const { todayMetrics: tm } = computePmcFromActivities(activities, profile, { sportFilter: 'all', tssUser: user });
      if (tm) return tm;
    }
    if (!calendarDriven && headlineMetrics && (
      headlineMetrics.fitness != null
      || headlineMetrics.form != null
      || headlineMetrics.fatigue != null
    )) {
      return headlineMetrics;
    }
    if (Array.isArray(activities) && activities.length && profile) {
      const { todayMetrics: tm } = computePmcFromActivities(activities, profile, { sportFilter: 'all', tssUser: user });
      if (tm) return tm;
    }
    return todayMetrics;
  }, [calendarDriven, headlineMetrics, activities, profile, todayMetrics, user]);

  const insights = useMemo(() => {
    const fitness = Math.round(Number(headlinePmc?.fitness ?? 0));
    const fatigue = Math.round(Number(headlinePmc?.fatigue ?? 0));
    const form = Math.round(Number(headlinePmc?.form ?? 0));

    const hasHeadline = headlinePmc && (
      headlinePmc.fitness != null || headlinePmc.fatigue != null || headlinePmc.form != null
    );
    if (!hasHeadline && (!chartData || chartData.length === 0)) return null;

    const first = chartData?.[0];

    const getIdxFromEnd = (daysBack) => Math.max(0, (chartData?.length || 1) - 1 - daysBack);

    let fitnessDelta = 0;
    let fatigueDelta = 0;
    let formDelta = 0;
    let deltaLabel = '';

    if (deltaMode === 'yesterday') {
      fitnessDelta = Number(headlinePmc?.fitnessChange ?? 0);
      fatigueDelta = Number(headlinePmc?.fatigueChange ?? 0);
      formDelta = Number(headlinePmc?.formChange ?? 0);
      deltaLabel = 'from yesterday';
    } else if (deltaMode === '7d' && chartData?.length) {
      const base = chartData[getIdxFromEnd(7)] || first;
      fitnessDelta = fitness - Number(base?.Fitness || 0);
      fatigueDelta = fatigue - Number(base?.Fatigue || 0);
      formDelta = form - Number(base?.Form || 0);
      deltaLabel = 'over 7 days';
    } else if (deltaMode === '28d' && chartData?.length) {
      const base = chartData[getIdxFromEnd(28)] || first;
      fitnessDelta = fitness - Number(base?.Fitness || 0);
      fatigueDelta = fatigue - Number(base?.Fatigue || 0);
      formDelta = form - Number(base?.Form || 0);
      deltaLabel = 'over 28 days';
    } else if (chartData?.length) {
      fitnessDelta = fitness - Number(first?.Fitness || 0);
      fatigueDelta = fatigue - Number(first?.Fatigue || 0);
      formDelta = form - Number(first?.Form || 0);
      deltaLabel = `over ${timeframeLabel}`;
    } else {
      fitnessDelta = Number(headlinePmc?.fitnessChange ?? 0);
      fatigueDelta = Number(headlinePmc?.fatigueChange ?? 0);
      formDelta = Number(headlinePmc?.formChange ?? 0);
      deltaLabel = 'from yesterday';
    }

    const fitnessStatus =
      fitnessDelta > 5 ? 'Productive Training' :
      fitnessDelta < -5 ? 'Detraining' :
      'Maintaining';

    const formStatus =
      form <= -30 ? 'Overloading' :
      form <= -10 ? 'Fatigued' :
      form < 10 ? 'Normal' :
      'Fresh';

    const fatigueStatus =
      fatigueDelta > 5 ? 'Building Fatigue' :
      fatigueDelta < -5 ? 'Shedding Fatigue' :
      'Maintaining Fatigue';

    return {
      fitness, fatigue, form,
      fitnessDelta, fatigueDelta, formDelta,
      fitnessStatus, fatigueStatus, formStatus,
      deltaLabel
    };
  }, [chartData, deltaMode, timeframeLabel, headlinePmc]);

  // ── Future projection from planned workouts (TrainingPeaks-style PMC) ──
  // Continues the CTL/ATL/TSB recurrence forward using planned TSS so coaches
  // and athletes can see how the plan will shape fitness/form before it happens.
  const projection = useMemo(() => {
    if (!showProjection || !chartData || chartData.length === 0) return [];
    const days = Object.keys(plannedTssByDate);
    if (days.length === 0) return [];
    const last = chartData[chartData.length - 1];
    let ctl = Number(last.Fitness || 0);
    let atl = Number(last.Fatigue || 0);
    const lastDate = new Date(last.date); lastDate.setHours(0, 0, 0, 0);
    const maxDay = days.reduce((m, d) => (d > m ? d : m), days[0]);
    const end = new Date(maxDay); end.setHours(0, 0, 0, 0);
    const alphaCTL = 1 / 42;
    const alphaATL = 1 / 7;
    const out = [];
    const d = new Date(lastDate);
    d.setDate(d.getDate() + 1);
    let guard = 0;
    while (d <= end && guard < 120) {
      guard++;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const tss = plannedTssByDate[key] || 0;
      const form = ctl - atl; // TSB = yesterday's balance (before today's TSS)
      ctl = ctl + alphaCTL * (tss - ctl);
      atl = atl + alphaATL * (tss - atl);
      out.push({
        date: key,
        dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        projected: true,
        FitnessProj: Math.round(ctl),
        FatigueProj: Math.round(atl),
        FormProj: Math.round(form),
        PlannedTSS: Math.round(tss),
      });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [showProjection, chartData, plannedTssByDate]);

  const wellnessByDate = useMemo(() => {
    const m = {};
    (wellness || []).forEach((d) => { if (d?.date) m[d.date] = d; });
    return m;
  }, [wellness]);
  const hasWellness = (wellness || []).length > 0;

  // Actual series + projected tail. The last actual point also carries the
  // *Proj fields so the dashed projection line connects seamlessly. Recovery
  // (resting HR / HRV) is merged onto matching days for the optional overlay.
  const chartDataExtended = useMemo(() => {
    if (!chartData || chartData.length === 0) return chartData || [];
    const lastIdx = chartData.length - 1;
    const base = chartData.map((p, i) => {
      const w = wellnessByDate[p.date];
      const merged = w
        ? { ...p, rhr: w.restingHeartRate ?? null, hrv: w.hrvMs ?? null }
        : p;
      if (projection.length > 0 && i === lastIdx) {
        return { ...merged, FitnessProj: p.Fitness, FatigueProj: p.Fatigue, FormProj: p.Form };
      }
      return merged;
    });
    return projection.length > 0 ? [...base, ...projection] : base;
  }, [chartData, projection, wellnessByDate]);

  const hasProjection = projection.length > 0;
  const todayLabel = (chartData && chartData.length > 0) ? chartData[chartData.length - 1].dateLabel : null;

  const handleInfoClick = (term) => {
    setSelectedTerm(term);
    setShowGlossary(true);
  };

  const deltaDisplayText = (delta, label) => {
    const n = Math.abs(Math.round(delta));
    if (!label) return '';
    return `${delta >= 0 ? '↑' : '↓'} ${n} ${label}`;
  };

  const effectiveZoomRange = useMemo(() => {
    if (!chartDataExtended || chartDataExtended.length === 0) return { start: 0, end: 0 };
    const start = zoomRange?.start != null ? Math.max(0, Math.min(chartDataExtended.length - 1, zoomRange.start)) : 0;
    const end = zoomRange?.end != null ? Math.max(0, Math.min(chartDataExtended.length - 1, zoomRange.end)) : (chartDataExtended.length - 1);
    return start <= end ? { start, end } : { start: end, end: start };
  }, [chartDataExtended, zoomRange]);

  const zoomedData = useMemo(() => {
    if (!chartDataExtended || chartDataExtended.length === 0) return [];
    return chartDataExtended.slice(effectiveZoomRange.start, effectiveZoomRange.end + 1);
  }, [chartDataExtended, effectiveZoomRange]);

  const axisDomains = useMemo(
    () => pmcAxisDomainsFromPoints(zoomedData),
    [zoomedData],
  );

  // If data length changes (filters/time range), keep zoom in bounds / reset selection
  useEffect(() => {
    setRefAreaLeft(null);
    setRefAreaRight(null);
    if (!chartData || chartData.length === 0) {
      setZoomRange(null);
      return;
    }
    if (!zoomRange) return;
    if (zoomRange.start >= chartData.length || zoomRange.end >= chartData.length) {
      setZoomRange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData.length]);

  const selectionX1 = useMemo(() => {
    if (refAreaLeft == null) return null;
    return chartDataExtended?.[refAreaLeft]?.dateLabel ?? null;
  }, [refAreaLeft, chartDataExtended]);

  const selectionX2 = useMemo(() => {
    if (refAreaRight == null) return null;
    return chartDataExtended?.[refAreaRight]?.dateLabel ?? null;
  }, [refAreaRight, chartDataExtended]);

  const getGlobalIndexFromChartEvent = (e) => {
    if (!e) return null;
    if (typeof e.activeTooltipIndex === 'number' && e.activeTooltipIndex >= 0) {
      return effectiveZoomRange.start + e.activeTooltipIndex;
    }
    if (e.activeLabel) {
      const idx = chartDataExtended.findIndex(d => d.dateLabel === e.activeLabel);
      return idx >= 0 ? idx : null;
    }
    return null;
  };

  const isTwoFingerTouch = (e) => {
    const t = e?.touches || e?.nativeEvent?.touches;
    return Boolean(t && t.length >= 2);
  };

  const handleZoomMouseDown = (e) => {
    // Mobile UX: allow one-finger scrolling; only start zoom selection with 2 fingers
    if (isMobile && (e?.type?.includes('touch') || e?.nativeEvent?.type?.includes('touch'))) {
      if (!isTwoFingerTouch(e)) return;
    }
    const idx = getGlobalIndexFromChartEvent(e);
    if (idx == null) return;
    // Don't set state yet (prevents rerender on simple click for tooltip).
    // We'll start selection only when the user actually drags.
    selectionStartRef.current = idx;
  };

  const handleZoomMouseMove = (e) => {
    // Mobile UX: one-finger scrolling should not create selection; require 2 fingers
    if (isMobile && (e?.type?.includes('touch') || e?.nativeEvent?.type?.includes('touch'))) {
      if (!isTwoFingerTouch(e)) return;
    }
    if (selectionStartRef.current == null) return;
    const idx = getGlobalIndexFromChartEvent(e);
    if (idx == null) return;
    // Start selection only if the user moved to a different index
    if (idx === selectionStartRef.current) return;
    if (refAreaLeft == null) {
      setRefAreaLeft(selectionStartRef.current);
      setRefAreaRight(idx);
    } else {
      setRefAreaRight(idx);
    }
  };

  const handleZoomMouseUp = () => {
    // If selection never started (only click), do nothing
    if (refAreaLeft == null || refAreaRight == null) {
      selectionStartRef.current = null;
      return;
    }
    const start = Math.min(refAreaLeft, refAreaRight);
    const end = Math.max(refAreaLeft, refAreaRight);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    selectionStartRef.current = null;
    if (end - start < 1) return; // ignore click without a range
    setZoomRange({ start, end });
  };

  const handleZoomReset = () => {
    setZoomRange(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
    selectionStartRef.current = null;
  };

  return (
    <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-lg w-full h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-lg font-semibold text-gray-900 min-w-0 truncate">Form & Fitness</h3>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Open settings"
            title="Settings"
          >
            <EllipsisHorizontalIcon className="w-6 h-6 text-gray-500" />
          </button>
          <button
            onClick={() => handleInfoClick('Form & Fitness')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Show explanation"
            title="Glossary"
          >
            <InformationCircleIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>
      </div>

      {profileNeedsTrainingZones(profile) && Array.isArray(activities) && activities.length > 0 && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {usingInferredZones
              ? 'Zones estimated from your workouts — set FTP/LT2 for accurate TSS.'
              : 'Set training zones to unlock Form & Fitness from your workouts.'}
          </span>
          <button
            type="button"
            onClick={() => requestTrainingZonesModal({ force: true, source: 'form-fitness' })}
            className="font-semibold text-primary hover:underline shrink-0"
          >
            Set up zones
          </button>
        </div>
      )}

      {loading ? (
        <div className="h-48 sm:h-56 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
        {/* Settings modal */}
        {showSettings && (
          <div
            className="fixed inset-0 z-[9999] bg-black/40 flex items-end sm:items-center justify-center"
            onMouseDown={(e) => {
              // click outside closes
              if (e.target === e.currentTarget) setShowSettings(false);
            }}
          >
            <div className={`bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 ${isMobile ? 'max-h-[85vh]' : 'max-h-[90vh]'} overflow-y-auto`}>
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <div className="font-semibold text-gray-900">Settings</div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Close settings"
                >
                  <XMarkIcon className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Sport</div>
                  <div className="relative">
                    <select
                      value={sportFilter}
                      onChange={(e) => handleSportFilterChange(e.target.value)}
                      className="appearance-none w-full text-sm border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-gray-700 bg-white h-10 leading-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="all">All Sports</option>
                      <option value="bike">Bike</option>
                      <option value="run">Run</option>
                      <option value="swim">Swim</option>
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-gray-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Time frame</div>
                  <div className="relative">
                    <select
                      value={timeRange}
                      onChange={(e) => handleTimeRangeChange(e.target.value)}
                      className="appearance-none w-full text-sm border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-gray-700 bg-white h-10 leading-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      {FORM_FITNESS_TIME_RANGES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-gray-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Delta</div>
                  <div className="relative">
                    <select
                      value={deltaMode}
                      onChange={(e) => setDeltaMode(e.target.value)}
                      className="appearance-none w-full text-sm border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-gray-700 bg-white h-10 leading-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="timeframe">Over time frame</option>
                      <option value="yesterday">From yesterday</option>
                      <option value="7d">Over 7 days</option>
                      <option value="28d">Over 28 days</option>
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-gray-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-1">Projection</div>
                  <button
                    type="button"
                    onClick={() => setShowProjection((v) => !v)}
                    className="flex items-center justify-between w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-700 bg-white h-10 hover:bg-gray-50 transition-colors"
                  >
                    <span>Project planned workouts forward</span>
                    <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showProjection ? 'bg-primary' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showProjection ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                  <p className="mt-1 text-[11px] text-gray-400">Uses planned TSS to forecast Fitness, Form &amp; Fatigue up to 8 weeks ahead.</p>
                </div>

                {hasWellness && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-1">Recovery overlay</div>
                    <button
                      type="button"
                      onClick={() => setShowRecovery((v) => !v)}
                      className="flex items-center justify-between w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-700 bg-white h-10 hover:bg-gray-50 transition-colors"
                    >
                      <span>Show resting HR &amp; HRV</span>
                      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showRecovery ? 'bg-primary' : 'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showRecovery ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </span>
                    </button>
                    <p className="mt-1 text-[11px] text-gray-400">Overlays Apple Health resting heart rate &amp; HRV so you can spot rising fatigue / overtraining.</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    onClick={() => {
                      handleInfoClick('Form & Fitness');
                      setShowSettings(false);
                    }}
                    className="h-10 px-4 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition-colors w-full"
                  >
                    Open glossary
                  </button>
                  <button
                    onClick={() => {
                      handleZoomReset();
                      setShowSettings(false);
                    }}
                    className="h-10 px-4 text-sm bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors w-full"
                    disabled={!zoomRange}
                    title={!zoomRange ? 'No zoom active' : 'Reset zoom'}
                  >
                    Reset zoom
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Compact headline metrics — no mini sparklines; all curves live on the main chart */}
        {insights && (
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-2">
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Fitness</div>
              <div className="text-lg sm:text-xl font-bold text-blue-600 tabular-nums leading-tight">{insights.fitness}</div>
              <div className="text-[10px] text-gray-500 truncate">{deltaDisplayText(insights.fitnessDelta, insights.deltaLabel)}</div>
              <div className="text-[10px] font-semibold text-blue-600 truncate">{insights.fitnessStatus}</div>
            </div>
            <div className="rounded-lg border border-orange-100 bg-orange-50/60 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Form</div>
              <div className={`text-lg sm:text-xl font-bold tabular-nums leading-tight ${insights.form < 0 ? 'text-orange-600' : 'text-orange-500'}`}>
                {insights.form > 0 ? `+${insights.form}` : insights.form}
              </div>
              <div className="text-[10px] text-gray-500 truncate">{deltaDisplayText(insights.formDelta, insights.deltaLabel)}</div>
              <div className="text-[10px] font-semibold text-orange-600 truncate">{insights.formStatus}</div>
            </div>
            <div className="rounded-lg border border-pink-100 bg-pink-50/60 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Fatigue</div>
              <div className="text-lg sm:text-xl font-bold text-pink-600 tabular-nums leading-tight">{insights.fatigue}</div>
              <div className="text-[10px] text-gray-500 truncate">{deltaDisplayText(insights.fatigueDelta, insights.deltaLabel)}</div>
              <div className="text-[10px] font-semibold text-pink-600 truncate">{insights.fatigueStatus}</div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-56 sm:min-h-72 lg:min-h-80 select-none relative">
          {zoomRange && (
            <button
              onClick={handleZoomReset}
              className="absolute top-2 right-2 z-10 p-1.5 bg-white hover:bg-gray-50 rounded-full shadow-md border border-gray-200 transition-colors"
              aria-label="Reset zoom"
              title="Reset zoom"
            >
              <ArrowPathIcon className="w-4 h-4 text-gray-600" />
            </button>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={zoomedData}
              margin={{ top: 10, right: isMobile ? 36 : 44, left: isMobile ? 4 : 8, bottom: 0 }}
              onMouseDown={handleZoomMouseDown}
              onMouseMove={handleZoomMouseMove}
              onMouseUp={handleZoomMouseUp}
              onDoubleClick={handleZoomReset}
              onTouchStart={handleZoomMouseDown}
              onTouchMove={handleZoomMouseMove}
              onTouchEnd={handleZoomMouseUp}
            >
            <defs>
              <linearGradient id="colorFitness" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PMC_COLORS.fitness} stopOpacity={0.18}/>
                <stop offset="95%" stopColor={PMC_COLORS.fitness} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid yAxisId="tss" strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="dateLabel" 
              tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="tss"
              orientation="left"
              width={isMobile ? 32 : 40}
              domain={[0, axisDomains.tssMax]}
              tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
              label={{ value: 'TSS/d', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }}
            />
            <YAxis
              yAxisId="tsb"
              orientation="right"
              width={isMobile ? 32 : 40}
              domain={[axisDomains.min, axisDomains.max]}
              tick={{ fontSize: isMobile ? 10 : 12, fill: PMC_COLORS.form }}
              label={{ value: 'Form (TSB)', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 10, fill: PMC_COLORS.form } }}
            />
            {showRecovery && hasWellness && (
              <YAxis yAxisId="recovery" orientation="right" hide domain={['auto', 'auto']} />
            )}
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px'
              }}
              labelFormatter={(label) => {
                const dataPoint = chartDataExtended.find(d => d.dateLabel === label);
                if (dataPoint) {
                  const date = new Date(dataPoint.date);
                  const base = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                  return dataPoint.projected ? `${base} · Planned` : base;
                }
                return label;
              }}
            />
            {selectionX1 && selectionX2 && (
              <ReferenceArea yAxisId="tss" x1={selectionX1} x2={selectionX2} strokeOpacity={0.1} />
            )}
            <Area
              yAxisId="tss"
              type="monotone"
              dataKey="Fitness"
              name="Fitness"
              stroke={PMC_COLORS.fitness}
              fillOpacity={1}
              fill="url(#colorFitness)"
              strokeWidth={2.5}
            />
            <Line
              yAxisId="tss"
              type="monotone"
              dataKey="Fatigue"
              name="Fatigue"
              stroke={PMC_COLORS.fatigue}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="tsb"
              type="monotone"
              dataKey="Form"
              name="Form"
              stroke={PMC_COLORS.form}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            {/* ── Recovery overlay (Apple Health) — thin lines on a hidden right axis ── */}
            {showRecovery && hasWellness && (
              <>
                <Line yAxisId="recovery" type="monotone" dataKey="rhr" name="Resting HR" stroke="#f43f5e" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                <Line yAxisId="recovery" type="monotone" dataKey="hrv" name="HRV" stroke="#10b981" strokeWidth={1.5} strokeDasharray="2 2" dot={false} connectNulls isAnimationActive={false} />
              </>
            )}
            {/* ── Future projection from planned workouts (dashed) ── */}
            {hasProjection && (
              <>
                <ReferenceArea yAxisId="tss" x1={todayLabel} x2={projection[projection.length - 1].dateLabel} fill="#6366f1" fillOpacity={0.05} />
                <ReferenceLine
                  yAxisId="tss"
                  x={todayLabel}
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                  label={{ value: 'Today', position: 'insideTopLeft', fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                />
                <Line yAxisId="tss" type="monotone" dataKey="FitnessProj" name="Fitness" stroke={PMC_COLORS.fitness} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line yAxisId="tss" type="monotone" dataKey="FatigueProj" name="Fatigue" stroke={PMC_COLORS.fatigue} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                <Line yAxisId="tsb" type="monotone" dataKey="FormProj" name="Form" stroke={PMC_COLORS.form} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              </>
            )}
            <ReferenceLine
              yAxisId="tsb"
              y={0}
              stroke="#9ca3af"
              strokeDasharray="3 3"
            />
            {raceTarget?.ctl != null && (
              <ReferenceLine
                yAxisId="tss"
                y={raceTarget.ctl}
                stroke="#767EB5"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: `Target ${Math.round(raceTarget.ctl)} CTL · ${raceTarget.name}`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fontWeight: 700,
                  fill: '#767EB5',
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        </div>
        </>
      )}

      <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
          <span className="text-xs text-gray-600">Fitness</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
          <span className="text-xs text-gray-600">Form</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PMC_COLORS.fatigue }}></div>
          <span className="text-xs text-gray-600">Fatigue</span>
        </div>
        {hasProjection && (
          <div className="flex items-center gap-1.5">
            <svg width="16" height="5" aria-hidden><line x1="0" y1="2.5" x2="16" y2="2.5" stroke="#64748b" strokeWidth="2" strokeDasharray="4 3" /></svg>
            <span className="text-xs text-gray-600">Planned (projected)</span>
          </div>
        )}
        {showRecovery && hasWellness && (
          <>
            <div className="flex items-center gap-2">
              <svg width="20" height="6" aria-hidden><line x1="0" y1="3" x2="20" y2="3" stroke="#f43f5e" strokeWidth="2" /></svg>
              <span className="text-sm text-gray-600">Resting HR</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="20" height="6" aria-hidden><line x1="0" y1="3" x2="20" y2="3" stroke="#10b981" strokeWidth="2" strokeDasharray="2 2" /></svg>
              <span className="text-sm text-gray-600">HRV</span>
            </div>
          </>
        )}
      </div>

      {/* Glossary Modal */}
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm={selectedTerm}
      />
    </div>
  );
};

export default FormFitnessChart;

