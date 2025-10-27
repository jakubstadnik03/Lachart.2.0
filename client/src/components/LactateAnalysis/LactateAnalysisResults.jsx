import React from 'react';
import { motion } from 'framer-motion';

const LactateAnalysisResults = ({ session, analysis }) => {
  console.log('📊 LactateAnalysisResults received:', { session, analysis });
  
  if (!analysis) {
    console.log('❌ No analysis data provided');
    return null;
  }

  const { intervalMetrics, overallMetrics, sessionInfo } = analysis;

  const formatTime = (seconds) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPace = (secondsPerKm) => {
    if (!secondsPerKm) return 'N/A';
    const minutes = Math.floor(secondsPerKm / 60);
    const secs = Math.floor(secondsPerKm % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}/km`;
  };

  const formatPower = (watts) => {
    if (!watts) return 'N/A';
    return `${watts}W`;
  };

  const getZoneColor = (zone) => {
    switch (zone) {
      case 'under': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'ok': return 'text-green-600 bg-green-50 border-green-200';
      case 'over': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getZoneIcon = (zone) => {
    switch (zone) {
      case 'under': return '⚠️';
      case 'ok': return '✅';
      case 'over': return '🔴';
      default: return '❓';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Session Header - Strava Style */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">
              {sessionInfo?.title || session.title || 'Lactate Training Session'}
            </h2>
            {(sessionInfo?.description || session.description) && (
              <p className="text-sm opacity-90 mb-2">{sessionInfo?.description || session.description}</p>
            )}
            <div className="flex items-center space-x-4 text-sm opacity-90">
              <span className="flex items-center">
                <span className="w-2 h-2 bg-white rounded-full mr-2"></span>
                {sessionInfo?.sport?.toUpperCase() || session.sport?.toUpperCase()}
              </span>
              <span className="flex items-center">
                <span className="w-2 h-2 bg-white rounded-full mr-2"></span>
                {new Date(sessionInfo?.startTime || session.startTime).toLocaleDateString()}
              </span>
              <span className="flex items-center">
                <span className="w-2 h-2 bg-white rounded-full mr-2"></span>
                {session.intervals.length} intervals
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">
              {overallMetrics?.avgDLADt ? overallMetrics.avgDLADt.toFixed(2) : 'N/A'}
            </div>
            <div className="text-sm opacity-90">Avg dLa/dt (mmol/L/min)</div>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-lg p-4 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-600">Lactate Production</div>
              <div className="text-xl font-bold text-blue-600">
                {overallMetrics?.avgDLADt ? overallMetrics.avgDLADt.toFixed(2) : 'N/A'}
              </div>
              <div className="text-xs text-gray-500">mmol/L/min</div>
            </div>
            <div className="text-2xl">📈</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-600">Recovery Time</div>
              <div className="text-xl font-bold text-green-600">
                {overallMetrics?.avgTHalf ? formatTime(overallMetrics.avgTHalf) : 'N/A'}
              </div>
              <div className="text-xs text-gray-500">t½ clearance</div>
            </div>
            <div className="text-2xl">⏱️</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-4 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-600">Total Load</div>
              <div className="text-xl font-bold text-purple-600">
                {overallMetrics?.totalAUC ? overallMetrics.totalAUC.toFixed(1) : 'N/A'}
              </div>
              <div className="text-xs text-gray-500">AUC (mmol·min)</div>
            </div>
            <div className="text-2xl">📊</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-4 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-600">Session Duration</div>
              <div className="text-xl font-bold text-orange-600">
                {session.intervals.reduce((total, interval) => total + interval.durationS, 0) > 0 
                  ? formatTime(session.intervals.reduce((total, interval) => total + interval.durationS, 0))
                  : 'N/A'}
              </div>
              <div className="text-xs text-gray-500">total time</div>
            </div>
            <div className="text-2xl">⏰</div>
          </div>
        </div>
      </div>

      {/* Interval Analysis - Strava Style */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b">
          <h3 className="text-xl font-bold text-gray-800">Interval Analysis</h3>
          <p className="text-sm text-gray-600 mt-1">
            Detailed breakdown of each interval with lactate predictions and target zones
          </p>
        </div>
        
        <div className="divide-y divide-gray-200">
          {session.intervals.map((interval, index) => {
            const metrics = intervalMetrics.find(m => m.intervalId === interval._id);
            const isWork = interval.kind === 'work';
            const lactateValue = metrics?.lactateEndWork || metrics?.lactateEndRest;
            
            // Determine zone based on target lactate range
            let zone = 'N/A';
            if (interval.targetLactateMin && interval.targetLactateMax && lactateValue) {
              if (lactateValue < interval.targetLactateMin) zone = 'under';
              else if (lactateValue > interval.targetLactateMax) zone = 'over';
              else zone = 'ok';
            }

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  {/* Left side - Interval info */}
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full">
                      <span className="text-lg font-bold text-gray-700">{interval.seq}</span>
                    </div>
                    
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          isWork ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {isWork ? '💪 Work' : '🛌 Rest'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {formatTime(interval.durationS)}
                        </span>
                      </div>
                      
                      <div className="mt-2 flex items-center space-x-4 text-sm">
                        {/* Target Power/Pace */}
                        {interval.targetPowerW && (
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-500">Target:</span>
                            <span className="font-medium text-gray-700">{formatPower(interval.targetPowerW)}</span>
                          </div>
                        )}
                        {interval.targetPaceSPerKm && (
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-500">Target:</span>
                            <span className="font-medium text-gray-700">{formatPace(interval.targetPaceSPerKm)}</span>
                          </div>
                        )}
                        
                        {/* Target Lactate Range */}
                        {interval.targetLactateMin && interval.targetLactateMax && (
                          <div className="flex items-center space-x-1">
                            <span className="text-gray-500">Lactate:</span>
                            <span className="font-medium text-gray-700">
                              {interval.targetLactateMin}-{interval.targetLactateMax} mmol/L
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side - Metrics */}
                  <div className="flex items-center space-x-6">
                    {/* Predicted Lactate */}
                    <div className="text-center">
                      <div className="text-sm text-gray-500">Predicted Lactate</div>
                      <div className="text-xl font-bold text-blue-600">
                        {lactateValue ? lactateValue.toFixed(1) : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500">mmol/L</div>
                    </div>

                    {/* Zone Status */}
                    <div className="text-center">
                      <div className="text-sm text-gray-500">Zone Status</div>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getZoneColor(zone)}`}>
                        {getZoneIcon(zone)} {zone.toUpperCase()}
                      </div>
                    </div>

                    {/* Additional Metrics for Work Intervals */}
                    {isWork && metrics && (
                      <>
                        <div className="text-center">
                          <div className="text-sm text-gray-500">dLa/dt</div>
                          <div className="text-lg font-semibold text-purple-600">
                            {metrics.dLaDtMmolPerMin ? metrics.dLaDtMmolPerMin.toFixed(2) : 'N/A'}
                          </div>
                          <div className="text-xs text-gray-500">mmol/L/min</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-sm text-gray-500">AUC</div>
                          <div className="text-lg font-semibold text-orange-600">
                            {metrics.aucMmolMin ? metrics.aucMmolMin.toFixed(1) : 'N/A'}
                          </div>
                          <div className="text-xs text-gray-500">mmol·min</div>
                        </div>
                      </>
                    )}

                    {/* Additional Metrics for Rest Intervals */}
                    {!isWork && metrics && (
                      <>
                        <div className="text-center">
                          <div className="text-sm text-gray-500">Clearance Rate</div>
                          <div className="text-lg font-semibold text-green-600">
                            {metrics.clearanceRateMmolPerMin ? metrics.clearanceRateMmolPerMin.toFixed(2) : 'N/A'}
                          </div>
                          <div className="text-xs text-gray-500">mmol/L/min</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="text-sm text-gray-500">t½</div>
                          <div className="text-lg font-semibold text-blue-600">
                            {metrics.tHalfS ? formatTime(metrics.tHalfS) : 'N/A'}
                          </div>
                          <div className="text-xs text-gray-500">half-life</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      {overallMetrics?.recommendations && overallMetrics.recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Training Recommendations</h3>
          <div className="space-y-3">
            {overallMetrics.recommendations.map((recommendation, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start space-x-3 p-4 bg-blue-50 rounded-lg border border-blue-200"
              >
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-sm font-bold">{index + 1}</span>
                </div>
                <p className="text-gray-700">{recommendation}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Session Details */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Session Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm font-medium text-gray-600">Sport</div>
            <div className="text-lg font-semibold capitalize">{sessionInfo?.sport || session.sport}</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm font-medium text-gray-600">Start Time</div>
            <div className="text-lg font-semibold">
              {new Date(sessionInfo?.startTime || session.startTime).toLocaleString()}
            </div>
          </div>
          {sessionInfo?.envTempC && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-gray-600">Temperature</div>
              <div className="text-lg font-semibold">{sessionInfo.envTempC}°C</div>
            </div>
          )}
          {sessionInfo?.altitudeM && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm font-medium text-gray-600">Altitude</div>
              <div className="text-lg font-semibold">{sessionInfo.altitudeM}m</div>
            </div>
          )}
        </div>
        {sessionInfo?.notes && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium text-gray-600 mb-2">Notes</div>
            <div className="text-gray-800">{sessionInfo.notes}</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Metrics Explanation</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">Lactate Metrics</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                <span><strong>Predicted Lactate:</strong> Estimated lactate level at interval end</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                <span><strong>dLa/dt:</strong> Lactate production rate (mmol/L/min)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                <span><strong>AUC:</strong> Area under lactate curve (total load)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span><strong>Clearance Rate:</strong> Lactate removal rate during rest</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-gray-700 mb-3">Zone Status</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-1 rounded-full text-xs font-medium text-green-600 bg-green-50 border border-green-200">✅ OK</span>
                <span>Lactate within target range</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-1 rounded-full text-xs font-medium text-yellow-600 bg-yellow-50 border border-yellow-200">⚠️ UNDER</span>
                <span>Lactate below target range</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-1 rounded-full text-xs font-medium text-red-600 bg-red-50 border border-red-200">🔴 OVER</span>
                <span>Lactate above target range</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default LactateAnalysisResults;