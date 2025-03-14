import * as React from "react";
import { useState } from "react";


function SportButton({ sport, isSelected, onClick }) {
  return (
    <div
      className="gap-3 self-stretch px-3 py-1.5 my-auto rounded-md cursor-pointer"
      onClick={() => onClick(sport)}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      style={{
          backgroundColor: isSelected ? "#FCFCFC" : "#F3F3F3",
          color: "#686868",
      }}
    >
      {sport}
    </div>
  );
}
function NotificationBadge({ isActive, onToggle }) {
  const sports = ["Cycling", "Running", "Swimming"];
  const [selectedSport, setSelectedSport] = useState("cycling");
  function selectSport(sport) {
    setSelectedSport(sport.toLowerCase());
  }
  return (
   <div className="flex justify-between items-center">
      <div className="flex gap-1.5 items-center self-stretch p-1.5 my-auto ml-5 text-xs text-center whitespace-nowrap rounded-md bg-zinc-100 min-w-[240px] text-stone-500 w-[247px]">
     
    </div>
      <div className="flex flex-col items-center pb-2  text-sm text-stone-500 ">
        <div className="flex flex-col justify-center items-center pr-5 py-px ">
          <button
            onClick={onToggle}
            className={`flex gap-1.5 items-center p-2.5 rounded-md border border-violet-500 border-solid
              ${isActive ? "bg-violet-500 text-white" : "text-stone-500"}`}
            role="status"
            aria-live="polite"
          >
            <img
              loading="lazy"
              src="https://cdn.builder.io/api/v1/image/assets/069fe6e63e3c490cb6056c51644919ef/1f3e5714fd003d23eeb1cf388e748fcbf9c42f1adb8928e52365015a031e63ad?apiKey=f26ef201ae1f4d94a4c50b4406b07044&"
              className={`object-contain shrink-0 self-stretch my-auto w-6 aspect-square
                ${isActive ? "brightness-0 invert" : ""}`}
              alt=""
              aria-hidden="true"
            />
            <div className="self-stretch my-auto w-[104px]">
              {isActive ? "Hide testing" : "New testing"}
            </div>
          </button>
        </div>
      </div>
   </div>
  );
}

export default NotificationBadge;
