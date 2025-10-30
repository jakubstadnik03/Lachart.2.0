
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { calculateThresholds } from './DataTable';

const TrainingZonesGenerator = ({ mockData, demoMode = false }) => {
  const [zones, setZones] = useState(null);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [isEditingZones, setIsEditingZones] = useState(false);
  const [editableZones, setEditableZones] = useState(null);
  
  // Get unit system and input mode from mockData or default to metric/pace
  const unitSystem = mockData?.unitSystem || 'metric';
  const inputMode = mockData?.inputMode || 'pace';

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


  const calculateTrainingZones = useCallback(() => {
    if (!mockData || !mockData.results || mockData.results.length < 3) {
      return;
    }
    const sport = mockData.sport || 'bike';
    setSelectedSport(sport);
    if (sport !== 'run' && sport !== 'swim') return;
    const thresholds = calculateThresholds(mockData);
    const lt1_sec = thresholds['LTP1'];
    const lt2_sec = thresholds['LTP2'];
    const hr1 = thresholds.heartRates['LTP1'];
    const hr2 = thresholds.heartRates['LTP2'];
    if (!lt1_sec || !lt2_sec || !hr1 || !hr2) {
      console.warn('[Zones] Nelze vypočítat zóny protože LTP1/LTP2 nebo HR není dostupné!', { lt1_sec, lt2_sec, hr1, hr2 });
      setZones(null);
      return;
    }
    if (lt2_sec >= lt1_sec) {
      console.warn('[Zones] LTP2 < LTP1, invalid combination', { lt1_sec, lt2_sec });
      setZones(null);
      return;
    }
    const fmt = s => formatPace(s);
    console.log(`[Zones] LTP1: ${lt1_sec} (${fmt(lt1_sec)}) LTP2: ${lt2_sec} (${fmt(lt2_sec)})`);
    // NOVÁ LOGIKA: dělení pro tempo, násobení pro HR
    setZones({
      pace: {
        zone1: {
          min: fmt(lt1_sec / 0.90),
          max: fmt(lt1_sec / 0.70),
          description: '70–90% LT1 (recovery, reference wide zone)',
          hr: `${Math.round(hr1*0.90)}–${Math.round(hr1*0.70)} BPM`,
          percent: '70–90% LT1',
        },
        zone2: {
          min: fmt(lt1_sec / 1.00),
          max: fmt(lt1_sec / 0.90),
          description: '90%–100% LT1',
          hr: `${Math.round(hr1*0.90)}–${Math.round(hr1*1.00)} BPM`,
          percent: '90–100% LT1',
        },
        zone3: {
          min: fmt(lt2_sec / 0.95),
          max: fmt(lt1_sec / 1.00),
          description: '100% LT1 – 95% LT2',
          hr: `${Math.round(hr1*1.00)}–${Math.round(hr2*0.95)} BPM`,
          percent: '100% LT1 – 95% LT2',
        },
        zone4: {
          min: fmt(lt2_sec / 1.04),
          max: fmt(lt2_sec / 0.96),
          description: '96%–104% LT2 (threshold)',
          hr: `${Math.round(hr2*0.96)}–${Math.round(hr2*1.04)} BPM`,
          percent: '96–104% LT2',
        },
        zone5: {
          min: fmt(lt2_sec / 1.20),
          max: fmt(lt2_sec / 1.05),
          description: '105–120% LT2 (sprint/VO2max+ reference)',
          hr: `${Math.round(hr2 * 1.05)}–${Math.round(hr2 * 1.20)} BPM`,
          percent: '105–120% LT2',
        },
      },
      heartRate: {
        zone1: { min: Math.round(hr1*0.90), max: Math.round(hr1*0.70) },
        zone2: { min: Math.round(hr1*0.90), max: Math.round(hr1*1.00) },
        zone3: { min: Math.round(hr1*1.00), max: Math.round(hr2*0.95) },
        zone4: { min: Math.round(hr2*0.96), max: Math.round(hr2*1.04) },
        zone5: { min: Math.round(hr2*1.05), max: Math.round(hr2*1.20) },
      }
    });
  }, [mockData]);

  useEffect(() => {
    if (mockData && mockData.results && mockData.results.length > 0) {
      calculateTrainingZones();
    }
  }, [mockData, calculateTrainingZones]);




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
      <div className="relative flex flex-col gap-4 p-2 sm:p-4 bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl mt-3 sm:mt-5 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/20 bg-white/20 rounded-t-3xl backdrop-blur">
          <h4 className="text-lg font-semibold text-gray-900 mb-1 drop-shadow-[0_1px_8px_rgba(0,0,30,0.10)]">
            Training Zones Table
          </h4>
          <p className="text-sm text-gray-700 mt-1">Complete training zones with power, heart rate, and lactate ranges</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] select-text">
            <thead className="bg-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Zone</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Description</th>
                {selectedSport === 'bike' && (
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Power (W)</th>
                )}
                {(selectedSport === 'run' || selectedSport === 'swim') && (
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">
                    {inputMode === 'pace' ? 
                      (selectedSport === 'swim' ? 
                        (unitSystem === 'imperial' ? 'Pace /100yd' : 'Pace /100m') :
                        (unitSystem === 'imperial' ? 'Pace /mile' : 'Pace /km')
                      ) :
                      (unitSystem === 'imperial' ? 'Speed (mph)' : 'Speed (km/h)')
                    }
                  </th>
                )}
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Heart Rate (BPM)</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Lactate (mmol/L)</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Edit</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-white/30 rounded-b-3xl">
              {Object.entries((isEditingZones ? editableZones : zones).power || (isEditingZones ? editableZones : zones).pace || (isEditingZones ? editableZones : zones).speed || (isEditingZones ? editableZones : zones).heartRate).map(([zoneKey, zone], index) => {
                const zoneNumber = parseInt(zoneKey.replace('zone', ''));
                const currentZones = isEditingZones ? editableZones : zones;
                const powerZone = currentZones.power || currentZones.pace || currentZones.speed;
                const hrZone = currentZones.heartRate;

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
                    className={
                      `transition-all duration-200 ` +
                      'hover:bg-white/40 hover:backdrop-blur pb-1 '
                    }
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.09 }}
                  >
                    {/* ZONE NUMBER + DOT */}
                    <td className="px-6 py-4 border-r border-white/20">
                      <div className="flex items-center">
                        <span className={
                          `w-3 h-3 rounded-full mr-3 inline-block border border-white/70 shadow ` +
                          [
                            'bg-[#9AECDB]/60', // 1 glass green
                            'bg-[#48DBFB]/60', // 2 glass blue
                            'bg-[#f3e6ff]/60', // 3 glass pastel violet
                            'bg-[#fde2cf]/60', // 4 glass peach
                            'bg-[#ffb6b9]/60', // 5 glass pink
                          ][zoneNumber - 1] || 'bg-gray-200/60'
                        } />
                        <span className="text-sm font-semibold text-gray-900 tracking-wide drop-shadow-[0_0.5px_2px_rgba(0,0,20,0.06)]">
                          Zone {zoneNumber}
                        </span>
                      </div>
                    </td>
                    {/* DESCRIPTION */}
                    <td className="px-6 py-4 border-r border-white/20">
                      <span className="text-sm font-normal text-gray-700">{zone.description}</span>
                    </td>
                    {/* POWER/PASTE/SPEED column */}
                    {selectedSport === 'bike' && powerZone && (
                      <td className="px-6 py-4 border-r border-white/20">
                        {isEditingZones ? (
                          <div className="flex space-x-1">
                            <input
                              type="number"
                              value={powerZone[zoneKey]?.min || ''}
                              onChange={(e) => handleZoneChange('power', zoneKey, 'min', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs border border-blue-200 bg-white/70 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition"
                            />
                            <span className="text-xs font-light text-gray-400">-</span>
                            <input
                              type="number"
                              value={powerZone[zoneKey]?.max || ''}
                              onChange={(e) => handleZoneChange('power', zoneKey, 'max', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs border border-blue-200 bg-white/70 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition"
                            />
                            <span className="text-xs font-light text-gray-400">W</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-900 font-mono font-normal tracking-tight">
                            {powerZone[zoneKey] ? `${powerZone[zoneKey].min}W - ${powerZone[zoneKey].max}W` : '-'}
                          </span>
                        )}
                      </td>
                    )}
                    {(selectedSport === 'run' || selectedSport === 'swim') && powerZone && (
                      <td className="px-6 py-4 border-r border-white/20">
                        {isEditingZones ? (
                          <div className="flex space-x-1">
                            <input
                              type="text"
                              value={powerZone[zoneKey]?.min || ''}
                              onChange={(e) => handleZoneChange(inputMode === 'speed' ? 'speed' : 'pace', zoneKey, 'min', e.target.value)}
                              className="w-20 px-2 py-1 text-xs border border-blue-200 bg-white/70 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition"
                              placeholder={inputMode === 'speed' ? '12.0' : '4:30'}
                            />
                            <span className="text-xs font-light text-gray-400">-</span>
                            <input
                              type="text"
                              value={powerZone[zoneKey]?.max || ''}
                              onChange={(e) => handleZoneChange(inputMode === 'speed' ? 'speed' : 'pace', zoneKey, 'max', e.target.value)}
                              className="w-20 px-2 py-1 text-xs border border-blue-200 bg-white/70 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition"
                              placeholder={inputMode === 'speed' ? '15.0' : '4:00'}
                            />
                            {inputMode === 'speed' && (
                              <span className="text-xs font-light text-gray-400">{unitSystem === 'imperial' ? 'mph' : 'km/h'}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-900 font-mono font-normal tracking-tight">
                            {powerZone[zoneKey] ? 
                              (inputMode === 'speed' ? 
                                `${powerZone[zoneKey].min} - ${powerZone[zoneKey].max} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}` :
                                (powerZone[zoneKey].max && powerZone[zoneKey].min) ?
                                  `${powerZone[zoneKey].max} – ${powerZone[zoneKey].min} (${powerZone[zoneKey].percent})` :
                                  powerZone[zoneKey].min ?
                                    `>${powerZone[zoneKey].min}` :
                                  powerZone[zoneKey].max ?
                                    `<${powerZone[zoneKey].max}` :
                                  '-'
                              ) : '-'
                            }
                          </span>
                        )}
                      </td>
                    )}
                    {/* HR COLUMN */}
                    <td className="px-6 py-4 border-r border-white/20">
                      {isEditingZones ? (
                        <div className="flex space-x-1">
                          <input
                            type="number"
                            value={hrZone?.[zoneKey]?.min || ''}
                            onChange={(e) => handleZoneChange('heartRate', zoneKey, 'min', parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-xs border border-blue-200 bg-white/70 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition"
                          />
                          <span className="text-xs font-light text-gray-400">-</span>
                          <input
                            type="number"
                            value={hrZone?.[zoneKey]?.max || ''}
                            onChange={(e) => handleZoneChange('heartRate', zoneKey, 'max', parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-xs border border-blue-200 bg-white/70 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none transition"
                          />
                          <span className="text-xs font-light text-gray-400">BPM</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-900 font-mono font-normal tracking-tight">
                          {hrZone && hrZone[zoneKey] ? `${hrZone[zoneKey].min} - ${hrZone[zoneKey].max} BPM` : '-'}
                        </span>
                      )}
                    </td>
                    {/* LACTATE */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900 font-mono font-normal tracking-tight">
                        {lactateRange.min} - {lactateRange.max}
                      </span>
                    </td>
                    {/* ACTION BUTTONS */}
                    <td className="px-6 py-4 text-center">
                      {!isEditingZones ? (
                        <button
                          onClick={handleEditZones}
                          className="p-2 transition border-none bg-white/60 hover:bg-blue-100/80 rounded-xl shadow hover:scale-110 hover:ring-2 hover:ring-blue-300/60 duration-150"
                          title="Edit zones"
                        >
                          {/* Pencil Icon (lucide style) */}
                          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#246bfd" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6-6M4 20h7" />
                          </svg>
                        </button>
                      ) : (
                        <div className="flex space-x-1 justify-center">
                          <button
                            onClick={handleSaveZones}
                            className="p-2 transition border-none bg-white/70 hover:bg-green-100/90 rounded-xl shadow hover:scale-110 hover:ring-2 hover:ring-green-300/40 duration-150"
                            title="Save Changes"
                          >
                            {/* Check Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#44b672" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-2 transition border-none bg-white/70 hover:bg-red-100/90 rounded-xl shadow hover:scale-110 hover:ring-2 hover:ring-red-300/40 duration-150"
                            title="Cancel"
                          >
                            {/* X Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#e3342f" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
      {/* Recommendations - minimalist card only */}
      <div className="rounded-xl px-3 py-3 bg-white/40 backdrop-blur-sm mt-4 shadow text-gray-700">
        <h4 className="text-base font-semibold text-blue-900 mb-2">Training Zone Reference</h4>
        <ul className="text-sm pl-3 space-y-1">
          <li><span className="font-medium text-gray-900">Zone 1 (Recovery/Easy):</span> &gt;110% LT1 : Long easy runs &amp; recovery</li>
          <li><span className="font-medium text-gray-900">Zone 2 (Base):</span> 100–110% LT1 : Aerobic base building</li>
          <li><span className="font-medium text-gray-900">Zone 3 (Tempo):</span> LT1–LT2 : Marathon/sweet spot/steady state</li>
          <li><span className="font-medium text-gray-900">Zone 4 (Threshold):</span> 95–100% LT2 : Threshold/interval, high aerobic</li>
          <li><span className="font-medium text-gray-900">Zone 5 (VO2max+):</span> &lt;95% LT2 : Fast repeats, <b>max</b> zone</li>
        </ul>
      </div>

     
    </div>
  );
};

export default TrainingZonesGenerator;
