import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { getFormFitnessData } from '../../services/api';
import TrainingGlossary from './TrainingGlossary';

const FormFitnessChart = ({ athleteId }) => {
  const [showGlossary, setShowGlossary] = useState(false);
  
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
        
        const response = await getFormFitnessData(athleteId, days, sportFilter);
        if (response && response.data) {
          setChartData(response.data);
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

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Form & Fitness</h3>
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
            <option value="30 days">Past 30 days</option>
            <option value="60 days">Past 60 days</option>
            <option value="90 days">Past 90 days</option>
            <option value="180 days">Past 6 months</option>
            <option value="365 days">Past year</option>
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
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              tick={{ fontSize: 12, fill: '#6b7280' }}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6b7280' }}
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
        initialTerm="Form & Fitness"
      />
    </div>
  );
};

export default FormFitnessChart;

