import React, { useState, useEffect } from "react";
import { fetchMockTestings } from "../../mock/mockApi";
import LactateCurve from "./LactateCurve";
import TestingForm from "./TestingForm";
import DateSelector from "../DateSelector";
import LactateCurveCalculator from "./LactateCurveCalculator";

const PreviousTestingComponent = () => {
  const [trainings, setTrainings] = useState([]);
  const [selectedTraining, setSelectedTraining] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchMockTestings();
      setTrainings(data);
      setSelectedTraining(data[0]); // Vybereme první trénink jako default
    };

    loadData();
  }, []);

  return (
    <div className="mx-6 max-w-[1600px] mx-auto">
      <DateSelector
        dates={trainings.map((training) => training.date)}
        onSelectDate={(date) => {
          const foundTraining = trainings.find((training) => training.date === date);
          setSelectedTraining(foundTraining);
        }}
      />

      {selectedTraining ? (
        <div className="flex justify-center flex-wrap lg:flex-nowrap gap-6 mt-5  ">
          <LactateCurve mockData={selectedTraining} />
          <div className="flex-1 max-w-xl bg-white rounded-2xl shadow-lg p-6">
            <TestingForm testData={selectedTraining} onTestDataChange={setSelectedTraining}/>
          </div>
        </div>
      ) : (
        <p className="text-center mt-4">Loading...</p>
      )}
      <LactateCurveCalculator mockData={selectedTraining}/>
    </div>
  );
};

export default PreviousTestingComponent;
