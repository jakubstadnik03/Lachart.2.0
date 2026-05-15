import React, { useEffect, useMemo, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';
import { resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import { SearchableSelect } from '../SearchableSelect';
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

/** Parse seconds from a raw result — used outside the component too */
function parseResultDurationSec(result) {
  if (!result) return 0;
  if (result.durationSeconds > 0) return result.durationSeconds;
  if (result.durationType === 'time' && typeof result.duration === 'number' && result.duration > 0) return result.duration;
  if (result.duration && typeof result.duration === 'string') {
    const parts = result.duration.split(':');
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  return 0;
}

/**
 * From a results array, return only the "work" intervals.
 * Returns [{result, originalIdx}] so callers always show the original interval number.
 *
 * Priority:
 *  1. If ANY result has an explicit `intervalType`, treat the user's tags as
 *     authoritative — only intervals tagged 'work' (or untagged when at least
 *     one of warmup/recovery/cooldown is set) count toward averages.
 *  2. Fall back to distance clustering (best for swim/run repeats).
 *  3. Fall back to duration clustering (best for timed bike intervals).
 *  4. If nothing helps, return everything.
 */
function detectWorkIntervals(results) {
  if (!results || results.length <= 2) return results.map((r, i) => ({ result: r, originalIdx: i }));

  // ── 1. Explicit intervalType (set by TrainingForm — manual or auto-detect) ──
  const tagged = results.some(r => r && r.intervalType);
  if (tagged) {
    const indexed = results.map((r, i) => ({ result: r, originalIdx: i }));
    // Anything explicitly marked warmup / recovery / cooldown is excluded.
    // Untagged entries are kept when they look like work (i.e. there ARE
    // non-work tags somewhere) — gives users a way to flag boundaries
    // without re-tagging every work interval.
    const workOnly = indexed.filter(({ result: r }) => {
      const t = r.intervalType;
      if (t === 'warmup' || t === 'recovery' || t === 'cooldown') return false;
      return true; // 'work' or untagged
    });
    if (workOnly.length >= 1) return workOnly;
  }

  // ── 2. Distance clustering (swim / run by distance) ─────────────────────
  const withDist = results.map((r, i) => {
    const raw = r.distanceMeters ?? r.distance;
    const n = Number(raw);
    return { result: r, originalIdx: i, dist: Number.isFinite(n) && n > 0 ? n : null };
  });
  const distValues = withDist.map(x => x.dist).filter(Boolean);
  if (distValues.length >= Math.ceil(results.length * 0.5)) {
    const sorted = [...distValues].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const matched = withDist.filter(x => x.dist !== null && Math.abs(x.dist - median) / median <= 0.25);
    if (matched.length >= 2 && matched.length < results.length) return matched;
  }

  // ── 3. Duration clustering (time-based intervals) ────────────────────────
  const withDur = results.map((r, i) => ({ result: r, originalIdx: i, dur: parseResultDurationSec(r) }));
  const durValues = withDur.map(x => x.dur).filter(d => d > 0);
  if (durValues.length >= 2) {
    const sorted = [...durValues].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const matched = withDur.filter(x => x.dur > 0 && Math.abs(x.dur - median) / median <= 0.35);
    if (matched.length >= 2 && matched.length < results.length) return matched;
  }

  return results.map((r, i) => ({ result: r, originalIdx: i }));
}

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

// Parent passes the curated Training-collection set. Accept anything that
// has a title and at least one result so the available titles match the
// dashboard Training History.
function isAnnotatedExport(t) {
  if (!t) return false;
  const hasTitle = !!((t.titleManual || t.title) && String(t.titleManual || t.title).trim());
  const hasResults = Array.isArray(t.results) && t.results.length > 0;
  const hasLaps    = Array.isArray(t.laps)    && t.laps.length    > 0;
  return hasTitle && (hasResults || hasLaps);
}

const TrainingComparison = ({ trainings: rawTrainings }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const unitSystem = resolveDistanceUnitSystem(user, 'metric');

  // Filter early so every derived list (categories / titles / chart / …)
  // sees only the annotated exports.
  const trainings = useMemo(
    () => (Array.isArray(rawTrainings) ? rawTrainings.filter(isAnnotatedExport) : []),
    [rawTrainings]
  );
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
  const [filterWorkOnly, setFilterWorkOnly] = useState(true);
  // barTooltip: { iv, durLabel, valLabel, x, y } — null = hidden
  const [barTooltip, setBarTooltip] = useState(null);
  const barTooltipTimeout = useRef(null);

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

  // ── Auto-select best default title when trainings first load ────────────────
  useEffect(() => {
    if (!trainings || trainings.length === 0) return;
    // Only auto-select if user hasn't already made a choice
    const persisted = localStorage.getItem('trainingComparison_title');
    if (persisted && persisted !== 'all') return;

    // Count sessions per title (only those with results)
    const withResults = trainings.filter(t => Array.isArray(t.results) && t.results.length > 0);
    if (withResults.length === 0) return;

    const counts = {};
    withResults.forEach(t => {
      if (t.title) counts[t.title] = (counts[t.title] || 0) + 1;
    });

    // Prefer title with most sessions (≥2); fall back to most recent with results
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1]).find(([, n]) => n >= 2);
    const defaultTitle = best
      ? best[0]
      : withResults.sort((a, b) => new Date(b.date || b.timestamp || b.createdAt || 0) - new Date(a.date || a.timestamp || a.createdAt || 0))[0]?.title;

    if (defaultTitle) {
      setSelectedTitle(defaultTitle);
      localStorage.setItem('trainingComparison_title', defaultTitle);
    }
  }, [trainings]);

  // ── Listen for "compare same trainings" event from TrainingItem ─────────────
  useEffect(() => {
    const handler = (e) => {
      const { title, category } = e.detail || {};
      if (category && category !== 'all') {
        setSelectedCategory(category);
        localStorage.setItem('trainingComparison_category', category);
      }
      if (title) {
        setSelectedTitle(title);
        localStorage.setItem('trainingComparison_title', title);
      }
      setActiveTab('compare');
      localStorage.setItem('trainingComparison_tab', 'compare');
    };
    window.addEventListener('lachart:compare', handler);
    return () => window.removeEventListener('lachart:compare', handler);
  }, []);

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

  /**
   * For each selected training, returns the (possibly filtered) interval items:
   *   [{ result, originalIdx }]
   * When filterWorkOnly=true, warmup/cooldown/odd-duration laps are excluded.
   */
  const filteredIntervalSets = useMemo(() => {
    const map = new Map();
    snapshotSelectedTrainings.forEach(training => {
      const uid = getTrainingUid(training);
      const raw = training.results || [];
      map.set(uid, filterWorkOnly ? detectWorkIntervals(raw) : raw.map((r, i) => ({ result: r, originalIdx: i })));
    });
    return map;
  }, [snapshotSelectedTrainings, filterWorkOnly]);

  const sameTrainingSnapshot = useMemo(() => {
    if (snapshotSelectedTrainings.length < 2) return null;
    const firstTraining = snapshotSelectedTrainings[0];
    const lastTraining = snapshotSelectedTrainings[snapshotSelectedTrainings.length - 1];
    if (!firstTraining || !lastTraining) return null;

    const firstItems = filteredIntervalSets.get(getTrainingUid(firstTraining)) || [];
    const lastItems  = filteredIntervalSets.get(getTrainingUid(lastTraining))  || [];
    const maxLen = Math.max(firstItems.length, lastItems.length);

    const rows = [];
    for (let i = 0; i < maxLen; i++) {
      const fi = firstItems[i];
      const li = lastItems[i];
      const firstVal = normalizeMetricValue(fi?.result, selectedMetric);
      const lastVal  = normalizeMetricValue(li?.result, selectedMetric);
      if (firstVal === null && lastVal === null) continue;
      let deltaPct = null;
      let trend = 'same';
      if (Number.isFinite(firstVal) && Number.isFinite(lastVal) && firstVal !== 0) {
        deltaPct = snapshotShowsPaceAxis ? ((firstVal - lastVal) / firstVal) * 100 : ((lastVal - firstVal) / firstVal) * 100;
        trend = deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'same';
      }
      // Keep original interval number (from first training if available) for display
      const displayNum = (fi?.originalIdx ?? li?.originalIdx ?? i) + 1;
      rows.push({ interval: displayNum, matchIdx: i + 1, firstVal, lastVal, deltaPct, trend });
    }
    const comparedRows = rows.filter(r => r.deltaPct !== null);
    const avgProgress = comparedRows.length ? comparedRows.reduce((sum, r) => sum + r.deltaPct, 0) / comparedRows.length : null;

    // How many intervals were excluded by the work-only filter
    const totalFirst = firstTraining.results?.length || 0;
    const totalLast  = lastTraining.results?.length  || 0;
    const excludedCount = Math.max(0, Math.max(totalFirst, totalLast) - maxLen);

    return { firstTraining, lastTraining, rows, avgProgress, excludedCount };
  }, [selectedMetric, snapshotSelectedTrainings, snapshotShowsPaceAxis, filteredIntervalSets]);

  const snapshotSeries = useMemo(() => snapshotSelectedTrainings.map((training, idx) => {
    const date = getTrainingDate(training);
    const dateLabel = Number.isNaN(date.getTime()) ? `Unknown ${idx + 1}` : date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return { key: `snapshot_${idx}`, label: dateLabel, training, color: SERIES_COLORS[idx % SERIES_COLORS.length] };
  }), [snapshotSelectedTrainings]);

  const sameTrainingChartData = useMemo(() => {
    if (!snapshotSeries.length) return [];
    const itemsPerSeries = snapshotSeries.map(s => filteredIntervalSets.get(getTrainingUid(s.training)) || []);
    const maxLen = Math.max(...itemsPerSeries.map(items => items.length), 0);
    return Array.from({ length: maxLen }, (_, i) => {
      const row = { interval: i + 1 };
      snapshotSeries.forEach((series, sIdx) => {
        const item = itemsPerSeries[sIdx]?.[i];
        row[series.key] = normalizeMetricValue(item?.result, selectedMetric);
      });
      return row;
    });
  }, [snapshotSeries, selectedMetric, filteredIntervalSets]);

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

  // ── Interval Timeline helpers ───────────────────────────────────────────────
  /** Parse seconds from a result object — same logic as chartData builder */
  const parseResultDurationSeconds = (result) => {
    if (!result) return 0;
    if (result.durationSeconds && result.durationSeconds > 0) return result.durationSeconds;
    if (result.durationType === 'time' && typeof result.duration === 'number' && result.duration > 0) return result.duration;
    if (result.duration && typeof result.duration === 'string') {
      const parts = result.duration.split(':');
      if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
      if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    return 0;
  };

  /** Linear interpolation between two hex colours (0–1 factor) */
  const lerpColor = (hexA, hexB, t) => {
    const h = (hex) => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    const a = h(hexA), b = h(hexB);
    const r = Math.round(a[0] + (b[0]-a[0])*t);
    const g = Math.round(a[1] + (b[1]-a[1])*t);
    const bl = Math.round(a[2] + (b[2]-a[2])*t);
    return `rgb(${r},${g},${bl})`;
  };

  /** Map a 0–1 intensity to a blue → indigo → red colour ramp */
  const intensityColor = (t) => {
    if (t <= 0.5) return lerpColor('#60A5FA', '#6366F1', t * 2);   // blue → indigo
    return lerpColor('#6366F1', '#EF4444', (t - 0.5) * 2);         // indigo → red
  };

  /** Timeline data for currently selected snapshot trainings */
  const timelineData = useMemo(() => {
    if (!snapshotSelectedTrainings.length) return null;

    const rows = snapshotSelectedTrainings.map((training, tIdx) => {
      const d = getTrainingDate(training);
      const label = Number.isNaN(d.getTime()) ? `#${tIdx+1}` : d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });

      // Use filtered items so timeline respects the work-interval filter
      const items = filteredIntervalSets.get(getTrainingUid(training)) || (training.results || []).map((r, i) => ({ result: r, originalIdx: i }));

      const intervals = items.map(({ result: r, originalIdx }) => {
        const dur = parseResultDurationSeconds(r);
        const val = normalizeMetricValue(r, selectedMetric);
        let restSec = 0;
        if (r.rest && typeof r.rest === 'string') {
          const rp = r.rest.split(':');
          if (rp.length === 2) restSec = parseInt(rp[0]) * 60 + parseInt(rp[1]);
          else if (rp.length === 3) restSec = parseInt(rp[0]) * 3600 + parseInt(rp[1]) * 60 + parseInt(rp[2]);
        }
        // Distance (metres) for tooltip
        const rawDist = r.distanceMeters ?? r.distance;
        const distM = Number(rawDist);
        const dist = Number.isFinite(distM) && distM > 0 ? distM : null;
        // Lactate recorded?
        const lactate = (r.lactate !== undefined && r.lactate !== null && r.lactate !== 0) ? Number(r.lactate) : null;
        const heartRate = (r.heartRate !== undefined && r.heartRate !== null) ? Number(r.heartRate) : null;
        const power = r.power !== undefined ? r.power : null;
        return { idx: originalIdx, dur, val, restSec, dist, lactate, heartRate, power };
      });
      const totalDur = intervals.reduce((s, iv) => s + iv.dur + iv.restSec, 0);
      return { label, training, color: SERIES_COLORS[tIdx % SERIES_COLORS.length], intervals, totalDur };
    });

    // global value range for colour mapping
    const allVals = rows.flatMap(r => r.intervals.map(iv => iv.val)).filter(v => v !== null && Number.isFinite(v));
    const minVal = allVals.length ? Math.min(...allVals) : 0;
    const maxVal = allVals.length ? Math.max(...allVals) : 1;
    const maxTotalDur = Math.max(...rows.map(r => r.totalDur), 1);

    return { rows, minVal, maxVal, maxTotalDur };
  }, [snapshotSelectedTrainings, selectedMetric, filteredIntervalSets]);

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
    <motion.div id="training-comparison" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

      {/* ── Header — single row on lg+, wraps on smaller screens ── */}
      <div className="px-4 pt-4 pb-3 md:px-6 md:pt-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 shrink-0">Training Comparison</h2>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {/* Category */}
            <SearchableSelect
              value={selectedCategory}
              onChange={(val) => {
                setSelectedCategory(val);
                localStorage.setItem('trainingComparison_category', val);
                setSelectedTitle('all');
                localStorage.setItem('trainingComparison_title', 'all');
              }}
              options={categories.map(cat => ({
                value: cat,
                label: cat === 'all' ? 'All categories' : cat.charAt(0).toUpperCase() + cat.slice(1),
              }))}
              placeholder="All categories"
            />

            {/* Title */}
            <SearchableSelect
              value={selectedTitle}
              onChange={(val) => {
                setSelectedTitle(val);
                localStorage.setItem('trainingComparison_title', val);
              }}
              options={titles.map(title => ({
                value: title,
                label: title === 'all' ? 'All titles' : title,
              }))}
              placeholder="All titles"
            />
          </div>

          {/* Metric pills — push right on lg+ */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none lg:ml-auto">
            {METRICS.map(m => (
              <button key={m.id} onClick={() => { setSelectedMetric(m.id); localStorage.setItem('trainingComparison_metric', m.id); }}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${selectedMetric === m.id ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40 hover:text-primary'}`}>
                {m.label}
              </button>
            ))}
          </div>
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
              <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1.5">
                <p className="text-xs font-semibold text-gray-700">Select trainings to compare</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setSnapshotSelectedIds(snapshotOptions.map(o => o.id))} className="text-[11px] px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">All</button>
                  <button onClick={() => setSnapshotSelectedIds(snapshotOptions.slice(Math.max(0, snapshotOptions.length - 2)).map(o => o.id))} className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">Latest 2</button>
                  <button onClick={() => setSnapshotSelectedIds([])} className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">Clear</button>
                  <button
                    onClick={() => setFilterWorkOnly(v => !v)}
                    title="Match only work intervals of similar duration/distance — skips warmup, cooldown, recovery"
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${filterWorkOnly ? 'border-primary/50 bg-primary/10 text-primary font-semibold' : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                  >
                    {filterWorkOnly ? '✓ Work laps' : 'Work laps'}
                  </button>
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

            {/* ── Interval Timeline (duration bars) ── */}
            {timelineData && timelineData.rows.length > 0 && timelineData.rows.some(r => r.intervals.some(iv => iv.dur > 0)) && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700">Interval duration breakdown</p>
                  <span className="text-[11px] text-gray-400">bar width = duration</span>
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2.5">
                  {timelineData.rows.map((row, rowIdx) => {
                    const hasDuration = row.intervals.some(iv => iv.dur > 0);

                    return (
                      <div key={rowIdx} className="flex items-center gap-2">
                        {/* Date label */}
                        <div className="w-14 shrink-0 text-[10px] text-right text-gray-500 leading-tight font-medium"
                             style={{ color: row.color }}>
                          {row.label}
                        </div>

                        {/* Bar strip */}
                        <div className="flex-1 flex h-9 rounded-lg overflow-hidden gap-px bg-gray-200">
                          {row.intervals.map((iv, ivIdx) => {
                            const barWidth = hasDuration
                              ? (iv.dur / timelineData.maxTotalDur) * 100
                              : (1 / row.intervals.length) * 100;
                            const restWidth = hasDuration && iv.restSec > 0
                              ? (iv.restSec / timelineData.maxTotalDur) * 100
                              : 0;

                            // colour based on value intensity
                            // For pace sports: lower value = faster = more intense → invert the scale
                            const range = timelineData.maxVal - timelineData.minVal;
                            const rawIntensity = range > 0 && iv.val !== null
                              ? Math.max(0, Math.min(1, (iv.val - timelineData.minVal) / range))
                              : 0.5;
                            const intensity = snapshotShowsPaceAxis ? 1 - rawIntensity : rawIntensity;
                            const bgColor = iv.val !== null ? intensityColor(intensity) : '#D1D5DB';

                            const durLabel = iv.dur > 0
                              ? (iv.dur < 60 ? `${iv.dur}s` : `${Math.floor(iv.dur/60)}:${String(Math.round(iv.dur%60)).padStart(2,'0')}`)
                              : null;
                            const valLabel = iv.val !== null ? formatMetricValue(iv.val, selectedMetric) : null;

                            const showTooltip = (e) => {
                              clearTimeout(barTooltipTimeout.current);
                              const rect = e.currentTarget.getBoundingClientRect();
                              setBarTooltip({
                                iv, durLabel, valLabel,
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                              });
                            };
                            const hideTooltip = () => {
                              barTooltipTimeout.current = setTimeout(() => setBarTooltip(null), 120);
                            };
                            const toggleTooltip = (e) => {
                              e.stopPropagation();
                              if (barTooltip?.iv === iv) {
                                setBarTooltip(null);
                              } else {
                                showTooltip(e);
                              }
                            };

                            return (
                              <div
                                key={ivIdx}
                                className="relative flex shrink-0"
                                style={{ width: `${barWidth + restWidth}%`, minWidth: 4 }}
                              >
                                {/* Work bar */}
                                <div
                                  className="relative flex items-center justify-center h-full overflow-hidden transition-opacity active:opacity-75 cursor-default select-none"
                                  style={{
                                    width: restWidth > 0 ? `${(barWidth / (barWidth + restWidth)) * 100}%` : '100%',
                                    backgroundColor: bgColor,
                                    minWidth: 4,
                                  }}
                                  onMouseEnter={showTooltip}
                                  onMouseLeave={hideTooltip}
                                  onClick={toggleTooltip}
                                >
                                  {/* Value label */}
                                  {barWidth > 6 && valLabel && (
                                    <span className="text-[8px] sm:text-[9px] font-semibold text-white drop-shadow pointer-events-none leading-none px-0.5 truncate">
                                      {valLabel}
                                    </span>
                                  )}
                                  {/* Lactate badge */}
                                  {iv.lactate !== null && iv.lactate !== undefined && (
                                    barWidth > 10 ? (
                                      <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 bg-white/90 rounded px-0.5 pointer-events-none z-10"
                                           style={{ fontSize: 7, lineHeight: '11px', color: '#dc2626', fontWeight: 700 }}>
                                        <span className="w-1 h-1 rounded-full bg-red-500 inline-block shrink-0" />
                                        {iv.lactate}
                                      </div>
                                    ) : (
                                      <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-white border border-red-500 pointer-events-none z-10" />
                                    )
                                  )}
                                </div>
                                {/* Rest gap */}
                                {restWidth > 0 && (
                                  <div
                                    className="h-full bg-gray-200"
                                    style={{ width: `${(restWidth / (barWidth + restWidth)) * 100}%`, minWidth: 2 }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Total duration */}
                        {hasDuration && (
                          <div className="w-10 shrink-0 text-[10px] text-gray-400 text-left leading-tight tabular-nums">
                            {row.totalDur >= 3600
                              ? `${Math.floor(row.totalDur/3600)}h${String(Math.floor((row.totalDur%3600)/60)).padStart(2,'0')}m`
                              : `${Math.floor(row.totalDur/60)}:${String(Math.round(row.totalDur%60)).padStart(2,'0')}`}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Colour scale legend */}
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                    {/* For pace: max value (slow) on the left = blue, min value (fast) on the right = red */}
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatMetricValue(snapshotShowsPaceAxis ? timelineData.maxVal : timelineData.minVal, selectedMetric)}
                    </span>
                    <div className="flex-1 h-2 rounded-full" style={{
                      background: snapshotShowsPaceAxis
                        ? 'linear-gradient(to right, #60A5FA, #6366F1, #EF4444)'   // slow(blue)→fast(red) — same gradient, labels flipped
                        : 'linear-gradient(to right, #60A5FA, #6366F1, #EF4444)',
                    }} />
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatMetricValue(snapshotShowsPaceAxis ? timelineData.minVal : timelineData.maxVal, selectedMetric)}
                    </span>
                    {snapshotShowsPaceAxis && (
                      <span className="text-[10px] text-indigo-500 font-medium ml-1">(faster = redder)</span>
                    )}
                    {timelineData.rows.some(r => r.intervals.some(iv => iv.restSec > 0)) && (
                      <div className="flex items-center gap-1 ml-2">
                        <div className="w-3 h-3 rounded-sm bg-gray-200" />
                        <span className="text-[10px] text-gray-400">rest</span>
                      </div>
                    )}
                  </div>
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
                {/* Filtered intervals info banner */}
                {filterWorkOnly && sameTrainingSnapshot.excludedCount > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">
                    <span>✦</span>
                    <span>Showing <strong>{sameTrainingSnapshot.rows.length}</strong> work laps · <strong>{sameTrainingSnapshot.excludedCount}</strong> warmup/recovery laps excluded</span>
                    <button onClick={() => setFilterWorkOnly(false)} className="ml-auto underline hover:no-underline">Show all</button>
                  </div>
                )}
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

      {/* ── Bar tooltip portal — renders into body, bypasses all overflow-hidden ── */}
      {barTooltip && ReactDOM.createPortal(
        <div
          className="fixed z-[9999] cursor-default"
          style={{
            left: barTooltip.x,
            top: barTooltip.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
          onMouseEnter={() => clearTimeout(barTooltipTimeout.current)}
          onMouseLeave={() => setBarTooltip(null)}
        >
          {/* Card */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
               style={{ minWidth: 160 }}>

            {/* Coloured header strip */}
            <div className="px-3 pt-2.5 pb-2 border-b border-gray-100"
                 style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)' }}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-indigo-700">
                  Interval {barTooltip.iv.idx + 1}
                </span>
                {barTooltip.iv.lactate != null && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-red-500 bg-red-50 rounded-full px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block shrink-0" />
                    La {barTooltip.iv.lactate} mmol
                  </span>
                )}
              </div>
            </div>

            {/* Rows */}
            <div className="px-3 py-2 space-y-1.5 text-[12px]">
              {/* Distance — prominent, shown first if present */}
              {barTooltip.iv.dist != null && (
                <div className="flex items-center justify-between gap-6">
                  <span className="text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                    Distance
                  </span>
                  <span className="font-semibold text-gray-900">
                    {barTooltip.iv.dist >= 1000
                      ? `${(barTooltip.iv.dist / 1000).toFixed(barTooltip.iv.dist % 1000 === 0 ? 0 : 2)} km`
                      : `${Math.round(barTooltip.iv.dist)} m`}
                  </span>
                </div>
              )}
              {/* Duration */}
              {barTooltip.durLabel && (
                <div className="flex items-center justify-between gap-6">
                  <span className="text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/></svg>
                    Duration
                  </span>
                  <span className="font-semibold text-gray-900">{barTooltip.durLabel}</span>
                </div>
              )}
              {/* Pace / Power / HR — selected metric */}
              {barTooltip.valLabel && (
                <div className="flex items-center justify-between gap-6">
                  <span className="text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    {snapshotShowsPaceAxis ? 'Pace' : selectedMetric === 'power' ? 'Power' : 'HR'}
                  </span>
                  <span className="font-semibold text-gray-900">{barTooltip.valLabel}</span>
                </div>
              )}
              {/* HR when metric ≠ heartRate */}
              {barTooltip.iv.heartRate != null && selectedMetric !== 'heartRate' && (
                <div className="flex items-center justify-between gap-6">
                  <span className="text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                    HR
                  </span>
                  <span className="font-semibold text-gray-900">{Math.round(barTooltip.iv.heartRate)} bpm</span>
                </div>
              )}
              {/* Power when metric ≠ power */}
              {barTooltip.iv.power != null && selectedMetric !== 'power' && (
                <div className="flex items-center justify-between gap-6">
                  <span className="text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    Power
                  </span>
                  <span className="font-semibold text-gray-900">{Math.round(barTooltip.iv.power)} W</span>
                </div>
              )}
              {/* Rest */}
              {barTooltip.iv.restSec > 0 && (
                <div className="flex items-center justify-between gap-6 pt-1.5 mt-0.5 border-t border-gray-100">
                  <span className="text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Rest
                  </span>
                  <span className="font-semibold text-gray-500">
                    {barTooltip.iv.restSec < 60
                      ? `${barTooltip.iv.restSec}s`
                      : `${Math.floor(barTooltip.iv.restSec / 60)}:${String(barTooltip.iv.restSec % 60).padStart(2, '0')}`}
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* Arrow pointing down */}
          <div className="w-3 h-3 bg-white border-r border-b border-gray-200 rotate-45 mx-auto -mt-1.5" />
        </div>,
        document.body
      )}
    </motion.div>
  );
};

export default TrainingComparison;
