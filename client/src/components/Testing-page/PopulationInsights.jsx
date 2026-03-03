import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import api from '../../services/api';

const PopulationInsights = ({ athleteProfile, selectedSport = 'bike' }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedGender, setSelectedGender] = useState('male');
  const [selectedMetric, setSelectedMetric] = useState('lt1');

  useEffect(() => {
    const loadStats = async () => {
      if (!athleteProfile) return;
      
      setLoading(true);
      try {
        const response = await api.get('/test/population-stats', {
          params: {
            gender: selectedGender,
            sport: selectedSport === 'bike' ? 'bike' : selectedSport === 'run' ? 'run' : null
          }
        });
        setStats(response.data);
      } catch (error) {
        console.error('Failed to load population stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [athleteProfile, selectedGender, selectedSport]);

  // Reset metric when sport changes (W/kg only for bike)
  useEffect(() => {
    if (selectedSport === 'run' && (selectedMetric === 'lt1Wkg' || selectedMetric === 'lt2Wkg')) {
      setSelectedMetric('lt1');
    }
  }, [selectedSport, selectedMetric]);

  if (loading) {
    return (
      <div className="text-center py-4 text-gray-500">
        Loading population statistics...
      </div>
    );
  }

  if (!stats || !stats[selectedSport]) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-center py-4 text-gray-500 text-sm">
          Population statistics not available yet.
        </div>
      </div>
    );
  }

  const sportStats = stats[selectedSport];
  const metricMap = {
    'lt1': 'lt1',
    'lt2': 'lt2',
    'ratio': 'lt1Lt2Ratio',
    'lt1Wkg': 'lt1Wkg',
    'lt2Wkg': 'lt2Wkg'
  };
  const currentMetric = sportStats[metricMap[selectedMetric] || 'lt1'];
  
  if (!currentMetric || currentMetric.count === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        Not enough data available for {selectedGender} {selectedSport} athletes.
      </div>
    );
  }

  // Get current user's value
  const getCurrentValue = () => {
    if (!athleteProfile?.powerZones) return null;
    
    const zones = athleteProfile.powerZones[selectedSport === 'bike' ? 'cycling' : 'running'];
    if (!zones?.lt1 || !zones?.lt2) return null;
    
    if (selectedMetric === 'lt1') {
      return zones.lt1;
    } else if (selectedMetric === 'lt2') {
      return zones.lt2;
    } else if (selectedMetric === 'ratio') {
      return (zones.lt1 / zones.lt2) * 100;
    } else if (selectedMetric === 'lt1Wkg' && selectedSport === 'bike' && athleteProfile.weight) {
      return zones.lt1 / athleteProfile.weight;
    } else if (selectedMetric === 'lt2Wkg' && selectedSport === 'bike' && athleteProfile.weight) {
      return zones.lt2 / athleteProfile.weight;
    }
    return null;
  };

  const currentValue = getCurrentValue();
  
  // Calculate percentile
  const calculatePercentile = (value, stats) => {
    if (value === null || value === undefined || !stats || !stats.distribution || stats.count === 0) return null;
    
    // Calculate how many values are below current value using normal distribution
    // Z-score
    const z = (value - stats.mean) / stats.sd;
    
    // Cumulative distribution function approximation (erf approximation)
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    
    let percentile = z > 0 ? (1 - p) * 100 : p * 100;
    return Math.max(0, Math.min(100, percentile));
  };

  const percentile = currentValue ? calculatePercentile(currentValue, currentMetric) : null;

  // Format metric name
  const getMetricName = () => {
    if (selectedMetric === 'lt1') return selectedSport === 'bike' ? 'LT1 (W)' : 'LT1 (pace)';
    if (selectedMetric === 'lt2') return selectedSport === 'bike' ? 'LT2 (W)' : 'LT2 (pace)';
    if (selectedMetric === 'lt1Wkg') return 'LT1 (W/kg)';
    if (selectedMetric === 'lt2Wkg') return 'LT2 (W/kg)';
    return 'LT1/LT2 Ratio (%)';
  };

  // Format current value
  const formatCurrentValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (selectedMetric === 'ratio') {
      return `${value.toFixed(1)}%`;
    }
    if (selectedMetric === 'lt1Wkg' || selectedMetric === 'lt2Wkg') {
      return `${value.toFixed(2)} W/kg`;
    }
    if (selectedSport === 'run' && selectedMetric !== 'ratio') {
      // Format pace (value is in seconds per km)
      const mins = Math.floor(value / 60);
      const secs = Math.round(value % 60);
      return `${mins}:${String(secs).padStart(2, '0')} /km`;
    }
    // For bike, value is in watts
    return `${Math.round(value)}W`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Population Comparison</h3>
        
        {/* Gender selector */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setSelectedGender('male')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              selectedGender === 'male'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Male
          </button>
          <button
            onClick={() => setSelectedGender('female')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              selectedGender === 'female'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Female
          </button>
        </div>

        {/* Metric selector */}
        <div className="mb-3">
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1 w-full"
          >
            <option value="lt1">LT1</option>
            <option value="lt2">LT2</option>
            {selectedSport === 'bike' && (
              <>
                <option value="lt1Wkg">LT1 (W/kg)</option>
                <option value="lt2Wkg">LT2 (W/kg)</option>
              </>
            )}
            <option value="ratio">LT1/LT2 Ratio</option>
          </select>
        </div>
      </div>

      {/* Statistics */}
      <div className="mb-4 space-y-1 text-xs text-gray-700">
        <div><span className="font-semibold">Count:</span> {currentMetric.count}</div>
        {currentValue && (
          <div className="text-primary font-semibold">
            <span className="font-semibold">Current:</span> {formatCurrentValue(currentValue)}
            {percentile !== null && (
              <span className="ml-2">({percentile.toFixed(1)}th percentile)</span>
            )}
          </div>
        )}
        {!currentValue && (selectedMetric === 'lt1Wkg' || selectedMetric === 'lt2Wkg') && (
          <div className="text-amber-600 text-xs italic">
            Weight not set in profile. Set your weight to see your W/kg value.
          </div>
        )}
        <div><span className="font-semibold">Average:</span> {formatCurrentValue(currentMetric.mean)}</div>
        <div><span className="font-semibold">SD:</span> {formatCurrentValue(currentMetric.sd)}</div>
        <div><span className="font-semibold">Median:</span> {formatCurrentValue(currentMetric.median)}</div>
        <div><span className="font-semibold">25-75%:</span> {formatCurrentValue(currentMetric.p25)} - {formatCurrentValue(currentMetric.p75)}</div>
        <div><span className="font-semibold">Min-Max:</span> {formatCurrentValue(currentMetric.min)} - {formatCurrentValue(currentMetric.max)}</div>
      </div>

      {/* Bell curve chart */}
      {currentMetric.distribution && currentMetric.distribution.length > 0 && (
        <div className="h-48 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={currentMetric.distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="x" 
                tick={{ fontSize: 10 }}
                label={{ value: getMetricName(), position: 'insideBottom', offset: -5, style: { fontSize: 10 } }}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                label={{ value: 'Density', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
              />
              <Tooltip 
                formatter={(value, name) => [value.toFixed(4), 'Density']}
                labelFormatter={(label) => {
                  if (selectedMetric === 'lt1Wkg' || selectedMetric === 'lt2Wkg') {
                    return `${getMetricName()}: ${label.toFixed(2)} W/kg`;
                  }
                  return `${getMetricName()}: ${formatCurrentValue(label)}`;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="y" 
                stroke="#3b82f6" 
                fill="#3b82f6" 
                fillOpacity={0.3}
              />
              {currentValue && (
                <ReferenceLine 
                  x={currentValue} 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  label={{ value: 'You', position: 'top', fill: '#ef4444', fontSize: 10 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default PopulationInsights;
