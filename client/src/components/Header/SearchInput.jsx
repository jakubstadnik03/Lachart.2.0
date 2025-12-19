import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthProvider';
import api from '../../services/api';
import AsyncSelect from 'react-select/async';

export function SearchInput() {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  // Univerzální funkce pro vyhledávání ve všech typech entit
  const loadOptions = useCallback(async (inputValue, callback) => {
    if (!inputValue || inputValue.length < 2) {
      callback([]);
      return;
    }

    try {
      const searchLower = inputValue.toLowerCase();
      const results = [];

      // 1. Hledání v trénincích (Training, FitTraining, StravaActivity)
      try {
        const targetId = user?._id || user?.id;
        if (targetId) {
          // Načtení všech tréninků
          const [trainingsRes, fitRes, stravaRes] = await Promise.all([
            api.get(`/user/athlete/${targetId}/trainings`).catch(() => ({ data: [] })),
            api.get(`/api/fit/trainings`, { params: { athleteId: targetId } }).catch(() => ({ data: [] })),
            api.get(`/api/integrations/activities`, { params: { athleteId: targetId } }).catch(() => ({ data: [] }))
          ]);

          // FIT trainings
          (fitRes.data || []).forEach(training => {
            const title = training.title || training.titleManual || training.titleAuto || 'Untitled Training';
            if (title.toLowerCase().includes(searchLower)) {
              results.push({
                type: 'fit-training',
                value: training._id,
                label: title,
                sport: training.sport || 'unknown',
                date: training.timestamp || training.date,
                id: training._id
              });
            }
          });

          // Strava activities
          (stravaRes.data || []).forEach(activity => {
            const title = activity.title || activity.titleManual || activity.name || 'Untitled Activity';
            if (title.toLowerCase().includes(searchLower)) {
              results.push({
                type: 'strava-activity',
                value: activity.stravaId || activity.id,
                label: title,
                sport: activity.sport || 'unknown',
                date: activity.startDate || activity.date,
                id: activity.stravaId || activity.id
              });
            }
          });

          // Regular trainings
          (trainingsRes.data || []).forEach(training => {
            const title = training.title || 'Untitled Training';
            if (title.toLowerCase().includes(searchLower)) {
              results.push({
                type: 'training',
                value: training._id,
                label: title,
                sport: training.sport || 'unknown',
                date: training.date,
                id: training._id
              });
            }
          });
        }
      } catch (error) {
        console.error('Error searching trainings:', error);
      }

      // 2. Hledání v testech
      try {
        const targetId = user?._id || user?.id;
        if (targetId) {
          const testsRes = await api.get(`/test/list/${targetId}`).catch(() => ({ data: [] }));
          (testsRes.data || []).forEach(test => {
            const title = test.title || test.name || `Test ${test.date ? new Date(test.date).toLocaleDateString() : ''}`;
            if (title.toLowerCase().includes(searchLower)) {
              results.push({
                type: 'test',
                value: test._id,
                label: title,
                sport: test.sport || 'unknown',
                date: test.date,
                id: test._id
              });
            }
          });
        }
      } catch (error) {
        console.error('Error searching tests:', error);
      }

      // 3. Hledání v atletech (pouze pro trenéry)
      if (user?.role === 'coach') {
        try {
          const athletesRes = await api.get('/user/coach/athletes').catch(() => ({ data: [] }));
          (athletesRes.data || []).forEach(athlete => {
            const name = `${athlete.name || ''} ${athlete.surname || ''}`.trim();
            if (name.toLowerCase().includes(searchLower)) {
              results.push({
                type: 'athlete',
                value: athlete._id,
                label: name,
                sport: athlete.sport || 'unknown',
                date: null,
                id: athlete._id
              });
            }
          });
        } catch (error) {
          console.error('Error searching athletes:', error);
        }
      }

      // Seřadit podle data (nejnovější první) a omezit na 10 výsledků
      const sorted = results.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });

      callback(sorted.slice(0, 10));
    } catch (error) {
      console.error('Error in search:', error);
      callback([]);
    }
  }, [user]);

  // Funkce pro zpracování výběru
  const handleChange = (selectedOption) => {
    if (selectedOption) {
      const { type, id } = selectedOption;
      
      // Navigace podle typu výsledku
      switch (type) {
        case 'fit-training':
          navigate(`/fit-analysis?trainingId=${id}`);
          break;
        case 'strava-activity':
          navigate(`/fit-analysis?stravaId=${id}`);
          break;
        case 'training':
          navigate(`/training?trainingId=${id}`);
          break;
        case 'test':
          navigate(`/testing?testId=${id}`);
          break;
        case 'athlete':
          navigate(`/athlete/${id}`);
          break;
        default:
          console.warn('Unknown result type:', type);
      }
      
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

  // Funkce pro získání ikony podle typu
  const getTypeIcon = (type) => {
    switch (type) {
      case 'fit-training':
      case 'strava-activity':
      case 'training':
        return '/icon/training.svg';
      case 'test':
        return '/icon/testing.svg';
      case 'athlete':
        return '/icon/athletes.svg';
      default:
        return '/icon/training.svg';
    }
  };

  // Funkce pro získání typu textu
  const getTypeLabel = (type) => {
    switch (type) {
      case 'fit-training':
        return 'FIT Training';
      case 'strava-activity':
        return 'Strava Activity';
      case 'training':
        return 'Training';
      case 'test':
        return 'Test';
      case 'athlete':
        return 'Athlete';
      default:
        return 'Training';
    }
  };

  // Vlastní formátování možností
  const formatOptionLabel = ({ label, sport, date, type }) => (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
        <img
          src={getTypeIcon(type)}
          alt={getTypeLabel(type)}
          className="w-5 h-5"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
        <p className="text-xs text-gray-500">
          {getTypeLabel(type)} • {sport} {date ? `• ${new Date(date).toLocaleDateString()}` : ''}
        </p>
      </div>
    </div>
  );

  return (
    <div className="relative w-full max-w-xl">
      <AsyncSelect
        cacheOptions
        defaultOptions={false}
        loadOptions={loadOptions}
        onChange={handleChange}
        value={searchTerm ? { value: searchTerm, label: searchTerm } : null}
        placeholder="Search trainings, tests, athletes..."
        styles={customStyles}
        formatOptionLabel={formatOptionLabel}
        noOptionsMessage={({ inputValue }) => 
          inputValue.length < 2 
            ? "Type at least 2 characters to search..." 
            : "No results found"
        }
        loadingMessage={() => "Searching..."}
        className="w-full"
        classNamePrefix="select"
        isClearable
        isSearchable
        debounceTimeout={300}
      />
    </div>
  );
}