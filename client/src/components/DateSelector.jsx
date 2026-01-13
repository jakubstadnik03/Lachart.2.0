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

function DateSelector({ tests, onSelectTest, selectedTestId }) {
  // tests should be array of objects: [{ date, _id }, ...]
  const [selectedId, setSelectedId] = useState(selectedTestId || null);
  const scrollContainerRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640; // sm breakpoint
  const PAGE_SIZE = 4;
  const [page, setPage] = useState(0); // only for mobile

  // Update selectedId when selectedTestId prop changes
  useEffect(() => {
    if (selectedTestId) {
      setSelectedId(selectedTestId);
    }
  }, [selectedTestId]);

  useEffect(() => {
    if (tests && tests.length > 0) {
      // Sort tests by date (newest first)
      const sortedTests = [...tests].sort((a, b) => new Date(b.date) - new Date(a.date));
      const latestTest = sortedTests[0];
      if (!selectedId || !tests.find(t => t._id === selectedId)) {
        setSelectedId(latestTest._id);
        onSelectTest(latestTest._id);
      }
      if (isMobile) setPage(0);
    } else {
      setSelectedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, isMobile]);

  useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
        const hasScroll = scrollWidth > clientWidth;
        // On desktop, only show arrows if there's actual scrolling needed
        if (!isMobile) {
          setShowLeftArrow(hasScroll && scrollLeft > 10);
          setShowRightArrow(hasScroll && scrollLeft < scrollWidth - clientWidth - 10);
        } else {
          // On mobile, use the page-based logic
          setShowLeftArrow(false);
          setShowRightArrow(false);
        }
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      // Check on mount and when tests change
      checkScroll();
      
      // Use ResizeObserver to detect container size changes
      const resizeObserver = new ResizeObserver(checkScroll);
      resizeObserver.observe(container);
      
      // Listen to scroll events (only on desktop)
      if (!isMobile) {
        container.addEventListener('scroll', checkScroll, { passive: true });
      }
      
      // Also check after a short delay to ensure layout is complete
      const timeoutId = setTimeout(checkScroll, 100);

      return () => {
        if (!isMobile) {
          container.removeEventListener('scroll', checkScroll);
        }
        resizeObserver.disconnect();
        clearTimeout(timeoutId);
      };
    }
  }, [tests, isMobile]);

  const handleTestSelect = (testId) => {
    setSelectedId(testId);
    onSelectTest(testId);
  };

  // Sort tests by date (newest first) and get visible tests for mobile pagination
  const sortedTests = [...(tests || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  let visibleTests = sortedTests;
  if(isMobile && sortedTests.length > PAGE_SIZE) {
    const start = page * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    visibleTests = sortedTests.slice(start, end);
  }

  // Šipky pro stránkování na mobilu (přepis stávajících podmínek pro showLeftArrow/showRightArrow jen na mobilu)
  const customShowLeftArrow = isMobile && page > 0;
  const customShowRightArrow = isMobile && ((page+1) * PAGE_SIZE < sortedTests.length);

  // Animace stránky (framer-motion direction)
  const [direction, setDirection] = useState(0); // -1 (left), 1 (right)

  const scrollPage = (dir) => {
    if (dir === 'left' && page > 0) {
      setDirection(-1);
      setPage(page - 1);
    }
    if (dir === 'right' && (page + 1) * PAGE_SIZE < sortedTests.length) {
      setDirection(1);
      setPage(page + 1);
    }
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

  return (
    <div className="relative w-full">
      <div className="text-lg sm:text-xl font-semibold text-black mb-2 sm:mb-3">Previous testings</div>
      <div className="relative">
        {/* Vlevo */}
        {((isMobile && customShowLeftArrow) || (!isMobile && showLeftArrow)) && (
          <motion.button
            whileHover={{ scale: 1.14 }}
            onClick={() => {
              isMobile ? scrollPage('left') : scroll('left');
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 p-1.5 sm:p-1 rounded-full shadow-md touch-manipulation min-w-[40px] min-h-[40px] flex items-center justify-center transition origin-center hover:bg-white active:bg-white"
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </motion.button>
        )}
        {/* Datumy */}
        <div
          ref={scrollContainerRef}
          className={
            'flex gap-1 sm:gap-1.5 items-center py-1.5 sm:py-2 mt-2 text-xs sm:text-sm whitespace-nowrap rounded-md bg-zinc-100 sm:bg-zinc-150 text-stone-500 sm:text-stone-600 overflow-x-auto scrollbar-hide touch-pan-x snap-x snap-mandatory relative ' +
            (isMobile ? 'pl-[52px] pr-[52px] justify-center' : 'pr-2 sm:pr-1 pl-2 sm:pl-1.5')
          }
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorX: 'contain'
          }}
        >
          {!tests || tests.length === 0 ? (
            <p className="px-2 sm:px-3 text-xs sm:text-sm">No tests available</p>
          ) : (
            <motion.div
              key={page}
              initial={{ x: isMobile && direction !== 0 ? (direction > 0 ? 90 : -90) : 0, opacity: isMobile && direction !== 0 ? 0 : 1 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: isMobile && direction !== 0 ? (direction > 0 ? -90 : 90) : 0, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.29 }}
              className="flex gap-1 sm:gap-1.5 items-center w-full"
              style={{ minHeight: '32px' }}
            >
              {visibleTests.map((test) => (
                <div key={test._id} className="snap-start flex-shrink-0">
                  <DateButton
                    date={test.date}
                    isSelected={test._id === selectedId}
                    onClick={() => handleTestSelect(test._id)}
                  />
                </div>
              ))}
            </motion.div>
          )}
        </div>
        {/* Vpravo */}
        {((isMobile && customShowRightArrow) || (!isMobile && showRightArrow)) && (
          <motion.button
            whileHover={{ scale: 1.14 }}
            onClick={() => {
              isMobile ? scrollPage('right') : scroll('right');
            }}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 p-1.5 sm:p-1 rounded-full shadow-md touch-manipulation min-w-[40px] min-h-[40px] flex items-center justify-center transition origin-center hover:bg-white active:bg-white"
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
