import React, { useState, useEffect } from 'react';
import { Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend } from 'recharts';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { getWeeklyTrainingLoad } from '../../services/api';
import TrainingGlossary from './TrainingGlossary';

const WeeklyTrainingLoad = ({ athleteId }) => {
  const [showGlossary, setShowGlossary] = useState(false);
  
  // Load time range from localStorage or default to '3 months'
  const getStoredTimeRange = () => {
    try {
      const stored = localStorage.getItem('weeklyTrainingLoadTimeRange');
      if (stored && ['3 months', '6 months', '12 months'].includes(stored)) {
        return stored;
      }
    } catch (error) {
      console.error('Error reading from localStorage:', error);
    }
    return '3 months';
  };

  // Load sport filter from localStorage or default to 'all'
  const getStoredSportFilter = () => {
    try {
      const stored = localStorage.getItem('weeklyTrainingLoadSportFilter');
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

  // Save time range to localStorage when it changes
  const handleTimeRangeChange = (newTimeRange) => {
    setTimeRange(newTimeRange);
    try {
      localStorage.setItem('weeklyTrainingLoadTimeRange', newTimeRange);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  // Save sport filter to localStorage when it changes
  const handleSportFilterChange = (newSportFilter) => {
    setSportFilter(newSportFilter);
    try {
      localStorage.setItem('weeklyTrainingLoadSportFilter', newSportFilter);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!athleteId) return;
      try {
        setLoading(true);
        const months = timeRange === '3 months' ? 3 : timeRange === '6 months' ? 6 : 12;
        const response = await getWeeklyTrainingLoad(athleteId, months, sportFilter);
        if (response && response.data) {
          // Backend returns { data: [...] }, so we need to extract the data array
          const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
          setChartData(data);
        } else {
          setChartData([]);
        }
      } catch (error) {
        console.error('Error loading weekly training load:', error);
        setChartData([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [athleteId, timeRange, sportFilter]);

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Weekly Training Load</h3>
        <div className="flex items-center gap-2">
          <select
            value={sportFilter}
            onChange={(e) => handleSportFilterChange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 text-gray-600 bg-white"
          >
            <option value="all">All Sports</option>
            <option value="bike">Bike</option>
            <option value="run">Run</option>
            <option value="swim">Swim</option>
          </select>
          <select
            value={timeRange}
            onChange={(e) => handleTimeRangeChange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1 text-gray-600 bg-white"
          >
            <option value="3 months">Past 3 months</option>
            <option value="6 months">Past 6 months</option>
            <option value="12 months">Past 12 months</option>
          </select>
          <button
            onClick={() => setShowGlossary(true)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Show explanation"
          >
            <InformationCircleIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 sm:h-80 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="weekLabel" 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              label={{ value: 'TSS', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px'
              }}
              formatter={(value, name) => {
                if (name === 'Training Load' || name === 'Optimal Load') {
                  return [`${value} TSS`, name];
                }
                return [value, name];
              }}
            />
            <Bar 
              dataKey="trainingLoad" 
              fill="#ef4444" 
              name="Training Load"
              radius={[4, 4, 0, 0]}
            />
            <Line 
              type="monotone" 
              dataKey="optimalLoad" 
              stroke="#22c55e" 
              strokeWidth={2}
              name="Optimal Load"
              dot={false}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Glossary Modal */}
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm="Training Load"
      />
    </div>
  );
};

export default WeeklyTrainingLoad;

