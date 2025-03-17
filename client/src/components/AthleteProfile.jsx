import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import SpiderChart from './DashboardPage/SpiderChart';

export default function AthleteProfile() {
  const { athleteId } = useParams();
  const { user } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [selectedSport, setSelectedSport] = useState('run');

  useEffect(() => {
    const fetchAthleteData = async () => {
      try {
        // Načtení dat atleta
        const profileResponse = await fetch(`/api/athletes/${athleteId}`, {
          headers: {
            'Authorization': `Bearer ${user.token}`
          }
        });
        const profileData = await profileResponse.json();
        setAthlete(profileData);

        // Načtení tréninků atleta
        const trainingsResponse = await fetch(`/api/athletes/${athleteId}/trainings`, {
          headers: {
            'Authorization': `Bearer ${user.token}`
          }
        });
        const trainingsData = await trainingsResponse.json();
        setTrainings(trainingsData);
      } catch (error) {
        console.error('Error fetching athlete data:', error);
      }
    };

    if (user?.role === 'coach') {
      fetchAthleteData();
    }
  }, [athleteId, user]);

  if (!athlete) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center mb-6">
        <img
          src={athlete.avatar || '/default-avatar.png'}
          alt={athlete.name}
          className="w-16 h-16 rounded-full mr-4"
        />
        <div>
          <h1 className="text-2xl font-bold">{athlete.name}</h1>
          <p className="text-gray-600">{athlete.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Training Overview</h2>
          <SpiderChart
            trainings={trainings}
            selectedSport={selectedSport}
            setSelectedSport={setSelectedSport}
          />
        </div>

        {/* Další statistiky a informace o atletovi */}
      </div>
    </div>
  );
}