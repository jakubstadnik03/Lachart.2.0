import React, { useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import LactateStatistics from '../components/LactateStatistics/LactateStatistics';
import AthleteSelector from '../components/AthleteSelector';

const LactateStatisticsPage = () => {
  const { user } = useAuth();
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);

  const handleAthleteChange = (athleteId) => {
    setSelectedAthleteId(athleteId);
    localStorage.setItem('lactateStatistics_selectedAthleteId', athleteId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 md:mb-8">Lactate Statistics</h1>

        {/* Athlete Selector for Coach */}
        {user?.role === 'coach' && (
          <div className="mb-6">
            <AthleteSelector
              selectedAthleteId={selectedAthleteId}
              onAthleteChange={handleAthleteChange}
              user={user}
            />
          </div>
        )}

        {/* Lactate Statistics Component */}
        <LactateStatistics selectedAthleteId={selectedAthleteId} />
      </div>
    </div>
  );
};

export default LactateStatisticsPage;

