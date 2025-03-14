import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMockTrainings } from '../../mock/mockApi';

export function SearchInput() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const navigate = useNavigate();

  const handleSearch = async (value) => {
    setSearchTerm(value);
    if (value.length > 2) {
      const trainings = await fetchMockTrainings();
      const filtered = trainings.filter(training =>
        training.title.toLowerCase().includes(value.toLowerCase()) ||
        training.sport.toLowerCase().includes(value.toLowerCase()) ||
        training.description?.toLowerCase().includes(value.toLowerCase())
      );
      setSearchResults(filtered.slice(0, 5)); // Omezíme na 5 výsledků
    } else {
      setSearchResults([]);
    }
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search trainings..."
          className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-primary bg-gray-50"
        />
        <img
        src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/6c7a562a0ed27a3cef4686aed74aa67292fbca1dd3757e4bb60a891698cdfdb7?apiKey=069fe6e63e3c490cb6056c51644919ef&"
        alt="Search"
          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
        />
      </div>

      {/* Search Results Dropdown */}
      {searchResults.length > 0 && (
        <div className="absolute mt-2 w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          {searchResults.map((training) => (
            <button
              key={training.trainingId}
              onClick={() => {
                navigate(`/training/${training.trainingId}`);
                setSearchResults([]);
                setSearchTerm('');
              }}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-none"
            >
              <div className="p-2 bg-gray-100 rounded-lg">
                <img
                  src={`/icon/${training.sport}.svg`}
                  alt={training.sport}
                  className="w-5 h-5"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{training.title}</p>
                <p className="text-xs text-gray-500">
                  {training.sport} • {new Date(training.date).toLocaleDateString()}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}