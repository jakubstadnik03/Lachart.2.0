import React from 'react';

const TestSelector = ({ tests = [], selectedTests = [], onTestSelect, selectedSport = 'all' }) => {
  // Ensure tests is an array
  const validTests = Array.isArray(tests) ? tests : [];

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
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Previous Tests</h2>
        <p className="text-sm text-gray-500">
          Selected for comparison: {selectedTests.length}
          {selectedTests.length > 0 && selectedTests[0] && ` (${selectedTests[0].sport})`}
        </p>
      </div>
      
      {validTests.length === 0 ? (
        <p className="text-gray-500 text-center py-4">
          No tests found for {selectedSport === 'all' ? 'any sport' : selectedSport}
        </p>
      ) : (
        <div className="space-y-4">
          {validTests.map((test) => (
            <div 
              key={test._id} 
              onClick={() => handleTestSelect(test)}
              className={`border rounded-lg p-4 cursor-pointer transition-colors
                ${selectedTests.some(t => t._id === test._id)
                  ? 'border-primary bg-primary/5' 
                  : selectedTests.length > 0 && selectedTests[0] && selectedTests[0].sport !== test.sport
                    ? 'border-gray-200 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <img
                      src={`/icon/${test.sport}.svg`}
                      alt={test.sport}
                      className="w-5 h-5"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium">{test.description}</h3>
                    <p className="text-sm text-gray-500">
                      {test.sport} • {new Date(test.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-medium">
                      {test.results && test.results.length > 0 ? `${test.results[test.results.length - 1].power}W` : 'N/A'}
                    </p>
                    <p className="text-sm text-gray-500">
                      Base Lactate: {test.baseLactate || 'N/A'}
                    </p>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 transition-colors
                    ${selectedTests.some(t => t._id === test._id)
                      ? 'border-primary bg-primary'
                      : 'border-gray-300'
                    }`}
                  >
                    {selectedTests.some(t => t._id === test._id) && (
                      <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TestSelector; 