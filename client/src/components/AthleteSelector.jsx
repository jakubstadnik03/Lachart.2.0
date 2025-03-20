import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';

const AthleteSelector = ({ selectedAthleteId, onAthleteChange }) => {
  const [athletes, setAthletes] = useState([]);
  const location = useLocation();
  const currentPath = location.pathname.split('/')[1]; // Získá 'dashboard', 'training', nebo 'testing'

  useEffect(() => {
    const loadAthletes = async () => {
      try {
        const response = await api.get('/user/coach/athletes');
        setAthletes(response.data);
      } catch (error) {
        console.error('Error loading athletes:', error);
      }
    };
    loadAthletes();
  }, []);

  const handleAthleteChange = (e) => {
    const newAthleteId = e.target.value;
    onAthleteChange(newAthleteId);
  };

  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <select
          value={selectedAthleteId || ''}
          onChange={handleAthleteChange}
          className="w-full sm:w-64 p-2 border rounded-lg bg-white"
        >
          <option value="">Select Athlete</option>
          {athletes.map((athlete) => (
            <option key={athlete._id} value={athlete._id}>
              {athlete.name} {athlete.surname}
            </option>
          ))}
        </select>

        {selectedAthleteId && (
          <div className="flex gap-2">
            <Link
              to={`/dashboard/${selectedAthleteId}`}
              className={`px-4 py-2 rounded-lg ${
                currentPath === 'dashboard' 
                  ? 'bg-violet-600 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to={`/training/${selectedAthleteId}`}
              className={`px-4 py-2 rounded-lg ${
                currentPath === 'training' 
                  ? 'bg-violet-600 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Training
            </Link>
            <Link
              to={`/testing/${selectedAthleteId}`}
              className={`px-4 py-2 rounded-lg ${
                currentPath === 'testing' 
                  ? 'bg-violet-600 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Testing
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default AthleteSelector; 