import React, { useMemo, useState, useEffect } from "react";
import { VerticalBar } from "./VerticalBar";
import { DropdownMenu } from "../DropDownMenu";
import { fetchMockTrainings } from "../../mock/mockApi";
import { Line, LineChart, ResponsiveContainer, Scatter, YAxis, CartesianGrid } from "recharts";

const maxGraphHeight = 250;

function Scale({ values, unit }) {
  return (
    <div className="relative flex flex-col justify-between py-4 w-12 text-sm text-right whitespace-nowrap min-h-[287px] text-zinc-500">
      {values.map((value, index) => (
        <div key={index} className="relative flex items-center w-full">
          <div className="absolute left-0 right-0 h-px border-t border-dashed border-gray-300" />
          <span className="relative z-10 bg-white px-1">{value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function TrainingStats() {
  const [trainings, setTrainings] = useState([]);
  const [selectedTraining, setSelectedTraining] = useState("4x15min LT2 p:2min");

  useEffect(() => {
    fetchMockTrainings().then((data) => {
      const relevantTrainings = data.filter((t) => t.title === selectedTraining);
      setTrainings(relevantTrainings);
    });
  }, [selectedTraining]);

  const { powerValues, heartRateValues, avgPowerData, minPower, maxPower } = useMemo(() => {
    if (trainings.length === 0) return { powerValues: [], heartRateValues: [], avgPowerData: [], minPower: 0, maxPower: 100 };

    const allPowers = trainings.flatMap((t) => t.results.map((r) => r.power));
    const allHeartRates = trainings.flatMap((t) => t.results.map((r) => r.heartRate));

    const minPower = Math.floor(Math.min(...allPowers) / 10) * 10;
    const maxPower = Math.ceil(Math.max(...allPowers) / 10) * 10;
    const minHeartRate = Math.min(...allHeartRates);
    const maxHeartRate = Math.ceil(Math.max(...allHeartRates) / 10) * 10;

    const avgPowerData = trainings.map((training, index) => {
      const avgPower = training.results.reduce((sum, r) => sum + r.power, 0) / training.results.length;
      return { x: index + 0.5, y: avgPower }; // Posunutí bodů na střed intervalů
    });

    return {
      powerValues: Array.from({ length: 6 }, (_, i) => Math.round(minPower + (i * (maxPower - minPower)) / 5)).reverse(),
      heartRateValues: Array.from({ length: 6 }, (_, i) => Math.round(minHeartRate + (i * (maxHeartRate - minHeartRate)) / 5)).reverse(),
      avgPowerData,
      minPower,
      maxPower
    };
  }, [trainings]);

  const barColors = ["bg-violet-100", "bg-violet-200", "bg-violet-300", "bg-violet-400", "bg-violet-500"];

  return (
    <div className="flex flex-col p-5 bg-white rounded-3xl m-5 max-w-[704px] shadow-md relative">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-zinc-900">{selectedTraining}</h2>
        <DropdownMenu selectedTraining={selectedTraining} setSelectedTraining={setSelectedTraining} />
      </div>
      <div className="text-sm text-gray-600 mt-2">
        {trainings.length > 0 && <p>{trainings[0].scenario}</p>}
      </div>
      <div className="flex gap-2 items-end px-1.5 mt-5 relative w-full" style={{ minHeight: `${maxGraphHeight + 50}px` }}>
        <Scale values={powerValues} unit="W" />
        <div className="relative flex flex-wrap justify-between w-full">
          {trainings.map((training) => (
            <div key={training.trainingId} className="flex flex-col justify-end items-center w-[43px] relative">
              <div className="flex gap-px items-end">
                {training.results.map((result, index) => (
                  <VerticalBar
                    key={index}
                    height={((result.power - minPower) / (maxPower - minPower)) * maxGraphHeight}
                    color={barColors[index % barColors.length]}
                    power={result.power}
                    lactate={result.lactate}
                    heartRate={result.heartRate}
                  />
                ))}
              </div>
              <div className="text-sm text-zinc-500 mt-1">{new Date(training.date).toLocaleDateString("cs-CZ").replace(/\s/g, "").replace(/\d{4}$/, "24")}</div>
            </div>
          ))}
          <ResponsiveContainer width="100%" height={maxGraphHeight} className="absolute top-0 left-0 z-20">
            <LineChart data={avgPowerData}>
              <CartesianGrid strokeDasharray="3 3" className="z-0" />
              <YAxis domain={[minPower, maxPower]} hide />
              <Line type="monotone" dataKey="y" stroke="#3b82f6" strokeWidth={2} dot={true} />
              <Scatter data={avgPowerData} fill="#3b82f6" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Scale values={heartRateValues} unit="Bpm" />
      </div>
      <div className="text-sm text-gray-600 mt-4">
        {trainings.length > 0 && <p>📝 {trainings[0].comments}</p>}
      </div>
    </div>
  );
}