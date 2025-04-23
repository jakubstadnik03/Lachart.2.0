import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

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
  const scrollContainerRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  useEffect(() => {
    if (dates && dates.length > 0) {
      const sortedDates = [...dates].sort((a, b) => new Date(b) - new Date(a));
      const latestDate = sortedDates[0];
      
      if (!selectedDate || !dates.includes(selectedDate)) {
        setSelectedDate(latestDate);
        onSelectDate(latestDate);
      }
    } else {
      setSelectedDate(null);
    }
  }, [dates]);

  useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
        setShowLeftArrow(scrollLeft > 0);
        setShowRightArrow(scrollLeft < scrollWidth - clientWidth);
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      checkScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', checkScroll);
      }
    };
  }, [dates]);

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    onSelectDate(date);
  };

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200; // adjust this value as needed
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const sortedDates = [...(dates || [])].sort((a, b) => new Date(b) - new Date(a));

  return (
    <div className="relative w-full">
      <div className="text-xl font-semibold text-black mb-2">
        Previous testings
      </div>
      
      <div className="relative">
        {showLeftArrow && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white p-1 rounded-full shadow-md"
            aria-label="Scroll left"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </motion.button>
        )}

        <div
          ref={scrollContainerRef}
          className="flex gap-1.5 items-center py-1.5 pr-1 pl-1.5 mt-2 text-xs whitespace-nowrap rounded-md bg-zinc-150 text-stone-500 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
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

        {showRightArrow && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white p-1 rounded-full shadow-md"
            aria-label="Scroll right"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </motion.button>
        )}
      </div>
    </div>
  );
}

export default DateSelector;
