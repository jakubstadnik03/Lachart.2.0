import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, LineChart, Line } from 'recharts';
import { InformationCircleIcon, ChevronDownIcon, EllipsisHorizontalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getFormFitnessData, getTodayMetrics } from '../../services/api';
import TrainingGlossary from './TrainingGlossary';

const FormFitnessChart = ({ athleteId }) => {
  const [showGlossary, setShowGlossary] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('Form & Fitness');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [showSettings, setShowSettings] = useState(false);

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
      if (stored && ['30 days', '60 days', '90 days', '180 days', '365 days'].includes(stored)) {
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
  const [loading, setLoading] = useState(true);
  const [zoomRange, setZoomRange] = useState(null); // { start: number, end: number } indices in chartData
  const [refAreaLeft, setRefAreaLeft] = useState(null); // global index in chartData
  const [refAreaRight, setRefAreaRight] = useState(null); // global index in chartData
  const selectionStartRef = useRef(null); // global index (doesn't cause rerenders on simple click)

  const [deltaMode, setDeltaMode] = useState(() => {
    try {
      return localStorage.getItem('formFitnessDeltaMode') || 'timeframe';
    } catch (e) {
      return 'timeframe';
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
    const loadData = async () => {
      if (!athleteId) return;
      try {
        setLoading(true);
        // Convert time range to days
        const days = timeRange === '30 days' ? 30 :
                     timeRange === '60 days' ? 60 :
                     timeRange === '90 days' ? 90 :
                     timeRange === '180 days' ? 180 :
                     timeRange === '365 days' ? 365 : 60;
        
        const [ffResponse, todayResponse] = await Promise.all([
          getFormFitnessData(athleteId, days, sportFilter),
          getTodayMetrics(athleteId)
        ]);

        if (ffResponse && ffResponse.data) {
          setChartData(ffResponse.data);
        }

        if (todayResponse && todayResponse.data) {
          setTodayMetrics(todayResponse.data);
        }
      } catch (error) {
        console.error('Error loading form fitness data:', error);
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [athleteId, timeRange, sportFilter]);

  // Detect mobile for carousel behavior
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const timeframeLabel = useMemo(() => {
    const days = timeRange === '30 days' ? 30 :
      timeRange === '60 days' ? 60 :
      timeRange === '90 days' ? 90 :
      timeRange === '180 days' ? 180 :
      timeRange === '365 days' ? 365 : 60;
    return `${days} days`;
  }, [timeRange]);

  const insights = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;
    const first = chartData[0];
    const last = chartData[chartData.length - 1];

    const fitness = Number(last.Fitness || 0);
    const fatigue = Number(last.Fatigue || 0);
    const form = Number(last.Form || 0);

    const getIdxFromEnd = (daysBack) => {
      const idx = Math.max(0, chartData.length - 1 - daysBack);
      return idx;
    };

    let fitnessDelta = 0;
    let fatigueDelta = 0;
    let formDelta = 0;
    let deltaLabel = '';

    if (deltaMode === 'yesterday') {
      fitnessDelta = Number(todayMetrics.fitnessChange || 0);
      fatigueDelta = Number(todayMetrics.fatigueChange || 0);
      formDelta = Number(todayMetrics.formChange || 0);
      deltaLabel = 'from yesterday';
    } else if (deltaMode === '7d') {
      const base = chartData[getIdxFromEnd(7)] || first;
      fitnessDelta = fitness - Number(base.Fitness || 0);
      fatigueDelta = fatigue - Number(base.Fatigue || 0);
      formDelta = form - Number(base.Form || 0);
      deltaLabel = 'over 7 days';
    } else if (deltaMode === '28d') {
      const base = chartData[getIdxFromEnd(28)] || first;
      fitnessDelta = fitness - Number(base.Fitness || 0);
      fatigueDelta = fatigue - Number(base.Fatigue || 0);
      formDelta = form - Number(base.Form || 0);
      deltaLabel = 'over 28 days';
    } else {
      fitnessDelta = fitness - Number(first.Fitness || 0);
      fatigueDelta = fatigue - Number(first.Fatigue || 0);
      formDelta = form - Number(first.Form || 0);
      deltaLabel = `over ${timeframeLabel}`;
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
  }, [chartData, deltaMode, timeframeLabel, todayMetrics]);

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
    if (!chartData || chartData.length === 0) return { start: 0, end: 0 };
    const start = zoomRange?.start != null ? Math.max(0, Math.min(chartData.length - 1, zoomRange.start)) : 0;
    const end = zoomRange?.end != null ? Math.max(0, Math.min(chartData.length - 1, zoomRange.end)) : (chartData.length - 1);
    return start <= end ? { start, end } : { start: end, end: start };
  }, [chartData, zoomRange]);

  const zoomedData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.slice(effectiveZoomRange.start, effectiveZoomRange.end + 1);
  }, [chartData, effectiveZoomRange]);

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
    return chartData?.[refAreaLeft]?.dateLabel ?? null;
  }, [refAreaLeft, chartData]);

  const selectionX2 = useMemo(() => {
    if (refAreaRight == null) return null;
    return chartData?.[refAreaRight]?.dateLabel ?? null;
  }, [refAreaRight, chartData]);

  const getGlobalIndexFromChartEvent = (e) => {
    if (!e) return null;
    if (typeof e.activeTooltipIndex === 'number' && e.activeTooltipIndex >= 0) {
      return effectiveZoomRange.start + e.activeTooltipIndex;
    }
    if (e.activeLabel) {
      const idx = chartData.findIndex(d => d.dateLabel === e.activeLabel);
      return idx >= 0 ? idx : null;
    }
    return null;
  };

  const handleZoomMouseDown = (e) => {
    const idx = getGlobalIndexFromChartEvent(e);
    if (idx == null) return;
    // Don't set state yet (prevents rerender on simple click for tooltip).
    // We'll start selection only when the user actually drags.
    selectionStartRef.current = idx;
  };

  const handleZoomMouseMove = (e) => {
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

  const miniTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0];
    const dp = chartData.find(d => d.dateLabel === label) || null;
    const dateText = dp?.date ? new Date(dp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : label;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
        <div className="font-semibold text-gray-900">{dateText}</div>
        <div className="text-gray-700">
          {p.name}: <span className="font-semibold">{p.value}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg">
      <div className="flex items-center justify-between gap-3 mb-4">
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

      {loading ? (
        <div className="h-64 sm:h-80 flex items-center justify-center">
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
                      <option value="30 days">Past 30 days</option>
                      <option value="60 days">Past 60 days</option>
                      <option value="90 days">Past 90 days</option>
                      <option value="180 days">Past 6 months</option>
                      <option value="365 days">Past year</option>
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

        {/* Performance Insights cards (TrainingPeaks-like) */}
        {insights && (
          <div className={isMobile ? "mb-4" : "grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4"}>
            {isMobile && (
              <div className="-mx-4 px-4 overflow-x-auto snap-x snap-mandatory flex gap-3">
                {/* Fitness */}
                <div className="min-w-full snap-center">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-gray-500 uppercase">Fitness</div>
                      <button
                        onClick={() => handleInfoClick('Form & Fitness')}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Show explanation"
                      >
                        <InformationCircleIcon className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <div className="text-2xl font-bold text-blue-600">{insights.fitness}</div>
                      <div className="text-xs text-gray-600">{deltaDisplayText(insights.fitnessDelta, insights.deltaLabel)}</div>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-blue-600">{insights.fitnessStatus}</div>
                    <div className="mt-2 select-none">
                      <ResponsiveContainer width="100%" height={56}>
                        <LineChart
                          data={zoomedData}
                          onMouseDown={handleZoomMouseDown}
                          onMouseMove={handleZoomMouseMove}
                          onMouseUp={handleZoomMouseUp}
                          onDoubleClick={handleZoomReset}
                          onTouchStart={handleZoomMouseDown}
                          onTouchMove={handleZoomMouseMove}
                          onTouchEnd={handleZoomMouseUp}
                        >
                          <XAxis dataKey="dateLabel" hide />
                          <Tooltip content={miniTooltip} />
                          {selectionX1 && selectionX2 && (
                            <ReferenceArea x1={selectionX1} x2={selectionX2} strokeOpacity={0.1} />
                          )}
                          <Line type="monotone" dataKey="Fitness" name="Fitness" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Form */}
                <div className="min-w-full snap-center">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-gray-500 uppercase">Form</div>
                      <button
                        onClick={() => handleInfoClick('Form & Fitness')}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Show explanation"
                      >
                        <InformationCircleIcon className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <div className={`text-2xl font-bold ${insights.form < 0 ? 'text-orange-600' : 'text-orange-500'}`}>{insights.form}</div>
                      <div className="text-xs text-gray-600">{deltaDisplayText(insights.formDelta, insights.deltaLabel)}</div>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-orange-600">{insights.formStatus}</div>
                    <div className="mt-2 select-none">
                      <ResponsiveContainer width="100%" height={56}>
                        <LineChart
                          data={zoomedData}
                          onMouseDown={handleZoomMouseDown}
                          onMouseMove={handleZoomMouseMove}
                          onMouseUp={handleZoomMouseUp}
                          onDoubleClick={handleZoomReset}
                          onTouchStart={handleZoomMouseDown}
                          onTouchMove={handleZoomMouseMove}
                          onTouchEnd={handleZoomMouseUp}
                        >
                          <XAxis dataKey="dateLabel" hide />
                          <Tooltip content={miniTooltip} />
                          {selectionX1 && selectionX2 && (
                            <ReferenceArea x1={selectionX1} x2={selectionX2} strokeOpacity={0.1} />
                          )}
                          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="Form" name="Form" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Fatigue */}
                <div className="min-w-full snap-center">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-gray-500 uppercase">Fatigue</div>
                      <button
                        onClick={() => handleInfoClick('Form & Fitness')}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                        aria-label="Show explanation"
                      >
                        <InformationCircleIcon className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <div className="text-2xl font-bold text-pink-600">{insights.fatigue}</div>
                      <div className="text-xs text-gray-600">{deltaDisplayText(insights.fatigueDelta, insights.deltaLabel)}</div>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-pink-600">{insights.fatigueStatus}</div>
                    <div className="mt-2 select-none">
                      <ResponsiveContainer width="100%" height={56}>
                        <LineChart
                          data={zoomedData}
                          onMouseDown={handleZoomMouseDown}
                          onMouseMove={handleZoomMouseMove}
                          onMouseUp={handleZoomMouseUp}
                          onDoubleClick={handleZoomReset}
                          onTouchStart={handleZoomMouseDown}
                          onTouchMove={handleZoomMouseMove}
                          onTouchEnd={handleZoomMouseUp}
                        >
                          <XAxis dataKey="dateLabel" hide />
                          <Tooltip content={miniTooltip} />
                          {selectionX1 && selectionX2 && (
                            <ReferenceArea x1={selectionX1} x2={selectionX2} strokeOpacity={0.1} />
                          )}
                          <Line type="monotone" dataKey="Fatigue" name="Fatigue" stroke="#db2777" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isMobile && (
              <>
            {/* Fitness */}
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500 uppercase">Fitness</div>
                <button
                  onClick={() => handleInfoClick('Form & Fitness')}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Show explanation"
                >
                  <InformationCircleIcon className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="text-2xl sm:text-3xl font-bold text-blue-600">{insights.fitness}</div>
                <div className="text-xs text-gray-600">{deltaDisplayText(insights.fitnessDelta, insights.deltaLabel)}</div>
              </div>
              <div className="mt-1 text-sm font-semibold text-blue-600">{insights.fitnessStatus}</div>
              <div className="mt-2 select-none">
                <ResponsiveContainer width="100%" height={56}>
                  <LineChart
                    data={zoomedData}
                    onMouseDown={handleZoomMouseDown}
                    onMouseMove={handleZoomMouseMove}
                    onMouseUp={handleZoomMouseUp}
                    onDoubleClick={handleZoomReset}
                    onTouchStart={handleZoomMouseDown}
                    onTouchMove={handleZoomMouseMove}
                    onTouchEnd={handleZoomMouseUp}
                  >
                    <XAxis dataKey="dateLabel" hide />
                    <Tooltip content={miniTooltip} />
                    {selectionX1 && selectionX2 && (
                      <ReferenceArea x1={selectionX1} x2={selectionX2} strokeOpacity={0.1} />
                    )}
                    <Line type="monotone" dataKey="Fitness" name="Fitness" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Form */}
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500 uppercase">Form</div>
                <button
                  onClick={() => handleInfoClick('Form & Fitness')}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Show explanation"
                >
                  <InformationCircleIcon className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className={`text-2xl sm:text-3xl font-bold ${insights.form < 0 ? 'text-orange-600' : 'text-orange-500'}`}>{insights.form}</div>
                <div className="text-xs text-gray-600">{deltaDisplayText(insights.formDelta, insights.deltaLabel)}</div>
              </div>
              <div className="mt-1 text-sm font-semibold text-orange-600">{insights.formStatus}</div>
              <div className="mt-2 select-none">
                <ResponsiveContainer width="100%" height={56}>
                  <LineChart
                    data={zoomedData}
                    onMouseDown={handleZoomMouseDown}
                    onMouseMove={handleZoomMouseMove}
                    onMouseUp={handleZoomMouseUp}
                    onDoubleClick={handleZoomReset}
                    onTouchStart={handleZoomMouseDown}
                    onTouchMove={handleZoomMouseMove}
                    onTouchEnd={handleZoomMouseUp}
                  >
                    <XAxis dataKey="dateLabel" hide />
                    <Tooltip content={miniTooltip} />
                    {selectionX1 && selectionX2 && (
                      <ReferenceArea x1={selectionX1} x2={selectionX2} strokeOpacity={0.1} />
                    )}
                    <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="Form" name="Form" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fatigue */}
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500 uppercase">Fatigue</div>
                <button
                  onClick={() => handleInfoClick('Form & Fitness')}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Show explanation"
                >
                  <InformationCircleIcon className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="text-2xl sm:text-3xl font-bold text-pink-600">{insights.fatigue}</div>
                <div className="text-xs text-gray-600">{deltaDisplayText(insights.fatigueDelta, insights.deltaLabel)}</div>
              </div>
              <div className="mt-1 text-sm font-semibold text-pink-600">{insights.fatigueStatus}</div>
              <div className="mt-2 select-none">
                <ResponsiveContainer width="100%" height={56}>
                  <LineChart
                    data={zoomedData}
                    onMouseDown={handleZoomMouseDown}
                    onMouseMove={handleZoomMouseMove}
                    onMouseUp={handleZoomMouseUp}
                    onDoubleClick={handleZoomReset}
                    onTouchStart={handleZoomMouseDown}
                    onTouchMove={handleZoomMouseMove}
                    onTouchEnd={handleZoomMouseUp}
                  >
                    <XAxis dataKey="dateLabel" hide />
                    <Tooltip content={miniTooltip} />
                    {selectionX1 && selectionX2 && (
                      <ReferenceArea x1={selectionX1} x2={selectionX2} strokeOpacity={0.1} />
                    )}
                    <Line type="monotone" dataKey="Fatigue" name="Fatigue" stroke="#db2777" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
              </>
            )}
          </div>
        )}

        <div className="h-56 sm:h-80 select-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={zoomedData}
              margin={{ top: 10, right: 10, left: isMobile ? 0 : 0, bottom: 0 }}
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
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorForm" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorFatigue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#9333ea" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#9333ea" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="dateLabel" 
              tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
              interval="preserveStartEnd"
            />
            <YAxis 
              width={isMobile ? 28 : 40}
              tick={{ fontSize: isMobile ? 10 : 12, fill: '#6b7280' }}
              domain={['auto', 'auto']}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px'
              }}
              labelFormatter={(label) => {
                const dataPoint = chartData.find(d => d.dateLabel === label);
                if (dataPoint) {
                  const date = new Date(dataPoint.date);
                  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                }
                return label;
              }}
            />
            {selectionX1 && selectionX2 && (
              <ReferenceArea x1={selectionX1} x2={selectionX2} strokeOpacity={0.1} />
            )}
            <Area 
              type="monotone" 
              dataKey="Fitness" 
              stroke="#3b82f6" 
              fillOpacity={1} 
              fill="url(#colorFitness)" 
              strokeWidth={2}
            />
            <Area 
              type="monotone" 
              dataKey="Form" 
              stroke="#f97316" 
              fillOpacity={1} 
              fill="url(#colorForm)" 
              strokeWidth={2}
            />
            <Area 
              type="monotone" 
              dataKey="Fatigue" 
              stroke="#9333ea" 
              fillOpacity={1} 
              fill="url(#colorFatigue)" 
              strokeWidth={2}
            />
            <ReferenceLine 
              y={0} 
              stroke="#9ca3af" 
              strokeDasharray="3 3" 
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
        </>
      )}

      <div className="flex justify-center gap-4 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-sm text-gray-600">Fitness</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
          <span className="text-sm text-gray-600">Form</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <span className="text-sm text-gray-600">Fatigue</span>
        </div>
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

