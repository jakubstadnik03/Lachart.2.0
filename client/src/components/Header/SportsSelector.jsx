"use client";
import React, { useEffect, useState } from 'react';
import { getMockTests } from '../../mock/mockApi';

function SportButton({ sport, isSelected, onClick }) {
  // Převod názvu sportu na správný formát
  const formatSportName = (sport) => {
    if (sport === 'all') return 'All Sports';
    const sportNames = {
      'run': 'Running',
      'bike': 'Cycling',
      'swim': 'Swimming'
    };
    return sportNames[sport] || sport;
  };

  return (
    <div
      className="flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-md cursor-pointer text-center"
      onClick={() => onClick(sport)}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      style={{
          backgroundColor: isSelected ? "#FCFCFC" : "#F3F3F3",
          color: "#686868",
      }}
    >
      {formatSportName(sport)}
    </div>
  );
}

const SportsSelector = ({ onSportChange }) => {
  const [availableSports, setAvailableSports] = useState([]);
  const [selectedSport, setSelectedSport] = useState("all");

  useEffect(() => {
    const allTests = getMockTests();
    // Získej unikátní sporty z testů a seřaď je podle preferovaného pořadí
    const uniqueSports = [...new Set(allTests.map(test => test.sport))];
    const orderedSports = ['all'];
    
    // Přidej sporty v požadovaném pořadí, pokud existují v datech
    ['bike', 'run', 'swim'].forEach(sport => {
      if (uniqueSports.includes(sport)) {
        orderedSports.push(sport);
      }
    });
    
    setAvailableSports(orderedSports);
  }, []);

  const handleSportSelect = (sport) => {
    setSelectedSport(sport);
    onSportChange(sport);
  };

  return (
    <div className="flex gap-1 sm:gap-1.5 items-center p-1.5 rounded-md bg-zinc-100 w-full sm:w-auto min-w-[240px] text-stone-500">
      {availableSports.map((sport) => (
        <SportButton
          key={sport}
          sport={sport}
          isSelected={selectedSport === sport}
          onClick={handleSportSelect}
        />
      ))}
    </div>
  );
};

export default SportsSelector;