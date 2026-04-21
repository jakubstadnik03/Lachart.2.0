"use client";
import React from 'react';

const SPORT_LABELS = {
  all: 'All',
  run: 'Running',
  bike: 'Cycling',
  swim: 'Swimming',
};

function SportButton({ sport, isSelected, onClick }) {
  const label = SPORT_LABELS[sport] || sport;
  return (
    <button
      type="button"
      className="flex-shrink-0 px-3 py-1.5 text-xs sm:text-sm rounded-md cursor-pointer whitespace-nowrap transition-colors"
      onClick={() => onClick(sport)}
      aria-pressed={isSelected}
      style={{
        backgroundColor: isSelected ? '#FCFCFC' : 'transparent',
        color: isSelected ? '#111827' : '#686868',
        boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

const SportsSelector = ({ sports = [], selectedSport = 'all', onSportChange }) => {
  // Derive sport IDs — accept both {id, name} objects and plain strings
  const sportIds = sports.map(s => (typeof s === 'string' ? s : s.id));

  return (
    <div
      className="flex gap-1 items-center p-1 rounded-lg bg-zinc-100 text-stone-500 overflow-x-auto"
      style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
    >
      {/* Hide native scrollbar on WebKit */}
      <style>{`.sports-selector-scroll::-webkit-scrollbar{display:none}`}</style>
      {sportIds.map((id) => (
        <SportButton
          key={id}
          sport={id}
          isSelected={selectedSport === id}
          onClick={onSportChange}
        />
      ))}
    </div>
  );
};

export default SportsSelector;