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

  const renderWorkoutRow = ({ id, interval, power, heartRate, RPE, lactate }) => {
    const isLastRow = id === 4;
    const borderClass = isLastRow ? '' : 'border-solid border-b-[0.3px] border-b-stone-500';
    const efficiencyColor = lactate < 2.5 ? 'text-red-700 bg-red-600' : 'text-green-600 bg-green-600';

    return (
      <div key={id} className={`flex gap-6 items-center py-1.5 w-full ${borderClass} max-w-[468px] `}>
        <div className="self-stretch my-auto w-20 text-center">{interval}</div>
        <div className="self-stretch my-auto w-20 text-center">{power}</div>
        <div className="flex gap-0.5 items-center self-stretch my-auto">
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/a8b365ad7ccf1466c38d227be8da3cc68edda93357cc91f89de840d723c70bb4?apiKey=f26ef201ae1f4d94a4c50b4406b07044&"
            className="object-contain shrink-0 self-stretch my-auto aspect-square w-[18px]"
            alt=""
          />
          <div className="self-stretch my-auto w-[60px]">{heartRate}</div>
        </div>
        <div className="flex gap-0.5 items-center self-stretch my-auto text-blue-500">
          <img
            loading="lazy"
            src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/560435bfa3d998398c37040f6c6463c35a70154d9fd9cd3f0f8d73ae6ed91ab4?placeholderIfAbsent=true"
            className="object-contain shrink-0 self-stretch my-auto aspect-square w-[18px]"
            alt=""
          />
          <div className="self-stretch my-auto w-[60px]">{RPE}</div>
        </div>
        <div className={`flex gap-1 items-center self-stretch p-1 my-auto w-12 text-xs text-center ${efficiencyColor} bg-opacity-10 rounded-md`}>
          <img
            loading="lazy"
            src={`http://b.io/ext_${lactate < 2.5 ? '7' : '4'}-`}
            className="object-contain shrink-0 self-stretch my-auto w-3 aspect-square"
            alt=""
          />
          <div className="self-stretch my-auto w-6">{lactate}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-wrap gap-6 items-center px-2.5 py-1.5 w-full border-solid bg-zinc-50 border-b-[0.3px] border-b-stone-500  m-5 ">
      <div className=" shrink self-stretch my-auto">{date}</div>
      <div className="flex  shrink self-stretch py-2 my-auto w-16 h-[38px]">
        <div className="flex gap-2.5 items-center">
          <img
            loading="lazy"
            src={getSportIcon(sport)}
            className="object-fill overflow-hidden w-8 h-8 aspect-square"
            alt={sport}
          />
        </div>
      </div>
      <div className=" shrink self-stretch my-auto w-16">{title}</div>
      <div className="flex flex-col  shrink justify-center self-stretch my-auto whitespace-nowrap min-w-[240px] w-[452px] ">
        {results.map(renderWorkoutRow)}
      </div>
      <div className="flex gap-5 items-center self-stretch my-auto min-w-[240px]">
        <div className="self-stretch my-auto w-20">{specifics.specific}</div>
        <div className="self-stretch my-auto w-20">{specifics.weather}</div>
        <div className="my-auto w-[104px]">{comments}</div>
      </div>
    </div>
  );
};

export default TrainingItem;
