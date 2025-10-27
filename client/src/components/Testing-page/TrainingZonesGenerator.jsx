import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

const TrainingZonesGenerator = ({ mockData, demoMode = false }) => {
  const [zones, setZones] = useState(null);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [isEditingZones, setIsEditingZones] = useState(false);
  const [editableZones, setEditableZones] = useState(null);
  
  // Get unit system and input mode from mockData or default to metric/pace
  const unitSystem = mockData?.unitSystem || 'metric';
  const inputMode = mockData?.inputMode || 'pace';

  const calculateZones = useCallback((lt1, lt2, maxPower, maxHR, sport, thresholds = {}) => {
    const zones = {};

    if (sport === 'bike') {
      // Cycling zones based on proper lactate thresholds
      // Zone 1: < LTP1 (Recovery)
      // Zone 2: LTP1 - OBLA 2.0 (Aerobic Base)
      // Zone 3: OBLA 2.0 - OBLA 3.0 (Tempo/Sweet Spot)
      // Zone 4: OBLA 3.0 - LTP2 (Threshold)
      // Zone 5: > LTP2 (VO2max)
      const obla20 = thresholds.obla20?.power || lt1.power * 1.1;
      const obla30 = thresholds.obla30?.power || lt2.power * 0.9;
      
      zones.power = {
        zone1: { min: 0, max: Math.round(lt1.power * 0.7), description: 'Recovery & Easy' },
        zone2: { min: Math.round(lt1.power * 0.7), max: Math.round(lt1.power), description: 'Aerobic Base' },
        zone3: { min: Math.round(lt1.power), max: Math.round(obla20), description: 'Tempo/Sweet Spot' },
        zone4: { min: Math.round(obla20), max: Math.round(lt2.power), description: 'Threshold' },
        zone5: { min: Math.round(lt2.power), max: Math.round(maxPower), description: 'VO2max' }
      };
    } else if (sport === 'run' || sport === 'swim') {
      // Running/Swimming zones based on pace or speed
      const lt1Power = lt1.power; // Power in seconds per km
      const lt2Power = lt2.power;
      const fastestPace = maxPower; // This is the fastest pace (lowest seconds)
      
      if (inputMode === 'pace') {
        // Pace mode - convert to MM:SS format
        const lt1PaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(lt1Power) : lt1Power;
        const lt2PaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(lt2Power) : lt2Power;
        const maxPaceConverted = unitSystem === 'imperial' ? convertPaceToImperial(fastestPace) : fastestPace;
        
        // For pace: slower times (higher seconds) = easier zones
        // Zone 1: slowest pace (highest seconds) to 70% of LT1
        // Zone 2: 70% LT1 to LT1
        // Zone 3: LT1 to 90% of LT1 (faster)
        // Zone 4: 90% LT1 to LT2
        // Zone 5: LT2 to fastest pace (lowest seconds)
        zones.pace = {
          zone1: { min: formatPace(lt1PaceConverted * 1.3), max: formatPace(maxPaceConverted), description: 'Recovery & Easy' },
          zone2: { min: formatPace(lt1PaceConverted), max: formatPace(lt1PaceConverted * 1.3), description: 'Aerobic Base' },
          zone3: { min: formatPace(lt1PaceConverted * 0.9), max: formatPace(lt1PaceConverted), description: 'Tempo' },
          zone4: { min: formatPace(lt2PaceConverted), max: formatPace(lt1PaceConverted * 0.9), description: 'Threshold' },
          zone5: { min: formatPace(maxPaceConverted), max: formatPace(lt2PaceConverted), description: 'VO2max' }
        };
      } else {
        // Speed mode - convert to km/h or mph
        const lt1Speed = convertSecondsToSpeed(lt1Power, unitSystem);
        const lt2Speed = convertSecondsToSpeed(lt2Power, unitSystem);
        const maxSpeed = convertSecondsToSpeed(fastestPace, unitSystem);
        
        // For speed: lower speeds = easier zones
        // Zone 1: slowest speed to 70% of LT1 speed
        // Zone 2: 70% LT1 to LT1 speed  
        // Zone 3: LT1 to 90% of LT1 speed
        // Zone 4: 90% LT1 to LT2 speed
        // Zone 5: LT2 to fastest speed
        zones.speed = {
          zone1: { min: formatSpeed(lt1Speed * 0.7), max: formatSpeed(lt1Speed * 0.85), description: 'Recovery & Easy' },
          zone2: { min: formatSpeed(lt1Speed * 0.85), max: formatSpeed(lt1Speed), description: 'Aerobic Base' },
          zone3: { min: formatSpeed(lt1Speed), max: formatSpeed(lt1Speed * 1.1), description: 'Tempo' },
          zone4: { min: formatSpeed(lt1Speed * 1.1), max: formatSpeed(lt2Speed), description: 'Threshold' },
          zone5: { min: formatSpeed(lt2Speed), max: formatSpeed(maxSpeed), description: 'VO2max' }
        };
      }
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
  }, [unitSystem, inputMode]);

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

  const convertSecondsToSpeed = (seconds, unitSystem) => {
    if (!seconds || seconds <= 0) return 0;
    if (unitSystem === 'imperial') {
      // Convert seconds per km to mph
      const kmh = 3600 / seconds; // Convert seconds per km to km/h
      return kmh * 0.621371; // Convert km/h to mph
    } else {
      // Convert seconds per km to km/h
      return 3600 / seconds;
    }
  };

  const formatSpeed = (speed) => {
    if (!speed || speed === 0) return '0.0';
    return speed.toFixed(1);
  };

  // Zone editing functions
  const handleEditZones = () => {
    setEditableZones(JSON.parse(JSON.stringify(zones)));
    setIsEditingZones(true);
  };

  const handleCancelEdit = () => {
    setEditableZones(null);
    setIsEditingZones(false);
  };

  const handleSaveZones = () => {
    setZones(editableZones);
    setIsEditingZones(false);
    setEditableZones(null);
  };

  const handleZoneChange = (zoneType, zoneKey, field, value) => {
    setEditableZones(prev => ({
      ...prev,
      [zoneType]: {
        ...prev[zoneType],
        [zoneKey]: {
          ...prev[zoneType][zoneKey],
          [field]: value
        }
      }
    }));
  };


  // Import the same threshold calculation logic from DataTable
  const calculateDmax = (points) => {
    if (!points || points.length < 3) return null;
    
    // Najít první a poslední bod
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    
    // Vypočítat přímku mezi prvním a posledním bodem
    const slope = (lastPoint.lactate - firstPoint.lactate) / 
                  (lastPoint.power - firstPoint.power);
    const intercept = firstPoint.lactate - slope * firstPoint.power;
    
    // Najít bod s největší kolmou vzdáleností od přímky
    let maxDistance = 0;
    let dmaxPoint = null;
    
    points.forEach(point => {
      // Vypočítat vzdálenost bodu od přímky
      const distance = Math.abs(
        point.lactate - (slope * point.power + intercept)
      ) / Math.sqrt(1 + slope * slope);
      
      if (distance > maxDistance) {
        maxDistance = distance;
        dmaxPoint = point;
      }
    });
    
    return dmaxPoint;
  };

  const findLactateThresholds = (results, baseLactate) => {
    if (!results || results.length < 3) {
      return { ltp1: null, ltp2: null };
    }

    // Použít D-max pro LTP2
    const ltp2Point = calculateDmax(results);
    
    if (!ltp2Point) return { ltp1: null, ltp2: null };
    
    // Pro LTP1 použít modifikovanou D-max metodu na první část křivky
    const firstHalfPoints = results.filter(p => p.power <= ltp2Point.power);
    const ltp1Point = calculateDmax(firstHalfPoints);

    return {
      ltp1: ltp1Point?.power || null,
      ltp2: ltp2Point.power
    };
  };

  const calculateTrainingZones = useCallback(() => {
    if (!mockData || !mockData.results || mockData.results.length < 3) {
      return;
    }

    const results = mockData.results;
    const sport = mockData.sport || 'bike';
    setSelectedSport(sport);

    // Sort results the same way as DataTable
    const sortedResults = [...results].sort((a, b) => {
      if (sport === 'run' || sport === 'swim') {
        // Pro běh a plavání řadíme sestupně (nižší čas = lepší výkon)
        return b.power - a.power;
      }
      // Pro kolo řadíme vzestupně
      return a.power - b.power;
    });

    // Implement proper lactate zone calculation based on mathematical principles
    const baseLactate = mockData.baseLactate;
    
    // 1️⃣ Calculate baseline lactate (average of first 2-3 points)
    const Bsln = baseLactate || (sortedResults[0].lactate + sortedResults[1].lactate) / 2;
    
    // 2️⃣ Define target lactate values
    const targets = {
      bsln05: Bsln + 0.5,
      bsln10: Bsln + 1.0,
      bsln15: Bsln + 1.5,
      obla20: 2.0,
      obla30: 3.0,
      obla40: 4.0
    };

    // 3️⃣ Interpolation function
    const interpolatePower = (data, targetLactate) => {
      for (let i = 0; i < data.length - 1; i++) {
        const a = data[i];
        const b = data[i + 1];
        if (a.lactate <= targetLactate && b.lactate >= targetLactate) {
          const ratio = (targetLactate - a.lactate) / (b.lactate - a.lactate);
          return {
            power: a.power + ratio * (b.power - a.power),
            hr: a.heartRate + ratio * (b.heartRate - a.heartRate),
            lactate: targetLactate
          };
        }
      }
      return null;
    };

    // 4️⃣ Calculate interpolated thresholds
    const thresholds = {};
    for (const [key, value] of Object.entries(targets)) {
      thresholds[key] = interpolatePower(sortedResults, value);
    }

    // 5️⃣ Derive LTP1 and LTP2
    const LTP1 = thresholds.bsln05 || thresholds.bsln10;
    const LTP2 = thresholds.obla40 || thresholds.obla30;

    if (!LTP1 || !LTP2) {
      console.warn('Could not calculate lactate thresholds');
      return;
    }

    const lt1 = {
      power: LTP1.power,
      hr: LTP1.hr,
      lactate: LTP1.lactate
    };

    const lt2 = {
      power: LTP2.power,
      hr: LTP2.hr,
      lactate: LTP2.lactate
    };

    // Find max values
    let maxPower = 0;
    let maxHR = 0;
    results.forEach(result => {
      const power = parseFloat(result.power) || 0;
      const hr = parseFloat(result.heartRate) || 0;
      if (power > maxPower) maxPower = power;
      if (hr > maxHR) maxHR = hr;
    });

    // Calculate zones with proper thresholds
    const calculatedZones = calculateZones(lt1, lt2, maxPower, maxHR, sport, thresholds);
    setZones(calculatedZones);
  }, [mockData, calculateZones]);

  useEffect(() => {
    if (mockData && mockData.results && mockData.results.length > 0) {
      calculateTrainingZones();
    }
  }, [mockData, calculateTrainingZones]);




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



      {/* Combined Training Zones Table */}
      <div className="flex flex-col gap-4 p-2 sm:p-4 bg-white rounded-2xl shadow-lg mt-3 sm:mt-5">
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
          <h4 className="text-lg font-semibold text-gray-900">
          Training Zones Table
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
                    {inputMode === 'pace' ? 
                      (selectedSport === 'swim' ? 
                        (unitSystem === 'imperial' ? 'Pace /100yd' : 'Pace /100m') :
                        (unitSystem === 'imperial' ? 'Pace /mile' : 'Pace /km')
                      ) :
                      (unitSystem === 'imperial' ? 'Speed (mph)' : 'Speed (km/h)')
                    }
                  </th>
                )}
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Heart Rate (BPM)</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Lactate (mmol/L)</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Edit</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries((isEditingZones ? editableZones : zones).power || (isEditingZones ? editableZones : zones).pace || (isEditingZones ? editableZones : zones).speed || (isEditingZones ? editableZones : zones).heartRate).map(([zoneKey, zone], index) => {
                const zoneNumber = parseInt(zoneKey.replace('zone', ''));
                const currentZones = isEditingZones ? editableZones : zones;
                const powerZone = currentZones.power || currentZones.pace || currentZones.speed;
                const hrZone = currentZones.heartRate;
                
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
                        {isEditingZones ? (
                          <div className="flex space-x-1">
                            <input
                              type="number"
                              value={powerZone[zoneKey]?.min || ''}
                              onChange={(e) => handleZoneChange('power', zoneKey, 'min', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs border rounded"
                            />
                            <span className="text-xs">-</span>
                            <input
                              type="number"
                              value={powerZone[zoneKey]?.max || ''}
                              onChange={(e) => handleZoneChange('power', zoneKey, 'max', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs border rounded"
                            />
                            <span className="text-xs">W</span>
                          </div>
                        ) : (
                          <span className="text-sm font-mono text-gray-900 font-semibold">
                            {powerZone[zoneKey] ? `${powerZone[zoneKey].min}W - ${powerZone[zoneKey].max}W` : '-'}
                          </span>
                        )}
                      </td>
                    )}
                    {(selectedSport === 'run' || selectedSport === 'swim') && powerZone && (
                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                        {isEditingZones ? (
                          <div className="flex space-x-1">
                            <input
                              type="text"
                              value={powerZone[zoneKey]?.min || ''}
                              onChange={(e) => handleZoneChange(inputMode === 'speed' ? 'speed' : 'pace', zoneKey, 'min', e.target.value)}
                              className="w-20 px-2 py-1 text-xs border rounded"
                              placeholder={inputMode === 'speed' ? '12.0' : '4:30'}
                            />
                            <span className="text-xs">-</span>
                            <input
                              type="text"
                              value={powerZone[zoneKey]?.max || ''}
                              onChange={(e) => handleZoneChange(inputMode === 'speed' ? 'speed' : 'pace', zoneKey, 'max', e.target.value)}
                              className="w-20 px-2 py-1 text-xs border rounded"
                              placeholder={inputMode === 'speed' ? '15.0' : '4:00'}
                            />
                            {inputMode === 'speed' && (
                              <span className="text-xs">{unitSystem === 'imperial' ? 'mph' : 'km/h'}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm font-mono text-gray-900 font-semibold">
                            {powerZone[zoneKey] ? 
                              (inputMode === 'speed' ? 
                                `${powerZone[zoneKey].min} - ${powerZone[zoneKey].max} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}` :
                                `${powerZone[zoneKey].min} - ${powerZone[zoneKey].max}`
                              ) : '-'
                            }
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap border-r border-gray-200">
                      {isEditingZones ? (
                        <div className="flex space-x-1">
                          <input
                            type="number"
                            value={hrZone?.[zoneKey]?.min || ''}
                            onChange={(e) => handleZoneChange('heartRate', zoneKey, 'min', parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-xs border rounded"
                          />
                          <span className="text-xs">-</span>
                          <input
                            type="number"
                            value={hrZone?.[zoneKey]?.max || ''}
                            onChange={(e) => handleZoneChange('heartRate', zoneKey, 'max', parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-xs border rounded"
                          />
                          <span className="text-xs">BPM</span>
                        </div>
                      ) : (
                        <span className="text-sm font-mono text-gray-900 font-semibold">
                          {hrZone && hrZone[zoneKey] ? `${hrZone[zoneKey].min} - ${hrZone[zoneKey].max} BPM` : '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-gray-900 font-semibold">
                        {lactateRange.min} - {lactateRange.max}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {!isEditingZones ? (
                        <button
                          onClick={handleEditZones}
                          className="text-blue-600 hover:text-blue-800 transition-colors p-2 rounded-lg hover:bg-blue-50"
                          title="Edit zones"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      ) : (
                        <div className="flex space-x-1">
                          <button
                            onClick={handleSaveZones}
                            className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            title="Save Changes"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            title="Cancel"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
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

     
    </div>
  );
};

export default TrainingZonesGenerator;
