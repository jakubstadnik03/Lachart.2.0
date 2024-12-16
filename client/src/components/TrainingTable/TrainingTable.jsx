"use client";
import * as React from "react";
import { useState, useEffect } from "react";
import { TrainingRow } from "./TrainingRow";
import { TableHeader } from "./TableHeader";

export default function TrainingTable() {
  const [trainings, setTrainings] = useState(() => []);

  async function fetchTrainings() {
    setTrainings([
      {
        training: "5x15min LT2",
        sport: "Cycling",
        date: "15 Jan 2024",
        averagePace: "340 W",
        status: "down",
      },
      {
        training: "10x1km p:1min",
        sport: "Running",
        date: "15 Jan 2024",
        averagePace: "3:30 / km",
        status: "up",
      },
      {
        training: "5x2km + 4x1km",
        sport: "Running",
        date: "15 Jan 2024",
        averagePace: "3:37 / km",
        status: "same",
      },
      {
        training: "3x20min LT1",
        sport: "Cycling",
        date: "15 Jan 2024",
        averagePace: "320 W",
        status: "same",
      },
      {
        training: "4x400 LT2",
        sport: "Swimming",
        date: "15 Jan 2024",
        averagePace: "1:18 / 100m",
        status: "same",
      },
      {
        training: "3x30 min LT1",
        sport: "Cycling",
        date: "15 Jan 2024",
        averagePace: "300 W",
        status: "up",
      },
    ]);
  }

  useEffect(() => {
    fetchTrainings();
  }, []);

  return (
    <div className="flex flex-col justify-center p-5 max-w-2xl bg-white rounded-3xl m-5 shadow-md">
      <div className="flex flex-col w-full max-md:max-w-full">
        <div className="flex flex-col px-5 pb-3.5 w-full max-md:max-w-full">
          <div className="flex flex-wrap gap-10 items-center w-full max-md:max-w-full">
            <div className="flex-1 shrink self-stretch my-auto text-lg font-semibold leading-loose text-gray-900 basis-3.5">
              View last trainings
            </div>
            <button className="flex overflow-hidden gap-1 items-center self-stretch py-0.5 pl-3.5 my-auto w-24 text-base text-blue-500 bg-white rounded min-h-[28px]">
              <div className="self-stretch my-auto">View All</div>
              <img
                loading="lazy"
                src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/d5620c00b89d258c2df851956089e1cf63163537c904e90b0ae529b03aba7f72?apiKey=069fe6e63e3c490cb6056c51644919ef&"
                alt=""
                className="object-contain shrink-0 self-stretch my-auto w-4 aspect-square"
              />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-y-4 w-full text-base text-gray-600 ">
  <TableHeader />
  {trainings.map((training, index) => (
    <TrainingRow key={index} {...training} />
  ))}
</div>

      </div>
    </div>
  );
}