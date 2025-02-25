import React, { useMemo, useState, useEffect } from "react";
import { DropdownMenu } from "../DropDownMenu";
import { fetchMockTrainings } from "../../mock/mockApi";

const maxGraphHeight = 250;
function StatCard({ stats }) {
  return (
    <div className="flex flex-col text-xs rounded-none max-w-[192px]" >
      <div className="flex z-10 flex-col justify-center items-center px-3 py-2 text-center bg-white rounded-lg border border-solid border-slate-100 shadow-[0px_12px_20px_rgba(0,0,0,0.1)] text-stone-500">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={stat.unit === "W" ? "font-semibold text-gray-900" : ""}
          >
            {stat.label}: {stat.value} {stat.unit}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 self-center mt-3 w-3.5 h-3.5 bg-violet-500 rounded-full border-solid border-[3px] border-zinc-50" />
    </div>
  );
}
 function VerticalBar({ height, color, power, heartRate, lactate }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative flex justify-end shrink-0 w-3 rounded-md z-10"
      style={{ height: `${height}px`, backgroundColor: color }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Tooltip se zobrazuje jen při hover */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 z-50 " style={{marginBottom: "-10px", minWidth: "120px" }}>
          <StatCard
            stats={[
              { label: "Avg", value: `${power}`, unit: "W" },
              { label: "Avg", value: `${heartRate}`, unit: "Bpm" },
              { label: "Avg", value: `${lactate}`, unit: "mmol/L" }, // Fiktivní hodnota
            ]}
          />
        </div>
      )}
         <div
      className={`flex justify-end shrink-0 w-3 rounded-md ${color}`}
      style={{ height: `${height}px` }} // Inline styl pro výšku
    />
      
    </div>
  );
}
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
  const [selectedTraining, setSelectedTraining] = useState("4x15min LT2");

  useEffect(() => {
    fetchMockTrainings().then((data) => {
      const relevantTrainings = data.filter((t) => t.title === selectedTraining);
      setTrainings(relevantTrainings);
    });
  }, [selectedTraining]);

  const { powerValues, heartRateValues, avgPowerData, avgHeartRateData, minPower, maxPower, minHeartRate, maxHeartRate } = useMemo(() => {
    if (trainings.length === 0) return { powerValues: [], heartRateValues: [], avgPowerData: [], avgHeartRateData: [], minPower: 0, maxPower: 100, minHeartRate: 0, maxHeartRate: 200 };
  
    const allPowers = trainings.flatMap((t) => t.results.map((r) => r.power));
    const allHeartRates = trainings.flatMap((t) => t.results.map((r) => r.heartRate));
  
    const minPower = Math.floor(Math.min(...allPowers) / 10) * 10;
    const maxPower = Math.ceil(Math.max(...allPowers) / 10) * 10;
    const minHeartRate = Math.min(...allHeartRates);
    const maxHeartRate = Math.ceil(Math.max(...allHeartRates) / 10) * 10;
  
    const avgPowerData = trainings.map((training) => ({
      x: training.trainingId, // Ujisti se, že se shoduje se sloupci!
      y: training.results.reduce((sum, r) => sum + r.power, 0) / training.results.length
    }));
    
    const avgHeartRateData = trainings.map((training) => ({
      x: training.trainingId,
      y: training.results.reduce((sum, r) => sum + r.heartRate, 0) / training.results.length
    }));
    
  
    return {
      powerValues: Array.from({ length: 6 }, (_, i) => Math.round(minPower + (i * (maxPower - minPower)) / 5)).reverse(),
      heartRateValues: Array.from({ length: 6 }, (_, i) => Math.round(minHeartRate + (i * (maxHeartRate - minHeartRate)) / 5)).reverse(),
      avgPowerData,
      avgHeartRateData,
      minPower,
      maxPower,
      minHeartRate,
      maxHeartRate
    };
  }, [trainings]);
  
  const barColors = ["bg-violet-100", "bg-violet-200", "bg-violet-300", "bg-violet-400", "bg-violet-500"];
  const trainingOptions = [
    "4x15min LT2",
    "5x10min FTP",
    "3x20min Z3",
    "6x5min VO2 Max",
    "8x3min Anaerobic Capacity",
  ];
  return (
    <div className="flex flex-col p-5 bg-white rounded-3xl shadow-md relative h-full">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-zinc-900">Training {selectedTraining}</h2>
        <DropdownMenu selectedTraining={selectedTraining} setSelectedTraining={setSelectedTraining} trainingOptions={trainingOptions}/>
      </div>
      <div className="text-sm text-gray-600 mt-4">
        {trainings.length > 0 && <p>📝 {trainings[0].comments}</p>}
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
        </div>
        <Scale values={heartRateValues} unit="Bpm" />
      </div>
      
    </div>
  );
}