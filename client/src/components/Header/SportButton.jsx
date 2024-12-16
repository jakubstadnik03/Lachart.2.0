import * as React from "react";

export default function SportButton({ sport, isSelected, onClick }) {
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