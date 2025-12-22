import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, MinusIcon } from '@heroicons/react/24/outline';

const TrainingComparison = ({ trainings }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTitle, setSelectedTitle] = useState('all');
  const [selectedMetric, setSelectedMetric] = useState('power'); // power, heartRate, lactate, RPE

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
        }
      });
      
      data.push(intervalData);
    }
    
    return data;
  }, [filteredTrainings, selectedMetric]);

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
        
        stats[metric].first = firstAvg;
        stats[metric].last = lastAvg;
        stats[metric].change = ((lastAvg - firstAvg) / firstAvg) * 100;
        stats[metric].trend = lastAvg > firstAvg ? 'up' : lastAvg < firstAvg ? 'down' : 'same';
      }
    });

    return stats;
  }, [filteredTrainings]);

  // Format metric value for display
  const formatMetricValue = (value, metric) => {
    if (value === null || value === undefined) return 'N/A';
    
    if (metric === 'power') {
      // Check if it's pace format (seconds)
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
                      {metric === 'power' ? 'Power/Pace' : metric === 'heartRate' ? 'Heart Rate' : metric.charAt(0).toUpperCase() + metric.slice(1)}
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
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Trainings ({filteredTrainings.length})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filteredTrainings.map((training, index) => {
              const date = new Date(training.date || training.timestamp || training.createdAt);
              return (
                <div
                  key={training._id || index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{training.title}</div>
                    <div className="text-sm text-gray-600">
                      {date.toLocaleDateString('cs-CZ', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })} • {training.sport} • {training.category || 'No category'}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {training.results?.length || 0} intervals
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
              Interval Comparison - {selectedMetric === 'power' ? 'Power/Pace' : selectedMetric === 'heartRate' ? 'Heart Rate' : selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)}
            </h3>
            <div className="w-full h-64 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="interval" 
                    label={{ value: 'Interval', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    label={{ 
                      value: selectedMetric === 'power' ? 'Power (W) / Pace (s)' : 
                             selectedMetric === 'heartRate' ? 'Heart Rate (bpm)' : 
                             selectedMetric === 'lactate' ? 'Lactate (mmol/L)' : 'RPE',
                      angle: -90,
                      position: 'insideLeft'
                    }}
                  />
                  <Tooltip 
                    formatter={(value) => {
                      if (value === null || value === undefined) return 'N/A';
                      return formatMetricValue(value, selectedMetric);
                    }}
                  />
                  <Legend />
                  {filteredTrainings.map((training, index) => {
                    const date = new Date(training.date || training.timestamp || training.createdAt);
                    const dateLabel = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
                    const trainingLabel = `${dateLabel} (${index + 1})`;
                    const colors = ['#767EB5', '#599FD0', '#7BC2EB', '#4BA87D', '#E05347'];
                    const color = colors[index % colors.length];
                    
                    return (
                      <Line
                        key={training._id || index}
                        type="monotone"
                        dataKey={trainingLabel}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        connectNulls={false}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default TrainingComparison;

