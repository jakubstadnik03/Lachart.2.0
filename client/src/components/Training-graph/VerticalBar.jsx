import React, { useState } from "react";
import StatCard from "./StartCard";

interface VerticalBarProps {
  height: number;
  color: string;
  power: number;
  heartRate: number;
}

export function VerticalBar({ height, color, power, heartRate }: VerticalBarProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative flex justify-end shrink-0 w-2.5 rounded-md"
      style={{ height: `${height}px`, backgroundColor: color }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
         <div
      className={`flex justify-end shrink-0 w-2.5 rounded-md ${color}`}
      style={{ height: `${height}px` }} // Inline styl pro výšku
    />
      {/* Tooltip se zobrazuje jen při hover */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 z-50 " style={{marginBottom: "-10px", minWidth: "120px" }}>
          <StatCard
            stats={[
              { label: "Avg", value: `${power}`, unit: "W" },
              { label: "Avg", value: `${heartRate}`, unit: "Bpm" },
              { label: "Avg", value: `${(power / 100).toFixed(1)}`, unit: "mmol/L" }, // Fiktivní hodnota
            ]}
          />
        </div>
      )}
    </div>
  );
}
