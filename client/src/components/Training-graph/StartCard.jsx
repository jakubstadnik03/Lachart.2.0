import React from "react";

interface StartCardProps {
  stats: { label: string; value: string; unit: string }[];
}

export default function StatCard({ stats }: StartCardProps) {
  return (
    <div className="flex flex-col text-xs rounded-none max-w-[192px]">
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
