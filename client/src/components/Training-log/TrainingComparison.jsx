import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';
import { resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon
} from '@heroicons/react/24/outline';

const SERIES_COLORS = ['#6366F1', '#22C55E', '#F97316', '#06B6D4', '#EF4444', '#A855F7', '#0EA5E9'];

function navigateTrainingToCalendar(trainingData, navigate) {
  if (!trainingData || !navigate) return;
  if (trainingData.type === 'fit' && trainingData._id) {
    navigate(`/training-calendar/${encodeURIComponent(`fit-${trainingData._id}`)}`);
  } else if (trainingData.type === 'strava' && (trainingData.stravaId || trainingData.id)) {
    const stravaId = trainingData.stravaId || trainingData.id;
    navigate(`/training-calendar/${encodeURIComponent(`strava-${stravaId}`)}`);
  } else if (trainingData.type === 'regular' && trainingData._id) {
    navigate(`/training-calendar/${encodeURIComponent(`regular-${trainingData._id}`)}`);
  } else if (trainingData.stravaId || trainingData.id) {
    const stravaId = trainingData.stravaId || trainingData.id;
    navigate(`/training-calendar/${encodeURIComponent(`strava-${stravaId}`)}`);
  } else if (trainingData._id) {
    navigate(`/training-calendar/${encodeURIComponent(`training-${trainingData._id}`)}`);
  }
}

const TABS = ['compare', 'progress', 'monthly'];
const METRICS = [
  { id: 'power', label: 'Power/Pace' },
  { id: 'heartRate', label: 'Heart Rate' },
  { id: 'lactate', label: 'Lactate' },
  { id: 'RPE', label: 'RPE' },
];

const TrainingComparison = ({ trainings }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const unitSystem = resolveDistanceUnitSystem(user, 'metric');
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('trainingComparison_tab') || 'compare');
  const stripUnits = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/[^0-9.:]/g, '');
  };

  // ── Persisted selections ────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState(() => localStorage.getItem('trainingComparison_category') || 'all');
  const [selectedTitle, setSelectedTitle] = useState(() => localStorage.getItem('trainingComparison_title') || 'all');
  const [selectedMetric, setSelectedMetric] = useState(() => localStorage.getItem('trainingComparison_metric') || 'power');
  const [monthlyMetric, setMonthlyMetric] = useState(() => localStorage.getItem('trainingComparison_monthlyMetric') || 'power');
  const [hasPersistedSnapshotSelection] = useState(() => localStorage.getItem('trainingComparison_snapshotSelectedIds') !== null);
  const [snapshotSelectedIds, setSnapshotSelectedIds] = useState(() => {
    try {
      const raw = localStorage.getItem('trainingComparison_snapshotSelectedIds');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [activeSeries, setActiveSeries] = useState(() => {
    const saved = localStorage.getItem('trainingComparison_activeSeries');
    if (saved) { try { return JSON.parse(saved); } catch { return {}; } }
    return {};
  });  const [trainingMeta, setTrainingMeta] = useState({});
  const [showAllTrainings, setShowAllTrainings] = useState(false);

  // ── Derived lists ───────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set();
    trainings.forEach(t => { if (t.category) cats.add(t.category); });
    return ['all', ...Array.from(cats).sort()];
  }, [trainings]);

  const titles = useMemo(() => {
    const filtered = selectedCategory === 'all' ? trainings : trainings.filter(t => t.category === selectedCategory);
    const titleSet = new Set();
    filtered.forEach(t => { if (t.title) titleSet.add(t.title); });
    return ['all', ...Array.from(titleSet).sort()];
  }, [trainings, selectedCategory]);

  const filteredTrainings = useMemo(() => {
    let filtered = trainings;
    if (selectedCategory !== 'all') filtered = filtered.filter(t => t.category === selectedCategory);
    if (selectedTitle !== 'all') filtered = filtered.filter(t => t.title === selectedTitle);
    filtered = filtered.filter(t => t.results && t.results.length > 0);
    return filtered.sort((a, b) => new Date(a.date || a.timestamp || a.createdAt) - new Date(b.date || b.timestamp || b.createdAt));
  }, [trainings, selectedCategory, selectedTitle]);

  const recentSavedTrainings = useMemo(() => {
    return [...(trainings || [])]
      .filter(t => t && (t._id || t.stravaId || t.id))
      .sort((a, b) => new Date(b.date || b.timestamp || b.createdAt || 0) - new Date(a.date || a.timestamp || a.createdAt || 0))
      .slice(0, 25);
  }, [trainings]);

  // ── Chart data ──────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (filteredTrainings.length === 0) return [];
    const maxIntervals = Math.max(...filteredTrainings.map(t => t.results?.length || 0));
    const data = [];
    for (let i = 0; i < maxIntervals; i++) {
      const intervalData = { interval: i + 1 };
      filteredTrainings.forEach((training, trainingIndex) => {
        const result = training.results?.[i];
        if (result) {
          const date = new Date(training.date || training.timestamp || training.createdAt);
          const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
          const trainingLabel = `${dateLabel} (${trainingIndex + 1})`;
          let value = null;
          if (selectedMetric === 'power') value = result.power;
          else if (selectedMetric === 'heartRate') value = result.heartRate;
          else if (selectedMetric === 'lactate') value = result.lactate;
          else if (selectedMetric === 'RPE') value = result.RPE;
          if (selectedMetric === 'power' && typeof value === 'string' && value.includes(':')) {
            const [min, sec] = value.split(':').map(Number);
            value = min * 60 + sec;
          }
          if (value !== null && value !== undefined) intervalData[trainingLabel] = value;
          let durationSeconds = 0;
          if (result.durationSeconds && result.durationSeconds > 0) durationSeconds = result.durationSeconds;
          else if (result.durationType === 'time' && typeof result.duration === 'number' && result.duration > 0) durationSeconds = result.duration;
          else if (result.duration && typeof result.duration === 'string') {
            const parts = result.duration.split(':');
            if (parts.length === 2) durationSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
            else if (parts.length === 3) durationSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
          }
          intervalData[`${trainingLabel}_duration`] = durationSeconds;
        }
      });
      data.push(intervalData);
    }
    return data;
  }, [filteredTrainings, selectedMetric]);

  // ── Auto-select default title ───────────────────────────────────────────────
  useEffect(() => {
    if (selectedTitle === 'all' && titles.length > 1) {
      const defaultTitle = titles[1];
      if (defaultTitle) { setSelectedTitle(defaultTitle); localStorage.setItem('trainingComparison_title', defaultTitle); }
    }
  }, [titles, selectedTitle]);

  // ── Sync activeSeries with filteredTrainings ────────────────────────────────
  useEffect(() => {
    const meta = {};
    const next = {};
    const savedActiveSeries = activeSeries;
    filteredTrainings.forEach((training, index) => {
      const date = new Date(training.date || training.timestamp || training.createdAt);
      const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
      const trainingLabel = `${dateLabel} (${index + 1})`;
      meta[trainingLabel] = { training, index, results: training.results || [] };
      next[trainingLabel] = savedActiveSeries[trainingLabel] !== undefined
        ? savedActiveSeries[trainingLabel]
        : index >= filteredTrainings.length - 3;
    });
    setActiveSeries(next);
    setTrainingMeta(meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTrainings]);

  useEffect(() => { if (Object.keys(activeSeries).length > 0) localStorage.setItem('trainingComparison_activeSeries', JSON.stringify(activeSeries)); }, [activeSeries]);  useEffect(() => { localStorage.setItem('trainingComparison_monthlyMetric', monthlyMetric); }, [monthlyMetric]);
  useEffect(() => { localStorage.setItem('trainingComparison_snapshotSelectedIds', JSON.stringify(snapshotSelectedIds)); }, [snapshotSelectedIds]);
  useEffect(() => { localStorage.setItem('trainingComparison_tab', activeTab); }, [activeTab]);

  // ── Progress stats ──────────────────────────────────────────────────────────
  const progressStats = useMemo(() => {
    if (filteredTrainings.length < 2) return null;
    const firstTraining = filteredTrainings[0];
    const lastTraining = filteredTrainings[filteredTrainings.length - 1];
    if (!firstTraining.results || !lastTraining.results) return null;
    const stats = { power: { first: null, last: null, change: null, trend: null }, heartRate: { first: null, last: null, change: null, trend: null }, lactate: { first: null, last: null, change: null, trend: null }, RPE: { first: null, last: null, change: null, trend: null } };
    ['power', 'heartRate', 'lactate', 'RPE'].forEach(metric => {
      const firstValues = firstTraining.results.map(r => {
        let val = r[metric];
        if (metric === 'power' && typeof val === 'string' && val.includes(':')) { const [min, sec] = val.split(':').map(Number); val = min * 60 + sec; }
        return val;
      }).filter(v => v !== null && v !== undefined && v !== 0);
      const lastValues = lastTraining.results.map(r => {
        let val = r[metric];
        if (metric === 'power' && typeof val === 'string' && val.includes(':')) { const [min, sec] = val.split(':').map(Number); val = min * 60 + sec; }
        return val;
      }).filter(v => v !== null && v !== undefined && v !== 0);
      if (firstValues.length > 0 && lastValues.length > 0) {
        const firstAvg = firstValues.reduce((a, b) => a + b, 0) / firstValues.length;
        const lastAvg = lastValues.reduce((a, b) => a + b, 0) / lastValues.length;
        const firstSport = (firstTraining?.sport || '').toLowerCase();
        const lastSport = (lastTraining?.sport || '').toLowerCase();
        const firstIsBike = firstSport.includes('bike') || firstSport.includes('cycle') || firstSport.includes('ride') || firstSport.includes('cycling');
        const lastIsBike = lastSport.includes('bike') || lastSport.includes('cycle') || lastSport.includes('ride') || lastSport.includes('cycling');
        const isPace = metric === 'power' && !(firstIsBike && lastIsBike);
        stats[metric].first = firstAvg;
        stats[metric].last = lastAvg;
        if (isPace) {
          stats[metric].change = ((firstAvg - lastAvg) / firstAvg) * 100;
          stats[metric].trend = lastAvg < firstAvg ? 'up' : lastAvg > firstAvg ? 'down' : 'same';
        } else {
          stats[metric].change = ((lastAvg - firstAvg) / firstAvg) * 100;
          stats[metric].trend = lastAvg > firstAvg ? 'up' : lastAvg < firstAvg ? 'down' : 'same';
        }
      }
    });
    return stats;
  }, [filteredTrainings]);

  // ── Format helpers ──────────────────────────────────────────────────────────
  const isBikeSport = (sportValue) => {
    const sport = (sportValue || '').toLowerCase();
    return sport.includes('bike') || sport.includes('cycle') || sport.includes('ride') || sport.includes('cycling');
  };
  const isPaceSport = (sportValue) => {
    const s = (sportValue || '').toLowerCase();
    return s.includes('run') || s === 'walk' || s === 'hike' || s.includes('swim');
  };
  const areAllTrainingsBike = () => filteredTrainings.every(t => isBikeSport(t.sport));

  const formatMetricValue = (value, metric) => {
    if (value === null || value === undefined) return 'N/A';
    if (metric === 'power') {
      if (areAllTrainingsBike()) return `${Math.round(value)}W`;
      if (typeof value === 'number' && value > 100) {
        const minutes = Math.floor(value / 60);
        const seconds = Math.round(value % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      } else if (typeof value === 'string' && value.includes(':')) return value;
      return `${Math.round(value)}W`;
    }
    if (metric === 'heartRate') return `${Math.round(value)} bpm`;
    if (metric === 'lactate') { const num = Number(value); return Number.isNaN(num) ? 'N/A' : `${num.toFixed(1)} mmol/L`; }
    if (metric === 'RPE') return `${value}`;
    return value;
  };

  const formatMetricAxisTick = (value, metric) => {
    if (value === null || value === undefined) return '';
    if (metric === 'power') {
      if (typeof value === 'number' && value > 100 && !areAllTrainingsBike()) {
        const minutes = Math.floor(value / 60);
        const seconds = Math.round(value % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
      return `${Math.round(Number(value) || 0)}`;
    }
    if (metric === 'heartRate') return `${Math.round(Number(value) || 0)}`;
    if (metric === 'lactate') return `${Number(value).toFixed(1)}`;
    if (metric === 'RPE') return `${value}`;
    return `${value}`;
  };

  const getTrendIcon = (trend) => {
    if (trend === 'up') return <ArrowTrendingUpIcon className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <ArrowTrendingDownIcon className="w-4 h-4 text-red-500" />;
    return <MinusIcon className="w-4 h-4 text-gray-400" />;
  };
  const getTrendColor = (trend) => trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500';
  const getTrendBg = (trend) => trend === 'up' ? 'bg-green-50 border-green-200 text-green-700' : trend === 'down' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600';

  const getTrainingUid = (t) => String(t?._id || t?.id || t?.stravaId || t?.sourceStravaActivityId || t?.createdAt || t?.timestamp || '');
  const getTrainingDate = (t) => new Date(t?.date || t?.timestamp || t?.createdAt);
  const normalizeMetricValue = (result, metric) => {
    if (!result) return null;
    let value = null;
    if (metric === 'power') value = result.power;
    if (metric === 'heartRate') value = result.heartRate;
    if (metric === 'lactate') value = result.lactate;
    if (metric === 'RPE') value = result.RPE;
    if (value === null || value === undefined || value === '') return null;
    if (metric === 'power' && typeof value === 'string' && value.includes(':')) {
      const [min, sec] = value.split(':').map(Number);
      if (Number.isFinite(min) && Number.isFinite(sec)) return min * 60 + sec;
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  // ── Snapshot (same-training compare) ───────────────────────────────────────
  const snapshotOptions = useMemo(() => filteredTrainings.map(t => ({ id: getTrainingUid(t), training: t })).filter(x => x.id), [filteredTrainings]);

  useEffect(() => {
    if (!snapshotOptions.length) return;
    const ids = new Set(snapshotOptions.map(o => o.id));
    const validCurrent = snapshotSelectedIds.filter(id => ids.has(id));
    if (validCurrent.length >= 1) {
      if (validCurrent.length !== snapshotSelectedIds.length) setSnapshotSelectedIds(validCurrent);
      return;
    }
    if (hasPersistedSnapshotSelection) return;
    setSnapshotSelectedIds(snapshotOptions.slice(Math.max(0, snapshotOptions.length - 2)).map(o => o.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotOptions]);

  const snapshotSelectedTrainings = useMemo(() => {
    if (!snapshotOptions.length) return [];
    const byId = new Map(snapshotOptions.map(o => [o.id, o.training]));
    return snapshotSelectedIds.map(id => byId.get(id)).filter(Boolean).sort((a, b) => getTrainingDate(a) - getTrainingDate(b));
  }, [snapshotOptions, snapshotSelectedIds]);

  const snapshotShowsPaceAxis = selectedMetric === 'power' && snapshotSelectedTrainings.length > 0 && !snapshotSelectedTrainings.some(t => isBikeSport(t.sport)) && snapshotSelectedTrainings.some(t => isPaceSport(t.sport));

  const sameTrainingSnapshot = useMemo(() => {
    if (snapshotSelectedTrainings.length < 2) return null;
    const firstTraining = snapshotSelectedTrainings[0];
    const lastTraining = snapshotSelectedTrainings[snapshotSelectedTrainings.length - 1];
    if (!firstTraining || !lastTraining) return null;
    const firstResults = firstTraining.results || [];
    const lastResults = lastTraining.results || [];
    const maxIntervals = Math.max(firstResults.length, lastResults.length);
    const rows = [];
    for (let i = 0; i < maxIntervals; i++) {
      const firstVal = normalizeMetricValue(firstResults[i], selectedMetric);
      const lastVal = normalizeMetricValue(lastResults[i], selectedMetric);
      if (firstVal === null && lastVal === null) continue;
      let deltaPct = null;
      let trend = 'same';
      if (Number.isFinite(firstVal) && Number.isFinite(lastVal) && firstVal !== 0) {
        deltaPct = snapshotShowsPaceAxis ? ((firstVal - lastVal) / firstVal) * 100 : ((lastVal - firstVal) / firstVal) * 100;
        trend = deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'same';
      }
      rows.push({ interval: i + 1, firstVal, lastVal, deltaPct, trend });
    }
    const comparedRows = rows.filter(r => r.deltaPct !== null);
    const avgProgress = comparedRows.length ? comparedRows.reduce((sum, r) => sum + r.deltaPct, 0) / comparedRows.length : null;
    return { firstTraining, lastTraining, rows, avgProgress };
  }, [selectedMetric, snapshotSelectedTrainings, snapshotShowsPaceAxis]);

  const snapshotSeries = useMemo(() => snapshotSelectedTrainings.map((training, idx) => {
    const date = getTrainingDate(training);
    const dateLabel = Number.isNaN(date.getTime()) ? `Unknown ${idx + 1}` : date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return { key: `snapshot_${idx}`, label: dateLabel, training, color: SERIES_COLORS[idx % SERIES_COLORS.length] };
  }), [snapshotSelectedTrainings]);

  const sameTrainingChartData = useMemo(() => {
    if (!snapshotSeries.length) return [];
    const maxIntervals = Math.max(...snapshotSeries.map(s => s.training?.results?.length || 0));
    return Array.from({ length: maxIntervals }, (_, i) => {
      const row = { interval: i + 1 };
      snapshotSeries.forEach(series => { row[series.key] = normalizeMetricValue(series.training?.results?.[i], selectedMetric); });
      return row;
    });
  }, [snapshotSeries, selectedMetric]);

  const snapshotYDomain = useMemo(() => {
    if (!sameTrainingChartData.length || !snapshotSeries.length) return [0, 'auto'];
    const values = [];
    sameTrainingChartData.forEach(row => snapshotSeries.forEach(s => { const v = row?.[s.key]; if (typeof v === 'number' && Number.isFinite(v)) values.push(v); }));
    if (!values.length) return [0, 'auto'];
    let minV = Math.min(...values);
    let maxV = Math.max(...values);
    if (minV === maxV) { const pad = Math.max(1, Math.abs(minV) * 0.1); return [minV - pad, maxV + pad]; }
    const range = maxV - minV;
    const pad = range * 0.15;
    minV = minV - pad;
    maxV = maxV + pad;
    if (selectedMetric !== 'power') minV = Math.max(0, minV);
    else if (filteredTrainings.every(t => isBikeSport(t.sport))) minV = Math.max(0, minV);
    return [minV, maxV];
  }, [sameTrainingChartData, snapshotSeries, selectedMetric, filteredTrainings]);

  // ── Monthly trend ───────────────────────────────────────────────────────────
  const monthlyTrendData = useMemo(() => {
    if (!filteredTrainings.length) return [];
    const byMonth = new Map();
    filteredTrainings.forEach(training => {
      const date = new Date(training.date || training.timestamp || training.createdAt);
      if (Number.isNaN(date.getTime())) return;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, { monthKey, monthLabel, powerValues: [], speedValues: [], trainings: 0 });
      const bucket = byMonth.get(monthKey);
      bucket.trainings += 1;
      if (isBikeSport(training.sport)) {
        const values = (training.results || []).map(r => { const v = r?.power; if (typeof v === 'string' && v.includes(':')) return null; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }).filter(v => v !== null);
        if (values.length) bucket.powerValues.push(values.reduce((a, b) => a + b, 0) / values.length);
      }
      const avgSpeedMps = Number(training.avgSpeed || 0);
      if (Number.isFinite(avgSpeedMps) && avgSpeedMps > 0) bucket.speedValues.push(unitSystem === 'imperial' ? avgSpeedMps * 2.236936 : avgSpeedMps * 3.6);
    });
    return Array.from(byMonth.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey)).map(item => ({
      monthKey: item.monthKey, monthLabel: item.monthLabel, trainings: item.trainings,
      power: item.powerValues.length ? item.powerValues.reduce((a, b) => a + b, 0) / item.powerValues.length : null,
      speed: item.speedValues.length ? item.speedValues.reduce((a, b) => a + b, 0) / item.speedValues.length : null,
    }));
  }, [filteredTrainings, unitSystem]);

  // ── Y-axis helpers ──────────────────────────────────────────────────────────
  const paceYAxisReversed = useMemo(() => {
    if (selectedMetric !== 'power' || !filteredTrainings.length) return false;
    if (filteredTrainings.every(t => isBikeSport(t.sport))) return false;
    if (filteredTrainings.some(t => isPaceSport(t.sport))) return true;
    if (!chartData.length) return false;
    const values = [];
    chartData.forEach(row => Object.entries(row).forEach(([key, val]) => { if (key === 'interval' || val === null) return; if (activeSeries[key] === false) return; if (typeof val === 'number' && Number.isFinite(val)) values.push(val); }));
    if (!values.length) return false;
    return values.filter(v => v > 100).length > values.length * 0.5;
  }, [selectedMetric, filteredTrainings, chartData, activeSeries]);

  const getYDomain = () => {
    if (!chartData.length) return [0, 'auto'];
    const allOriginalValues = [];
    filteredTrainings.forEach(training => training.results?.forEach(result => {
      let value = null;
      if (selectedMetric === 'power') value = result.power;
      else if (selectedMetric === 'heartRate') value = result.heartRate;
      else if (selectedMetric === 'lactate') value = result.lactate;
      else if (selectedMetric === 'RPE') value = result.RPE;
      if (selectedMetric === 'power' && typeof value === 'string' && value.includes(':')) { const [min, sec] = value.split(':').map(Number); value = min * 60 + sec; }
      if (value !== null && value !== undefined && typeof value === 'number') allOriginalValues.push(value);
    }));
    if (!allOriginalValues.length) return [0, 'auto'];
    const minValue = Math.min(...allOriginalValues);
    const maxValue = Math.max(...allOriginalValues);
    if (maxValue === 0) return [0, 10];
    const range = maxValue - minValue;
    return [Math.max(0, minValue - range * 0.1), Math.ceil((maxValue + range * 0.1) / 10) * 10];
  };

  const getCustomYTicks = () => {
    if (!chartData.length) return [0, 100, 200, 300, 400, 500];
    const yDomain = getYDomain();
    const [domainMin, domainMax] = [yDomain[0], yDomain[1]];
    const range = domainMax - domainMin;
    if (range === 0) return [domainMin];
    const targetTicks = 10;
    let step = range / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(step)));
    const normalized = step / magnitude;
    let niceStep = normalized <= 1 ? magnitude : normalized <= 2 ? 2 * magnitude : normalized <= 5 ? 5 * magnitude : 10 * magnitude;
    niceStep = Math.max(10, Math.ceil(niceStep / 10) * 10);
    const ticks = [];
    const startTick = Math.floor(domainMin / niceStep) * niceStep;
    for (let tick = startTick; tick <= domainMax + niceStep; tick += niceStep) {
      if (tick >= domainMin && tick <= domainMax && !ticks.includes(tick)) ticks.push(tick);
    }
    if (!ticks.length || ticks[ticks.length - 1] < domainMax) {
      const rounded = Math.ceil(domainMax / niceStep) * niceStep;
      if (!ticks.includes(rounded) && rounded <= domainMax + niceStep) ticks.push(rounded);
      else if (!ticks.includes(domainMax)) ticks.push(domainMax);
    }
    return ticks.sort((a, b) => a - b);
  };

  // ── Series toggle ───────────────────────────────────────────────────────────
  const toggleSeries = (label) => setActiveSeries(prev => ({ ...prev, [label]: !prev[label] }));
  const setAllSeriesVisible = (visible) => setActiveSeries(prev => { const next = { ...prev }; Object.keys(trainingMeta).forEach(label => { next[label] = visible; }); return next; });

  // ── Interval formatters ─────────────────────────────────────────────────────
  const formatIntervalDuration = (result) => {
    if (!result) return 'N/A';
    let seconds = 0;
    if (result.durationSeconds && result.durationSeconds > 0) seconds = result.durationSeconds;
    else if (result.durationType === 'time' && typeof result.duration === 'number' && result.duration > 0) seconds = result.duration;
    else if (result.duration && typeof result.duration === 'string') {
      const parts = result.duration.split(':');
      if (parts.length === 2) seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      else if (parts.length === 3) seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    if (seconds === 0) return 'N/A';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  };

  const formatIntervalDistance = (result) => {
    if (!result) return null;
    const dist = result.distance || result.distanceMeters;
    if (dist === undefined || dist === null) return null;
    const meters = typeof dist === 'string' ? Number(dist) : dist;
    if (Number.isNaN(meters) || meters <= 0) return null;
    if (unitSystem === 'imperial') { const miles = meters / 1609.344; return miles >= 0.1 ? `${miles.toFixed(2)} mi` : `${Math.round(meters * 3.28084)} ft`; }
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
  };

  // ── Tooltip ─────────────────────────────────────────────────────────────────
  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[180px] max-w-[320px]">
        <div className="font-semibold text-gray-900 mb-2">Interval {label}</div>
        <div className="space-y-1.5">
          {payload.map((point, idx) => {
            const trainingLabel = point.dataKey;
            const meta = trainingMeta[trainingLabel];
            const result = meta?.results?.[label - 1];
            let originalValue = null;
            if (result) {
              if (selectedMetric === 'power') { originalValue = result.power; if (typeof originalValue === 'string' && originalValue.includes(':')) { const [min, sec] = originalValue.split(':').map(Number); originalValue = min * 60 + sec; } }
              else if (selectedMetric === 'heartRate') originalValue = result.heartRate;
              else if (selectedMetric === 'lactate') originalValue = result.lactate;
              else if (selectedMetric === 'RPE') originalValue = result.RPE;
            }
            const distanceText = stripUnits(formatIntervalDistance(result));
            const durationText = formatIntervalDuration(result);
            return (
              <div key={idx} className="flex items-center gap-2 py-1 border-b border-gray-100 last:border-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: point.color }} />
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{trainingLabel}</div>
                  <div className="text-gray-500">
                    {formatMetricValue(originalValue, selectedMetric)}
                    {durationText !== 'N/A' && ` · ${durationText}`}
                    {distanceText && ` · ${distanceText}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Navigate to calendar ────────────────────────────────────────────────────
  const handleOpenTraining = (training) => {
    const tid = training?._id || training?.id;
    const stravaId = training?.stravaId || training?.sourceStravaActivityId || null;
    if (stravaId) navigate(`/training-calendar?stravaId=${encodeURIComponent(String(stravaId))}`);
    else if (tid) navigate(`/training-calendar?trainingId=${encodeURIComponent(String(tid))}`);
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (filteredTrainings.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Training Comparison</h2>
        <p className="text-sm text-gray-500 mb-4">
          {recentSavedTrainings.length > 0
            ? 'Select a category and title with interval data to enable comparison.'
            : 'No trainings yet. Add trainings or sync Strava/FIT to start comparing.'}
        </p>
        {recentSavedTrainings.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Recent sessions</p>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 max-h-60 overflow-y-auto">
              {recentSavedTrainings.map(t => {
                const when = new Date(t.date || t.timestamp || t.createdAt || 0);
                const dateLabel = Number.isNaN(when.getTime()) ? '—' : when.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                const hasIntervals = Array.isArray(t.results) && t.results.length > 0;
                return (
                  <li key={String(t._id || t.stravaId || t.id)} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{t.title || t.name || 'Untitled'}</p>
                      <p className="text-xs text-gray-500">{dateLabel}{t.sport ? ` · ${t.sport}` : ''}{!hasIntervals ? ' · no intervals' : ''}</p>
                    </div>
                    <button onClick={() => navigateTrainingToCalendar(t, navigate)} className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-primary/40 bg-indigo-50 text-primary font-medium hover:bg-indigo-100 transition-colors">Open</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </motion.div>
    );
  }

  // ── Metric label helper ─────────────────────────────────────────────────────
  const metricLabel = () => {
    if (selectedMetric === 'power') return areAllTrainingsBike() ? 'Power' : 'Power/Pace';
    if (selectedMetric === 'heartRate') return 'Heart Rate';
    return selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1);
  };

  // ── Training list (for compare tab) ────────────────────────────────────────
  const displayedTrainings = showAllTrainings ? filteredTrainings : filteredTrainings.slice(Math.max(0, filteredTrainings.length - 8));

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 md:px-6 md:pt-5">
        <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-3">Training Comparison</h2>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Category */}
          <div className="relative">
            <select value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); localStorage.setItem('trainingComparison_category', e.target.value); setSelectedTitle('all'); localStorage.setItem('trainingComparison_title', 'all'); }}
              className="pl-3 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30">
              {categories.map(cat => <option key={cat} value={cat}>{cat === 'all' ? 'All categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}</option>)}
            </select>
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></div>
          </div>

          {/* Title */}
          <div className="relative flex-1 min-w-[140px]">
            <select value={selectedTitle} onChange={e => { setSelectedTitle(e.target.value); localStorage.setItem('trainingComparison_title', e.target.value); }}
              className="w-full pl-3 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30">
              {titles.map(title => <option key={title} value={title}>{title === 'all' ? 'All titles' : title}</option>)}
            </select>
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></div>
          </div>
        </div>

        {/* Metric pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {METRICS.map(m => (
            <button key={m.id} onClick={() => { setSelectedMetric(m.id); localStorage.setItem('trainingComparison_metric', m.id); }}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${selectedMetric === m.id ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40 hover:text-primary'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-100 px-4 md:px-6 gap-0">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {tab === 'compare' ? 'Compare' : tab === 'progress' ? 'Progress' : 'Monthly'}
          </button>
        ))}
        <div className="ml-auto flex items-center text-xs text-gray-400 pb-1">
          {filteredTrainings.length} sessions
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="p-4 md:p-6">

        {/* ══ COMPARE TAB ══════════════════════════════════════════════════════ */}
        <AnimatePresence mode="wait">
        {activeTab === 'compare' && (
          <motion.div key="compare" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            {/* Training selector */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-700">Select trainings to compare</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setSnapshotSelectedIds(snapshotOptions.map(o => o.id))} className="text-[11px] px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">All</button>
                  <button onClick={() => setSnapshotSelectedIds(snapshotOptions.slice(Math.max(0, snapshotOptions.length - 2)).map(o => o.id))} className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">Latest 2</button>
                  <button onClick={() => setSnapshotSelectedIds([])} className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">Clear</button>
                </div>
              </div>

              {/* Selected chips */}
              {snapshotSelectedTrainings.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {snapshotSelectedTrainings.map((t, idx) => {
                    const id = getTrainingUid(t);
                    const d = getTrainingDate(t);
                    const dateLabel = Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
                    return (
                      <button key={`chip-${id}`} onClick={() => setSnapshotSelectedIds(prev => prev.filter(x => x !== id))}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border border-primary/20 bg-primary/8 text-primary hover:bg-primary/15 transition-colors"
                        style={{ backgroundColor: `${SERIES_COLORS[idx % SERIES_COLORS.length]}15`, borderColor: `${SERIES_COLORS[idx % SERIES_COLORS.length]}40`, color: SERIES_COLORS[idx % SERIES_COLORS.length] }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }} />
                        <span className="font-semibold">{dateLabel}</span>
                        <span className="opacity-60 max-w-[100px] truncate">{t?.title || 'Training'}</span>
                        <span className="opacity-50 ml-0.5">×</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Training list */}
              <div className={`space-y-1 overflow-y-auto rounded-xl border border-gray-100 ${showAllTrainings ? 'max-h-none' : 'max-h-52'}`}>
                {displayedTrainings.map((training, index) => {
                  const absIndex = showAllTrainings ? index : filteredTrainings.length - displayedTrainings.length + index;
                  const id = getTrainingUid(training);
                  const isSnapshotChecked = snapshotSelectedIds.includes(id);
                  const date = getTrainingDate(training);
                  const dateLabel = Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
                  const color = SERIES_COLORS[absIndex % SERIES_COLORS.length];
                  return (
                    <div key={training._id || index}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all ${isSnapshotChecked ? 'bg-gray-50 border-gray-200' : 'border-transparent hover:bg-gray-50'}`}>
                      {/* Color dot + checkbox */}
                      <button onClick={() => setSnapshotSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                        className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSnapshotChecked ? 'border-0' : 'border-gray-300 bg-white'}`}
                        style={isSnapshotChecked ? { backgroundColor: color, borderColor: color } : {}}>
                        {isSnapshotChecked && <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.07 7.07a1 1 0 01-1.42 0l-3.535-3.536a1 1 0 011.415-1.414l2.828 2.829 6.364-6.364a1 1 0 011.418-.005z" clipRule="evenodd" /></svg>}
                      </button>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm truncate">{training.title || 'Training'}</div>
                        <div className="text-xs text-gray-500">{dateLabel} · {training.sport || '—'} · {training.results?.length || 0} int</div>
                      </div>
                      {/* Open button */}
                      <button onClick={() => handleOpenTraining(training)} className="shrink-0 text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-primary/40 hover:text-primary transition-colors">
                        Open
                      </button>
                    </div>
                  );
                })}
              </div>
              {filteredTrainings.length > 8 && (
                <button onClick={() => setShowAllTrainings(v => !v)} className="mt-1.5 text-xs text-primary hover:underline">
                  {showAllTrainings ? 'Show fewer' : `Show all ${filteredTrainings.length} sessions`}
                </button>
              )}
            </div>

            {snapshotSelectedTrainings.length < 2 && snapshotSelectedTrainings.length > 0 && (
              <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Select at least <span className="font-semibold">2 trainings</span> to see interval comparison and progress.
              </div>
            )}

            {/* ── Snapshot chart ── */}
            {sameTrainingChartData.length > 0 && snapshotSelectedTrainings.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">{metricLabel()} by interval</p>
                  {snapshotShowsPaceAxis && <span className="text-[11px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">Faster = lower</span>}
                </div>
                <div className="w-full h-56 md:h-72 rounded-xl bg-gray-50 border border-gray-100 p-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={sameTrainingChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis dataKey="interval" tick={{ fontSize: 10, fill: '#6B7280' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} domain={snapshotYDomain} reversed={snapshotShowsPaceAxis} tickFormatter={v => formatMetricAxisTick(v, selectedMetric)} width={42} />
                      <Tooltip formatter={(value, name) => { if (value === null || value === undefined) return 'N/A'; const meta = snapshotSeries.find(s => s.key === name); return [formatMetricValue(value, selectedMetric), meta?.label || String(name)]; }} labelFormatter={label => `Interval ${label}`} contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
                      {snapshotSeries.map(series => (
                        <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2.5} dot={{ r: 4, fill: series.color, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5 }} connectNulls />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── Avg progress badge ── */}
            {sameTrainingSnapshot && sameTrainingSnapshot.avgProgress !== null && (
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Avg progress (first → last):</span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${getTrendBg(sameTrainingSnapshot.avgProgress > 0 ? 'up' : sameTrainingSnapshot.avgProgress < 0 ? 'down' : 'same')}`}>
                  {getTrendIcon(sameTrainingSnapshot.avgProgress > 0 ? 'up' : sameTrainingSnapshot.avgProgress < 0 ? 'down' : 'same')}
                  {sameTrainingSnapshot.avgProgress > 0 ? '+' : ''}{sameTrainingSnapshot.avgProgress.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-400">across {sameTrainingSnapshot.rows.filter(r => r.deltaPct !== null).length} intervals</span>
              </div>
            )}

            {/* ── Interval delta table ── */}
            {sameTrainingSnapshot && sameTrainingSnapshot.rows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm min-w-[320px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-10">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: SERIES_COLORS[0] }}>
                        {(() => { const d = getTrainingDate(sameTrainingSnapshot.firstTraining); return Number.isNaN(d.getTime()) ? 'First' : d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' }); })()}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: SERIES_COLORS[snapshotSeries.length > 1 ? snapshotSeries.length - 1 : 1] }}>
                        {(() => { const d = getTrainingDate(sameTrainingSnapshot.lastTraining); return Number.isNaN(d.getTime()) ? 'Last' : d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' }); })()}
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sameTrainingSnapshot.rows.map(row => (
                      <tr key={`row-${row.interval}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2.5 text-xs font-bold text-gray-400">{row.interval}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-700">{row.firstVal === null ? <span className="text-gray-300">—</span> : formatMetricValue(row.firstVal, selectedMetric)}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-700">{row.lastVal === null ? <span className="text-gray-300">—</span> : formatMetricValue(row.lastVal, selectedMetric)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {row.deltaPct === null ? <span className="text-xs text-gray-300">—</span> : (
                            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full border ${getTrendBg(row.trend)}`}>
                              {getTrendIcon(row.trend)}
                              {row.deltaPct > 0 ? '+' : ''}{row.deltaPct.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* ══ PROGRESS TAB ══════════════════════════════════════════════════════ */}
        {activeTab === 'progress' && (
          <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {progressStats ? (
              <>
                <p className="text-xs text-gray-500 mb-4">Comparing first vs last training for each metric</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['power', 'heartRate', 'lactate', 'RPE'].map(metric => {
                    const stat = progressStats[metric];
                    if (stat.first === null) return null;
                    return (
                      <div key={metric} className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-gray-600">
                            {metric === 'power' ? (areAllTrainingsBike() ? 'Power' : 'Power/Pace') : metric === 'heartRate' ? 'Heart Rate' : metric.charAt(0).toUpperCase() + metric.slice(1)}
                          </p>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${getTrendBg(stat.trend)}`}>
                            {getTrendIcon(stat.trend)}
                            {stat.change > 0 ? '+' : ''}{stat.change.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[11px] text-gray-400">First</p>
                            <p className="text-sm font-semibold text-gray-700">{formatMetricValue(stat.first, metric)}</p>
                          </div>
                          <div className="text-gray-300 text-lg font-light px-2">→</div>
                          <div className="text-right">
                            <p className="text-[11px] text-gray-400">Last</p>
                            <p className={`text-sm font-bold ${getTrendColor(stat.trend)}`}>{formatMetricValue(stat.last, metric)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* All trainings list in progress view */}
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-700">All sessions ({filteredTrainings.length})</p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setAllSeriesVisible(true)} className="text-[11px] px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700">Show all</button>
                      <button onClick={() => setAllSeriesVisible(false)} className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">Hide all</button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-56 overflow-y-auto rounded-xl border border-gray-100">
                    {filteredTrainings.map((training, index) => {
                      const date = getTrainingDate(training);
                      const dateLabel = Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
                      const trainingLabel = `${dateLabel} (${index + 1})`;
                      const color = SERIES_COLORS[index % SERIES_COLORS.length];
                      const isOn = activeSeries[trainingLabel] !== false;
                      return (
                        <div key={training._id || index} className={`flex items-center gap-2.5 px-3 py-2 border-b border-gray-50 last:border-0 transition-opacity ${isOn ? '' : 'opacity-50'}`}>
                          <button onClick={() => toggleSeries(trainingLabel)} className={`shrink-0 w-4 h-4 rounded-full border-2 transition-all`} style={isOn ? { backgroundColor: color, borderColor: color } : { borderColor: '#D1D5DB' }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-gray-800 truncate block">{training.title || 'Training'}</span>
                            <span className="text-[11px] text-gray-400">{dateLabel} · {training.results?.length || 0} intervals</span>
                          </div>
                          <button onClick={() => handleOpenTraining(training)} className="shrink-0 text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-primary/40 hover:text-primary transition-colors">Open</button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full interval chart */}
                {chartData.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold text-gray-700 mb-2">All trainings overlay — {metricLabel()}</p>
                    <div className="w-full h-64 md:h-80 rounded-xl bg-gray-50 border border-gray-100 p-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                          <XAxis dataKey="interval" tick={{ fontSize: 10, fill: '#6B7280' }} label={{ value: 'Interval', position: 'insideBottom', offset: -5, fill: '#9CA3AF', fontSize: 10 }} />
                          <YAxis domain={getYDomain()} ticks={getCustomYTicks()} tickFormatter={v => formatMetricAxisTick(v, selectedMetric)} tick={{ fontSize: 10, fill: '#6B7280' }} reversed={paceYAxisReversed} width={40} />
                          <Tooltip content={renderTooltip} />
                          {Object.entries(trainingMeta).map(([label, meta]) => {
                            if (activeSeries[label] === false) return null;
                            return (
                              <Line key={label} type="monotone" dataKey={label} stroke={SERIES_COLORS[meta.index % SERIES_COLORS.length]} strokeWidth={1.5} dot={false} connectNulls activeDot={{ r: 4 }} />
                            );
                          })}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Need at least 2 sessions with intervals to show progress.</p>
            )}
          </motion.div>
        )}

        {/* ══ MONTHLY TAB ═══════════════════════════════════════════════════════ */}
        {activeTab === 'monthly' && (
          <motion.div key="monthly" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {monthlyTrendData.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-gray-700">Average monthly trend</p>
                  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                    <button onClick={() => setMonthlyMetric('power')} className={`px-3 py-1.5 ${monthlyMetric === 'power' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Power</button>
                    <button onClick={() => setMonthlyMetric('speed')} className={`px-3 py-1.5 border-l border-gray-200 ${monthlyMetric === 'speed' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Speed</button>
                  </div>
                </div>
                {monthlyTrendData.some(d => d[monthlyMetric] !== null) ? (
                  <div className="w-full h-64 md:h-80 rounded-xl bg-gray-50 border border-gray-100 p-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthlyTrendData} margin={{ top: 10, right: 15, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                        <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: '#6B7280' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} label={{ value: monthlyMetric === 'power' ? 'Power (W)' : `Speed (${unitSystem === 'imperial' ? 'mph' : 'km/h'})`, angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 10 }} />
                        <Tooltip formatter={v => v === null ? 'N/A' : monthlyMetric === 'power' ? `${Math.round(v)} W` : `${Number(v).toFixed(1)} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}`} labelFormatter={(label, payload) => `${label} (${payload?.[0]?.payload?.trainings || 0} sessions)`} contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 12 }} />
                        <Line type="monotone" dataKey={monthlyMetric} stroke="#6366F1" strokeWidth={2.5} dot={{ r: 4, fill: '#6366F1', stroke: '#fff', strokeWidth: 1.5 }} connectNulls={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-xl border border-gray-100 p-4">No {monthlyMetric} data for current filter.</div>
                )}

                {/* Monthly table */}
                <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Month</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Sessions</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Avg Power</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Avg Speed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {monthlyTrendData.map(row => (
                        <tr key={row.monthKey} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs font-medium text-gray-700">{row.monthLabel}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 text-right">{row.trainings}</td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-right">{row.power !== null ? `${Math.round(row.power)} W` : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-right">{row.speed !== null ? `${row.speed.toFixed(1)} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}` : <span className="text-gray-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">No monthly data for the current filter.</p>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default TrainingComparison;
