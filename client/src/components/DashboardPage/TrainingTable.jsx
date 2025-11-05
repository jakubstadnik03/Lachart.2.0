import React, { useState, useRef, useEffect } from "react";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

function TrainingRow({ training, trainingId, sport, date, averagePace, status, onTrainingClick }) {
  // Omezíme délku názvu tréninku na 20 znaků
  const truncatedTraining = training.length > 18 ? training.substring(0, 18) + '..' : training;

  const getStatusIcon = (status) => {
    const icons = {
      up: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/ca42b61d339a69e3bb2cc02efb61369c67cfc2f39658e99e5d576df14fcdfcd9?",
      down: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/03f5e1c239b86d526fe7a81e7008e0b47bb861a21531b26f903e6750497c90ce?",
    };
    return icons[status];
  };

  const getBackgroundColor = (status) => {
    const colors = {
      up: "bg-green-500 text-green bg-opacity-10",
      down: "bg-red-500 text-red-500 bg-opacity-10",
      same: "bg-gray-200 text-gray-600"
    };
    return colors[status];
  };

  return (
    <>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
        <div 
          className="self-stretch py-1.5 sm:py-2.5 px-1 w-full text-xs sm:text-sm font-semibold border-b text-center border-gray-200 cursor-pointer hover:bg-blue-50 hover:text-secondary transition-colors duration-200"
          onClick={() => onTrainingClick(training, trainingId)}
        >
          {truncatedTraining}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto whitespace-nowrap basis-0">
        <div className="self-stretch px-1 sm:px-4 py-1.5 sm:py-2.5 w-full border-b text-center border-gray-200 text-xs sm:text-sm">
          {sport.substring(0, 4)}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto basis-0">
        <div className="self-stretch px-1 sm:px-4 py-1.5 sm:py-2.5 w-full border-b text-center border-gray-200 text-xs sm:text-sm">
          {date}
        </div>
      </div>
      <div className="flex flex-col flex-1 shrink justify-center self-stretch my-auto text-xs sm:text-sm text-green-600 basis-0">
        <div className="flex justify-center items-center py-1.5 sm:py-1.5 w-full text-center border-b border-gray-200">
          <div
            className={`flex gap-1 items-center self-stretch p-0.5 sm:p-1 my-auto rounded-md ${getBackgroundColor(
              status
            )}`}
          >
            {status !== "same" && (
              <img
                loading="lazy"
                src={getStatusIcon(status)}
                alt=""
                className="object-contain shrink-0 self-stretch my-auto w-2 sm:w-3 aspect-square"
              />
            )}
            <div className="self-stretch my-auto text-xs sm:text-sm">{averagePace}</div>
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
      <div className="flex gap-1 sm:gap-2.5 items-center py-1.5 sm:py-2.5 px-1 sm:px-4 w-full font-medium text-gray-900 whitespace-nowrap bg-white border-t border-b text-center justify-center border-gray-200 text-xs sm:text-sm">
        <div className="gap-1 self-stretch my-auto">{header}</div>
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

export default function TrainingTable({ trainings = [], selectedSport = 'all', onSportChange }) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(6);
  const settingsRef = useRef(null);
  const navigate = useNavigate();

  const handleSportChange = (sport) => {
    if (onSportChange) {
      onSportChange(sport);
    }
  };

  const handleTrainingClick = (trainingTitle, trainingId) => {
    // Navigate to Fit Analysis page with training ID
    navigate(`/fit-analysis?trainingId=${trainingId}&title=${encodeURIComponent(trainingTitle)}`);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!trainings || trainings.length === 0) {
    return <div className="text-center py-4">No trainings available</div>;
  }

  // Filtrujeme tréninky podle sportu a seřadíme podle data
  const filteredTrainings = trainings
    .filter(t => selectedSport === 'all' || t.sport === selectedSport)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, displayCount);  // Použijeme nastavený počet tréninků

  const formattedTrainings = filteredTrainings.map((item, index, array) => {
    const averagePower = Math.round(
      item.results.reduce((sum, r) => sum + (parseFloat(r.power) || 0), 0) / 
      item.results.length
    );

    // Porovnání s předchozím tréninkem stejného typu
    const previousTraining = array
      .slice(index + 1)
      .find(t => t.title === item.title);
    
    let status = "same";
    if (previousTraining) {
      const previousPower = Math.round(
        previousTraining.results.reduce((sum, r) => sum + (parseFloat(r.power) || 0), 0) / 
        previousTraining.results.length
      );
      if (averagePower > previousPower) status = "up";
      else if (averagePower < previousPower) status = "down";
    }

    const pace = convertPowerToPace(averagePower, item.sport);

    return {
      training: item.title,
      trainingId: item._id, // Add training ID for navigation
      sport: item.sport,
      date: new Date(item.date).toLocaleDateString(),
      averagePace: pace,
      status,
    };
  });

  return (
    <div className="flex flex-col justify-start p-2 sm:p-5 bg-white rounded-3xl shadow-md h-full">
      <div className="flex flex-col w-full max-md:max-w-full">
        <div className="flex flex-col px-2 sm:px-5 pb-2 sm:pb-3.5 w-full max-md:max-w-full">
          <div className="flex flex-wrap gap-3 sm:gap-10 items-center w-full max-md:max-w-full">
            <div className="flex-1 shrink self-stretch my-auto text-base sm:text-lg font-semibold leading-loose text-gray-900 basis-3.5">
              View last trainings
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
             
              <button 
                onClick={() => window.location.href = "/training"}
                className="flex overflow-hidden gap-1 items-center self-stretch py-0.5  my-auto text-xs sm:text-base text-secondary bg-white rounded min-h-[24px] sm:min-h-[28px]"
              >
                <div className="self-stretch my-auto">View more</div>
                <img
                  loading="lazy"
                  src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/d5620c00b89d258c2df851956089e1cf63163537c904e90b0ae529b03aba7f72?"
                  alt=""
                  className="object-contain shrink-0 self-stretch my-auto w-3 sm:w-4 aspect-square"
                />
              </button>
              <div className="relative" ref={settingsRef}>
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="p-1 sm:p-2 hover:bg-gray-100 rounded-full"
                >
                  <EllipsisVerticalIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                </button>
                
                {isSettingsOpen && (
                  <div className="absolute right-0 mt-2 w-40 sm:w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-2">
                      <div className="mb-2 sm:mb-3">
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Sport</label>
                        <select 
                          className="w-full border rounded-lg px-2 sm:px-3 py-1 text-gray-600 text-xs sm:text-sm"
                          value={selectedSport}
                          onChange={(e) => handleSportChange(e.target.value)}
                        >
                          <option value="all">All Sports</option>
                          {['bike', 'run', 'swim'].map((sport) => (
                            <option key={sport} value={sport}>
                              {sport.charAt(0).toUpperCase() + sport.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Number of trainings</label>
                        <select 
                          className="w-full border rounded-lg px-2 sm:px-3 py-1 text-gray-600 text-xs sm:text-sm"
                          value={displayCount}
                          onChange={(e) => setDisplayCount(Number(e.target.value))}
                        >
                          {[3, 6, 9, 12].map((count) => (
                            <option key={count} value={count}>
                              {count} trainings
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-y-1 sm:gap-y-2 w-full text-xs sm:text-base text-gray-600">
          <TableHeader />
          {formattedTrainings.map((training, index) => (
            <TrainingRow 
              key={index} 
              {...training} 
              onTrainingClick={handleTrainingClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
