import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMockTrainings } from '../../mock/mockApi';
import AsyncSelect from 'react-select/async';

export function SearchInput() {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  // Načtení všech tréninků při prvním renderu
  const [allTrainings, setAllTrainings] = useState([]);
  
  useEffect(() => {
    const loadTrainings = async () => {
      try {
        const trainings = await fetchMockTrainings();
        setAllTrainings(trainings);
      } catch (error) {
        console.error('Error loading trainings:', error);
      }
    };
    
    loadTrainings();
  }, []);

  // Funkce pro vyhledávání tréninků
  const loadOptions = (inputValue, callback) => {
    // Simulace zpoždění pro lepší UX
    setTimeout(() => {
      // Filtrujeme pouze podle názvu tréninku
      const filtered = allTrainings.filter(training =>
        training.title.toLowerCase().includes(inputValue.toLowerCase())
      );
      
      // Transformace dat pro react-select
      const options = filtered.map(training => ({
        value: training.title, // Používáme název tréninku jako hodnotu
        label: training.title,
        sport: training.sport,
        date: training.date
      }));
      
      callback(options.slice(0, 5)); // Omezíme na 5 výsledků
    }, 300);
  };

  // Funkce pro zpracování výběru
  const handleChange = (selectedOption) => {
    if (selectedOption) {
      // Navigujeme na /training-history/[název-tréninku]
      navigate(`/training-history/${encodeURIComponent(selectedOption.value)}`);
      setSearchTerm('');
    }
  };

  // Vlastní styly pro react-select
  const customStyles = {
    control: (provided, state) => ({
      ...provided,
      borderRadius: '0.75rem',
      borderColor: state.isFocused ? '#3b82f6' : '#e5e7eb',
      boxShadow: state.isFocused ? '0 0 0 1px #3b82f6' : 'none',
      '&:hover': {
        borderColor: '#3b82f6'
      }
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#e5e7eb' : 'white',
      color: state.isSelected ? 'white' : '#1f2937',
      '&:active': {
        backgroundColor: '#3b82f6'
      }
    }),
    menu: (provided) => ({
      ...provided,
      borderRadius: '0.75rem',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    }),
    placeholder: (provided) => ({
      ...provided,
      color: '#9ca3af'
    })
  };

  // Vlastní formátování možností
  const formatOptionLabel = ({ label, sport, date }) => (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-gray-100 rounded-lg">
        <img
          src={`/icon/${sport}.svg`}
          alt={sport}
          className="w-5 h-5"
        />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">
          {sport} • {new Date(date).toLocaleDateString()}
        </p>
      </div>
    </div>
  );

  return (
    <div className="relative w-full max-w-xl">
      <AsyncSelect
        cacheOptions
        defaultOptions
        loadOptions={loadOptions}
        onChange={handleChange}
        value={searchTerm ? { value: searchTerm, label: searchTerm } : null}
        placeholder="Search trainings..."
        styles={customStyles}
        formatOptionLabel={formatOptionLabel}
        noOptionsMessage={() => "No trainings found"}
        loadingMessage={() => "Loading..."}
        className="w-full"
        classNamePrefix="select"
        isClearable
        isSearchable
      />
    </div>
  );
}