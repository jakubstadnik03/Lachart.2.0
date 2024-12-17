import React, { createContext, useState, useContext } from "react";
import { mockTrainings } from "../mock/trainings";

// Vytvoření kontextu
const TrainingContext = createContext();

// Poskytovatel kontextu
export const TrainingProvider = ({ children }) => {
  const [trainings, setTrainings] = useState(mockTrainings);

  // Funkce pro přidání nového tréninku
  const addTraining = (newTraining) => {
    setTrainings((prevTrainings) => [...prevTrainings, newTraining]);
  };

  // Funkce pro odstranění tréninku
  const deleteTraining = (id) => {
    setTrainings((prevTrainings) => prevTrainings.filter((t) => t._id !== id));
  };

  return (
    <TrainingContext.Provider value={{ trainings, addTraining, deleteTraining }}>
      {children}
    </TrainingContext.Provider>
  );
};

// Hook pro přístup ke kontextu
export const useTrainings = () => useContext(TrainingContext);
