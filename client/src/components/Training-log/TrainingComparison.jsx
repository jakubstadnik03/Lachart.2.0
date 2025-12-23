import React, { useEffect, useMemo, useState } from 'react';
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

const TrainingComparison = ({ trainings }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTitle, setSelectedTitle] = useState('all');
  const [selectedMetric, setSelectedMetric] = useState('power'); // power, heartRate, lactate, RPE
  const [activeSeries, setActiveSeries] = useState({});
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
          
          intervalData[trainingLabel] = value;
          
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

  // Initialize visible series when filters change
  useEffect(() => {
    const next = {};
    const meta = {};
    filteredTrainings.forEach((training, index) => {
      const date = new Date(training.date || training.timestamp || training.createdAt);
      const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
      const trainingLabel = `${dateLabel} (${index + 1})`;
      // Show only the latest 3 series by default to keep the chart readable
      const isVisible = index >= filteredTrainings.length - 3;
      next[trainingLabel] = isVisible;
      meta[trainingLabel] = {
        training,
        index,
        results: training.results || []
      };
    });
    setActiveSeries(next);
    setTrainingMeta(meta);
  }, [filteredTrainings]);

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
        
        // Check if this is pace (values > 100 are likely seconds/pace)
        const isPace = metric === 'power' && (firstAvg > 100 || lastAvg > 100);
        
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
      return `${value.toFixed(1)} mmol/L`;
    }
    
    if (metric === 'RPE') {
      return `${value}`;
    }
    
    return value;
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

  const colors = ['#6366F1', '#22C55E', '#F97316', '#06B6D4', '#EF4444', '#A855F7', '#0EA5E9'];

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
      const sport = (t.sport || '').toLowerCase();
      return sport.includes('bike') || sport.includes('cycle') || sport.includes('ride') || sport.includes('cycling');
    });
  };

  // Check if we're displaying pace (values > 100 are likely seconds/pace)
  // But NOT if all trainings are bike (bike always uses power in W)
  const isPaceMetric = () => {
    if (selectedMetric !== 'power') return false;
    // If all trainings are bike, it's always power, not pace
    if (areAllTrainingsBike()) return false;
    if (!chartData.length) return false;
    const values = [];
    chartData.forEach(row => {
      Object.entries(row).forEach(([key, val]) => {
        if (key === 'interval' || val === null || val === undefined) return;
        if (!activeSeries[key]) return;
        if (typeof val === 'number' && !Number.isNaN(val)) values.push(val);
      });
    });
    if (!values.length) return false;
    // If most values are > 100, it's likely pace (in seconds)
    const paceCount = values.filter(v => v > 100).length;
    return paceCount > values.length * 0.5;
  };

  // Compute dynamic Y domain starting from 0 with large gap and more space between values
  const getYDomain = () => {
    if (!chartData.length) return [0, 'auto'];
    const values = [];
    chartData.forEach(row => {
      Object.entries(row).forEach(([key, val]) => {
        if (key === 'interval' || val === null || val === undefined) return;
        if (!activeSeries[key]) return;
        if (typeof val === 'number' && !Number.isNaN(val)) values.push(val);
      });
    });
    if (!values.length) return [0, 'auto'];
    
    // Always start from 0
    const max = Math.max(...values);
    const minValue = Math.min(...values);
    
    if (max === 0) return [0, 10];
    
    // Calculate range of actual values
    const range = max - minValue;
    
    // Always start from 0
    // Create asymmetric spacing: large gap from 0, then more space around values
    let topPadding;
    if (range < max * 0.1) {
      // Very small range (e.g., 370-380W) - use 60% padding to create much more space
      topPadding = max * 0.6;
    } else if (range < max * 0.3) {
      // Small range - use 55% padding
      topPadding = max * 0.55;
    } else {
      // Normal range - use 50% padding
      topPadding = max * 0.5;
    }
    
    // If minValue is close to 0, add a small gap to create visual separation
    // If minValue is far from 0, there's naturally a large gap (asymmetric)
    let bottomValue = 0;
    if (minValue > 0 && minValue < max * 0.2) {
      // If minValue is close to 0, start slightly below 0 to create gap
      bottomValue = Math.min(0, minValue - (max * 0.05));
    }
    
    return [bottomValue, Math.ceil(max + topPadding)];
  };

  const formatYAxisTick = (value) => formatMetricValue(value, selectedMetric);

  const toggleSeries = (label) => {
    setActiveSeries(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
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
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    return `${Math.round(meters)} m`;
  };

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const intervalNumber = label;
    
    // Show all selected trainings in tooltip
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md p-2 text-xs min-w-[240px] max-w-[400px]">
        <div className="font-semibold text-gray-900 mb-1.5 text-sm">Interval {intervalNumber}</div>
        <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
          {payload.map((point, idx) => {
            const trainingLabel = point.dataKey;
            const meta = trainingMeta[trainingLabel];
            const result = meta?.results?.[intervalNumber - 1];
            const value = point.value;
            const sport = (meta?.training?.sport || '').toLowerCase();
            const isBike = sport.includes('bike') || sport.includes('cycle') || sport.includes('ride') || sport.includes('cycling');
            
            // Format metric label - for bike, show "Power" in W, otherwise show metric name
            const metricLabel =
              selectedMetric === 'power'
                ? (isBike ? 'Power' : 'Power/Pace')
                : selectedMetric === 'heartRate'
                  ? 'Heart Rate'
                  : selectedMetric === 'lactate'
                    ? 'Lactate'
                    : 'RPE';
            
            // Format metric value - for bike power, show in W
            const formatMetricForTooltip = (val, metric) => {
              if (val === null || val === undefined) return 'N/A';
              if (metric === 'power' && isBike) {
                // For bike, always show as power in W
                return `${Math.round(val)} W`;
              }
              return formatMetricValue(val, metric);
            };
            
            const distanceText = formatIntervalDistance(result);
            const durationText = formatIntervalDuration(result);
            const color = point.color || '#6366F1';

            // Build all info on one line
            const infoParts = [];
            infoParts.push(trainingLabel);
            if (durationText !== 'N/A') {
              infoParts.push(`Dur: ${durationText}`);
            }
            if (distanceText) {
              infoParts.push(`Dist: ${distanceText}`);
            }
            infoParts.push(`${metricLabel}: ${formatMetricForTooltip(value, selectedMetric)}`);
            
            // Add other metrics if available
            if (result) {
              if (selectedMetric !== 'power' && result.power) {
                infoParts.push(`Power: ${isBike ? `${Math.round(result.power)}W` : formatMetricValue(result.power, 'power')}`);
              }
              if (selectedMetric !== 'heartRate' && result.heartRate) {
                infoParts.push(`HR: ${Math.round(result.heartRate)}`);
              }
              if (selectedMetric !== 'lactate' && result.lactate) {
                infoParts.push(`Lac: ${result.lactate.toFixed(1)}`);
              }
              if (selectedMetric !== 'RPE' && result.RPE) {
                infoParts.push(`RPE: ${result.RPE}`);
              }
            }

            return (
              <div key={idx} className="pb-1 border-b border-gray-100 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-gray-900">{infoParts.join(' • ')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (filteredTrainings.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-sm p-6"
      >
        <h2 className="text-xl font-bold text-gray-900 mb-4">Training Comparison</h2>
        <p className="text-gray-500">No trainings found with intervals for the selected filters.</p>
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
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedTitle('all');
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
            <select
              value={selectedTitle}
              onChange={(e) => setSelectedTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {titles.map(title => (
                <option key={title} value={title}>
                  {title === 'all' ? 'All Titles' : title}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Metric</label>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="power">Power/Pace</option>
              <option value="heartRate">Heart Rate</option>
              <option value="lactate">Lactate</option>
              <option value="RPE">RPE</option>
            </select>
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

        {/* Training List */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Trainings ({filteredTrainings.length})
            </h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              Tap legend badges to hide/show a series
            </span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filteredTrainings.map((training, index) => {
              const date = new Date(training.date || training.timestamp || training.createdAt);
              const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
              const trainingLabel = `${dateLabel} (${index + 1})`;
              const color = colors[index % colors.length];
              const isOn = activeSeries[trainingLabel] !== false;
              const handleOpenInAnalysis = () => {
                // Log the entire training object to console
                console.log('Training clicked:', JSON.stringify(training, null, 2));
                console.log('Training object:', training);
                
                const tid = training?._id || training?.id;
                if (tid) {
                  window.location.href = `/fit-analysis?trainingId=${encodeURIComponent(tid)}`;
                } else {
                  console.warn('Missing training id, cannot open fit-analysis', training);
                }
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleSeries(trainingLabel);
                      }}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        isOn
                          ? 'bg-white text-gray-800 border-gray-200 hover:border-gray-300'
                          : 'bg-gray-200 text-gray-600 border-gray-300'
                      }`}
                    >
                      {isOn ? 'Hide' : 'Show'}
                    </button>
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
            <div className="w-full h-72 md:h-96 bg-gray-50 border border-gray-200 rounded-xl p-3 md:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  data={chartData}
                  margin={{ top: 40, right: 40, left: 40, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="interval" 
                    tick={{ fontSize: 12, fill: '#4B5563' }}
                    label={{ value: 'Interval', position: 'insideBottom', offset: -5, fill: '#4B5563', fontSize: 12 }}
                    padding={{ left: 30, right: 30 }}
                  />
                  <YAxis 
                    domain={getYDomain()}
                    tickFormatter={formatYAxisTick}
                    tick={{ fontSize: 12, fill: '#4B5563' }}
                    allowDecimals={true}
                    reversed={isPaceMetric()}
                    interval={0} // Invert Y-axis for pace (faster pace = lower seconds = top)
                    label={{
                      value: (() => {
                        if (selectedMetric === 'power') {
                          // If all trainings are bike, always show Power (W)
                          if (areAllTrainingsBike()) {
                            return 'Power (W)';
                          }
                          // Otherwise check if it's pace or power
                          return isPaceMetric() ? 'Pace (s)' : 'Power (W) / Pace (s)';
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
                      fontSize: 12,
                      dy: 40
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
                    height={36}
                    formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
                    onClick={(e) => toggleSeries(e.value)}
                  />
                  {/* Custom bars with width based on duration and color based on power */}
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
                            
                            // Get metric value
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
                          
                          // Calculate Y position using the same scale as recharts (yAxis.scale)
                          // This ensures bars align with the dots/points on the line
                          const yDomain = getYDomain();
                          const [yMin, yMax] = yDomain;
                          
                          // Use yAxis.scale if available (this is what recharts uses internally)
                          let yValuePos, yZeroPos;
                          if (yAxis.scale && typeof yAxis.scale === 'function') {
                            // Use the scale function directly (this matches recharts' calculation)
                            yValuePos = yAxis.scale(value);
                            yZeroPos = yAxis.scale(0);
                          } else {
                            // Fallback: manual calculation using chart area dimensions
                            const yRange = yMax - yMin;
                            if (yRange === 0) {
                              yValuePos = chartBottom;
                              yZeroPos = chartBottom;
                            } else {
                              const normalizedValue = (value - yMin) / yRange;
                              const normalizedZero = (0 - yMin) / yRange;
                              
                              // In recharts, Y=0 is at top, Y=height is at bottom
                              // So: y = chartTop + (1 - normalized) * chartHeight for normal axis
                              // Or: y = chartTop + normalized * chartHeight for reversed axis
                              const isReversed = isPaceMetric();
                              if (isReversed) {
                                yValuePos = chartTop + normalizedValue * chartHeight;
                                yZeroPos = chartTop + normalizedZero * chartHeight;
                              } else {
                                yValuePos = chartTop + (1 - normalizedValue) * chartHeight;
                                yZeroPos = chartTop + (1 - normalizedZero) * chartHeight;
                              }
                            }
                          }
                          
                          // Bar should start from bottom (X axis) and go up to the value
                          // Bottom is where 0 is (or chartBottom if 0 is not in domain)
                          const yBottom = yZeroPos;
                          // Top is where the value is
                          const yTop = yValuePos;
                          // Bar height from 0 (bottom) to value (top)
                          const barHeight = Math.max(4, Math.abs(yBottom - yTop));
                          
                          // Get power value for color
                          let powerValue = result.power;
                          if (typeof powerValue === 'string' && powerValue.includes(':')) {
                            const [min, sec] = powerValue.split(':').map(Number);
                            powerValue = min * 60 + sec;
                          }
                          
                          // Get color based on power
                          const barColor = powerValue !== null && powerValue !== undefined && typeof powerValue === 'number'
                            ? getPowerColor(powerValue, minPower, maxPower)
                            : colors[trainingIndex % colors.length];
                          
                          // Calculate stroke color (darker for better visibility)
                          const strokeColor = barColor;
                          
                          // Lower opacity for all bars
                          const opacity = 0.4 + (barIndex / activeTrainingsForInterval.length) * 0.15; // 0.4 to 0.55
                          
                          bars.push(
                            <rect
                              key={`bar-${training._id || trainingIndex}-${intervalIndex}`}
                              x={barX}
                              y={yTop}
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
                  {/* Render lines for metric values */}
                  {filteredTrainings.map((training, index) => {
                    const date = new Date(training.date || training.timestamp || training.createdAt);
                    const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
                    const trainingLabel = `${dateLabel} (${index + 1})`;
                    const color = colors[index % colors.length];
                    if (activeSeries[trainingLabel] === false) return null;
                    
                    return (
                      <Line
                        key={training._id || index}
                        type="monotone"
                        dataKey={trainingLabel}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 5, fill: color, strokeWidth: 2, stroke: '#fff' }}
                        connectNulls={false}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default TrainingComparison;

