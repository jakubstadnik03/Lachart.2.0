import React from "react";
import { useState, useEffect } from "react";
import { fetchMockTrainings } from "../../mock/mockApi";

function TrainingRow({ training, sport, date, averagePace, status }) {
  const getStatusIcon = (status) => {
    const icons = {
      up: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/ca42b61d339a69e3bb2cc02efb61369c67cfc2f39658e99e5d576df14fcdfcd9?",
      down: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/03f5e1c239b86d526fe7a81e7008e0b47bb861a21531b26f903e6750497c90ce?",
    };
    return icons[status];
  };

  const getBackgroundColor = (status) => {
    const colors = {
      up: "bg-green-600 text-green-600 bg-opacity-10",
      down: "bg-red-600 text-red-600 bg-opacity-10",
      same: "bg-gray-200 text-gray-600"
    };
    return colors[status];
  };

  return (
    <>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
        <div className="self-stretch py-2.5 pr-1 pl-1 w-full text font-semibold border-b text-center border-gray-200 max-sm:px-2">
          {training}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto whitespace-nowrap basis-0">
        <div className="self-stretch px-4 py-2.5 w-full border-b text-center border-gray-200">
          {sport.substring(0, 4)}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
        <div className="self-stretch px-4 py-2.5 w-full border-b text-center border-gray-200">
          {date}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto text-sm text-green-600 basis-0">
        <div className="flex justify-center items-center py-2 w-full text-center border-b text-center border-gray-200">
          <div
            className={`flex gap-1 items-center self-stretch p-1 my-auto rounded-md ${getBackgroundColor(
              status
            )}`}
          >
            {status !== "same" && (
              <img
                loading="lazy"
                src={getStatusIcon(status)}
                alt=""
                className="object-contain shrink-0 self-stretch my-auto w-3 aspect-square"
              />
            )}
            <div className="self-stretch my-auto">{averagePace}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function TableHeader() {
  const headers = ["Training", "Sport", "Date", "Avg pace"];
  
  return headers.map((header) => (
    <div key={header} className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
      <div className="flex gap-2.5 items-center py-2.5 pr-4 pl-5 w-full font-medium text-gray-900 whitespace-nowrap bg-white border-t border-b text-center justify-center border-gray-200 max-sm:px-2">
        <div className="gap-1 self-stretch my-auto ">{header}</div>
      </div>
    </div>
  ));
}

function convertPowerToPace(seconds, sport) {
  if (sport === "bike") {
    // Pro kolo vrátíme původní hodnotu výkonu ve wattech
    return `${seconds} W`;
  }

  // Převeďme celkový čas v sekundách na minuty a sekundy
  const minutes = Math.floor(seconds / 60); // Celkové minuty
  const remainingSeconds = seconds % 60; // Zbytek sekund

  // Formátování na mm:ss (přidáme nulu, pokud jsou sekundy jednociferné)
  const formattedPace = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

  if (sport === "run") {
    return `${formattedPace} min/km`; // Pro běh
  } else if (sport === "swim") {
    return `${formattedPace} min/100m`; // Pro plavání
  } else {
    return formattedPace; // Default pro jiné sporty
  }
}

export default function TrainingTable({ trainings, selectedSport }) {
  if (!trainings || trainings.length === 0) {
    return <div className="text-center py-4">No trainings available</div>;
  }

  // Filtrujeme tréninky podle sportu a seřadíme podle data
  const filteredTrainings = trainings
    .filter(t => selectedSport === 'all' || t.sport === selectedSport)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);  // Omezíme na posledních 6 tréninků

  const formattedTrainings = filteredTrainings.map((item, index, array) => {
    const averagePower = Math.round(
      item.results.reduce((sum, r) => sum + r.power, 0) / item.results.length
    );

    // Porovnání s předchozím tréninkem stejného typu
    const previousTraining = array
      .slice(index + 1)
      .find(t => t.title === item.title);
    
    let status = "same";
    if (previousTraining) {
      const previousPower = Math.round(
        previousTraining.results.reduce((sum, r) => sum + r.power, 0) / 
        previousTraining.results.length
      );
      if (averagePower > previousPower) status = "up";
      else if (averagePower < previousPower) status = "down";
    }

    const pace = convertPowerToPace(averagePower, item.sport);

    return {
      training: item.title,
      sport: item.sport,
      date: new Date(item.date).toLocaleDateString(),
      averagePace: pace,
      status,
    };
  });

  return (
    <div className="flex flex-col justify-center p-5 bg-white rounded-3xl shadow-md h-full">
      <div className="flex flex-col w-full max-md:max-w-full">
        <div className="flex flex-col px-5 pb-3.5 w-full max-md:max-w-full">
          <div className="flex flex-wrap gap-10 items-center w-full max-md:max-w-full">
            <div className="flex-1 shrink self-stretch my-auto text-lg font-semibold leading-loose text-gray-900 basis-3.5">
              View last trainings
            </div>
            <button 
              onClick={() => window.location.href = "/training"}
              className="flex overflow-hidden gap-1 items-center self-stretch py-0.5 pl-3.5 my-auto text-base text-blue-500 bg-white rounded min-h-[28px]"
            >
              <div className="self-stretch my-auto">View more</div>
              <img
                loading="lazy"
                src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/d5620c00b89d258c2df851956089e1cf63163537c904e90b0ae529b03aba7f72?"
                alt=""
                className="object-contain shrink-0 self-stretch my-auto w-4 aspect-square"
              />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-y-2 w-full text-base text-gray-600">
          <TableHeader />
          {formattedTrainings.map((training, index) => (
            <TrainingRow key={index} {...training} />
          ))}
        </div>
      </div>
    </div>
  );
}
