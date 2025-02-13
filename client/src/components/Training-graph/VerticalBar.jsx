import React, { useState } from "react";

interface VerticalBarProps {
  height: number;
  color: string;
  power: number;
  heartRate: number;
}
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
export function VerticalBar({ height, color, power, heartRate, lactate }: VerticalBarProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative flex justify-end shrink-0 w-3 rounded-md z-10"
      style={{ height: `${height}px`, backgroundColor: color }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
         <div
      className={`flex justify-end shrink-0 w-3 rounded-md ${color}`}
      style={{ height: `${height}px` }} // Inline styl pro výšku
    />
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
    </div>
  );
}
