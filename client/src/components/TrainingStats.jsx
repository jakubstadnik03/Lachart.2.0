import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { format, parseISO, subMonths } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const TrainingStats = ({ trainings, athleteId }) => {
  const [timeRange, setTimeRange] = useState('month'); // 'week', 'month', 'year'
  const [selectedSport, setSelectedSport] = useState('all');
  const [statsIndex, setStatsIndex] = useState(0);
  const [progressIndex, setProgressIndex] = useState(0);

  // Filter trainings based on time range and sport
  const filteredTrainings = useMemo(() => {
    if (!trainings || trainings.length === 0) return [];
    
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
      case 'week':
        startDate = subMonths(now, 1);
        break;
      case 'month':
        startDate = subMonths(now, 3);
        break;
      case 'year':
        startDate = subMonths(now, 12);
        break;
      default:
        startDate = subMonths(now, 3);
    }
    
    return trainings
      .filter(training => {
        const trainingDate = new Date(training.date);
        return (
          trainingDate >= startDate && 
          (selectedSport === 'all' || training.sport === selectedSport)
        );
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [trainings, timeRange, selectedSport]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!filteredTrainings || filteredTrainings.length === 0) {
      return {
        totalTrainings: 0,
        totalDuration: 0,
        avgPower: 0,
        avgHeartRate: 0,
        avgLactate: 0,
        sportDistribution: [],
        powerTrend: [],
        heartRateTrend: [],
        lactateTrend: []
      };
    }

    // Calculate basic stats
    const totalTrainings = filteredTrainings.length;
    const totalDuration = filteredTrainings.reduce((sum, training) => {
      return sum + (training.results?.reduce((total, result) => total + (result.duration || 0), 0) || 0);
    }, 0);
    
    // Calculate averages
    let totalPower = 0, totalHeartRate = 0, totalLactate = 0, powerCount = 0, hrCount = 0, lactateCount = 0;
    
    filteredTrainings.forEach(training => {
      training.results?.forEach(result => {
        if (result.power) {
          totalPower += Number(result.power);
          powerCount++;
        }
        if (result.heartRate) {
          totalHeartRate += Number(result.heartRate);
          hrCount++;
        }
        if (result.lactate) {
          totalLactate += Number(result.lactate);
          lactateCount++;
        }
      });
    });
    
    const avgPower = powerCount > 0 ? totalPower / powerCount : 0;
    const avgHeartRate = hrCount > 0 ? totalHeartRate / hrCount : 0;
    const avgLactate = lactateCount > 0 ? totalLactate / lactateCount : 0;
    
    // Calculate sport distribution
    const sportCounts = {};
    filteredTrainings.forEach(training => {
      sportCounts[training.sport] = (sportCounts[training.sport] || 0) + 1;
    });
    
    const sportDistribution = Object.entries(sportCounts).map(([name, value]) => ({
      name,
      value
    }));
    
    // Calculate trends
    const powerTrend = [];
    const heartRateTrend = [];
    const lactateTrend = [];
    
    // Group by date for trends
    const groupedByDate = {};
    
    filteredTrainings.forEach(training => {
      const date = format(parseISO(training.date), 'yyyy-MM-dd');
      if (!groupedByDate[date]) {
        groupedByDate[date] = {
          power: { sum: 0, count: 0 },
          heartRate: { sum: 0, count: 0 },
          lactate: { sum: 0, count: 0 }
        };
      }
      
      training.results?.forEach(result => {
        if (result.power) {
          groupedByDate[date].power.sum += Number(result.power);
          groupedByDate[date].power.count++;
        }
        if (result.heartRate) {
          groupedByDate[date].heartRate.sum += Number(result.heartRate);
          groupedByDate[date].heartRate.count++;
        }
        if (result.lactate) {
          groupedByDate[date].lactate.sum += Number(result.lactate);
          groupedByDate[date].lactate.count++;
        }
      });
    });
    
    // Convert grouped data to arrays for charts
    Object.entries(groupedByDate).forEach(([date, data]) => {
      powerTrend.push({
        date,
        value: data.power.count > 0 ? data.power.sum / data.power.count : 0
      });
      
      heartRateTrend.push({
        date,
        value: data.heartRate.count > 0 ? data.heartRate.sum / data.heartRate.count : 0
      });
      
      lactateTrend.push({
        date,
        value: data.lactate.count > 0 ? data.lactate.sum / data.lactate.count : 0
      });
    });
    
    // Sort trends by date
    powerTrend.sort((a, b) => new Date(a.date) - new Date(b.date));
    heartRateTrend.sort((a, b) => new Date(a.date) - new Date(b.date));
    lactateTrend.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return {
      totalTrainings,
      totalDuration,
      avgPower,
      avgHeartRate,
      avgLactate,
      sportDistribution,
      powerTrend,
      heartRateTrend,
      lactateTrend
    };
  }, [filteredTrainings]);

  // Navigation for stats
  const canNavigateStatsLeft = statsIndex > 0;
  const canNavigateStatsRight = statsIndex < 2;
  
  const handleStatsNavigateLeft = () => {
    if (canNavigateStatsLeft) {
      setStatsIndex(statsIndex - 1);
    }
  };
  
  const handleStatsNavigateRight = () => {
    if (canNavigateStatsRight) {
      setStatsIndex(statsIndex + 1);
    }
  };

  // Navigation for progress
  const visibleTrainings = filteredTrainings.slice(progressIndex, progressIndex + 2);
  const canNavigateProgressLeft = progressIndex > 0;
  const canNavigateProgressRight = progressIndex + 2 < filteredTrainings.length;
  
  const handleProgressNavigateLeft = () => {
    if (canNavigateProgressLeft) {
      setProgressIndex(progressIndex - 1);
    }
  };
  
  const handleProgressNavigateRight = () => {
    if (canNavigateProgressRight) {
      setProgressIndex(progressIndex + 1);
    }
  };

  // Format duration from seconds to HH:MM:SS
  const formatDuration = (seconds) => {
    if (!seconds) return '00:00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format date for display
  const formatDate = (dateString) => {
    return format(parseISO(dateString), 'dd.MM.yyyy');
  };

  // Render stats section based on index
  const renderStatsSection = () => {
    switch (statsIndex) {
      case 0:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="Total Trainings" 
              value={stats.totalTrainings} 
              icon="🏃‍♂️"
            />
            <StatCard 
              title="Total Duration" 
              value={formatDuration(stats.totalDuration)} 
              icon="⏱️"
            />
            <StatCard 
              title="Avg Power" 
              value={stats.avgPower.toFixed(1)} 
              icon="⚡"
              unit={selectedSport === 'bike' ? 'W' : 'min/km'}
            />
            <StatCard 
              title="Avg Heart Rate" 
              value={stats.avgHeartRate.toFixed(0)} 
              icon="❤️"
              unit="bpm"
            />
          </div>
        );
      case 1:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Sport Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.sportDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {stats.sportDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Power Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.powerTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => format(parseISO(date), 'dd.MM')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(date) => format(parseISO(date), 'dd.MM.yyyy')}
                      formatter={(value) => [value.toFixed(1), 'Power']}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#8884d8" 
                      name="Power"
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Heart Rate Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.heartRateTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => format(parseISO(date), 'dd.MM')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(date) => format(parseISO(date), 'dd.MM.yyyy')}
                      formatter={(value) => [value.toFixed(0), 'Heart Rate']}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#82ca9d" 
                      name="Heart Rate"
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Lactate Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.lactateTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => format(parseISO(date), 'dd.MM')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(date) => format(parseISO(date), 'dd.MM.yyyy')}
                      formatter={(value) => [value.toFixed(1), 'Lactate']}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#ffc658" 
                      name="Lactate"
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Training Statistics</h2>
        
        <div className="flex flex-wrap gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="week">Last Week</option>
            <option value="month">Last 3 Months</option>
            <option value="year">Last Year</option>
          </select>
          
          <select
            value={selectedSport}
            onChange={(e) => setSelectedSport(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Sports</option>
            <option value="run">Running</option>
            <option value="bike">Cycling</option>
            <option value="swim">Swimming</option>
          </select>
        </div>
      </div>
      
      {/* Stats Navigation */}
      <div className="mb-6 flex justify-between items-center">
        <h3 className="text-xl font-semibold text-gray-700">
          {statsIndex === 0 ? 'Overview' : statsIndex === 1 ? 'Distribution & Power' : 'Heart Rate & Lactate'}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleStatsNavigateLeft}
            disabled={!canNavigateStatsLeft}
            className={`p-2 rounded-full ${
              canNavigateStatsLeft ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300'
            }`}
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <button
            onClick={handleStatsNavigateRight}
            disabled={!canNavigateStatsRight}
            className={`p-2 rounded-full ${
              canNavigateStatsRight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300'
            }`}
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Stats Content */}
      <div className="mb-8">
        {renderStatsSection()}
      </div>
      
      {/* Training Progress */}
      <div className="mb-6 flex justify-between items-center">
        <h3 className="text-xl font-semibold text-gray-700">Training Progress</h3>
        <div className="flex gap-2">
          <button
            onClick={handleProgressNavigateLeft}
            disabled={!canNavigateProgressLeft}
            className={`p-2 rounded-full ${
              canNavigateProgressLeft ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300'
            }`}
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <button
            onClick={handleProgressNavigateRight}
            disabled={!canNavigateProgressRight}
            className={`p-2 rounded-full ${
              canNavigateProgressRight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300'
            }`}
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Training Progress Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visibleTrainings.map((training, index) => (
          <TrainingComparison 
            key={training._id} 
            training={training} 
            formatDate={formatDate}
          />
        ))}
      </div>
      
      {visibleTrainings.length === 0 && (
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <p className="text-gray-500">No training data available for the selected filters.</p>
        </div>
      )}
    </motion.div>
  );
};

// Stat Card Component
const StatCard = ({ title, value, icon, unit }) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className="bg-white p-4 rounded-lg shadow"
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-800">
          {value}{unit ? ` ${unit}` : ''}
        </p>
      </div>
      <div className="text-3xl">{icon}</div>
    </div>
  </motion.div>
);

// Training Comparison Component
const TrainingComparison = ({ training, formatDate }) => {
  const [hoveredBar, setHoveredBar] = useState(null);
  
  // Calculate max values for scaling
  const maxPower = Math.max(...training.results.map(r => r.power || 0));
  const maxHeartRate = Math.max(...training.results.map(r => r.heartRate || 0));
  const maxLactate = Math.max(...training.results.map(r => r.lactate || 0));
  
  // Helper function to parse duration (handles string "5:00" or number)
  const parseDuration = (duration) => {
    if (!duration && duration !== 0) return 0;
    if (typeof duration === 'number') return duration;
    if (typeof duration === 'string') {
      if (duration.includes(':')) {
        const [minutes, seconds] = duration.split(':').map(Number);
        return (minutes || 0) * 60 + (seconds || 0);
      }
      return parseFloat(duration) || 0;
    }
    return 0;
  };
  
  // Check if results have distance data (for distance-based intervals)
  const hasDistanceData = training.results && training.results.some(r => r.distance && r.distance > 0);
  
  // Calculate total duration or distance
  const totalDuration = training.results ? training.results.reduce((sum, result) => {
    return sum + parseDuration(result.duration);
  }, 0) : 0;
  
  const totalDistance = training.results ? training.results.reduce((sum, result) => {
    return sum + (parseFloat(result.distance) || 0);
  }, 0) : 0;
  
  // Use distance if available, otherwise use duration
  const useDistance = hasDistanceData && totalDistance > 0;
  const totalValue = useDistance ? totalDistance : totalDuration;
  
  // Calculate cumulative positions and widths for each bar
  const barPositions = useMemo(() => {
    if (!training.results || training.results.length === 0) return [];
    
    let cumulativePosition = 0;
    const positions = training.results.map((result, index) => {
      const durationValue = parseDuration(result.duration);
      const distanceValue = parseFloat(result.distance) || 0;
      
      const value = useDistance ? distanceValue : durationValue;
      const widthPercent = totalValue > 0 ? (value / totalValue) * 100 : (100 / training.results.length);
      const leftPercent = cumulativePosition;
      cumulativePosition += widthPercent;
      
      return {
        index,
        leftPercent,
        widthPercent,
        value,
        durationValue,
        distanceValue
      };
    });
    
    return positions;
  }, [training.results, useDistance, totalValue]);
  
  // Debug: Log all bar positions and widths (always log when component renders)
 
  
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-white p-4 rounded-lg shadow"
    >
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="font-semibold text-gray-800">{training.title || 'Untitled Training'}</h4>
          <p className="text-sm text-gray-500">{formatDate(training.date)}</p>
        </div>
        <div className="text-sm text-gray-500">
          {training.sport.charAt(0).toUpperCase() + training.sport.slice(1)}
        </div>
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Intervals</span>
          <span>{training.results.length}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Duration</span>
          <span>{formatDuration(totalDuration)}</span>
        </div>
      </div>
      
      <div className="relative h-40 mb-4">
        {barPositions.map((barPos) => {
          const result = training.results[barPos.index];
          return (
            <VerticalBar
              key={barPos.index}
              result={result}
              index={barPos.index}
              maxPower={maxPower}
              maxHeartRate={maxHeartRate}
              maxLactate={maxLactate}
              width={barPos.widthPercent}
              left={barPos.leftPercent}
              isHovered={hoveredBar === barPos.index}
              onHover={() => setHoveredBar(barPos.index)}
              onLeave={() => setHoveredBar(null)}
            />
          );
        })}
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <p className="font-semibold">Power</p>
          <p className="text-gray-500">{training.sport === 'bike' ? 'W' : 'min/km'}</p>
        </div>
        <div>
          <p className="font-semibold">Heart Rate</p>
          <p className="text-gray-500">bpm</p>
        </div>
        <div>
          <p className="font-semibold">Lactate</p>
          <p className="text-gray-500">mmol/L</p>
        </div>
      </div>
    </motion.div>
  );
};

// Helper function to format distance - show in meters if less than 1 km
const formatDistance = (distanceKm) => {
  if (!distanceKm && distanceKm !== 0) return '-';
  const distance = parseFloat(distanceKm);
  if (isNaN(distance)) return '-';
  if (distance < 1) {
    // Convert to meters and round
    const meters = Math.round(distance * 1000);
    return `${meters} m`;
  }
  return `${distance.toFixed(2)} km`;
};

// Vertical Bar Component
const VerticalBar = ({ 
  result, 
  index, 
  maxPower, 
  maxHeartRate, 
  maxLactate, 
  width, 
  left,
  isHovered, 
  onHover, 
  onLeave
}) => {
  // Calculate heights based on max values
  const powerHeight = maxPower > 0 ? (result.power / maxPower) * 100 : 0;
  const heartRateHeight = maxHeartRate > 0 ? (result.heartRate / maxHeartRate) * 100 : 0;
  const lactateHeight = maxLactate > 0 ? (result.lactate / maxLactate) * 100 : 0;
  
  // Debug: Log width and left for this bar
  
  // Use actual width, but ensure minimum 0.1% for visibility
  const actualWidth = Math.max(0.1, width);
  
  return (
    <div 
      className="absolute bottom-0"
      style={{ 
        left: `${left}%`, 
        width: `${actualWidth}%`,
        height: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        boxSizing: 'border-box'
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div 
        className="w-full flex flex-col items-center"
        style={{ height: '100%' }}
      >
        <div 
          className="w-full bg-purple-500 opacity-70 transition-all duration-300"
          style={{ 
            height: `${powerHeight}%`,
            transform: isHovered ? 'scaleX(1.2)' : 'scaleX(1)',
            zIndex: isHovered ? 10 : 1
          }}
        />
        <div 
          className="w-full bg-red-500 opacity-70 transition-all duration-300"
          style={{ 
            height: `${heartRateHeight}%`,
            transform: isHovered ? 'scaleX(1.2)' : 'scaleX(1)',
            zIndex: isHovered ? 10 : 1
          }}
        />
        <div 
          className="w-full bg-yellow-500 opacity-70 transition-all duration-300"
          style={{ 
            height: `${lactateHeight}%`,
            transform: isHovered ? 'scaleX(1.2)' : 'scaleX(1)',
            zIndex: isHovered ? 10 : 1
          }}
        />
        
        {isHovered && (
          <div 
            className="absolute bottom-full mb-2 p-2 bg-white rounded shadow-lg text-xs z-20"
            style={{ minWidth: '120px' }}
          >
            <p><span className="font-semibold">Interval:</span> {index + 1}</p>
            <p><span className="font-semibold">Power:</span> {result.power || '-'}</p>
            <p><span className="font-semibold">HR:</span> {result.heartRate || '-'}</p>
            <p><span className="font-semibold">Lactate:</span> {result.lactate || '-'}</p>
            <p><span className="font-semibold">Duration:</span> {formatDuration(result.duration)}</p>
            {result.distance && (
              <p><span className="font-semibold">Distance:</span> {formatDistance(result.distance)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function for formatting duration
const formatDuration = (seconds) => {
  if (!seconds) return '00:00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default TrainingStats;