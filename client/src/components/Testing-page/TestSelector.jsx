import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthProvider';

const TestSelector = ({ tests = [], selectedTests = [], onTestSelect, selectedSport = 'all' }) => {
  const { user } = useAuth();
  const [localSportFilter, setLocalSportFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const testsPerPage = 3;
  
  // Get unitSystem from user profile
  const unitSystem = user?.units?.distance === 'imperial' ? 'imperial' : 'metric';
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Format pace for display (seconds to mm:ss)
  const formatPace = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Get pace unit based on unitSystem
  const getPaceUnit = () => {
    return unitSystem === 'imperial' ? '/mile' : '/km';
  };
  
  // Convert power to pace for running (simplified conversion)
  // This is a rough estimation - in reality, power to pace conversion depends on many factors
  const powerToPace = (power) => {
    if (!power || power <= 0 || isNaN(power)) return null;
    // Rough estimation: higher power = faster pace (lower seconds per km)
    // This is a simplified formula - adjust based on your needs
    // Example: 300W might be around 4:00/km, 200W around 5:00/km
    // Using a linear approximation: pace = 600 - (power * 0.5) seconds per km
    // This is just an example - you might want to use actual conversion tables
    const basePace = 600; // 10:00/km base
    const paceSeconds = Math.max(180, Math.min(600, basePace - (power * 0.5)));
    return paceSeconds;
  };
  
  // Get max value from test results
  const getMaxValue = (test) => {
    if (!test.results || test.results.length === 0) return null;
    
    if (test.sport === 'run') {
      // For running, convert power to pace and get minimum pace (fastest = best)
      const paces = test.results
        .map(r => r.power ? powerToPace(r.power) : null)
        .filter(p => p !== null);
      if (paces.length === 0) return null;
      const minPace = Math.min(...paces); // Minimum pace = fastest
      return formatPace(minPace);
    } else {
      // For bike/swim, get max power
      const powers = test.results
        .map(r => r.power)
        .filter(p => p !== null && p !== undefined && !isNaN(p));
      if (powers.length === 0) return null;
      return Math.max(...powers);
    }
  };
  
  // Ensure tests is an array
  const validTests = Array.isArray(tests) ? tests : [];
  
  // Filter by local sport filter
  const filteredBySport = localSportFilter === 'all' 
    ? validTests 
    : validTests.filter(test => test.sport === localSportFilter);
  
  // Sort by date (newest first)
  const sortedTests = [...filteredBySport].sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
  
  // Pagination or show all if expanded
  const startIndex = expanded ? 0 : (currentPage - 1) * testsPerPage;
  const endIndex = expanded ? sortedTests.length : startIndex + testsPerPage;
  const displayedTests = sortedTests.slice(startIndex, endIndex);
  
  const totalPages = Math.ceil(sortedTests.length / testsPerPage);
  const hasMore = sortedTests.length > testsPerPage;

  const handleTestSelect = (test) => {
    console.log('Test clicked:', test);
    console.log('Current selected tests:', selectedTests);
    
    if (!test || !test._id) {
      console.log('Invalid test or missing _id');
      return;
    }

    // Check if test is already selected
    const isSelected = selectedTests.some(t => t._id === test._id);
    console.log('Is test already selected?', isSelected);
    
    if (isSelected) {
      // Remove test from selection
      const newSelection = selectedTests.filter(t => t._id !== test._id);
      console.log('Removing test, new selection:', newSelection);
      onTestSelect(newSelection);
    } else {
      // Check if we can add this test (same sport)
      if (selectedTests.length === 0 || selectedTests[0].sport === test.sport) {
        const newSelection = [...selectedTests, test];
        console.log('Adding test, new selection:', newSelection);
        onTestSelect(newSelection);
      } else {
        console.log('Cannot add test - different sport');
        alert('You can only compare tests of the same sport type');
      }
    }
  };

  return (
    <div className={`bg-white ${isMobile ? 'rounded-lg' : 'rounded-xl'} shadow-sm ${isMobile ? 'p-3' : 'p-6'}`}>
      <div className={`flex ${isMobile ? 'flex-col' : 'justify-between items-center'} ${isMobile ? 'gap-2 mb-3' : 'mb-4'}`}>
        <h2 className={`${isMobile ? 'text-base' : 'text-xl'} font-semibold`}>Previous Tests</h2>
        <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} ${isMobile ? 'gap-2' : 'gap-4'}`}>
        <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500`}>
            Selected: {selectedTests.length}
          {selectedTests.length > 0 && selectedTests[0] && ` (${selectedTests[0].sport})`}
        </p>
          {/* Sport Filter */}
          <div className={`flex ${isMobile ? 'gap-1' : 'gap-2'} ${isMobile ? 'flex-wrap' : ''}`}>
            <button
              onClick={() => {
                setLocalSportFilter('all');
                setCurrentPage(1);
                setExpanded(false);
              }}
              className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} font-medium ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all ${
                localSportFilter === 'all'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => {
                setLocalSportFilter('run');
                setCurrentPage(1);
                setExpanded(false);
              }}
              className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} font-medium ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all ${
                localSportFilter === 'run'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Run
            </button>
            <button
              onClick={() => {
                setLocalSportFilter('bike');
                setCurrentPage(1);
                setExpanded(false);
              }}
              className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} font-medium ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all ${
                localSportFilter === 'bike'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Bike
            </button>
            <button
              onClick={() => {
                setLocalSportFilter('swim');
                setCurrentPage(1);
                setExpanded(false);
              }}
              className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} font-medium ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all ${
                localSportFilter === 'swim'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Swim
            </button>
          </div>
        </div>
      </div>
      
      {sortedTests.length === 0 ? (
        <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500 text-center ${isMobile ? 'py-2' : 'py-4'}`}>
          No tests found for {localSportFilter === 'all' ? 'any sport' : localSportFilter}
        </p>
      ) : (
        <>
        <div className={`${isMobile ? 'space-y-2' : 'space-y-4'}`}>
            {displayedTests.map((test) => {
              const maxValue = getMaxValue(test);
              return (
            <div 
              key={test._id} 
              onClick={() => handleTestSelect(test)}
              className={`border ${isMobile ? 'rounded-md p-2' : 'rounded-lg p-4'} cursor-pointer transition-colors
                ${selectedTests.some(t => t._id === test._id)
                  ? 'border-primary bg-primary/5' 
                  : selectedTests.length > 0 && selectedTests[0] && selectedTests[0].sport !== test.sport
                    ? 'border-gray-200 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-between'} ${isMobile ? 'gap-2' : ''}`}>
                <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'}`}>
                  <div className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gray-100 ${isMobile ? 'rounded-md' : 'rounded-lg'}`}>
                    <img
                      src={`/icon/${test.sport}.svg`}
                      alt={test.sport}
                      className={isMobile ? 'w-4 h-4' : 'w-5 h-5'}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`${isMobile ? 'text-sm' : 'text-base'} font-medium truncate`}>{test.description}</h3>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500`}>
                      {test.sport} • {new Date(test.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className={`flex items-center ${isMobile ? 'justify-between w-full' : 'gap-4'}`}>
                  <div className={`${isMobile ? 'text-left' : 'text-right'}`}>
                    <p className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium`}>
                      {maxValue !== null 
                        ? (test.sport === 'run' ? `${maxValue}${getPaceUnit()}` : `${Math.round(maxValue)}W`)
                        : 'N/A'}
                    </p>
                    <p className={`${isMobile ? 'text-[10px]' : 'text-xs'} text-gray-500`}>
                      {isMobile ? 'Base:' : 'Base Lactate:'} {test.baseLactate || 'N/A'}
                    </p>
                  </div>
                  <div className={`${isMobile ? 'w-5 h-5' : 'w-6 h-6'} rounded-full border-2 transition-colors flex-shrink-0
                    ${selectedTests.some(t => t._id === test._id)
                      ? 'border-primary bg-primary'
                      : 'border-gray-300'
                    }`}
                  >
                    {selectedTests.some(t => t._id === test._id) && (
                      <svg className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-white`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
          })}
        </div>
          
          {/* Pagination / Expand Controls */}
          {hasMore && !expanded && (
            <div className={`flex ${isMobile ? 'flex-col' : 'items-center justify-center'} ${isMobile ? 'gap-2' : 'gap-4'} ${isMobile ? 'mt-2' : 'mt-4'}`}>
              <button
                onClick={() => setExpanded(true)}
                className={`${isMobile ? 'px-3 py-1.5 text-xs w-full' : 'px-4 py-2 text-sm'} font-medium text-primary hover:text-primary-dark hover:bg-primary/10 ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all`}
              >
                Show All ({sortedTests.length} tests)
              </button>
              {totalPages > 1 && (
                <div className={`flex items-center ${isMobile ? 'justify-between w-full' : 'gap-2'}`}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={`${isMobile ? 'px-2.5 py-1 text-xs flex-1' : 'px-3 py-1.5 text-sm'} font-medium text-gray-700 bg-gray-100 ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                  >
                    Previous
                  </button>
                  <span className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-600 ${isMobile ? 'px-2' : ''}`}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={`${isMobile ? 'px-2.5 py-1 text-xs flex-1' : 'px-3 py-1.5 text-sm'} font-medium text-gray-700 bg-gray-100 ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
          {expanded && hasMore && (
            <div className={`flex justify-center ${isMobile ? 'mt-2' : 'mt-4'}`}>
              <button
                onClick={() => setExpanded(false)}
                className={`${isMobile ? 'px-3 py-1.5 text-xs w-full' : 'px-4 py-2 text-sm'} font-medium text-primary hover:text-primary-dark hover:bg-primary/10 ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all`}
              >
                Show Less
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TestSelector; 