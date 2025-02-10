import React, { useState, useEffect } from "react";

function DateButton({ date, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Select date ${date}`}
      aria-pressed={isSelected}
      className={`px-3 py-1.5 my-auto rounded-md transition-colors whitespace-nowrap
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
      setSelectedDate(dates[0]);
      onSelectDate(dates[0]);
    }
  }, [dates, selectedDate, onSelectDate]);

  const handleDateSelect = (date) => {
    console.log("Date clicked:", date);
    setSelectedDate(date);
    onSelectDate(date);
  };

  return (
    <div
      className="flex flex-col text-center rounded-md ml-5"
      style={{ width: `${dates.length * 84}px` }}
      role="region"
      aria-label="Previous testing dates"
    >
      <div className="self-start text-xl font-semibold text-black">
        Previous testings
      </div>
      <div className="flex gap-1.5 items-center py-1.5 pr-1 pl-1.5 mt-2 text-xs whitespace-nowrap rounded-md bg-zinc-150 text-stone-500 overflow-x-auto">
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
