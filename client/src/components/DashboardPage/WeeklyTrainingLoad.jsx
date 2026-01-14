import React, { useState, useEffect } from 'react';
import { Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend } from 'recharts';
import { InformationCircleIcon, ChevronDownIcon, EllipsisHorizontalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getWeeklyTrainingLoad } from '../../services/api';
import TrainingGlossary from './TrainingGlossary';

const WeeklyTrainingLoad = ({ athleteId }) => {
  const [showGlossary, setShowGlossary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
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

      const months =
        timeRange === '3 months' ? 3 :
        timeRange === '6 months' ? 6 :
        12;

      // Per-athlete/time-range/sport cache shared across pages
      const cacheKey = `weeklyTrainingLoad_${athleteId}_${months}_${sportFilter}`;
      const tsKey = `${cacheKey}_ts`;
      const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

      let usedCache = false;

      // 1) Try to paint from cache immediately
      try {
        const cached = localStorage.getItem(cacheKey);
        const ts = localStorage.getItem(tsKey);
        if (cached && ts) {
          const age = Date.now() - parseInt(ts, 10);
          if (!Number.isNaN(age) && age < CACHE_TTL) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setChartData(parsed);
              setLoading(false);
              usedCache = true;
            }
          }
        }
      } catch (e) {
        console.warn('Error reading weekly training load cache:', e);
      }

      try {
        if (!usedCache) {
          setLoading(true);
        }
        const response = await getWeeklyTrainingLoad(athleteId, months, sportFilter);
        if (response && response.data) {
          const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
          setChartData(data);

          // 2) Save to cache so other renders/pages are instant
          try {
            const payload = JSON.stringify(data);
            if (payload.length < 100000) {
              localStorage.setItem(cacheKey, payload);
              localStorage.setItem(tsKey, Date.now().toString());
            }
          } catch (e) {
            console.warn('Error saving weekly training load cache:', e);
          }
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
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900 min-w-0 truncate">Weekly Training Load</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Open settings"
            title="Settings"
          >
            <EllipsisHorizontalIcon className="w-6 h-6 text-gray-500" />
          </button>
          <button
            onClick={() => setShowGlossary(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Show explanation"
            title="Glossary"
          >
            <InformationCircleIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-[9999] bg-black/40 flex items-end sm:items-center justify-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
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
                    <option value="3 months">Past 3 months</option>
                    <option value="6 months">Past 6 months</option>
                    <option value="12 months">Past 12 months</option>
                  </select>
                  <ChevronDownIcon className="w-4 h-4 text-gray-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowGlossary(true);
                    setShowSettings(false);
                  }}
                  className="h-10 px-4 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition-colors w-full"
                >
                  Open glossary
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="h-10 px-4 text-sm bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors w-full"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

