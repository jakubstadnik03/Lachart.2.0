import React, { useMemo } from "react";
import { Scale } from "./PowerScale";
import { VerticalBar } from "./VerticalBar";
import { DropdownMenu } from "../DropDownMenu";

const mockTests = [
  {
    _id: "test1",
    date: "1.11.24",
    description: "4x15min LT2",
    results: [
      { power: 380, heartRate: 155 },
      { power: 400, heartRate: 160 },
      { power: 420, heartRate: 165 },
      { power: 440, heartRate: 170 },
    ],
  },
  {
    _id: "test2",
    date: "8.11.24",
    description: "4x15min LT2",
    results: [
      { power: 370, heartRate: 153 },
      { power: 390, heartRate: 158 },
      { power: 410, heartRate: 163 },
      { power: 430, heartRate: 168 },
    ],
  },
];

const maxGraphHeight = 250; // Maximální výška grafu

export function TrainingStats() {
  // Dynamický výpočet stupnic
  const { powerValues, heartRateValues, maxPower, minPower } = useMemo(() => {
    const allPowers = mockTests.flatMap((test) => test.results.map((r) => r.power));
    const allHeartRates = mockTests.flatMap((test) => test.results.map((r) => r.heartRate));

    const minPower = Math.min(...allPowers) - 150;
    const maxPower = Math.max(...allPowers) + 50; // Přidáme 50W k max
    const minHeartRate = 80; // Pevně od 80
    const maxHeartRate = Math.max(...allHeartRates) + 10;

    return {
      powerValues: Array.from({ length: 6 }, (_, i) =>
        Math.round(minPower + (i * (maxPower - minPower)) / 5)
      ).reverse(), // Osa od max dolů k min
      heartRateValues: Array.from({ length: 6 }, (_, i) =>
        Math.round(minHeartRate + (i * (maxHeartRate - minHeartRate)) / 5)
      ).reverse(),
      maxPower,
      minPower,
    };
  }, []);

  const barColors = ["bg-violet-100", "bg-violet-200", "bg-violet-300", "bg-violet-400", "bg-violet-500"];

  return (
    <div className="flex flex-col p-5 bg-white rounded-3xl m-5 max-w-[704px] shadow-md">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-zinc-900">Training 4x15min LT2 p:2min</h2>
      <DropdownMenu />
</div>
      <div className="flex gap-2 items-end px-1.5 mt-5" style={{ minHeight: `${maxGraphHeight + 50}px` }}>
        {/* Stupnice výkonu */}
        <Scale values={powerValues} unit="W" />
        <div className="flex flex-wrap justify-between w-full">
          {mockTests.map((test, testIndex) => (
            <div key={test._id} className="flex flex-col items-center w-[43px]">
              <div className="flex gap-px items-end">
                {test.results.map((result, index) => (
                  <VerticalBar
                    key={index}
                    height={((result.power - minPower) / (maxPower - minPower)) * maxGraphHeight}
                    color={barColors[(index + testIndex) % barColors.length]}
                    power={result.power}
                    heartRate={result.heartRate}
                  />
                ))}
              </div>
              <div className="text-sm text-zinc-500">{test.date}</div>
            </div>
          ))}
        </div>
        {/* Stupnice tepové frekvence */}
        <Scale values={heartRateValues} unit="Bpm" />
      </div>
    </div>
  );
}
