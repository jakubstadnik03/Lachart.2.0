import React from 'react';

const TrainingItem = ({ training }) => {
  console.log(training);
  if (!training) return null;
  const { date, title, specifics, comments, results, sport } = training;

  const getSportIcon = (sport) => {
    switch (sport) {
      case 'run':
        return 'icon/run.svg';
      case 'bike':
        return 'icon/bike.svg';
      case 'swim':
        return 'icon/swim.svg';
      default:
        return 'icon/default.svg';
    }
  };
  const getStatusIcon = (status) => {
    const icons = {
      up: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/ca42b61d339a69e3bb2cc02efb61369c67cfc2f39658e99e5d576df14fcdfcd9?",
      down: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/03f5e1c239b86d526fe7a81e7008e0b47bb861a21531b26f903e6750497c90ce?",
      same: "https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/5624a86d3c88d3562872dd0f15221eca4dabce973c1983cf98dd06cde908b9ee?"
    };
    return icons[status];
  };
  const getLactateStatus = (current, previous) => {
    if (previous === undefined) return "same"; // První hodnota nemá s čím srovnat
    return current > previous ? "up" : current < previous ? "down" : "same";
  };
  
  const renderWorkoutRow = (workout, index, array) => {
    const isLastRow = index === array.length - 1;
    const borderClass = isLastRow ? '' : 'border-solid border-b-[0.3px] border-b-[#686868]';
    
    const prevLactate = index > 0 ? array[index - 1].lactate : undefined;
    const lactateStatus = getLactateStatus(workout.lactate, prevLactate);
    const lactateIcon = lactateStatus !== "same" ? getStatusIcon(lactateStatus) : null; // Skryje ikonu pokud je "same"
  
    // Nastavení barvy podle trendu laktátu
    const efficiencyColor = lactateStatus === "down" 
      ? "text-red-700 bg-red-600"  // Laktát roste → červená
      : lactateStatus === "up"
      ? "text-green-600 bg-green-600"  // Laktát klesá → zelená
      : "text-gray-500 bg-gray-400"; // Stejný → šedá
  
    return (
      <div key={workout.interval} className={`grid grid-cols-5 justify-items-center w-full items-center py-1.5 ${borderClass} text-[#686868]`}>
        <div className="self-stretch my-auto w-20 text-center">{workout.interval}</div>
        <div className="self-stretch my-auto w-20 text-center">{workout.power}</div>
        <div className="flex gap-0.5 items-center self-stretch my-auto">
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/a8b365ad7ccf1466c38d227be8da3cc68edda93357cc91f89de840d723c70bb4?"
            className="object-contain shrink-0 self-stretch my-auto aspect-square w-[18px]"
            alt=""
          />
          <div className="self-stretch my-auto ">{workout.heartRate}</div>
        </div>
        <div className="flex gap-0.5 items-center self-stretch my-auto text-blue-500">
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/560435bfa3d998398c37040f6c6463c35a70154d9fd9cd3f0f8d73ae6ed91ab4?"
            className="object-contain shrink-0 self-stretch my-auto aspect-square w-[18px]"
            alt=""
          />
          <div className="self-stretch my-auto">{workout.RPE}</div>
        </div>
        <div className={`flex gap-1 items-center self-stretch p-1 my-auto w-12 text-xs justify-end text-center ${efficiencyColor} bg-opacity-10 rounded-md`}>
        {lactateIcon &&  <img
            loading="lazy"
            src={lactateIcon} // Dynamická šipka podle trendu laktátu
            className="object-contain shrink-0 self-stretch my-auto w-3 aspect-square"
            alt=""
          /> }
          <div className="self-stretch my-auto w-6 ">{workout.lactate}</div>
        </div>
      </div>
    );
  };
  
  
  
  return (
    <div className="grid justify-items-center grid-cols-11 flex-wrap p-2 items-center w-full border-solid bg-custom-gray border-b-[0.3px] border-b-[#686868] text-[#686868]">
      <div className=" shrink self-stretch my-auto">{date}</div>
      <div className="  shrink self-stretch  my-auto ">
          <img
            loading="lazy"
            src={getSportIcon(sport)}
            className="object-fill overflow-hidden w-8 h-8 aspect-square"
            alt={sport}
          />
      </div>
      <div className=" shrink self-stretch my-auto">{title}</div>
      <div className="flex flex-col col-span-5 w-full shrink justify-center self-stretch my-auto whitespace-nowrap min-w-[240px] ">
      {results.map((workout, index, array) => renderWorkoutRow(workout, index, array))}
      </div>

        <div className="self-stretch my-auto ">{specifics.specific}</div>
        <div className="self-stretch my-auto ">{specifics.weather}</div>
        <div className="my-auto text-sm">{comments}</div>

    </div>
  );
};

export default TrainingItem;
