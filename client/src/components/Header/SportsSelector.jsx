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
      className="gap-3 self-stretch px-3 py-1.5 my-auto rounded-md cursor-pointer"
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
    <div className="flex gap-1.5 items-center self-stretch p-1.5 my-auto ml-5 text-xs text-center whitespace-nowrap rounded-md bg-zinc-100 min-w-[240px] text-stone-500 w-[247px]">
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