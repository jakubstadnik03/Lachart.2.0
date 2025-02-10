import React, { useState, useEffect } from "react";

function DateButton({ date, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Select date ${date}`}
      aria-pressed={isSelected}
      className={`gap-3 self-stretch px-3 py-1.5 my-auto rounded-md transition-colors
        ${isSelected ? "bg-zinc-50" : "hover:bg-zinc-50 focus:bg-zinc-50"}`}
    >
      {date}
    </button>
  );
}

function DateSelector({ dates, onSelectDate }) {
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (dates.length > 0 && selectedDate === null) {
      // Pokud není vybráno žádné datum, nastavíme první
      setSelectedDate(dates[0]);
      onSelectDate(dates[0]);
    }
  }, [dates, selectedDate, onSelectDate]);

  const handleDateSelect = (date) => {
    console.log("Date clicked:", date);  // Logování kliknutého data
    setSelectedDate(date);
    onSelectDate(date); // Předáme vybraný datum rodičovské komponentě
  };

  return (
    <div
      className="flex flex-col max-w-full text-center rounded-md w-[254px] ml-5"
      role="region"
      aria-label="Previous testing dates"
    >
      <div className="self-start text-xl font-semibold text-black">
        Previous testings
      </div>
      <div className="flex gap-1.5 items-center py-1.5 pr-1 pl-1.5 mt-2 w-full text-xs whitespace-nowrap rounded-md bg-zinc-150 text-stone-500">
        {dates.length === 0 ? (
          <p>Loading...</p>
        ) : (
          dates.map((date) => (
            <DateButton
              key={date}
              date={date}
              isSelected={date === selectedDate}
              onClick={() => handleDateSelect(date)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default DateSelector;
