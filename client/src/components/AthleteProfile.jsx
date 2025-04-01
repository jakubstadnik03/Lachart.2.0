import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import SpiderChart from './DashboardPage/SpiderChart';
import TrainingGraph from './DashboardPage/TrainingGraph';
import UserTrainingsTable from './Training-log/UserTrainingsTable';
import PreviousTestingComponent from './Testing-page/PreviousTestingComponent';
import SportsSelector from './Header/SportsSelector';
import api from '../services/api';

export default function AthleteProfile() {
  const { athleteId } = useParams();
  const { user } = useAuth();
  const [athlete, setAthlete] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [tests, setTests] = useState([]);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTestingSport, setSelectedTestingSport] = useState('all');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAthleteData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Načtení všech dat paralelně
        const [athleteData, trainingsData, testsData] = await Promise.all([
          api.get(`/user/athlete/${athleteId}`),
          api.get(`/user/athlete/${athleteId}/trainings`),
          api.get(`/test/list/${athleteId}`)
        ]);

        setAthlete(athleteData.data);
        setTrainings(trainingsData.data || []);
        setTests(testsData.data || []);
      } catch (error) {
        console.error('Error fetching athlete data:', error);
        setError(error.message || 'Failed to load athlete data');
      } finally {
        setLoading(false);
      }
    };

    if (user?.role === 'coach' && athleteId) {
      fetchAthleteData();
    }
  }, [athleteId, user]);

  // Formátování data
  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Not set';
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${day}.${month}.${year}`;
  };

  const getAvatarBySport = (sport) => {
    const sportLower = sport?.toLowerCase() || '';
    switch (sportLower) {
      case 'triathlon':
        return '/images/triathlete-avatar.jpg';
      case 'running':
        return '/images/runner-avatar.jpg';
      case 'cycling':
        return '/images/cyclist-avatar.webp';
      case 'swimming':
        return '/images/swimmer-avatar.jpg';
      default:
        return '/images/triathlete-avatar.jpg';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen text-red-600">
        {error}
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="flex justify-center items-center h-screen">
        No athlete data available
      </div>
    );
  }

  return (
    <div className="py-2 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
      {/* Horní část s profilem */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden relative">
        <div className="h-24 md:h-32 bg-gradient-to-r from-purple-100 to-purple-50" />
        <div className="px-4 md:px-6 pb-4 md:pb-6">
          {/* Avatar a jméno */}
          <div className="flex flex-col sm:flex-row sm:items-end -mt-12 mb-4 gap-4 sm:gap-0">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-white overflow-hidden bg-white mx-auto sm:mx-0">
              <img
                src={getAvatarBySport(athlete.sport)}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-center sm:text-left sm:ml-4 sm:mb-2">
              <h1 className="text-xl md:text-2xl font-bold">{athlete.name} {athlete.surname}</h1>
              <p className="text-gray-600">{athlete.specialization || 'Athlete'}</p>
            </div>
          </div>

          {/* Osobní informace */}
          <div className="mt-4 md:mt-6">
            <h2 className="text-lg font-semibold mb-3 md:mb-4">Personal Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {[
                { label: 'Full Name', value: `${athlete.name} ${athlete.surname}` },
                { label: 'Email', value: athlete.email || 'Not set' },
                { label: 'Phone Number', value: athlete.phone || 'Not set' },
                { label: 'Weight', value: athlete.weight ? `${athlete.weight} kg` : 'Not set' },
                { label: 'Height', value: athlete.height ? `${athlete.height} cm` : 'Not set' },
                { label: 'Bio', value: athlete.bio || 'Not set' },
                { label: 'Sport', value: athlete.sport || 'Not set' },
                { label: 'Specialization', value: athlete.specialization || 'Not set' },
                { label: 'Address', value: athlete.address || 'Not set' },
                { label: 'Date of Birth', value: athlete.dateOfBirth ? formatDate(athlete.dateOfBirth) : 'Not set' },
              ].map((item, index) => (
                <div key={index} className="flex flex-col sm:flex-row sm:items-center p-2 bg-gray-50 rounded-lg">
                  <p className="text-gray-600 text-sm sm:w-1/3">{item.label}</p>
                  <p className="font-medium text-sm sm:w-2/3">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grafy a tabulky */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div>
          <SpiderChart 
            trainings={trainings}
            selectedSport={selectedSport}
            className="w-[400px]"
          />
        </div>
        <TrainingGraph 
          trainingList={trainings}
          selectedSport={selectedSport}
          selectedTitle={selectedTitle}
          setSelectedTitle={setSelectedTitle}
          selectedTraining={selectedTraining}
          setSelectedTraining={setSelectedTraining}
        />

        <div className='lg:col-span-2'>
          <UserTrainingsTable trainings={trainings} />
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="mb-4">
          <SportsSelector onSportChange={setSelectedTestingSport} />
        </div>
        <PreviousTestingComponent 
          selectedSport={selectedTestingSport}
          tests={tests}
          setTests={setTests}
          athleteId={athlete._id}
        />
      </div>
    </div>
  );
}