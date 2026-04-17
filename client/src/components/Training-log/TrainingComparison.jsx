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
  ResponsiveContainer,
  Customized
} from 'recharts';
import { motion } from 'framer-motion';
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

const TrainingComparison = ({ trainings }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const unitSystem = resolveDistanceUnitSystem(user, 'metric');
  const stripUnits = (text) => {
    if (!text || typeof text !== 'string') return text;
    // Keep digits, dot and colon (e.g. "1.25 km" -> "1.25", "00:45" -> "00:45")
    return text.replace(/[^0-9.:]/g, '');
  };
  // Load saved selections from localStorage
  const [selectedCategory, setSelectedCategory] = useState(() => {
    const saved = localStorage.getItem('trainingComparison_category');
    return saved || 'all';
  });
  const [selectedTitle, setSelectedTitle] = useState(() => {
    const saved = localStorage.getItem('trainingComparison_title');
    return saved || 'all';
  });
  const [selectedMetric, setSelectedMetric] = useState(() => {
    const saved = localStorage.getItem('trainingComparison_metric');
    return saved || 'power';
  });
  const [monthlyMetric, setMonthlyMetric] = useState(() => {
    const saved = localStorage.getItem('trainingComparison_monthlyMetric');
    return saved || 'power';
  });
  const [hasPersistedSnapshotSelection] = useState(() => localStorage.getItem('trainingComparison_snapshotSelectedIds') !== null);
  const [snapshotSelectedIds, setSnapshotSelectedIds] = useState(() => {
    try {
      const raw = localStorage.getItem('trainingComparison_snapshotSelectedIds');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [activeSeries, setActiveSeries] = useState(() => {
    // Load saved active series from localStorage
    const saved = localStorage.getItem('trainingComparison_activeSeries');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });
  const [showBars, setShowBars] = useState(() => {
    // Load saved showBars from localStorage
    const saved = localStorage.getItem('trainingComparison_showBars');
    return saved !== null ? saved === 'true' : true; // Default to true
  });
  const [trainingMeta, setTrainingMeta] = useState({});

  // Get unique categories from trainings
  const categories = useMemo(() => {
    const cats = new Set();
    trainings.forEach(t => {
      if (t.category) cats.add(t.category);
    });
    return ['all', ...Array.from(cats).sort()];
  }, [trainings]);

  // Get unique titles for selected category
  const titles = useMemo(() => {
    const filtered = selectedCategory === 'all' 
      ? trainings 
      : trainings.filter(t => t.category === selectedCategory);
    
    const titleSet = new Set();
    filtered.forEach(t => {
      if (t.title) titleSet.add(t.title);
    });
    return ['all', ...Array.from(titleSet).sort()];
  }, [trainings, selectedCategory]);

  // Filter trainings by category and title
  const filteredTrainings = useMemo(() => {
    let filtered = trainings;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(t => t.category === selectedCategory);
    }
    
    if (selectedTitle !== 'all') {
      filtered = filtered.filter(t => t.title === selectedTitle);
    }
    
    // Only include trainings with results/intervals
    filtered = filtered.filter(t => t.results && t.results.length > 0);
    
    // Sort by date
    return filtered.sort((a, b) => {
      const dateA = new Date(a.date || a.timestamp || a.createdAt);
      const dateB = new Date(b.date || b.timestamp || b.createdAt);
      return dateA - dateB;
    });
  }, [trainings, selectedCategory, selectedTitle]);

  const recentSavedTrainings = useMemo(() => {
    const list = Array.isArray(trainings) ? [...trainings] : [];
    return list
      .filter((t) => t && (t._id || t.stravaId || t.id))
      .sort((a, b) => {
        const dateA = new Date(a.date || a.timestamp || a.createdAt || 0).getTime();
        const dateB = new Date(b.date || b.timestamp || b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 25);
  }, [trainings]);

  // Prepare data for comparison chart
  const chartData = useMemo(() => {
    if (filteredTrainings.length === 0) return [];

    // Get max number of intervals across all trainings
    const maxIntervals = Math.max(...filteredTrainings.map(t => t.results?.length || 0));
    
    const data = [];
    
    for (let i = 0; i < maxIntervals; i++) {
      const intervalData = {
        interval: i + 1,
      };
      
      filteredTrainings.forEach((training, trainingIndex) => {
        const result = training.results?.[i];
        if (result) {
          const date = new Date(training.date || training.timestamp || training.createdAt);
          const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
          const trainingLabel = `${dateLabel} (${trainingIndex + 1})`;
          
          // Get metric value
          let value = null;
          if (selectedMetric === 'power') {
            value = result.power;
          } else if (selectedMetric === 'heartRate') {
            value = result.heartRate;
          } else if (selectedMetric === 'lactate') {
            value = result.lactate;
          } else if (selectedMetric === 'RPE') {
            value = result.RPE;
          }
          
          // Handle pace format (MM:SS) for running/swimming
          if (selectedMetric === 'power' && typeof value === 'string' && value.includes(':')) {
            const [min, sec] = value.split(':').map(Number);
            value = min * 60 + sec; // Convert to seconds for comparison
          }
          
          // Store original value (NOT offset) - recharts will handle the scaling
          // We'll use domain to shift the Y-axis instead
          if (value !== null && value !== undefined && typeof value === 'number') {
            intervalData[trainingLabel] = value;
          } else {
            intervalData[trainingLabel] = value;
          }
          
          // Store duration for width calculation (using same logic as getDurationInSeconds)
          let durationSeconds = 0;
          if (result.durationSeconds && result.durationSeconds > 0) {
            durationSeconds = result.durationSeconds;
          } else if (result.durationType === 'time' && typeof result.duration === 'number' && result.duration > 0) {
            durationSeconds = result.duration;
          } else if (result.duration && typeof result.duration === 'string') {
            const parts = result.duration.split(':');
            if (parts.length === 2) {
              durationSeconds = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            } else if (parts.length === 3) {
              durationSeconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
            }
          }
          intervalData[`${trainingLabel}_duration`] = durationSeconds;
        }
      });
      
      data.push(intervalData);
    }
    
    return data;
  }, [filteredTrainings, selectedMetric]);

  // Set default title if none is selected and there are titles available
  useEffect(() => {
    if (selectedTitle === 'all' && titles.length > 1) {
      // Use first non-'all' title as default
      const defaultTitle = titles[1];
      if (defaultTitle) {
        setSelectedTitle(defaultTitle);
        localStorage.setItem('trainingComparison_title', defaultTitle);
      }
    }
  }, [titles, selectedTitle]);

  // Initialize visible series when filters change
  useEffect(() => {
    const meta = {};
    const next = {};
    const savedActiveSeries = activeSeries; // Use current activeSeries state
    
    filteredTrainings.forEach((training, index) => {
      const date = new Date(training.date || training.timestamp || training.createdAt);
      const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
      const trainingLabel = `${dateLabel} (${index + 1})`;
      
      meta[trainingLabel] = {
        training,
        index,
        results: training.results || []
      };
      
      // If we have saved state, use it; otherwise default to showing latest 3
      if (savedActiveSeries[trainingLabel] !== undefined) {
        next[trainingLabel] = savedActiveSeries[trainingLabel];
      } else {
        // Show only the latest 3 series by default to keep the chart readable
        next[trainingLabel] = index >= filteredTrainings.length - 3;
      }
    });
    
    setActiveSeries(next);
    setTrainingMeta(meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTrainings]);
  
  // Save activeSeries to localStorage whenever it changes
  useEffect(() => {
    if (Object.keys(activeSeries).length > 0) {
      localStorage.setItem('trainingComparison_activeSeries', JSON.stringify(activeSeries));
    }
  }, [activeSeries]);
  
  // Save showBars to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('trainingComparison_showBars', showBars.toString());
  }, [showBars]);

  useEffect(() => {
    localStorage.setItem('trainingComparison_monthlyMetric', monthlyMetric);
  }, [monthlyMetric]);
  useEffect(() => {
    localStorage.setItem('trainingComparison_snapshotSelectedIds', JSON.stringify(snapshotSelectedIds));
  }, [snapshotSelectedIds]);

  // Calculate progress statistics
  const progressStats = useMemo(() => {
    if (filteredTrainings.length < 2) return null;

    const firstTraining = filteredTrainings[0];
    const lastTraining = filteredTrainings[filteredTrainings.length - 1];
    
    if (!firstTraining.results || !lastTraining.results) return null;

    const stats = {
      power: { first: null, last: null, change: null, trend: null },
      heartRate: { first: null, last: null, change: null, trend: null },
      lactate: { first: null, last: null, change: null, trend: null },
      RPE: { first: null, last: null, change: null, trend: null },
    };

    // Calculate average for first and last training
    ['power', 'heartRate', 'lactate', 'RPE'].forEach(metric => {
      const firstValues = firstTraining.results
        .map(r => {
          let val = r[metric];
          if (metric === 'power' && typeof val === 'string' && val.includes(':')) {
            const [min, sec] = val.split(':').map(Number);
            val = min * 60 + sec;
          }
          return val;
        })
        .filter(v => v !== null && v !== undefined && v !== 0);
      
      const lastValues = lastTraining.results
        .map(r => {
          let val = r[metric];
          if (metric === 'power' && typeof val === 'string' && val.includes(':')) {
            const [min, sec] = val.split(':').map(Number);
            val = min * 60 + sec;
          }
          return val;
        })
        .filter(v => v !== null && v !== undefined && v !== 0);

      if (firstValues.length > 0 && lastValues.length > 0) {
        const firstAvg = firstValues.reduce((a, b) => a + b, 0) / firstValues.length;
        const lastAvg = lastValues.reduce((a, b) => a + b, 0) / lastValues.length;
        
        // Determine pace vs power by sport (not by numeric threshold).
        // For bike/cycling values in "power", higher is better.
        const firstSport = (firstTraining?.sport || '').toLowerCase();
        const lastSport = (lastTraining?.sport || '').toLowerCase();
        const firstIsBike = firstSport.includes('bike') || firstSport.includes('cycle') || firstSport.includes('ride') || firstSport.includes('cycling');
        const lastIsBike = lastSport.includes('bike') || lastSport.includes('cycle') || lastSport.includes('ride') || lastSport.includes('cycling');
        const isPace = metric === 'power' && !(firstIsBike && lastIsBike);
        
        stats[metric].first = firstAvg;
        stats[metric].last = lastAvg;
        
        if (isPace) {
          // For pace: lower is better (faster), so invert the logic
          // If lastAvg > firstAvg, it's slower (worse) = negative change
          stats[metric].change = ((firstAvg - lastAvg) / firstAvg) * 100;
          stats[metric].trend = lastAvg < firstAvg ? 'up' : lastAvg > firstAvg ? 'down' : 'same';
        } else {
          // For power/HR/lactate/RPE: higher is better
          stats[metric].change = ((lastAvg - firstAvg) / firstAvg) * 100;
          stats[metric].trend = lastAvg > firstAvg ? 'up' : lastAvg < firstAvg ? 'down' : 'same';
        }
      }
    });

    return stats;
  }, [filteredTrainings]);

  // Format metric value for display
  const formatMetricValue = (value, metric) => {
    if (value === null || value === undefined) return 'N/A';
    
    if (metric === 'power') {
      // If all trainings are bike, always format as power in W
      if (areAllTrainingsBike()) {
        return `${Math.round(value)}W`;
      }
      // Check if it's pace format (seconds) - only for non-bike sports
      if (typeof value === 'number' && value > 100) {
        // Likely seconds, format as MM:SS
        const minutes = Math.floor(value / 60);
        const seconds = Math.round(value % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      } else if (typeof value === 'string' && value.includes(':')) {
        return value;
      } else {
        return `${Math.round(value)}W`;
      }
    }
    
    if (metric === 'heartRate') {
      return `${Math.round(value)} bpm`;
    }
    
    if (metric === 'lactate') {
      const num = Number(value);
      if (Number.isNaN(num)) return 'N/A';
      return `${num.toFixed(1)} mmol/L`;
    }
    
    if (metric === 'RPE') {
      return `${value}`;
    }
    
    return value;
  };

  // Axis tick formatter: keep it compact (no trailing "W" on Y axis).
  const formatMetricAxisTick = (value, metric) => {
    if (value === null || value === undefined) return '';
    if (metric === 'power') {
      // If all trainings are bike, axis should still be numeric only.
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
    if (trend === 'up') return <ArrowTrendingUpIcon className="w-5 h-5 text-green-600" />;
    if (trend === 'down') return <ArrowTrendingDownIcon className="w-5 h-5 text-red-600" />;
    return <MinusIcon className="w-5 h-5 text-gray-400" />;
  };

  const getTrendColor = (trend) => {
    if (trend === 'up') return 'text-green-600';
    if (trend === 'down') return 'text-red-600';
    return 'text-gray-600';
  };

  const isBikeSport = (sportValue) => {
    const sport = (sportValue || '').toLowerCase();
    return sport.includes('bike') || sport.includes('cycle') || sport.includes('ride') || sport.includes('cycling');
  };

  /** Run / walk / hike / swim use pace (s/km or s/100m) on the Power/Pace metric — faster = smaller number, belongs at top of Y axis */
  const isPaceSport = (sportValue) => {
    const s = (sportValue || '').toLowerCase();
    return s.includes('run') || s === 'walk' || s === 'hike' || s.includes('swim');
  };
  const getTrainingUid = (t) => String(t?._id || t?.id || t?.stravaId || t?.sourceStravaActivityId || t?.createdAt || t?.timestamp || '');
  const getTrainingDate = (t) => new Date(t?.date || t?.timestamp || t?.createdAt);
  const formatTrainingLabel = (t) => {
    const d = getTrainingDate(t);
    const dateLabel = Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const title = t?.title ? String(t.title) : 'Training';
    const intervals = Array.isArray(t?.results) ? t.results.length : 0;
    return `${dateLabel} • ${title} • ${intervals} int`;
  };

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
    if (!Number.isFinite(numeric)) return null;
    return numeric;
  };

  // Get color based on power value (gradient from low to high)
  const getPowerColor = (powerValue, minPower, maxPower) => {
    if (!powerValue || powerValue === null || powerValue === undefined) return '#9CA3AF';
    if (minPower === maxPower) return '#6366F1';
    
    // Normalize power value to 0-1 range
    const normalized = (powerValue - minPower) / (maxPower - minPower);
    
    // Color gradient: blue (low) -> green (medium) -> red (high)
    if (normalized < 0.33) {
      // Blue to green
      const ratio = normalized / 0.33;
      const r = Math.round(99 + (34 - 99) * ratio);
      const g = Math.round(102 + (197 - 102) * ratio);
      const b = Math.round(255 + (94 - 255) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else if (normalized < 0.66) {
      // Green to yellow
      const ratio = (normalized - 0.33) / 0.33;
      const r = Math.round(34 + (251 - 34) * ratio);
      const g = Math.round(197 + (191 - 197) * ratio);
      const b = Math.round(94 + (36 - 94) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to red
      const ratio = (normalized - 0.66) / 0.34;
      const r = Math.round(251 + (239 - 251) * ratio);
      const g = Math.round(191 + (68 - 191) * ratio);
      const b = Math.round(36 + (68 - 36) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Check if all trainings are bike
  const areAllTrainingsBike = () => {
    return filteredTrainings.every(t => {
      return isBikeSport(t.sport);
    });
  };

  const snapshotOptions = useMemo(() => {
    // Use current filtered set (already sorted by date asc)
    return filteredTrainings
      .map((t) => ({ id: getTrainingUid(t), training: t }))
      .filter((x) => x.id);
  }, [filteredTrainings]);

  // Auto-default selected trainings in snapshot to the latest 2 (only on first run; don't override user's empty selection)
  useEffect(() => {
    if (!snapshotOptions.length) return;
    const ids = new Set(snapshotOptions.map((o) => o.id));
    const validCurrent = snapshotSelectedIds.filter((id) => ids.has(id));
    if (validCurrent.length >= 1) {
      if (validCurrent.length !== snapshotSelectedIds.length) {
        setSnapshotSelectedIds(validCurrent);
      }
      return;
    }
    // If user already has persisted selection (even empty), don't auto-seed.
    if (hasPersistedSnapshotSelection) return;
    const defaults = snapshotOptions.slice(Math.max(0, snapshotOptions.length - 2)).map((o) => o.id);
    setSnapshotSelectedIds(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotOptions]);

  const snapshotSelectedTrainings = useMemo(() => {
    if (!snapshotOptions.length) return [];
    const byId = new Map(snapshotOptions.map((o) => [o.id, o.training]));
    return snapshotSelectedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => getTrainingDate(a) - getTrainingDate(b));
  }, [snapshotOptions, snapshotSelectedIds]);

  // Y-axis: pace increases downward (faster/smaller s at top). No bike in selection + at least one run/swim.
  const snapshotShowsPaceAxis =
    selectedMetric === 'power' &&
    snapshotSelectedTrainings.length > 0 &&
    !snapshotSelectedTrainings.some((t) => isBikeSport(t.sport)) &&
    snapshotSelectedTrainings.some((t) => isPaceSport(t.sport));

  const sameTrainingSnapshot = useMemo(() => {
    if (snapshotSelectedTrainings.length < 2) return null;

    const firstTraining = snapshotSelectedTrainings[0];
    const lastTraining = snapshotSelectedTrainings[snapshotSelectedTrainings.length - 1];
    if (!firstTraining || !lastTraining) return null;

    const firstResults = firstTraining.results || [];
    const lastResults = lastTraining.results || [];
    const maxIntervals = Math.max(firstResults.length, lastResults.length);
    const isPaceMetricForPair = snapshotShowsPaceAxis;
    const rows = [];

    for (let i = 0; i < maxIntervals; i++) {
      const firstVal = normalizeMetricValue(firstResults[i], selectedMetric);
      const lastVal = normalizeMetricValue(lastResults[i], selectedMetric);
      if (firstVal === null && lastVal === null) continue;

      let deltaPct = null;
      let trend = 'same';
      if (Number.isFinite(firstVal) && Number.isFinite(lastVal) && firstVal !== 0) {
        deltaPct = isPaceMetricForPair
          ? ((firstVal - lastVal) / firstVal) * 100
          : ((lastVal - firstVal) / firstVal) * 100;
        trend = deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'same';
      }

      rows.push({
        interval: i + 1,
        firstVal,
        lastVal,
        deltaPct,
        trend
      });
    }

    const comparedRows = rows.filter(r => r.deltaPct !== null);
    const avgProgress = comparedRows.length
      ? comparedRows.reduce((sum, r) => sum + r.deltaPct, 0) / comparedRows.length
      : null;

    return {
      firstTraining,
      lastTraining,
      rows,
      avgProgress,
      isPaceMetricForPair
    };
  }, [selectedMetric, snapshotSelectedTrainings, snapshotShowsPaceAxis]);

  const snapshotSeries = useMemo(() => {
    return snapshotSelectedTrainings.map((training, idx) => {
      const date = getTrainingDate(training);
      const dateLabel = Number.isNaN(date.getTime()) ? `Unknown ${idx + 1}` : date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
      return {
        key: `snapshot_${idx}`,
        label: dateLabel,
        training,
        color: SERIES_COLORS[idx % SERIES_COLORS.length]
      };
    });
  }, [snapshotSelectedTrainings]);

  const sameTrainingChartData = useMemo(() => {
    if (!snapshotSeries.length) return [];
    const maxIntervals = Math.max(...snapshotSeries.map((s) => s.training?.results?.length || 0));
    const rows = [];
    for (let i = 0; i < maxIntervals; i++) {
      const row = { interval: i + 1 };
      snapshotSeries.forEach((series) => {
        row[series.key] = normalizeMetricValue(series.training?.results?.[i], selectedMetric);
      });
      rows.push(row);
    }
    return rows;
  }, [snapshotSeries, selectedMetric]);

  const snapshotYDomain = useMemo(() => {
    if (!sameTrainingChartData.length || !snapshotSeries.length) return [0, 'auto'];
    const values = [];
    sameTrainingChartData.forEach((row) => {
      snapshotSeries.forEach((series) => {
        const v = row?.[series.key];
        if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
      });
    });
    if (!values.length) return [0, 'auto'];
    let minV = Math.min(...values);
    let maxV = Math.max(...values);
    if (minV === maxV) {
      const pad = Math.max(1, Math.abs(minV) * 0.1);
      return [minV - pad, maxV + pad];
    }
    const range = maxV - minV;
    const pad = range * 0.15;
    minV = minV - pad;
    maxV = maxV + pad;
    // Keep >=0 for numeric metrics (except pace seconds can be >0 anyway)
    if (selectedMetric !== 'power') {
      minV = Math.max(0, minV);
    } else if (filteredTrainings.every(t => isBikeSport(t.sport))) {
      minV = Math.max(0, minV);
    }
    return [minV, maxV];
  }, [sameTrainingChartData, snapshotSeries, selectedMetric, filteredTrainings]);

  const monthlyTrendData = useMemo(() => {
    if (!filteredTrainings.length) return [];
    const byMonth = new Map();

    filteredTrainings.forEach((training) => {
      const date = new Date(training.date || training.timestamp || training.createdAt);
      if (Number.isNaN(date.getTime())) return;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (!byMonth.has(monthKey)) {
        byMonth.set(monthKey, {
          monthKey,
          monthLabel,
          powerValues: [],
          speedValues: [],
          trainings: 0
        });
      }
      const bucket = byMonth.get(monthKey);
      bucket.trainings += 1;

      if (isBikeSport(training.sport)) {
        const values = (training.results || [])
          .map((r) => {
            const v = r?.power;
            if (typeof v === 'string' && v.includes(':')) return null;
            const n = Number(v);
            return Number.isFinite(n) && n > 0 ? n : null;
          })
          .filter((v) => v !== null);
        if (values.length) {
          bucket.powerValues.push(values.reduce((a, b) => a + b, 0) / values.length);
        }
      }

      const avgSpeedMps = Number(training.avgSpeed || 0);
      if (Number.isFinite(avgSpeedMps) && avgSpeedMps > 0) {
        const speed = unitSystem === 'imperial' ? avgSpeedMps * 2.236936 : avgSpeedMps * 3.6;
        bucket.speedValues.push(speed);
      }
    });

    return Array.from(byMonth.values())
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((item) => ({
        monthKey: item.monthKey,
        monthLabel: item.monthLabel,
        trainings: item.trainings,
        power: item.powerValues.length
          ? item.powerValues.reduce((a, b) => a + b, 0) / item.powerValues.length
          : null,
        speed: item.speedValues.length
          ? item.speedValues.reduce((a, b) => a + b, 0) / item.speedValues.length
          : null
      }));
  }, [filteredTrainings, unitSystem]);

  // Pace on Y: smaller s/km at top (reversed axis). Prefer sport; fallback if sport missing but values look like s/km.
  const paceYAxisReversed = useMemo(() => {
    if (selectedMetric !== 'power') return false;
    if (!filteredTrainings.length) return false;
    if (filteredTrainings.every((t) => isBikeSport(t.sport))) return false;
    if (filteredTrainings.some((t) => isPaceSport(t.sport))) return true;
    if (!chartData.length) return false;
    const values = [];
    chartData.forEach((row) => {
      Object.entries(row).forEach(([key, val]) => {
        if (key === 'interval' || val === null || val === undefined) return;
        if (activeSeries[key] === false) return;
        if (typeof val === 'number' && Number.isFinite(val)) values.push(val);
      });
    });
    if (!values.length) return false;
    const paceCount = values.filter((v) => v > 100).length;
    return paceCount > values.length * 0.5;
  }, [selectedMetric, filteredTrainings, chartData, activeSeries]);

  // Compute dynamic Y domain: use original values, but start from minValue - 100W
  const getYDomain = () => {
    if (!chartData.length) return [0, 'auto'];
    
    // Collect all original values (not offset)
    const allOriginalValues = [];
    filteredTrainings.forEach(training => {
      training.results?.forEach(result => {
        let value = null;
        if (selectedMetric === 'power') {
          value = result.power;
        } else if (selectedMetric === 'heartRate') {
          value = result.heartRate;
        } else if (selectedMetric === 'lactate') {
          value = result.lactate;
        } else if (selectedMetric === 'RPE') {
          value = result.RPE;
        }
        if (selectedMetric === 'power' && typeof value === 'string' && value.includes(':')) {
          const [min, sec] = value.split(':').map(Number);
          value = min * 60 + sec;
        }
        if (value !== null && value !== undefined && typeof value === 'number') {
          allOriginalValues.push(value);
        }
      });
    });
    
    if (allOriginalValues.length === 0) return [0, 'auto'];
    
    const minValue = Math.min(...allOriginalValues);
    const maxValue = Math.max(...allOriginalValues);
    
    if (maxValue === 0) return [0, 10];
    
    // Calculate range of actual values
    const range = maxValue - minValue;
    
    // Use 10% padding both above and below
    const topPadding = range * 0.1;
    const bottomPadding = range * 0.1;
    
    // Domain starts from minValue - 10% padding
    const bottomValue = Math.max(0, minValue - bottomPadding);
    
    // Round domainMax to a nice number for better alignment with ticks
    const domainMax = Math.ceil(maxValue + topPadding);
    const roundedDomainMax = Math.ceil(domainMax / 10) * 10;
    
    // Return domain starting from offset (original values, not offset)
    return [bottomValue, roundedDomainMax];
  };
  
  // Generate custom Y-axis ticks: use original values directly (domain already accounts for offset)
  const getCustomYTicks = () => {
    if (!chartData.length) return [0, 100, 200, 300, 400, 500];
    
    // Get domain (already calculated with offset)
    const yDomain = getYDomain();
    const domainMin = yDomain[0]; // This is offset (e.g., minValue - 100W)
    const domainMax = yDomain[1];
    
    // Calculate nice step size for symmetric ticks
    const range = domainMax - domainMin;
    if (range === 0) return [domainMin];
    
    const targetTicks = 10;
    let step = range / targetTicks;
    
    // Round step to a nice number (10, 20, 50, 100, etc.)
    const magnitude = Math.pow(10, Math.floor(Math.log10(step)));
    const normalized = step / magnitude;
    let niceStep;
    if (normalized <= 1) {
      niceStep = magnitude;
    } else if (normalized <= 2) {
      niceStep = 2 * magnitude;
    } else if (normalized <= 5) {
      niceStep = 5 * magnitude;
    } else {
      niceStep = 10 * magnitude;
    }
    
    // Round niceStep to nearest 10 for cleaner display
    niceStep = Math.ceil(niceStep / 10) * 10;
    if (niceStep === 0) niceStep = 10; // Ensure minimum step
    
    // Generate symmetric ticks from domainMin to domainMax
    const ticks = [];
    // Start from a rounded value at or below domainMin
    const startTick = Math.floor(domainMin / niceStep) * niceStep;
    
    // Generate ticks covering the entire range
    for (let tick = startTick; tick <= domainMax + niceStep; tick += niceStep) {
      if (tick >= domainMin && tick <= domainMax) {
        if (!ticks.includes(tick)) {
          ticks.push(tick);
        }
      }
    }
    
    // Always include domainMax as the last tick
    if (ticks.length === 0 || ticks[ticks.length - 1] < domainMax) {
      const roundedDomainMax = Math.ceil(domainMax / niceStep) * niceStep;
      if (!ticks.includes(roundedDomainMax) && roundedDomainMax <= domainMax + niceStep) {
        ticks.push(roundedDomainMax);
      } else if (!ticks.includes(domainMax)) {
        ticks.push(domainMax);
      }
    }
    
    return ticks.sort((a, b) => a - b);
  };

  const formatYAxisTick = (value) => {
    // Value passed to formatter is already the display value (with offset added back)
    // from getCustomYTicks, so we can format it directly
    return formatMetricValue(value, selectedMetric);
  };

  const toggleSeries = (label) => {
    setActiveSeries(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };
  const setAllSeriesVisible = (visible) => {
    setActiveSeries((prev) => {
      const next = { ...prev };
      Object.keys(trainingMeta).forEach((label) => {
        next[label] = visible;
      });
      return next;
    });
  };

  const formatIntervalDuration = (result) => {
    if (!result) return 'N/A';
    let seconds = 0;
    
    // If durationSeconds exists and is > 0, use it (regardless of durationType)
    if (result.durationSeconds && result.durationSeconds > 0) {
      seconds = result.durationSeconds;
    } else if (result.durationType === 'time' && typeof result.duration === 'number' && result.duration > 0) {
      // If durationType is "time" and duration is a number (seconds), use it
      seconds = result.duration;
    } else if (result.duration && typeof result.duration === 'string') {
      // Parse duration string (MM:SS or HH:MM:SS)
      const parts = result.duration.split(':');
      if (parts.length === 2) {
        seconds = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      } else if (parts.length === 3) {
        seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
      }
    }
    
    if (seconds === 0) return 'N/A';
    
    // If less than 60 seconds, show as seconds
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    
    // Otherwise show as MM:SS
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatIntervalDistance = (result) => {
    if (!result) return null;
    const dist = result.distance || result.distanceMeters;
    if (dist === undefined || dist === null) return null;
    const meters = typeof dist === 'string' ? Number(dist) : dist;
    if (Number.isNaN(meters) || meters <= 0) return null;
    if (unitSystem === 'imperial') {
      const miles = meters / 1609.344;
      if (miles >= 0.1) return `${miles.toFixed(2)} mi`;
      return `${Math.round(meters * 3.28084)} ft`;
    }
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    return `${Math.round(meters)} m`;
  };

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const intervalNumber = label;

    // Show all selected trainings in tooltip
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs min-w-[240px] max-w-[500px]">
        <div className="font-semibold text-gray-900 mb-2 text-sm">Interval {intervalNumber}</div>
        <div className="space-y-2">
          {payload.map((point, idx) => {
            const trainingLabel = point.dataKey;
            const meta = trainingMeta[trainingLabel];
            const result = meta?.results?.[intervalNumber - 1];
            // Use original value from result, not transformed display value
            let originalValue = null;
            if (result) {
              if (selectedMetric === 'power') {
                originalValue = result.power;
                // Handle pace format (MM:SS) for running/swimming
                if (typeof originalValue === 'string' && originalValue.includes(':')) {
                  const [min, sec] = originalValue.split(':').map(Number);
                  originalValue = min * 60 + sec; // Convert to seconds for comparison
                }
              } else if (selectedMetric === 'heartRate') {
                originalValue = result.heartRate;
              } else if (selectedMetric === 'lactate') {
                originalValue = result.lactate;
              } else if (selectedMetric === 'RPE') {
                originalValue = result.RPE;
              }
            }
            const sport = (meta?.training?.sport || '').toLowerCase();
            const isBike = sport.includes('bike') || sport.includes('cycle') || sport.includes('ride') || sport.includes('cycling');
            
            // Compact formatter (no units/labels) so it fits on one line
            const formatMetricCompact = (val, metric) => {
              if (val === null || val === undefined) return 'N/A';
              if (metric === 'power') {
                if (isBike) return `${Math.round(val)}`;
                // pace-like seconds => mm:ss (no unit)
                if (typeof val === 'number' && val > 100) {
                  const minutes = Math.floor(val / 60);
                  const seconds = Math.round(val % 60);
                  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                return `${Math.round(val)}`;
              }
              if (metric === 'heartRate') return `${Math.round(val)}`;
              if (metric === 'lactate') {
                const num = Number(val);
                if (Number.isNaN(num)) return 'N/A';
                return `${num.toFixed(1)}`;
              }
              if (metric === 'RPE') return `${val}`;
              return `${val}`;
            };
            
            const distanceText = stripUnits(formatIntervalDistance(result));
            const durationText = formatIntervalDuration(result);

            // Build compact one-line summary (no separators, no units/labels)
            const infoParts = [];
            infoParts.push(trainingLabel);
            if (durationText !== 'N/A') infoParts.push(durationText);
            if (distanceText) infoParts.push(distanceText);
            infoParts.push(formatMetricCompact(originalValue, selectedMetric));
            
            // Add other metrics if available
            if (result) {
              if (selectedMetric !== 'power' && result.power) {
                // For non-bike pace, keep compact mm:ss; for bike power just number
                const powerVal = result.power;
                if (typeof powerVal === 'string' && powerVal.includes(':')) {
                  infoParts.push(powerVal);
                } else {
                  infoParts.push(`${Math.round(Number(powerVal) || 0)}`);
                }
              }
              if (selectedMetric !== 'heartRate' && result.heartRate) {
                infoParts.push(`${Math.round(result.heartRate)}`);
              }
              if (selectedMetric !== 'lactate' && result.lactate !== null && result.lactate !== undefined) {
                const lact = Number(result.lactate);
                if (!Number.isNaN(lact) && lact !== 0) {
                  infoParts.push(`${lact.toFixed(1)}`);
                }
              }
              if (selectedMetric !== 'RPE' && result.RPE) {
                infoParts.push(`${result.RPE}`);
              }
            }

            return (
              <div key={idx} className="pb-1 border-b border-gray-100 last:border-b-0 last:pb-0">
                <div className="text-xs">
                  <span className="text-gray-900 whitespace-nowrap">{infoParts.join('|')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (filteredTrainings.length === 0) {
    const hasAnySaved = recentSavedTrainings.length > 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-sm p-6"
      >
        <h2 className="text-xl font-bold text-gray-900 mb-4">Training Comparison</h2>
        <p className="text-gray-600 mb-2">
          {hasAnySaved
            ? 'The comparison chart needs at least one session with saved intervals (laps or structured steps) for the selected category and title. Open a session below to add or edit intervals in the calendar.'
            : 'No trainings in this log yet. Add a manual training or sync Strava / FIT so sessions appear here.'}
        </p>
        {hasAnySaved && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent saved sessions</h3>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 max-h-[min(50vh,24rem)] overflow-y-auto">
              {recentSavedTrainings.map((t) => {
                const when = new Date(t.date || t.timestamp || t.createdAt || 0);
                const dateLabel = Number.isNaN(when.getTime())
                  ? '—'
                  : when.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                const label = t.title || t.name || 'Untitled';
                const sport = t.sport || '—';
                const hasIntervals = Array.isArray(t.results) && t.results.length > 0;
                return (
                  <li
                    key={String(t._id || t.stravaId || t.id)}
                    className="flex flex-col gap-2 py-3 px-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{label}</p>
                      <p className="text-xs text-gray-500">
                        {dateLabel}
                        {sport ? ` · ${sport}` : ''}
                        {t.category ? ` · ${t.category}` : ''}
                        {!hasIntervals ? ' · no intervals yet' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateTrainingToCalendar(t, navigate)}
                      className="shrink-0 rounded-lg border border-primary/40 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-primary hover:bg-indigo-100"
                    >
                      Open in calendar
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl shadow-sm overflow-hidden"
    >
      <div className="p-4 md:p-6">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 md:mb-6">Training Comparison</h2>
        
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  const newCategory = e.target.value;
                  setSelectedCategory(newCategory);
                  localStorage.setItem('trainingComparison_category', newCategory);
                  setSelectedTitle('all');
                  localStorage.setItem('trainingComparison_title', 'all');
                }}
                className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
            <div className="relative">
              <select
                value={selectedTitle}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  setSelectedTitle(newTitle);
                  localStorage.setItem('trainingComparison_title', newTitle);
                }}
                className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
              >
                {titles.map(title => (
                  <option key={title} value={title}>
                    {title === 'all' ? 'All Titles' : title}
                  </option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Metric</label>
            <div className="relative">
              <select
                value={selectedMetric}
                onChange={(e) => {
                  const newMetric = e.target.value;
                  setSelectedMetric(newMetric);
                  localStorage.setItem('trainingComparison_metric', newMetric);
                }}
                className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
              >
                <option value="power">Power/Pace</option>
                <option value="heartRate">Heart Rate</option>
                <option value="lactate">Lactate</option>
                <option value="RPE">RPE</option>
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Statistics */}
        {progressStats && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Progress Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['power', 'heartRate', 'lactate', 'RPE'].map(metric => {
                const stat = progressStats[metric];
                if (stat.first === null) return null;
                
                return (
                  <div key={metric} className="bg-white p-3 rounded-lg border border-gray-200">
                    <div className="text-xs font-medium text-gray-500 mb-1">
                      {(() => {
                        if (metric === 'power') {
                          // Check if all trainings are bike
                          const allBike = filteredTrainings.every(t => {
                            const sport = (t.sport || '').toLowerCase();
                            return sport.includes('bike') || sport.includes('cycle') || sport.includes('ride') || sport.includes('cycling');
                          });
                          return allBike ? 'Power' : 'Power/Pace';
                        }
                        return metric === 'heartRate' ? 'Heart Rate' : metric.charAt(0).toUpperCase() + metric.slice(1);
                      })()}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <div className="text-gray-600">First: {formatMetricValue(stat.first, metric)}</div>
                        <div className="text-gray-600">Last: {formatMetricValue(stat.last, metric)}</div>
                      </div>
                      <div className="flex flex-col items-end">
                        {getTrendIcon(stat.trend)}
                        <span className={`text-xs font-semibold mt-1 ${getTrendColor(stat.trend)}`}>
                          {stat.change > 0 ? '+' : ''}{stat.change.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {snapshotOptions.length > 0 && (
          <div className="mb-6 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-md p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
              <div>
                <h3 className="text-base md:text-lg font-semibold text-gray-900">Same-Training Snapshot</h3>
                <div className="text-xs text-gray-600">Pick multiple trainings and compare intervals visually.</div>
              </div>
              <span className="text-[11px] text-indigo-800 bg-indigo-100/80 px-2 py-1 rounded-full border border-indigo-200">
                {selectedMetric === 'power' && snapshotShowsPaceAxis
                  ? 'Pace: faster (smaller) at top'
                  : 'Higher is better'}
              </span>
            </div>
            <div className="bg-white/70 backdrop-blur-md border border-white/40 rounded-2xl p-3 mb-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                <div className="text-sm font-semibold text-gray-900">Select trainings</div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setSnapshotSelectedIds(snapshotOptions.map((o) => o.id))}
                    className="text-xs px-2 py-1 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => {
                      const latestTwo = snapshotOptions.slice(Math.max(0, snapshotOptions.length - 2)).map((o) => o.id);
                      setSnapshotSelectedIds(latestTwo);
                    }}
                    className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    Latest 2
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {snapshotSelectedTrainings.map((t) => {
                  const id = getTrainingUid(t);
                  const d = getTrainingDate(t);
                  const dateLabel = Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
                  return (
                    <button
                      key={`snap-chip-${id}`}
                      onClick={() => setSnapshotSelectedIds((prev) => prev.filter((x) => x !== id))}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-[11px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
                      title="Remove from snapshot"
                    >
                      <span className="font-semibold">{dateLabel}</span>
                      <span className="text-primary/80 truncate max-w-[180px]">{t?.title || 'Training'}</span>
                      <span className="text-primary/60">×</span>
                    </button>
                  );
                })}
                {snapshotSelectedTrainings.length === 0 && (
                  <div className="text-xs text-gray-600">No trainings selected.</div>
                )}
              </div>
              {snapshotSelectedTrainings.length < 2 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2">
                  Select at least <span className="font-semibold">2 trainings</span> to calculate progress (first → last). You can still view the chart with 1 training.
                </div>
              )}
              <div className="max-h-44 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1">
                {snapshotOptions.map((opt) => {
                  const checked = snapshotSelectedIds.includes(opt.id);
                  return (
                    <label
                      key={`snap-option-${opt.id}`}
                      className={`flex items-center justify-between gap-3 px-2 py-2 rounded-xl border transition ${
                        checked ? 'bg-primary/10 border-primary/20' : 'bg-white/60 border-white/40 hover:bg-white/80'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="relative inline-flex items-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSnapshotSelectedIds((prev) => (
                                prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id]
                              ));
                            }}
                            className="sr-only peer"
                          />
                          <span
                            className="h-4 w-4 rounded-md border border-gray-300 bg-white shadow-sm peer-focus:ring-2 peer-focus:ring-primary/40 peer-checked:bg-primary peer-checked:border-primary flex items-center justify-center transition"
                            aria-hidden="true"
                          >
                            <svg
                              className="h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.704 5.29a1 1 0 010 1.42l-7.07 7.07a1 1 0 01-1.42 0l-3.535-3.536a1 1 0 011.415-1.414l2.828 2.829 6.364-6.364a1 1 0 011.418-.005z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </span>
                        </span>
                        <span className="text-xs text-gray-800">{formatTrainingLabel(opt.training)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const training = opt.training;
                          const tid = training?._id || training?.id;
                          const stravaId = training?.stravaId || training?.sourceStravaActivityId || null;
                          if (stravaId) navigate(`/training-calendar?stravaId=${encodeURIComponent(String(stravaId))}`);
                          else if (tid) navigate(`/training-calendar?trainingId=${encodeURIComponent(String(tid))}`);
                        }}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Open
                      </button>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              <div className="bg-white/70 backdrop-blur-md border border-white/40 rounded-2xl p-3">
                <div className="text-[11px] text-gray-500">Trainings in filter</div>
                <div className="text-sm font-semibold text-gray-900">{filteredTrainings.length}</div>
              </div>
              <div className="bg-white/70 backdrop-blur-md border border-white/40 rounded-2xl p-3">
                <div className="text-[11px] text-gray-500">Compared intervals</div>
                <div className="text-sm font-semibold text-gray-900">{sameTrainingSnapshot?.rows?.length ?? 0}</div>
              </div>
              <div className="bg-white/70 backdrop-blur-md border border-white/40 rounded-2xl p-3">
                <div className="text-[11px] text-gray-500">Avg progress (first → last)</div>
                <div className={`text-sm font-semibold ${sameTrainingSnapshot?.avgProgress > 0 ? 'text-green-600' : sameTrainingSnapshot?.avgProgress < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  {sameTrainingSnapshot?.avgProgress === null || sameTrainingSnapshot?.avgProgress === undefined
                    ? 'N/A'
                    : `${sameTrainingSnapshot.avgProgress > 0 ? '+' : ''}${sameTrainingSnapshot.avgProgress.toFixed(1)}%`}
                </div>
              </div>
            </div>

            {sameTrainingChartData.length > 0 && (
              <div className="mb-3 w-full h-64 bg-white/70 backdrop-blur-md border border-white/40 rounded-2xl p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={sameTrainingChartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="interval" tick={{ fontSize: 11, fill: '#4B5563' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#4B5563' }}
                      domain={snapshotYDomain}
                      reversed={snapshotShowsPaceAxis}
                      tickFormatter={(v) => formatMetricAxisTick(v, selectedMetric)}
                      width={46}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        if (value === null || value === undefined) return 'N/A';
                        const meta = snapshotSeries.find((s) => s.key === name);
                        return [`${formatMetricValue(value, selectedMetric)}`, meta?.label || String(name)];
                      }}
                      labelFormatter={(label) => `Interval ${label}`}
                    />
                    <Legend />
                    {snapshotSeries.map((series) => (
                      <Line
                        key={series.key}
                        type="monotone"
                        dataKey={series.key}
                        name={series.label}
                        stroke={series.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {sameTrainingSnapshot && (
              <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Interval</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                        {new Date(sameTrainingSnapshot.firstTraining.date || sameTrainingSnapshot.firstTraining.timestamp || sameTrainingSnapshot.firstTraining.createdAt).toLocaleDateString('cs-CZ')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                        {new Date(sameTrainingSnapshot.lastTraining.date || sameTrainingSnapshot.lastTraining.timestamp || sameTrainingSnapshot.lastTraining.createdAt).toLocaleDateString('cs-CZ')}
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sameTrainingSnapshot.rows.map((row) => (
                      <tr key={`snapshot-row-${row.interval}`} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-3 py-2 text-xs font-medium text-gray-900">#{row.interval}</td>
                        <td className="px-3 py-2 text-xs text-gray-700">{row.firstVal === null ? '-' : formatMetricValue(row.firstVal, selectedMetric)}</td>
                        <td className="px-3 py-2 text-xs text-gray-700">{row.lastVal === null ? '-' : formatMetricValue(row.lastVal, selectedMetric)}</td>
                        <td className="px-3 py-2 text-right">
                          {row.deltaPct === null ? (
                            <span className="text-xs text-gray-400">N/A</span>
                          ) : (
                            <span className={`text-xs font-semibold ${getTrendColor(row.trend)}`}>
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
          </div>
        )}

        {monthlyTrendData.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Monthly Trend</h3>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setMonthlyMetric('power')}
                  className={`px-3 py-1 text-xs ${monthlyMetric === 'power' ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  Power
                </button>
                <button
                  onClick={() => setMonthlyMetric('speed')}
                  className={`px-3 py-1 text-xs ${monthlyMetric === 'speed' ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  Speed
                </button>
              </div>
            </div>

            {monthlyTrendData.some((d) => d[monthlyMetric] !== null) ? (
              <div className="w-full h-64 bg-white border border-gray-200 rounded-xl p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyTrendData} margin={{ top: 10, right: 15, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#4B5563' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#4B5563' }}
                      label={{
                        value: monthlyMetric === 'power'
                          ? 'Power (W)'
                          : `Speed (${unitSystem === 'imperial' ? 'mph' : 'km/h'})`,
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#4B5563',
                        fontSize: 10
                      }}
                    />
                    <Tooltip
                      formatter={(value) => {
                        if (value === null || value === undefined) return 'N/A';
                        return monthlyMetric === 'power'
                          ? `${Math.round(value)} W`
                          : `${Number(value).toFixed(1)} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}`;
                      }}
                      labelFormatter={(label, payload) => {
                        const count = payload?.[0]?.payload?.trainings || 0;
                        return `${label} (${count} trainings)`;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey={monthlyMetric}
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#2563eb', stroke: '#fff', strokeWidth: 1.5 }}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-4">
                No monthly {monthlyMetric} data in current filter.
              </div>
            )}
          </div>
        )}

        {/* Training List */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-900">
                Trainings ({filteredTrainings.length})
              </h3>
              <button
                onClick={() => setAllSeriesVisible(true)}
                className="text-xs px-2 py-1 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
              >
                Show all
              </button>
              <button
                onClick={() => setAllSeriesVisible(false)}
                className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Hide all
              </button>
            </div>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              Tick trainings you want to compare
            </span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filteredTrainings.map((training, index) => {
              const date = new Date(training.date || training.timestamp || training.createdAt);
              const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
              const trainingLabel = `${dateLabel} (${index + 1})`;
              const color = SERIES_COLORS[index % SERIES_COLORS.length];
              const isOn = activeSeries[trainingLabel] !== false;
              const handleOpenInAnalysis = () => {
                // Log the entire training object to console
                console.log('Training clicked:', JSON.stringify(training, null, 2));
                console.log('Training object:', training);
                
                // IMPORTANT: use client-side navigation so we don't hard-reload and get redirected to '/'
                // on hosts that don't serve SPA routes directly.
                const tid = training?._id || training?.id;
                const stravaId = training?.stravaId || training?.sourceStravaActivityId || null;
                if (stravaId) {
                  navigate(`/training-calendar?stravaId=${encodeURIComponent(String(stravaId))}`);
                  return;
                }
                if (tid) {
                  // trainingId here is Training model id (FitAnalysisPage will resolve to source FIT/Strava if present)
                  navigate(`/training-calendar?trainingId=${encodeURIComponent(String(tid))}`);
                  return;
                }
                console.warn('Missing training id, cannot open fit-analysis', training);
              };
              return (
                <div
                  key={training._id || index}
                  className={`flex items-center justify-between p-3 rounded-lg border transition ${
                    isOn ? 'bg-gray-50 border-gray-200' : 'bg-gray-100 border-dashed border-gray-300 opacity-70'
                  }`}
                  onClick={handleOpenInAnalysis}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenInAnalysis();
                    }
                  }}
                >
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {training.title}
                    </div>
                    <div className="text-sm text-gray-600">
                      {dateLabel} • {training.sport} • {training.category || 'No category'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      {training.results?.length || 0} intervals
                    </span>
                    <label
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded-full"
                    >
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggleSeries(trainingLabel)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span>{isOn ? 'Shown' : 'Hidden'}</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Comparison Chart */}
        {chartData.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Interval Comparison - {(() => {
                if (selectedMetric === 'power') {
                  // Check if all trainings are bike
                  const allBike = filteredTrainings.every(t => {
                    const sport = (t.sport || '').toLowerCase();
                    return sport.includes('bike') || sport.includes('cycle') || sport.includes('ride') || sport.includes('cycling');
                  });
                  return allBike ? 'Power' : 'Power/Pace';
                }
                return selectedMetric === 'heartRate' ? 'Heart Rate' : selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1);
              })()}
            </h3>
            <div className="w-full h-[400px] md:h-96 bg-gray-50 border border-gray-200 rounded-xl p-1 md:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  data={chartData}
                  margin={{ top: 20, right: 5, left: 5, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="interval" 
                    tick={{ fontSize: 10, fill: '#4B5563' }}
                    label={{ value: 'Interval', position: 'insideBottom', offset: -5, fill: '#4B5563', fontSize: 10 }}
                    padding={{ left: 5, right: 5 }}
                  />
                  <YAxis 
                    domain={getYDomain()}
                    ticks={getCustomYTicks()}
                    tickFormatter={formatYAxisTick}
                    tick={{ fontSize: 10, fill: '#4B5563' }}
                    allowDecimals={false}
                    reversed={paceYAxisReversed}
                    interval={0}
                    width={40}
                    label={{
                      value: (() => {
                        if (selectedMetric === 'power') {
                          // If all trainings are bike, always show Power (W)
                          if (areAllTrainingsBike()) {
                            return 'Power (W)';
                          }
                          // Otherwise check if it's pace or power
                          return paceYAxisReversed
                            ? (unitSystem === 'imperial' ? 'Pace (s/mile)' : 'Pace (s/km)')
                            : 'Power (W) / Pace (s)';
                        }
                        return selectedMetric === 'heartRate'
                          ? 'Heart Rate (bpm)'
                          : selectedMetric === 'lactate'
                            ? 'Lactate (mmol/L)'
                            : 'RPE';
                      })(),
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#4B5563',
                      fontSize: 9,
                      dy: 15
                    }}
                  />
                  <Tooltip 
                    formatter={(value) => {
                      if (value === null || value === undefined) return 'N/A';
                      return formatMetricValue(value, selectedMetric);
                    }}
                    content={renderTooltip}
                    contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB' }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={50}
                    formatter={(value) => <span className="text-xs md:text-sm text-gray-700">{value}</span>}
                    onClick={(e) => toggleSeries(e.value)}
                    content={({ payload }) => (
                      <div className="flex items-center justify-center gap-2 md:gap-4 flex-wrap px-2">
                        {payload?.map((entry, index) => (
                          <span
                            key={index}
                            onClick={() => toggleSeries(entry.value)}
                            className="inline-flex items-center gap-1 cursor-pointer text-xs md:text-sm"
                            style={{ color: entry.color }}
                          >
                            <span
                              className="inline-block w-2 h-2 md:w-3 md:h-3 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            {entry.value}
                          </span>
                        ))}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowBars(!showBars);
                          }}
                          className="ml-2 md:ml-4 px-2 py-1 md:px-3 md:py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors"
                        >
                          {showBars ? 'Hide Bars' : 'Show Bars'}
                        </button>
                      </div>
                    )}
                  />
                  {/* Custom bars with width based on duration and color based on power */}
                  {showBars && (
                  <Customized
                    component={(props) => {
                      const { xAxisMap, yAxisMap, height } = props;
                      if (!xAxisMap || !yAxisMap || !chartData.length) return null;
                      
                      const xAxis = xAxisMap['0'];
                      const yAxis = yAxisMap['0'];
                      if (!xAxis || !yAxis) return null;
                      
                      // Get the actual chart area dimensions (excluding margins)
                      // yAxis.y is the top of the chart area, yAxis.height is the height of the chart area
                      const chartTop = yAxis.y || 0;
                      const chartHeight = yAxis.height || height;
                      const chartBottom = chartTop + chartHeight;
                      
                      // Get the X-axis position (where domainMin is displayed)
                      // For normal axis: domainMin is at bottom (chartBottom)
                      // For reversed axis: domainMin is at top (chartTop), but X-axis is still at bottom!
                      // In recharts, X-axis is ALWAYS at the bottom of the chart, regardless of Y-axis reversal
                      const yDomain = getYDomain();
                      const domainMin = yDomain[0];
                      const isReversed = paceYAxisReversed;
                      let xAxisY = chartBottom; // X-axis is always at bottom
                      if (yAxis.scale && typeof yAxis.scale === 'function') {
                        // For normal axis: domainMin is at bottom, so X-axis is at domainMin position
                        // For reversed axis: domainMin is at top, but X-axis is still at bottom (where domainMax would be)
                        // Actually, for reversed axis, we need to find where the "zero" or "base" value is
                        // Since X-axis is always at bottom, we use chartBottom
                        if (!isReversed) {
                          xAxisY = yAxis.scale(domainMin);
                        } else {
                          // For reversed axis, X-axis is at bottom, which corresponds to domainMax position
                          xAxisY = chartBottom;
                        }
                      }
                      
                      // Helper function to get duration in seconds
                      const getDurationInSeconds = (result) => {
                        if (!result) return 0;
                        if (result.durationSeconds && result.durationSeconds > 0) {
                          return result.durationSeconds;
                        }
                        if (result.durationType === 'time' && typeof result.duration === 'number' && result.duration > 0) {
                          return result.duration;
                        }
                        if (result.duration && typeof result.duration === 'string') {
                          const parts = result.duration.split(':');
                          if (parts.length === 2) {
                            return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                          } else if (parts.length === 3) {
                            return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
                          }
                        }
                        return 0;
                      };
                      
                      // Calculate max duration and power across all trainings
                      const allDurations = chartData.flatMap(dp => 
                        filteredTrainings.map(t => {
                          const r = t.results?.[dp.interval - 1];
                          return getDurationInSeconds(r);
                        })
                      ).filter(d => d > 0);
                      
                      const allPowerValues = chartData.flatMap(dp => 
                        filteredTrainings.map(t => {
                          const r = t.results?.[dp.interval - 1];
                          if (!r) return null;
                          let power = r.power;
                          if (typeof power === 'string' && power.includes(':')) {
                            const [min, sec] = power.split(':').map(Number);
                            power = min * 60 + sec;
                          }
                          return power !== null && power !== undefined && typeof power === 'number' ? power : null;
                        })
                      ).filter(p => p !== null && !isNaN(p));
                      
                      const maxDuration = allDurations.length > 0 ? Math.max(...allDurations) : 300;
                      const minDuration = 30;
                      const minPower = allPowerValues.length > 0 ? Math.min(...allPowerValues) : 0;
                      const maxPower = allPowerValues.length > 0 ? Math.max(...allPowerValues) : 500;
                      
                      const bars = [];
                      
                      // Group bars by interval to handle overlapping
                      chartData.forEach((dataPoint, intervalIndex) => {
                        // Get all active trainings for this interval
                        const activeTrainingsForInterval = filteredTrainings
                          .map((training, trainingIndex) => {
                            const date = new Date(training.date || training.timestamp || training.createdAt);
                            const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
                            const trainingLabel = `${dateLabel} (${trainingIndex + 1})`;
                            if (activeSeries[trainingLabel] === false) return null;
                            
                            const result = training.results?.[intervalIndex];
                            if (!result) return null;
                            
                            const durationSeconds = getDurationInSeconds(result);
                            if (durationSeconds === 0) return null;
                            
                            // Get metric value (same logic as in chartData)
                            let value = null;
                            if (selectedMetric === 'power') {
                              value = result.power;
                              if (typeof value === 'string' && value.includes(':')) {
                                const [min, sec] = value.split(':').map(Number);
                                value = min * 60 + sec;
                              }
                            } else if (selectedMetric === 'heartRate') {
                              value = result.heartRate;
                            } else if (selectedMetric === 'lactate') {
                              value = result.lactate;
                            } else if (selectedMetric === 'RPE') {
                              value = result.RPE;
                            }
                            
                            if (value === null || value === undefined) return null;
                            
                            // Use original value (NOT offset) - domain already accounts for offset
                            // This ensures bars align with the Line chart points
                            return { training, trainingIndex, result, value, durationSeconds, trainingLabel };
                          })
                          .filter(item => item !== null);
                        
                        if (activeTrainingsForInterval.length === 0) return;
                        
                        // Sort bars by value (highest first - will be rendered first = in background)
                        activeTrainingsForInterval.sort((a, b) => b.value - a.value);
                        
                        // Calculate X position (center of interval)
                        const xPos = xAxis.scale(dataPoint.interval);
                        if (xPos === undefined || xPos === null) return;
                        
                        // All bars are centered on the same X position (overlapping)
                        activeTrainingsForInterval.forEach((item, barIndex) => {
                          const { training, trainingIndex, result, value, durationSeconds } = item;
                          
                          // Calculate bar width based on duration - make bars wider for better visibility
                          const normalizedDuration = Math.max(minDuration, durationSeconds);
                          const widthRatio = normalizedDuration / Math.max(maxDuration, minDuration);
                          const barWidth = Math.max(8, widthRatio * 50); // Min 8px, max 50px width (wider bars)
                          
                          // All bars centered on same X position (overlapping)
                          const barX = xPos - barWidth / 2;
                          
                          // Calculate Y position using normal linear scale
                          // Value is original (NOT offset) - domain already accounts for offset
                          // Use yAxis.scale if available (this is what recharts uses internally)
                          let yValuePos;
                          if (yAxis.scale && typeof yAxis.scale === 'function') {
                            // Use the scale function directly (this matches recharts' calculation)
                            // Value is original, domain starts from offset
                            yValuePos = yAxis.scale(value);
                          } else {
                            // Fallback: manual calculation using chart area dimensions
                            const yDomain = getYDomain();
                            const [yMin, yMax] = yDomain;
                            const yRange = yMax - yMin;
                            if (yRange === 0) {
                              yValuePos = xAxisY;
                            } else {
                              const normalizedValue = (value - yMin) / yRange;
                              
                              // In recharts, Y=0 is at top, Y=height is at bottom
                              // So: y = chartTop + (1 - normalized) * chartHeight for normal axis
                              // Or: y = chartTop + normalized * chartHeight for reversed axis
                              const isReversed = paceYAxisReversed;
                              if (isReversed) {
                                yValuePos = chartTop + normalizedValue * chartHeight;
                              } else {
                                yValuePos = chartTop + (1 - normalizedValue) * chartHeight;
                              }
                            }
                          }
                          
                          // Bar should start from X-axis (which is ALWAYS at bottom) and go up to the value
                          // In SVG, Y=0 is at top, so larger Y values are at bottom
                          // X-axis is ALWAYS at the bottom of the chart, regardless of Y-axis reversal
                          // Get X-axis position for bars (always at bottom = chartBottom)
                          const barXAxisY = chartBottom; // X-axis is always at bottom
                          
                          // Calculate bar position and height
                          // Bar should ALWAYS start at X-axis (barXAxisY at bottom) and extend to value (yValuePos)
                          // In SVG, rect y is the top-left corner, so we need to use the smaller Y value
                          // For normal axis: barXAxisY is at bottom (larger Y in SVG), yValuePos is above it (smaller Y in SVG)
                          //   -> barY = yValuePos (smaller), barHeight = barXAxisY - yValuePos
                          // For reversed axis: barXAxisY is at bottom (larger Y in SVG), yValuePos is above it (smaller Y in SVG)
                          //   -> barY = yValuePos (smaller), barHeight = barXAxisY - yValuePos
                          // In both cases, bar starts at the smaller Y (top = value position) and extends to the larger Y (bottom = X-axis)
                          const barY = Math.min(barXAxisY, yValuePos); // Top of bar (smaller Y in SVG = value position)
                          const barHeight = Math.max(4, Math.abs(barXAxisY - yValuePos)); // Height from value to X-axis
                          
                          // Get power value for color
                          let powerValue = result.power;
                          if (typeof powerValue === 'string' && powerValue.includes(':')) {
                            const [min, sec] = powerValue.split(':').map(Number);
                            powerValue = min * 60 + sec;
                          }
                          
                          // Get color based on power
                          const barColor = powerValue !== null && powerValue !== undefined && typeof powerValue === 'number'
                            ? getPowerColor(powerValue, minPower, maxPower)
                            : SERIES_COLORS[trainingIndex % SERIES_COLORS.length];
                          
                          // Calculate stroke color (darker for better visibility)
                          const strokeColor = barColor;
                          
                          // Lower opacity for all bars
                          const opacity = 0.4 + (barIndex / activeTrainingsForInterval.length) * 0.15; // 0.4 to 0.55
                          
                          bars.push(
                            <rect
                              key={`bar-${training._id || trainingIndex}-${intervalIndex}`}
                              x={barX}
                              y={barY}
                              width={barWidth}
                              height={barHeight}
                              fill={barColor}
                              stroke={strokeColor}
                              strokeWidth={2.5}
                              rx={4}
                              ry={4}
                              opacity={opacity}
                              style={{ pointerEvents: 'all' }}
                            />
                          );
                        });
                      });
                      
                      return <g>{bars}</g>;
                    }}
                  />
                  )}
                  {/* Render lines for metric values */}
                  {filteredTrainings.map((training, index) => {
                    const date = new Date(training.date || training.timestamp || training.createdAt);
                    const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
                    const trainingLabel = `${dateLabel} (${index + 1})`;
                    const color = SERIES_COLORS[index % SERIES_COLORS.length];
                    if (activeSeries[trainingLabel] === false) return null;
                    
                    return (
                      <Line
                        key={training._id || index}
                        type="monotone"
                        dataKey={trainingLabel}
                        stroke={color}
                        strokeWidth={1.5}
                        dot={{ r: 3, fill: color, strokeWidth: 1.5, stroke: '#fff' }}
                        connectNulls={false}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Values Table - Compare same intervals across trainings */}
        {filteredTrainings.length > 0 && (() => {
          // Get visible trainings sorted by date (newest first - left to right)
          const visibleTrainings = filteredTrainings
            .map((training, trainingIndex) => {
              const date = new Date(training.date || training.timestamp || training.createdAt);
              const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
              const trainingLabel = `${dateLabel} (${trainingIndex + 1})`;
              const isVisible = activeSeries[trainingLabel] !== false;
              return { training, trainingIndex, date, dateLabel, trainingLabel, isVisible, color: SERIES_COLORS[trainingIndex % SERIES_COLORS.length] };
            })
            .filter(item => item.isVisible)
            .sort((a, b) => b.date - a.date); // Sort from newest to oldest (newest on left)
          
          if (visibleTrainings.length === 0) return null;
          
          // Get max number of intervals across all visible trainings
          const maxIntervals = Math.max(...visibleTrainings.map(item => item.training.results?.length || 0));
          
          
          return (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Interval Comparison - Progress Tracking</h3>
              <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-center font-semibold text-gray-900 sticky left-0 bg-gray-50 z-10">Interval</th>
                      {visibleTrainings.map((item, idx) => (
                        <th key={item.training._id || idx} className="px-4 py-3 text-center font-semibold text-gray-900 min-w-[120px]">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs">{item.dateLabel}</span>
                            <span className="text-xs text-gray-500">{item.training.title || `Training ${idx + 1}`}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxIntervals }, (_, intervalIndex) => {
                      const intervalNumber = intervalIndex + 1;
                      const intervalValues = visibleTrainings.map(item => {
                        const result = item.training.results?.[intervalIndex];
                        if (!result) return null;
                        
                        // Get metric value (original, not transformed)
                        let metricValue = null;
                        if (selectedMetric === 'power') {
                          metricValue = result.power;
                          // Handle null/undefined/0
                          if (metricValue === null || metricValue === undefined) {
                            metricValue = null;
                          } else if (typeof metricValue === 'string' && metricValue.includes(':')) {
                            const [min, sec] = metricValue.split(':').map(Number);
                            metricValue = min * 60 + sec;
                          } else if (typeof metricValue === 'number' && metricValue === 0) {
                            // 0 is a valid value, keep it
                            metricValue = 0;
                          }
                        } else if (selectedMetric === 'heartRate') {
                          metricValue = result.heartRate;
                          if (metricValue === null || metricValue === undefined) {
                            metricValue = null;
                          }
                        } else if (selectedMetric === 'lactate') {
                          const lact = Number(result.lactate);
                          if (Number.isNaN(lact) || lact === 0) {
                            metricValue = null;
                          } else {
                            metricValue = lact;
                          }
                        } else if (selectedMetric === 'RPE') {
                          metricValue = result.RPE;
                          if (metricValue === null || metricValue === undefined) {
                            metricValue = null;
                          }
                        }
                        
                        const sport = (item.training.sport || '').toLowerCase();
                        const isBike = sport.includes('bike') || sport.includes('cycle') || sport.includes('ride') || sport.includes('cycling');
                        
                        // Format metric value for display
                        const formatMetricForTable = (val) => {
                          if (val === null || val === undefined) return 'N/A';
                          if (selectedMetric === 'power' && isBike) {
                            return `${Math.round(val)} W`;
                          }
                          return formatMetricValue(val, selectedMetric);
                        };
                        
                        return {
                          result,
                          metricValue,
                          isBike,
                          formatMetricForTable,
                          trainingLabel: item.trainingLabel,
                          color: item.color
                        };
                      });
                      
                      // Check if at least one training has this interval
                      const hasData = intervalValues.some(v => v !== null);
                      if (!hasData) return null;
                      
                      // Calculate progress (difference from oldest to newest)
                      // visibleTrainings is sorted newest first (left to right), so first is newest, last is oldest
                      const newestValue = intervalValues.find(v => v && v.metricValue !== null && v.metricValue !== undefined)?.metricValue; // First (newest on left)
                      const oldestValue = intervalValues.filter(v => v && v.metricValue !== null && v.metricValue !== undefined).pop()?.metricValue; // Last (oldest on right)
                      let progress = null;
                      if (oldestValue !== null && oldestValue !== undefined && newestValue !== null && newestValue !== undefined && typeof oldestValue === 'number' && typeof newestValue === 'number') {
                        const sport = visibleTrainings[0]?.training?.sport || '';
                        const isBike = sport.toLowerCase().includes('bike') || sport.toLowerCase().includes('cycle') || sport.toLowerCase().includes('ride') || sport.toLowerCase().includes('cycling');
                        if (selectedMetric === 'power' && !isBike) {
                          // For pace: lower is better
                          progress = ((oldestValue - newestValue) / oldestValue) * 100;
                        } else {
                          // For power/HR/lactate/RPE: higher is better
                          progress = ((newestValue - oldestValue) / oldestValue) * 100;
                        }
                      }
                      
                      return (
                        <tr 
                          key={`interval-${intervalNumber}`}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-center font-semibold text-gray-900 sticky left-0 bg-white z-10">
                            <div className="flex flex-col items-center">
                              <span>Interval {intervalNumber}</span>
                              {progress !== null && (
                                <span className={`text-xs mt-1 ${progress > 0 ? 'text-green-600' : progress < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                  {progress > 0 ? '+' : ''}{progress.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </td>
                          {visibleTrainings.map((item, idx) => {
                            const intervalData = intervalValues[idx];
                            if (!intervalData) {
                              return (
                                <td key={item.training._id || idx} className="px-4 py-3 text-center text-gray-400">
                                  -
                                </td>
                              );
                            }
                            
                            const { result, metricValue, formatMetricForTable } = intervalData;
                            const compact = [];
                            const durationText = formatIntervalDuration(result);
                            const distanceText = stripUnits(formatIntervalDistance(result));
                            compact.push(formatMetricForTable(metricValue).replace(/[a-zA-Z/]+/g, '').trim());
                            if (durationText !== 'N/A') compact.push(durationText);
                            if (distanceText) compact.push(distanceText);
                            if (result?.heartRate) compact.push(`${Math.round(result.heartRate)}`);
                            if (result?.lactate !== null && result?.lactate !== undefined) {
                              const lact = Number(result.lactate);
                              if (!Number.isNaN(lact) && lact !== 0) {
                                compact.push(`${lact.toFixed(1)}`);
                              }
                            }
                            
                            return (
                              <td key={item.training._id || idx} className="px-4 py-3 text-center">
                                <div className="text-xs text-gray-900 whitespace-nowrap">
                                  {compact.filter(Boolean).join('|')}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }).filter(Boolean)}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
    </motion.div>
  );
};

export default TrainingComparison;


