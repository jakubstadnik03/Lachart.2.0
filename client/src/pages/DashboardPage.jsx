import React, { useEffect, useState } from "react";
import SportsSelector from "../components/Header/SportsSelector";
import TrainingTable from "../components/DashboardPage/TrainingTable";
import { TrainingStats } from "../components/DashboardPage/TrainingStats";
import TrainingGraph from "../components/DashboardPage/TrainingGraph";
import SpiderChart from "../components/DashboardPage/SpiderChart";
import { fetchMockTrainings } from "../mock/mockApi";

const DashboardPage = () => {
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);

  // Načtení dat
  useEffect(() => {
    const loadTrainings = async () => {
      try {
        setLoading(true);
        const data = await fetchMockTrainings();
        setTrainings(data);
      } catch (err) {
        console.error("Error loading trainings:", err);
        setError("Failed to load trainings");
      } finally {
        setLoading(false);
      }
    };
    loadTrainings();
  }, []);

  // Správa výběru titulu a tréninku
  useEffect(() => {
    if (trainings.length > 0) {
      const sportTrainings = trainings.filter(t => t.sport === selectedSport);
      const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
      
      if (!selectedTitle || !sportTrainings.some(t => t.title === selectedTitle)) {
        setSelectedTitle(uniqueTitles[0]);
        const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
        if (firstTrainingWithTitle) {
          setSelectedTraining(firstTrainingWithTitle.trainingId);
        }
      }
    }
  }, [selectedSport, trainings]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="mx-6 m-auto max-w-[1600px] mx-auto ">
      {/* Výběr sportu */}
      <SportsSelector 
        selectedSport={selectedSport}
        onSportChange={setSelectedSport}
      />

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mt-6">
        {/* Training Table */}
        <div className="lg:col-span-3 md:col-span-2">
          <TrainingTable 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        </div>

        {/* Spider Chart */}
        <div className="lg:col-span-2 md:col-span-2">
          <SpiderChart 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        </div>

        {/* Training Stats */}
        <div className="lg:col-span-3 md:col-span-2">
          <TrainingStats 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        </div>

        {/* Training Graph */}
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
