import React, { useEffect, useState } from "react";
import SportsSelector from "../components/Header/SportsSelector";
import TrainingTable from "../components/DashboardPage/TrainingTable";
import { TrainingStats } from "../components/DashboardPage/Training-graph/TrainingStats";
import TrainingGraph from "../components/DashboardPage/TrainingGraph";
import SpiderChart from "../components/DashboardPage/SpiderChart";
import { fetchMockTrainings } from "../mock/mockApi";

const DashboardPage = () => {
  const [trainings, setTrainings] = useState([]);

  const loggedInUserId = "user1"; // Mockovaný přihlášený uživatel

  useEffect(() => {
    const loadTrainings = async () => {
      const data = await fetchMockTrainings();
      setTrainings(data);
    };
    loadTrainings();
  }, []);

  return (
    <div className="mx-6 m-auto max-w-[1600px]">
      {/* Výběr sportu */}
      <SportsSelector />

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mt-6">
        {/* Training Table - menší tabulka */}
        <div className="lg:col-span-3 md:col-span-2">
          <TrainingTable trainings={trainings} />
        </div>

        {/* Spider Chart - větší vizualizace */}
        <div className="lg:col-span-2 md:col-span-2">
          <SpiderChart trainings={trainings} />
        </div>

        {/* Training Stats - menší box */}
        <div className="lg:col-span-3 md:col-span-2">
          <TrainingStats trainings={trainings} />
        </div>

        {/* Training Graph - větší vizualizace */}
        <div className="lg:col-span-2 md:col-span-2">
          <TrainingGraph trainings={trainings} />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
