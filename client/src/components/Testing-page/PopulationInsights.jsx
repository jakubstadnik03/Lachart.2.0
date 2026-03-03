import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import api from '../../services/api';

const PopulationInsights = ({ athleteProfile, selectedSport = 'bike' }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedGender, setSelectedGender] = useState('male');

  useEffect(() => {
    const loadStats = async () => {
      if (!athleteProfile || selectedSport === 'all') return;
      
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
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [athleteProfile, selectedGender, selectedSport]);

  if (selectedSport === 'all') {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-center py-4 text-gray-500 text-sm">
          Loading population statistics...
        </div>
      </div>
    );
  }

  if (!stats || !stats[selectedSport]) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Population Comparison</h3>
        <p className="text-xs text-gray-500 mb-2">
          Compare your performance metrics with other athletes in the database.
        </p>
        <div className="text-center py-4 text-gray-500 text-sm">
          <p className="mb-2">Population statistics not available yet.</p>
          <p className="text-xs text-gray-400">
            Statistics are calculated from athletes who have set their power zones (LT1/LT2) in their profile.
            More data will be available as more athletes complete their profiles.
          </p>
        </div>
      </div>
    );
  }

  const sportStats = stats[selectedSport];
  
  // Get current user's values
  const getCurrentValues = () => {
    if (!athleteProfile?.powerZones) return null;
    
    const zones = athleteProfile.powerZones[selectedSport === 'bike' ? 'cycling' : 'running'];
    if (!zones?.lt1 || !zones?.lt2) return null;
    
    const ratio = (zones.lt1 / zones.lt2) * 100;
    const lt1Wkg = selectedSport === 'bike' && athleteProfile.weight ? zones.lt1 / athleteProfile.weight : null;
    const lt2Wkg = selectedSport === 'bike' && athleteProfile.weight ? zones.lt2 / athleteProfile.weight : null;
    
    return {
      lt1: zones.lt1,
      lt2: zones.lt2,
      ratio,
      lt1Wkg,
      lt2Wkg
    };
  };

  const currentValues = getCurrentValues();
  
  // Calculate percentile
  const calculatePercentile = (value, stats) => {
    if (value === null || value === undefined || !stats || !stats.distribution || stats.count === 0) return null;
    
    const z = (value - stats.mean) / stats.sd;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    
    let percentile = z > 0 ? (1 - p) * 100 : p * 100;
    return Math.max(0, Math.min(100, percentile));
  };

  // Format value
  const formatValue = (value, type) => {
    if (value === null || value === undefined) return '-';
    if (type === 'ratio') {
      return `${value.toFixed(1)}%`;
    }
    if (type === 'wkg') {
      return `${value.toFixed(2)} W/kg`;
    }
    if (selectedSport === 'run') {
      const mins = Math.floor(value / 60);
      const secs = Math.round(value % 60);
      return `${mins}:${String(secs).padStart(2, '0')} /km`;
    }
    return `${Math.round(value)}W`;
  };

  // Check if metric has data
  const hasData = (metric) => {
    return metric && metric.count > 0;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Population Comparison ({selectedSport === 'bike' ? 'Cycling' : 'Running'})</h3>
        <p className="text-xs text-gray-500 mb-3">
          Compare your performance with other {selectedGender} athletes who have set their power zones.
        </p>
        
        {/* Gender selector */}
        <div className="flex gap-2 mb-4">
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
      </div>

      {/* W/kg graphs for bike */}
      {selectedSport === 'bike' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* LT1 W/kg */}
          {hasData(sportStats.lt1Wkg) && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">
                LT1 (W/kg)
                {currentValues?.lt1Wkg && (
                  <span className="ml-2 text-primary">
                    You: {formatValue(currentValues.lt1Wkg, 'wkg')}
                    {calculatePercentile(currentValues.lt1Wkg, sportStats.lt1Wkg) && (
                      <span className="text-gray-500"> ({calculatePercentile(currentValues.lt1Wkg, sportStats.lt1Wkg).toFixed(1)}th percentile)</span>
                    )}
                  </span>
                )}
              </div>
              {!currentValues?.lt1Wkg && (
                <p className="text-xs text-amber-600 mb-2">Set your weight in profile to see your W/kg value</p>
              )}
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sportStats.lt1Wkg.distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="x" 
                      tick={{ fontSize: 9 }}
                      label={{ value: 'W/kg', position: 'insideBottom', offset: -5, style: { fontSize: 9 } }}
                    />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip 
                      formatter={(value) => [value.toFixed(4), 'Density']}
                      labelFormatter={(label) => `LT1: ${label.toFixed(2)} W/kg`}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="y" 
                      stroke="#3b82f6" 
                      fill="#3b82f6" 
                      fillOpacity={0.3}
                    />
                    {currentValues?.lt1Wkg && (
                      <ReferenceLine 
                        x={currentValues.lt1Wkg} 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        label={{ value: 'You', position: 'top', fill: '#ef4444', fontSize: 9 }}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                Avg: {formatValue(sportStats.lt1Wkg.mean, 'wkg')} | 
                Median: {formatValue(sportStats.lt1Wkg.median, 'wkg')} | 
                Count: {sportStats.lt1Wkg.count}
              </div>
            </div>
          )}

          {/* LT2 W/kg */}
          {hasData(sportStats.lt2Wkg) && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">
                LT2 (W/kg)
                {currentValues?.lt2Wkg && (
                  <span className="ml-2 text-primary">
                    You: {formatValue(currentValues.lt2Wkg, 'wkg')}
                    {calculatePercentile(currentValues.lt2Wkg, sportStats.lt2Wkg) && (
                      <span className="text-gray-500"> ({calculatePercentile(currentValues.lt2Wkg, sportStats.lt2Wkg).toFixed(1)}th percentile)</span>
                    )}
                  </span>
                )}
              </div>
              {!currentValues?.lt2Wkg && (
                <p className="text-xs text-amber-600 mb-2">Set your weight in profile to see your W/kg value</p>
              )}
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sportStats.lt2Wkg.distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="x" 
                      tick={{ fontSize: 9 }}
                      label={{ value: 'W/kg', position: 'insideBottom', offset: -5, style: { fontSize: 9 } }}
                    />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip 
                      formatter={(value) => [value.toFixed(4), 'Density']}
                      labelFormatter={(label) => `LT2: ${label.toFixed(2)} W/kg`}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="y" 
                      stroke="#3b82f6" 
                      fill="#3b82f6" 
                      fillOpacity={0.3}
                    />
                    {currentValues?.lt2Wkg && (
                      <ReferenceLine 
                        x={currentValues.lt2Wkg} 
                        stroke="#ef4444" 
                        strokeWidth={2}
                        label={{ value: 'You', position: 'top', fill: '#ef4444', fontSize: 9 }}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                Avg: {formatValue(sportStats.lt2Wkg.mean, 'wkg')} | 
                Median: {formatValue(sportStats.lt2Wkg.median, 'wkg')} | 
                Count: {sportStats.lt2Wkg.count}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LT1/LT2 Ratio graph */}
      {hasData(sportStats.lt1Lt2Ratio) && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-gray-700 mb-2">
            LT1/LT2 Ratio (%)
            {currentValues?.ratio && (
              <span className="ml-2 text-primary">
                You: {formatValue(currentValues.ratio, 'ratio')}
                {calculatePercentile(currentValues.ratio, sportStats.lt1Lt2Ratio) && (
                  <span className="text-gray-500"> ({calculatePercentile(currentValues.ratio, sportStats.lt1Lt2Ratio).toFixed(1)}th percentile)</span>
                )}
              </span>
            )}
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sportStats.lt1Lt2Ratio.distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="x" 
                  tick={{ fontSize: 9 }}
                  label={{ value: 'Ratio (%)', position: 'insideBottom', offset: -5, style: { fontSize: 9 } }}
                />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip 
                  formatter={(value) => [value.toFixed(4), 'Density']}
                  labelFormatter={(label) => `Ratio: ${label.toFixed(1)}%`}
                />
                <Area 
                  type="monotone" 
                  dataKey="y" 
                  stroke="#3b82f6" 
                  fill="#3b82f6" 
                  fillOpacity={0.3}
                />
                {currentValues?.ratio && (
                  <ReferenceLine 
                    x={currentValues.ratio} 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    label={{ value: 'You', position: 'top', fill: '#ef4444', fontSize: 9 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Avg: {formatValue(sportStats.lt1Lt2Ratio.mean, 'ratio')} | 
            Median: {formatValue(sportStats.lt1Lt2Ratio.median, 'ratio')} | 
            Count: {sportStats.lt1Lt2Ratio.count}
          </div>
        </div>
      )}

      {/* Show message if no data available */}
      {!hasData(sportStats.lt1Wkg) && !hasData(sportStats.lt2Wkg) && !hasData(sportStats.lt1Lt2Ratio) && (
        <div className="text-center py-4 text-gray-500 text-sm">
          <p className="mb-2">Not enough data available for {selectedGender} {selectedSport} athletes.</p>
          <p className="text-xs text-gray-400">
            Statistics are calculated from athletes who have set their power zones (LT1/LT2) in their profile.
            More data will be available as more athletes complete their profiles.
          </p>
        </div>
      )}
    </div>
  );
};

export default PopulationInsights;
