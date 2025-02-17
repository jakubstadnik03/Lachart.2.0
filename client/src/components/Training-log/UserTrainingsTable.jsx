import React, { useEffect, useState } from "react";
import { fetchMockTrainings } from "../../mock/mockApi";
import TrainingItem from "./TrainingItem";

const UserTrainingsTable = () => {
  const [trainings, setTrainings] = useState([]);

  useEffect(() => {
    const loadTrainings = async () => {
      const data = await fetchMockTrainings();
      setTrainings(data);
    };
    loadTrainings();
  }, []);

  if (trainings.length === 0) {
    return <div>Žádné tréninky k zobrazení.</div>;
  }

  return (
    <div className="training-table">
      {trainings.map((training) => (
        <TrainingItem key={training.id} training={training} />
      ))}
    </div>
  );
};

export default UserTrainingsTable;
