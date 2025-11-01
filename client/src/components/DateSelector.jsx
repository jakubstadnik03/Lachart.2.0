import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

// Custom hook for window width
function useWindowWidth() {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return windowWidth;
}

function DateButton({ date, isSelected, onClick }) {
  const windowWidth = useWindowWidth();

  const formatDate = () => {
    const dateObj = new Date(date);
    if (windowWidth < 640) {
      // Mobile: "Jan 15"
      return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      // Desktop: "Jan 15, 2024"
      return dateObj.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  return (
    <button
      onClick={onClick}
      aria-label={`Select date ${date}`}
      aria-pressed={isSelected}
      className={`px-2 sm:px-3 py-1.5 sm:py-2 my-auto rounded-md transition-colors whitespace-nowrap text-xs sm:text-sm touch-manipulation min-w-[60px] sm:min-w-[90px] text-center flex-shrink-0
        ${isSelected ? "bg-zinc-50 font-semibold shadow-sm ring-1 ring-zinc-300" : "hover:bg-zinc-50 focus:bg-zinc-50 active:bg-zinc-50"}`}
    >
      {formatDate()}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates]);

  useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
        const hasScroll = scrollWidth > clientWidth;
        setShowLeftArrow(hasScroll && scrollLeft > 10);
        setShowRightArrow(hasScroll && scrollLeft < scrollWidth - clientWidth - 10);
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      // Check on mount and when dates change
      checkScroll();
      
      // Use ResizeObserver to detect container size changes
      const resizeObserver = new ResizeObserver(checkScroll);
      resizeObserver.observe(container);
      
      // Listen to scroll events
      container.addEventListener('scroll', checkScroll, { passive: true });
      
      // Also check after a short delay to ensure layout is complete
      const timeoutId = setTimeout(checkScroll, 100);

      return () => {
        container.removeEventListener('scroll', checkScroll);
        resizeObserver.disconnect();
        clearTimeout(timeoutId);
      };
    }
  }, [dates]);

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    onSelectDate(date);
  };

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      // Use container width as scroll amount for better UX
      const scrollAmount = scrollContainerRef.current.clientWidth * 0.8;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const sortedDates = [...(dates || [])].sort((a, b) => new Date(b) - new Date(a));

  return (
    <div className="relative w-full">
      <div className="text-lg sm:text-xl font-semibold text-black mb-2 sm:mb-3">
        Previous testings
      </div>
      
      <div className="relative">
        {showLeftArrow && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white active:bg-white p-1.5 sm:p-1 rounded-full shadow-md touch-manipulation min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </motion.button>
        )}

        <div
          ref={scrollContainerRef}
          className="flex gap-1 sm:gap-1.5 items-center py-1.5 sm:py-2 pr-2 sm:pr-1 pl-2 sm:pl-1.5 mt-2 text-xs sm:text-sm whitespace-nowrap rounded-md bg-zinc-100 sm:bg-zinc-150 text-stone-500 sm:text-stone-600 overflow-x-auto scrollbar-hide touch-pan-x snap-x snap-mandatory"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorX: 'contain'
          }}
        >
          {!dates || dates.length === 0 ? (
            <p className="px-2 sm:px-3 text-xs sm:text-sm">No tests available</p>
          ) : (
            sortedDates.map((date) => (
              <div key={date} className="snap-start flex-shrink-0">
                <DateButton
                  date={date}
                  isSelected={date === selectedDate}
                  onClick={() => handleDateSelect(date)}
                />
              </div>
            ))
          )}
        </div>

        {showRightArrow && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white active:bg-white p-1.5 sm:p-1 rounded-full shadow-md touch-manipulation min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Scroll right"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </motion.button>
        )}
      </div>
    </div>
  );
}

export default DateSelector;
