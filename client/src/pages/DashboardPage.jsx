import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from 'react-router-dom';
import SportsSelector from "../components/Header/SportsSelector";
import TrainingTable from "../components/DashboardPage/TrainingTable";
import { TrainingStats } from "../components/DashboardPage/TrainingStats";
import TrainingGraph from "../components/DashboardPage/TrainingGraph";
import SpiderChart from "../components/DashboardPage/SpiderChart";
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import AthleteSelector from "../components/AthleteSelector";

const DashboardPage = () => {
  const { athleteId } = useParams();
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    const loadTrainings = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Použijeme ID vybraného atleta nebo přihlášeného uživatele
        const targetId = selectedAthleteId || user._id;
        const response = await api.get(`/user/athlete/${targetId}/trainings`);
        
        if (response && response.data) {
          setTrainings(response.data);
        }
      } catch (error) {
        console.error('Error loading trainings:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadTrainings();
  }, [user, isAuthenticated, navigate, selectedAthleteId]);

  useEffect(() => {
    if (trainings.length > 0) {
      const sportTrainings = trainings.filter(t => t.sport === selectedSport);
      const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
      
      if (!selectedTitle || !sportTrainings.some(t => t.title === selectedTitle)) {
        setSelectedTitle(uniqueTitles[0]);
        const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
        if (firstTrainingWithTitle) {
          setSelectedTraining(firstTrainingWithTitle._id);
        }
      }
    }
  }, [selectedSport, trainings]);

  const handleAthleteChange = (newAthleteId) => {
    setSelectedAthleteId(newAthleteId);
    navigate(`/dashboard/${newAthleteId}`);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">
      <p>Loading...</p>
    </div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen">
      <p className="text-red-500">Error: {error}</p>
    </div>;
  }

  if (!user) {
    return <div className="flex justify-center items-center h-screen">
      <p>Please log in to view this page</p>
    </div>;
  }

  return (
    <div className="mx-6 m-auto max-w-[1600px] mx-auto p-6">
      {user?.role === 'coach' && (
        <AthleteSelector
          selectedAthleteId={selectedAthleteId}
          onAthleteChange={handleAthleteChange}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 md:col-span-2">
          <TrainingTable 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        </div>

        <div className="lg:col-span-2 md:col-span-2">
          <SpiderChart 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        </div>

        <div className="lg:col-span-3 md:col-span-2">
          <TrainingStats 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        </div>

        <div className="lg:col-span-2 md:col-span-2">
          <TrainingGraph 
            trainingList={trainings}
            selectedSport={selectedSport}
            selectedTitle={selectedTitle}
            setSelectedTitle={setSelectedTitle}
            selectedTraining={selectedTraining}
            setSelectedTraining={setSelectedTraining}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
