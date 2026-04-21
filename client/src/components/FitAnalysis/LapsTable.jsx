import React, { useState, useEffect, useRef } from 'react';
import { formatDuration, formatDistance, formatSpeed, formatPace } from '../../utils/fitAnalysisUtils';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import LapsBarChart from './LapsBarChart';
import LactateModal from './LactateModal';

function exportLapsCSV(laps, training, user) {
  if (!laps?.length) return;
  const isRun = (training?.sport || '').toLowerCase().includes('run');
  const rows = laps.map((lap, i) => {
    const time = lap.moving_time || lap.totalTimerTime || lap.totalElapsedTime || lap.elapsed_time || 0;
    const dist = lap.totalDistance ?? lap.total_distance ?? lap.distance ?? 0;
    const power = lap.avgPower ?? lap.avg_power ?? lap.average_watts ?? '';
    const hr = lap.avgHeartRate ?? lap.avg_heart_rate ?? lap.average_heartrate ?? '';
    const cadence = lap.avgCadence ?? lap.avg_cadence ?? lap.average_cadence ?? '';
    const lactate = lap.lactate ?? '';
    const speedMps = lap.avgSpeed ?? lap.average_speed ?? lap.avg_speed ?? null;
    const pace = isRun && speedMps ? (1000 / speedMps / 60).toFixed(2) : '';
    return {
      lap: i + 1,
      duration_s: Math.round(time),
      distance_m: Math.round(dist),
      avg_power_w: power !== '' ? Math.round(Number(power)) : '',
      avg_hr_bpm: hr !== '' ? Math.round(Number(hr)) : '',
      avg_cadence: cadence !== '' ? Math.round(Number(cadence)) : '',
      pace_min_per_km: pace,
      lactate_mmol: lactate,
    };
  });
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => r[h] ?? '').join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = training?.titleManual || training?.titleAuto || training?.originalFileName || 'laps';
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9]/gi, '_')}_laps.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Scroll only the laps rows — max height uses dvh so chart + zones fit better on small screens */
const LAPS_LIST_SCROLL_CLASS =
  'overflow-x-auto overflow-y-auto max-h-[min(34dvh,19rem)] sm:max-h-[min(38dvh,23rem)] md:max-h-[min(42dvh,28rem)] overscroll-y-contain touch-pan-y';

/** No internal scroll — parent container handles scrolling (e.g. bottom sheet portal) */
const LAPS_LIST_FULL_CLASS =
  'overflow-x-auto';

const LapsTable = ({ training, onUpdate, user, selectedLapNumber = null, onSelectLapNumber = null, fullHeight = false, onOpenLactateForm = null }) => {
  const [lactateModalOpen, setLactateModalOpen] = useState(false);
  const [initialLapIndex, setInitialLapIndex] = useState(null);
  const [lactateSaved, setLactateSaved] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const sportLower = (training?.sport || '').toLowerCase();
  const isRun = sportLower.includes('run') || sportLower === 'walk' || sportLower === 'hike';
  const isSwim = sportLower.includes('swim');
  const unitSystem = user?.units?.distance === 'imperial' ? 'imperial' : 'metric';

  const formatSwimPace = (speedMps) => {
    const spd = Number(speedMps);
    if (!Number.isFinite(spd) || spd <= 0) return '-';

    const secondsPer100 = unitSystem === 'imperial'
      ? 109.361 / spd // s/100yd
      : 100 / spd; // s/100m

    const secRounded = Math.round(secondsPer100);
    const minutes = Math.floor(secRounded / 60);
    const secs = Math.max(0, secRounded % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}/${unitSystem === 'imperial' ? '100y' : '100m'}`;
  };
  
  // Additional safety check - ensure no duplicates in the component
  const uniqueLaps = React.useMemo(() => {
    if (!training || !training.laps || !Array.isArray(training.laps)) return [];
    
    console.log('LapsTable: Processing laps, count:', training.laps.length);
    
    const seen = new Map();
    const unique = [];
    
    training.laps.forEach((lap, index) => {
      // Strategy 1: Use startTime or start_date as primary identifier
      const startTime = lap.startTime || lap.start_time || lap.start_date;
      if (startTime) {
        const key = `time_${startTime}`;
        if (seen.has(key)) {
          console.warn(`LapsTable: Duplicate lap by startTime at index ${index}:`, {
            index,
            startTime,
            elapsedTime: lap.moving_time || lap.totalTimerTime || lap.totalElapsedTime || lap.elapsed_time,
            distance: lap.totalDistance || lap.distance,
            power: lap.avgPower || lap.average_watts
          });
          return; // Skip this duplicate
        }
        seen.set(key, true);
        unique.push(lap);
        return;
      }
      
      // Strategy 2: Use _id if available
      if (lap._id) {
        const idStr = lap._id.toString();
        if (seen.has(`id_${idStr}`)) {
          console.warn(`LapsTable: Duplicate lap by _id at index ${index}`);
          return; // Skip this duplicate
        }
        seen.set(`id_${idStr}`, true);
        unique.push(lap);
        return;
      }
      
      // Strategy 3: Use combination of properties (without index to detect true duplicates)
      const elapsedTime = lap.moving_time || lap.totalTimerTime || lap.totalElapsedTime || lap.total_elapsed_time || lap.elapsed_time || 0;
      const distance = lap.totalDistance || lap.total_distance || lap.distance || 0;
      const power = lap.avgPower || lap.avg_power || lap.average_watts || 0;
      const hr = lap.avgHeartRate || lap.avg_heart_rate || lap.average_heartrate || 0;
      
      // Create a key without index - if two laps have same values, they're duplicates
      const key = `t${Math.round(elapsedTime)}_d${Math.round(distance)}_p${Math.round(power)}_hr${Math.round(hr)}`;
      
      if (seen.has(key)) {
        console.warn(`LapsTable: Duplicate lap at index ${index}:`, {
          index,
          elapsedTime,
          distance,
          power,
          hr,
          existingIndex: seen.get(key)
        });
        return; // Skip this duplicate
      }
      seen.set(key, index); // Store index for reference
      unique.push(lap);
    });
    
    if (unique.length !== training.laps.length) {
      console.log(`LapsTable: Removed ${training.laps.length - unique.length} duplicate laps. Original: ${training.laps.length}, Unique: ${unique.length}`);
    }
    
    return unique;
  }, [training]);

  const lapRefs = useRef({});
  const tableContainerRef = useRef(null);

  useEffect(() => {
    if (selectedLapNumber == null) return;
    const el = lapRefs.current[selectedLapNumber];
    const container = tableContainerRef.current;
    if (!el || !container) return;
    // Manual scroll: center the selected row within the scrollable container
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relativeTop = elRect.top - containerRect.top;
    const centerOffset = relativeTop - container.clientHeight / 2 + elRect.height / 2;
    container.scrollBy({ top: centerOffset, behavior: 'smooth' });
  }, [selectedLapNumber]);

  if (!training || !training.laps || uniqueLaps.length === 0) return null;

  const handleLactateSaved = async (trainingId) => {
    if (onUpdate) await onUpdate(trainingId);
    setLactateSaved(true);
    setTimeout(() => setLactateSaved(false), 3000);
  };

  if (isMobile) {
    const scrollClass = fullHeight ? LAPS_LIST_FULL_CLASS : LAPS_LIST_SCROLL_CLASS;
    return (
      <div>
        <LactateModal
          isOpen={lactateModalOpen}
          onClose={() => { setLactateModalOpen(false); setInitialLapIndex(null); }}
          training={training}
          user={user}
          onSaved={handleLactateSaved}
          initialLapIndex={initialLapIndex}
        />

        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-gray-900">
            Laps
            {lactateSaved && <span className="ml-2 text-xs font-normal text-green-600">✓ Saved</span>}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportLapsCSV(uniqueLaps, training, user)}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              title="Export laps as CSV"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (onOpenLactateForm) { onOpenLactateForm(null); }
                else { setInitialLapIndex(null); setLactateModalOpen(true); }
              }}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium shadow-sm transition-colors active:bg-primary-dark"
            >
              Add Lactate
            </button>
          </div>
        </div>

        {/* Lap bar overview */}
        <LapsBarChart
          laps={uniqueLaps}
          selectedLapNumber={selectedLapNumber}
          onSelect={onSelectLapNumber}
          sport={training?.sport}
        />

        <div ref={tableContainerRef} className={`${scrollClass} rounded-xl border border-gray-200 bg-white`}>
          <div className="divide-y divide-gray-100">
            {uniqueLaps.map((lap, index) => {
              const lapNumber = lap?.lapNumber ?? (index + 1);
              const isSelected = selectedLapNumber != null && String(lapNumber) === String(selectedLapNumber);
              const time = formatDuration(lap.moving_time || lap.totalTimerTime || lap.totalElapsedTime || lap.elapsed_time);
              const distanceMeters =
                lap.totalDistance ?? lap.total_distance ?? lap.distance ?? lap.distanceMeters ?? lap.distance_meters ?? 0;
              const dist = formatDistance(distanceMeters, user, { swim: isSwim, assumeMeters: true });

              const speedMps =
                lap.avgSpeed ?? lap.average_speed ?? lap.avg_speed ?? lap.averageSpeed ?? lap.speed ?? null;

              const pace = isRun
                ? formatPace(speedMps)
                : isSwim
                  ? formatSwimPace(speedMps)
                  : formatSpeed(speedMps, user);

              const hr =
                lap.avgHeartRate ?? lap.avg_heart_rate ?? lap.average_heartrate ?? lap.averageHeartRate ?? lap.heartRate ?? 0;

              const power =
                lap.avgPower ?? lap.avg_power ?? lap.average_watts ?? lap.averageWatts ?? 0;

              const cadence =
                lap.avgCadence ?? lap.avg_cadence ?? lap.average_cadence ?? lap.averageCadence ?? lap.cadence ?? 0;

              const elevationGain = lap.total_elevation_gain ?? lap.elevation_gain ?? lap.totalAscent ?? lap.total_ascent ?? null;
              const elevationLoss = lap.total_descent ?? lap.elevation_loss ?? lap.descent ?? null;
              let elevation = null;
              if (Number.isFinite(Number(elevationGain)) && Number.isFinite(Number(elevationLoss))) {
                elevation = Math.round(Number(elevationGain) - Number(elevationLoss));
              } else if (Number.isFinite(Number(elevationGain))) {
                elevation = Math.round(Number(elevationGain));
              } else if (Number.isFinite(Number(elevationLoss))) {
                elevation = -Math.round(Math.abs(Number(elevationLoss)));
              }

              return (
                <button
                  key={index}
                  ref={el => { lapRefs.current[lapNumber] = el; }}
                  onClick={() => onSelectLapNumber && onSelectLapNumber(isSelected ? null : lapNumber)}
                  className={`w-full text-left px-3 py-3.5 flex items-center gap-3 transition-colors touch-manipulation ${
                    isSelected
                      ? 'bg-primary/10 border-l-[3px] border-primary'
                      : lap.lactate
                        ? 'bg-primary/5'
                        : 'active:bg-gray-50'
                  }`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {/* Lap number */}
                  <div className="w-8 shrink-0 text-center">
                    <span className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-gray-400'}`}>
                      {index + 1}
                    </span>
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      {dist && dist !== '0 m' && dist !== '0.0 km' && (
                        <span className="text-base font-bold text-gray-900">{dist}</span>
                      )}
                      <span className="text-base font-semibold text-gray-600">{time}</span>
                      {pace && pace !== '-' && (
                        <span className="text-sm text-gray-500">{pace}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {hr > 0 && (
                        <span className="text-xs font-medium text-red-500">♥ {Math.round(hr)} bpm</span>
                      )}
                      {!isSwim && power > 0 && (
                        <span className="text-xs font-medium text-purple-600">{Math.round(power)} W</span>
                      )}
                      {isSwim && cadence > 0 && (
                        <span className="text-xs font-medium text-gray-600">{Math.round(cadence)} rpm</span>
                      )}
                      {elevation !== null && elevation !== 0 && (
                        <span className="text-xs font-medium text-emerald-600">{elevation > 0 ? '+' : ''}{elevation} m</span>
                      )}
                      {lap.lactate && (
                        <span className="text-xs font-bold text-primary">{lap.lactate.toFixed(1)} mmol/L</span>
                      )}
                    </div>
                  </div>

                  {/* Lactate add button */}
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation();
                      if (onOpenLactateForm) { onOpenLactateForm(index); }
                      else { setInitialLapIndex(index); setLactateModalOpen(true); }
                    }}
                    className="shrink-0 px-2 py-1 rounded-lg border border-gray-200 text-[10px] font-semibold text-gray-500 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors touch-manipulation"
                  >
                    {lap.lactate ? lap.lactate.toFixed(1) : '+ La'}
                  </button>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <LactateModal
        isOpen={lactateModalOpen}
        onClose={() => setLactateModalOpen(false)}
        training={training}
        user={user}
        onSaved={handleLactateSaved}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900">Intervals</h3>
          {lactateSaved && <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Lactate saved</span>}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => exportLapsCSV(uniqueLaps, training, user)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            title="Export intervals as CSV"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => { if (onOpenLactateForm) { onOpenLactateForm(null); } else { setLactateModalOpen(true); } }}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-xl hover:bg-primary-dark text-xs sm:text-sm shadow-md transition-colors"
          >
            Add Lactate
          </button>
        </div>
      </div>

      {/* Lap bar overview */}
      <LapsBarChart
        laps={uniqueLaps}
        selectedLapNumber={selectedLapNumber}
        onSelect={onSelectLapNumber}
        sport={training?.sport}
      />

      <div
        ref={tableContainerRef}
        className={`${fullHeight ? LAPS_LIST_FULL_CLASS : LAPS_LIST_SCROLL_CLASS} rounded-2xl border border-white/40 bg-white/60 backdrop-blur-sm shadow-lg -mx-2 sm:mx-0 min-h-0`}
      >
        <table className="min-w-full divide-y divide-gray-200/50">
          <thead className="bg-white/80 backdrop-blur-sm sticky top-0 z-10">
            <tr>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">#</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Time</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Distance</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">
                {(isRun || isSwim) ? 'Avg Pace' : 'Avg Speed'}
              </th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Avg HR</th>
              {!isSwim && (
                <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Avg Power</th>
              )}
              {isSwim && (
                <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Avg Cadence</th>
              )}
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Elevation</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-600 uppercase">Lactate</th>
            </tr>
          </thead>
          <tbody className="bg-white/40 backdrop-blur-sm divide-y divide-gray-200/30">
            {uniqueLaps.map((lap, index) => {
              const lapNumber = lap?.lapNumber ?? (index + 1);
              const isSelected = selectedLapNumber != null && String(lapNumber) === String(selectedLapNumber);

              const distanceMeters =
                lap.totalDistance ??
                lap.total_distance ??
                lap.distance ??
                lap.distanceMeters ??
                lap.distance_meters ??
                0;
              const speedMps =
                lap.avgSpeed ??
                lap.average_speed ??
                lap.avg_speed ??
                lap.averageSpeed ??
                lap.speed ??
                null;
              const hr =
                lap.avgHeartRate ??
                lap.avg_heart_rate ??
                lap.average_heartrate ??
                lap.averageHeartRate ??
                lap.heartRate ??
                0;
              const power =
                lap.avgPower ??
                lap.avg_power ??
                lap.average_watts ??
                lap.averageWatts ??
                0;

              const cadence =
                lap.avgCadence ??
                lap.avg_cadence ??
                lap.average_cadence ??
                lap.averageCadence ??
                lap.cadence ??
                0;

              const elevationGain = lap.total_elevation_gain ?? lap.elevation_gain ?? lap.totalAscent ?? lap.total_ascent ?? null;
              const elevationLoss = lap.total_descent ?? lap.elevation_loss ?? lap.descent ?? null;
              let elevation = null;
              if (Number.isFinite(Number(elevationGain)) && Number.isFinite(Number(elevationLoss))) {
                elevation = Math.round(Number(elevationGain) - Number(elevationLoss));
              } else if (Number.isFinite(Number(elevationGain))) {
                elevation = Math.round(Number(elevationGain));
              } else if (Number.isFinite(Number(elevationLoss))) {
                elevation = -Math.round(Math.abs(Number(elevationLoss)));
              }

              const paceCell = isRun
                ? formatPace(speedMps)
                : isSwim
                  ? formatSwimPace(speedMps)
                  : formatSpeed(speedMps, user);

              return (
              <tr
                key={index}
                onClick={() => onSelectLapNumber && onSelectLapNumber(lapNumber)}
                ref={(el) => { if (el) lapRefs.current[lapNumber] = el; }}
                className={`transition-colors hover:bg-white/60 cursor-pointer ${lap.lactate ? 'bg-primary/10' : ''} ${isSelected ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}
              >
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-900">{index + 1}</td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">{formatDuration(lap.moving_time || lap.totalTimerTime || lap.totalElapsedTime || lap.elapsed_time)}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">
                    {formatDistance(distanceMeters, user, { swim: isSwim, assumeMeters: true })}
                  </td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">
                  {paceCell}
                </td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">{hr > 0 ? `${Math.round(hr)} bpm` : '-'}</td>
                {!isSwim && (
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">{power > 0 ? `${Math.round(power)} W` : '-'}</td>
                )}
                {isSwim && (
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">{cadence > 0 ? `${Math.round(cadence)} rpm` : '-'}</td>
                )}
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-700">
                  {elevation !== null && elevation !== 0 ? `${elevation > 0 ? '+' : ''}${elevation} m` : '-'}
                </td>
                <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                  <span
                    className={lap.lactate ? 'font-semibold text-primary-dark' : 'text-gray-400 cursor-pointer hover:text-primary transition-colors'}
                    onClick={(e) => { e.stopPropagation(); if (onOpenLactateForm) { onOpenLactateForm(index); } else { setInitialLapIndex(index); setLactateModalOpen(true); } }}
                    title={lap.lactate ? undefined : 'Click to add lactate'}
                  >
                    {lap.lactate ? `${lap.lactate.toFixed(1)} mmol/L` : '+ add'}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LapsTable;

