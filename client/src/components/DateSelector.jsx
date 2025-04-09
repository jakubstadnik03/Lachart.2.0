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
      {new Date(date).toLocaleDateString()}
    </button>
  );
}

function DateSelector({ dates, onSelectDate }) {
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (dates && dates.length > 0) {
      // Seřaď data sestupně a vyber nejnovější při prvním načtení nebo změně seznamu dat
      const sortedDates = [...dates].sort((a, b) => new Date(b) - new Date(a));
      const latestDate = sortedDates[0];
      
      // Nastav vybrané datum pouze pokud ještě není vybráno žádné
      // nebo pokud aktuálně vybrané datum není v novém seznamu dat
      if (!selectedDate || !dates.includes(selectedDate)) {
        setSelectedDate(latestDate);
        onSelectDate(latestDate);
      }
    } else {
      setSelectedDate(null);
    }
  }, [dates]);

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    onSelectDate(date);
  };

  // Seřaď data sestupně pro zobrazení
  const sortedDates = [...(dates || [])].sort((a, b) => new Date(b) - new Date(a));

  return (
    <div
      className="flex flex-col text-center rounded-md ml-5"
      style={{ width: `${dates?.length * 84 + 4}px` }}
      role="region"
      aria-label="Previous testing dates"
    >
      <div className="self-start text-xl font-semibold text-black">
        Previous testings
      </div>
      <div className="flex gap-1.5 items-center py-1.5 pr-1 pl-1.5 mt-2 text-xs whitespace-nowrap rounded-md bg-zinc-150 text-stone-500">
        {!dates || dates.length === 0 ? (
          <p>No tests available</p>
        ) : (
          sortedDates.map((date) => (
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
