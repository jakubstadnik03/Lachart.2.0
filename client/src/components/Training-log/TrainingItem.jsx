import React, { useState } from 'react';

const TrainingItem = ({ training, isExpanded = false, onToggleExpand }) => {
  if (!training) return null;
  const { date, title, specifics, comments, results, sport, description } = training;

  const getSportIcon = (sport) => {
    switch (sport) {
      case 'run':
        return 'icon/run.svg';
      case 'bike':
        return 'icon/bike.svg';
      case 'swim':
        return 'icon/swim.svg';
      default:
        return 'icon/default.svg';
    }
  };
  const getStatusIcon = (status) => {
    const icons = {
      up: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/ca42b61d339a69e3bb2cc02efb61369c67cfc2f39658e99e5d576df14fcdfcd9?",
      down: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/03f5e1c239b86d526fe7a81e7008e0b47bb861a21531b26f903e6750497c90ce?",
      same: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/5624a86d3c88d3562872dd0f15221eca4dabce973c1983cf98dd06cde908b9ee?"
    };
    return icons[status];
  };
  const getLactateStatus = (current, previous) => {
    if (previous === undefined) return "same"; // První hodnota nemá s čím srovnat
    return current > previous ? "up" : current < previous ? "down" : "same";
  };
  
  const getPowerUnit = (sport) => {
    switch (sport) {
      case 'run':
        return '/km';
      case 'swim':
        return '/100m';
      case 'bike':
        return 'W';
      default:
        return '';
    }
  };

  // Funkce pro převod sekund na formát MM:SS
  const formatSecondsToMMSS = (seconds) => {
    if (!seconds) return "";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Funkce pro formátování power/pace podle typu sportu
  const formatPower = (power, sport) => {
    if (!power) return "";
    if (sport === 'bike') {
      return `${power}W`;
    } else {
      // Pro run a swim převedeme sekundy na MM:SS
      return formatSecondsToMMSS(power);
    }
  };

  const renderIntervalsHeader = () => (
    <div className="grid grid-cols-5 sm:grid-cols-5 gap-1 sm:gap-2 justify-items-center w-full items-center py-2 bg-gray-50 text-gray-600 text-xs sm:text-sm font-medium border-b border-gray-200">
      <div className="text-center w-8">#</div>
      <div className="text-center w-12 sm:w-16">Power {getPowerUnit(sport)}</div>
      <div className="w-16">HR (bpm)</div>
      <div className="w-12">RPE</div>
      <div className="w-12 sm:w-16">Lactate</div>
    </div>
  );

  const renderWorkoutRow = (workout, index, array) => {
    const isLastRow = index === array.length - 1;
    const borderClass = isLastRow ? '' : 'border-solid border-b-[0.3px] border-b-[#686868]';
    
    const prevLactate = index > 0 ? array[index - 1].lactate : undefined;
    const lactateStatus = getLactateStatus(workout.lactate, prevLactate);
    const lactateIcon = lactateStatus !== "same" ? getStatusIcon(lactateStatus) : null;
  
    const efficiencyColor = lactateStatus === "down" 
      ? "text-red-700 bg-red-600"
      : lactateStatus === "up"
      ? "text-green-600 bg-green-600"
      : "text-gray-500 bg-gray-400";
  
    return (
      <div key={workout.interval} className={`grid grid-cols-5 sm:grid-cols-5 gap-1 sm:gap-2 justify-items-center w-full items-center py-1.5 ${borderClass} text-[#686868] text-sm sm:text-base`}>
        <div className="text-center w-8">{workout.interval}</div>
        <div className="text-center w-12 sm:w-16">{workout.power}</div>
        <div className="flex gap-0.5 items-center w-16">
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/a8b365ad7ccf1466c38d227be8da3cc68edda93357cc91f89de840d723c70bb4?"
            className="w-3 h-3 sm:w-4 sm:h-4"
            alt=""
          />
          <div>{workout.heartRate}</div>
        </div>
        <div className="flex gap-0.5 items-center text-blue-500 w-12">
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/560435bfa3d998398c37040f6c6463c35a70154d9fd9cd3f0f8d73ae6ed91ab4?"
            className="w-3 h-3 sm:w-4 sm:h-4"
            alt=""
          />
          <div>{workout.RPE}</div>
        </div>
        <div className={`flex gap-1 items-center p-1 w-12 sm:w-16 text-xs justify-center ${efficiencyColor} bg-opacity-10 rounded-md`}>
          {lactateIcon && <img
            loading="lazy"
            src={lactateIcon}
            className="w-2 h-2 sm:w-3 sm:h-3"
            alt=""
          />}
          <div>{workout.lactate}</div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="flex flex-col w-full bg-white rounded-lg shadow-sm mb-4 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header - vždy viditelný - upravený pro lepší zarovnání s hlavičkou tabulky */}
      <div 
        className="grid grid-cols-3 sm:grid-cols-8 gap-2 p-4 items-center cursor-pointer hover:bg-gray-50"
        onClick={onToggleExpand}
      >
        <div className="text-sm">{date}</div>
        <div className="flex justify-center">
          <img
            src={getSportIcon(sport)}
            className="w-6 h-6 sm:w-8 sm:h-8"
            alt={sport}
          />
        </div>
        <div className="text-sm font-medium truncate">{title}</div>
        
        {/* Detaily viditelné pouze na větších obrazovkách */}
        <div className="hidden sm:flex col-span-3 items-center justify-center">
          {results.length} intervals
        </div>
        <div className="hidden sm:block truncate">{specifics.specific}</div>
        <div className="hidden sm:block truncate">{specifics.weather}</div>
      </div>

      {/* Expandovaný obsah */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {/* Popis tréninku - přidáno */}
          {description && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-1">Description:</h4>
              <p className="text-gray-700">{description}</p>
            </div>
          )}
          
          {/* Intervaly s hlavičkou */}
          <div className="space-y-0.5">
            {renderIntervalsHeader()}
            {results.map((workout, index, array) => renderWorkoutRow(workout, index, array))}
          </div>
          
          {/* Dodatečné informace - nyní pro všechny velikosti obrazovek */}
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">Terrain/Pool:</span>
              <span>{specifics.specific}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Weather:</span>
              <span>{specifics.weather}</span>
            </div>
            {comments && (
              <div className="flex flex-col">
                <span className="font-medium">Comments:</span>
                <span className="text-gray-600">{comments}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingItem;
