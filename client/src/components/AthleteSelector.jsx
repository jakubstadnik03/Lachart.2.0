import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

const AthleteSelector = ({ selectedAthleteId, onAthleteChange, user }) => {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.split('/')[1]; // Získá 'dashboard', 'training', nebo 'testing'

  const loadAthletes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/user/coach/athletes');
      setAthletes(response.data);
    } catch (error) {
      console.error('Error loading athletes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAthletes();
  }, [loadAthletes]);

  useEffect(() => {
    const handleAthleteListUpdated = (event) => {
      console.log('Athlete list updated event received', event.detail);
      const { athlete, athleteId } = event.detail || {};
      
      // If we have the athlete data, add it directly to the list
      if (athlete && athleteId) {
        setAthletes(prev => {
          // Check if athlete already exists
          const exists = prev.some(a => a._id === athleteId);
          if (exists) {
            return prev;
          }
          // Add new athlete to the list
          return [...prev, athlete];
        });
      } else {
        // Fallback: reload the entire list
        loadAthletes();
      }
    };

    window.addEventListener('athleteListUpdated', handleAthleteListUpdated);
    return () => {
      window.removeEventListener('athleteListUpdated', handleAthleteListUpdated);
    };
  }, [loadAthletes]);

  const handleAthleteChange = (e) => {
    const newAthleteId = e.target.value;
    if (newAthleteId) {
      // Globální volba atleta – sdílená napříč stránkami (Dashboard, Training, Testing, Menu)
      try {
        localStorage.setItem('global_selectedAthleteId', newAthleteId);
      } catch {
        // ignore storage errors
      }
      onAthleteChange(newAthleteId);
      // Only navigate if not on training-calendar (which doesn't use athleteId in URL)
      if (currentPath !== 'training-calendar') {
        navigate(`/${currentPath}/${newAthleteId}`);
      }
    }
  };

  if (loading) {
    return <div className="mb-4 sm:mb-6">Loading athletes...</div>;
  }

  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        <select
          value={selectedAthleteId || ''}
          onChange={handleAthleteChange}
          className="w-full p-2 border rounded-lg bg-white text-sm sm:text-base appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          style={{
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.75rem center',
            backgroundSize: '1em 1em',
            paddingRight: '2.5rem'
          }}
        >
          <option value="">Select athlete</option>
          {user && user.role === 'coach' && (
            <option key={user._id} value={user._id}>
              {user.name} {user.surname} (Me)
            </option>
          )}
          {athletes.map((athlete) => (
            <option key={athlete._id} value={athlete._id}>
              {athlete.name} {athlete.surname}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default AthleteSelector; 