import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

const TrainingZonesGenerator = ({ mockData, demoMode = false }) => {
  const [zones, setZones] = useState(null);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' or 'imperial'

  const calculateZones = useCallback((lt1, lt2, maxPower, maxHR, sport) => {
    const zones = {};

    if (sport === 'bike') {
      // Cycling zones based on power
      zones.power = {
        zone1: { min: 0, max: Math.round(lt1.power * 0.85), description: 'Recovery & Easy' },
        zone2: { min: Math.round(lt1.power * 0.85), max: Math.round(lt1.power), description: 'Aerobic Base' },
        zone3: { min: Math.round(lt1.power), max: Math.round(lt1.power * 1.1), description: 'Tempo' },
        zone4: { min: Math.round(lt1.power * 1.1), max: Math.round(lt2.power), description: 'Threshold' },
        zone5: { min: Math.round(lt2.power), max: Math.round(maxPower), description: 'VO2max' }
      };
    } else if (sport === 'run') {
      // Running zones based on pace (convert to mm:ss format)
      const lt1Pace = lt1.power; // Assuming power field contains pace in seconds per km
      const lt2Pace = lt2.power;
      const minPace = maxPower; // Assuming maxPower is actually min pace
      
      // Convert to imperial if needed
      const lt1PaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(lt1Pace) : lt1Pace;
      const lt2PaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(lt2Pace) : lt2Pace;
      const minPaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(minPace) : minPace;
      
      zones.pace = {
        zone1: { min: formatPace(minPaceConverted), max: formatPace(lt1PaceConverted * 1.15), description: 'Recovery & Easy' },
        zone2: { min: formatPace(lt1PaceConverted * 1.15), max: formatPace(lt1PaceConverted), description: 'Aerobic Base' },
        zone3: { min: formatPace(lt1PaceConverted), max: formatPace(lt1PaceConverted * 0.9), description: 'Tempo' },
        zone4: { min: formatPace(lt1PaceConverted * 0.9), max: formatPace(lt2PaceConverted), description: 'Threshold' },
        zone5: { min: formatPace(lt2PaceConverted), max: formatPace(lt2PaceConverted * 0.8), description: 'VO2max' }
      };
    } else if (sport === 'swim') {
      // Swimming zones based on pace (convert to mm:ss format)
      const lt1Pace = lt1.power;
      const lt2Pace = lt2.power;
      const minPace = maxPower;
      
      // Convert to imperial if needed
      const lt1PaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(lt1Pace) : lt1Pace;
      const lt2PaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(lt2Pace) : lt2Pace;
      const minPaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(minPace) : minPace;
      
      zones.pace = {
        zone1: { min: formatPace(minPaceConverted), max: formatPace(lt1PaceConverted * 1.15), description: 'Recovery & Easy' },
        zone2: { min: formatPace(lt1PaceConverted * 1.15), max: formatPace(lt1PaceConverted), description: 'Aerobic Base' },
        zone3: { min: formatPace(lt1PaceConverted), max: formatPace(lt1PaceConverted * 0.9), description: 'Tempo' },
        zone4: { min: formatPace(lt1PaceConverted * 0.9), max: formatPace(lt2PaceConverted), description: 'Threshold' },
        zone5: { min: formatPace(lt2PaceConverted), max: formatPace(lt2PaceConverted * 0.8), description: 'VO2max' }
      };
    }

    // Heart rate zones (same for all sports)
    zones.heartRate = {
      zone1: { min: Math.round(lt1.hr * 0.7), max: Math.round(lt1.hr * 0.85), description: 'Recovery & Easy' },
      zone2: { min: Math.round(lt1.hr * 0.85), max: Math.round(lt1.hr), description: 'Aerobic Base' },
      zone3: { min: Math.round(lt1.hr), max: Math.round(lt1.hr * 1.1), description: 'Tempo' },
      zone4: { min: Math.round(lt1.hr * 1.1), max: Math.round(lt2.hr), description: 'Threshold' },
      zone5: { min: Math.round(lt2.hr), max: Math.round(maxHR), description: 'VO2max' }
    };

    return zones;
  }, [unitSystem]);

  const formatPace = (seconds) => {
    if (!seconds || seconds === 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const convertPaceToImperial = (secondsPerKm) => {
    // Convert seconds per km to seconds per mile
    return secondsPerKm * 1.60934;
  };


  const calculateTrainingZones = useCallback(() => {
    if (!mockData || !mockData.results || mockData.results.length < 3) {
      return;
    }

    const results = mockData.results;
    const sport = mockData.sport || 'bike';
    setSelectedSport(sport);

    // Find LT1 and LT2 thresholds
    let lt1 = null;
    let lt2 = null;
    let maxPower = 0;
    let maxHR = 0;

    // Find maximum values
    results.forEach(result => {
      const power = parseFloat(result.power) || 0;
      const hr = parseFloat(result.heartRate) || 0;
      if (power > maxPower) maxPower = power;
      if (hr > maxHR) maxHR = hr;
    });

    // Find LT1 (first significant rise above baseline, ~2 mmol/L)
    for (let i = 0; i < results.length - 1; i++) {
      const currentLactate = parseFloat(results[i].lactate) || 0;
      const nextLactate = parseFloat(results[i + 1].lactate) || 0;
      if (currentLactate >= 1.5 && nextLactate > currentLactate + 0.5) {
        lt1 = {
          power: parseFloat(results[i].power) || 0,
          hr: parseFloat(results[i].heartRate) || 0,
          lactate: currentLactate
        };
        break;
      }
    }

    // Find LT2 (rapid accumulation, ~4 mmol/L)
    for (let i = 0; i < results.length; i++) {
      const lactate = parseFloat(results[i].lactate) || 0;
      if (lactate >= 4.0) {
        lt2 = {
          power: parseFloat(results[i].power) || 0,
          hr: parseFloat(results[i].heartRate) || 0,
          lactate: lactate
        };
        break;
      }
    }

    // If LT2 not found, use last point
    if (!lt2 && results.length > 0) {
      const lastResult = results[results.length - 1];
      lt2 = {
        power: parseFloat(lastResult.power) || 0,
        hr: parseFloat(lastResult.heartRate) || 0,
        lactate: parseFloat(lastResult.lactate) || 0
      };
    }

    // If LT1 not found, estimate as 70% of LT2
    if (!lt1 && lt2) {
      lt1 = {
        power: lt2.power * 0.7,
        hr: lt2.hr * 0.7,
        lactate: 2.0
      };
    }

    if (lt1 && lt2) {
      const calculatedZones = calculateZones(lt1, lt2, maxPower, maxHR, sport);
      setZones(calculatedZones);
    }
  }, [mockData, calculateZones]);

  useEffect(() => {
    if (mockData && mockData.results && mockData.results.length > 0) {
      calculateTrainingZones();
    }
  }, [mockData, calculateTrainingZones]);

  useEffect(() => {
    if (zones && (selectedSport === 'run' || selectedSport === 'swim')) {
      calculateTrainingZones();
    }
  }, [unitSystem, calculateTrainingZones, zones, selectedSport]);



  const getZoneColor = (zone) => {
    const colors = {
      1: 'bg-green-100 text-green-800 border-green-200',
      2: 'bg-blue-100 text-blue-800 border-blue-200',
      3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      4: 'bg-orange-100 text-orange-800 border-orange-200',
      5: 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[zone] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  if (!zones) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No valid test data available for zone calculation</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Training Zones</h3>
        <p className="text-gray-600">Based on your lactate test results</p>
      </div>

      {/* Unit System Switcher */}
      {(selectedSport === 'run' || selectedSport === 'swim') && (
        <div className="flex justify-center mb-6">
          <div className="bg-gray-100 rounded-lg p-1 inline-flex">
            <button
              onClick={() => setUnitSystem('metric')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                unitSystem === 'metric'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              km/h & pace/km
            </button>
            <button
              onClick={() => setUnitSystem('imperial')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                unitSystem === 'imperial'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              mph & pace/mile
            </button>
          </div>
        </div>
      )}

      {/* Combined Training Zones Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900">
            📊 Training Zones Table
          </h4>
          <p className="text-sm text-gray-600 mt-1">
            Complete training zones with power, heart rate, and lactate ranges
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Zone</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Description</th>
                {selectedSport === 'bike' && (
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Power (W)</th>
                )}
                {(selectedSport === 'run' || selectedSport === 'swim') && (
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Pace {unitSystem === 'imperial' ? '/mile' : '/km'}
                  </th>
                )}
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Heart Rate (BPM)</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Lactate (mmol/L)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(zones.power || zones.pace || zones.heartRate).map(([zoneKey, zone], index) => {
                const zoneNumber = parseInt(zoneKey.replace('zone', ''));
                const powerZone = zones.power || zones.pace;
                const hrZone = zones.heartRate;
                
                // Calculate lactate ranges based on zone
                const lactateRanges = {
                  1: { min: 0.5, max: 1.5 },
                  2: { min: 1.5, max: 2.5 },
                  3: { min: 2.5, max: 3.5 },
                  4: { min: 3.5, max: 5.0 },
                  5: { min: 5.0, max: 8.0 }
                };
                
                const lactateRange = lactateRanges[zoneNumber] || { min: 0, max: 0 };
                
                return (
                  <motion.tr
                    key={zoneKey}
                    className={`${getZoneColor(zoneNumber)} hover:bg-opacity-90 transition-all duration-200 border-r border-gray-200`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                      <div className="flex items-center">
                        <div className={`w-5 h-5 rounded-full mr-3 ${getZoneColor(zoneNumber).split(' ')[0]} border-2 border-white shadow-sm`}></div>
                        <span className="text-sm font-bold text-gray-900">Zone {zoneNumber}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                      <span className="text-sm text-gray-700 font-medium">{zone.description}</span>
                    </td>
                    {selectedSport === 'bike' && powerZone && (
                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                        <span className="text-sm font-mono text-gray-900 font-semibold">
                          {powerZone[zoneKey] ? `${powerZone[zoneKey].min}W - ${powerZone[zoneKey].max}W` : '-'}
                        </span>
                      </td>
                    )}
                    {(selectedSport === 'run' || selectedSport === 'swim') && powerZone && (
                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                        <span className="text-sm font-mono text-gray-900 font-semibold">
                          {powerZone[zoneKey] ? `${powerZone[zoneKey].min} - ${powerZone[zoneKey].max}` : '-'}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                      <span className="text-sm font-mono text-gray-900 font-semibold">
                        {hrZone && hrZone[zoneKey] ? `${hrZone[zoneKey].min} - ${hrZone[zoneKey].max} BPM` : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-gray-900 font-semibold">
                        {lactateRange.min} - {lactateRange.max}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Training Recommendations */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-blue-900 mb-3">Training Recommendations</h4>
        <div className="space-y-2 text-sm text-blue-800">
          <p><strong>Zone 1-2:</strong> 70-80% of training time - Build aerobic base</p>
          <p><strong>Zone 3:</strong> 10-15% of training time - Tempo training</p>
          <p><strong>Zone 4:</strong> 5-10% of training time - Threshold intervals</p>
          <p><strong>Zone 5:</strong> 2-5% of training time - VO2max intervals</p>
        </div>
      </div>

      {/* Export/Print Button */}
      <div className="flex justify-center">
        <motion.button
          onClick={() => window.print()}
          className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Print Training Zones
        </motion.button>
      </div>
    </div>
  );
};

export default TrainingZonesGenerator;
