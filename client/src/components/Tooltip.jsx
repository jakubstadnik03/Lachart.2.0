import * as React from "react";

function Tooltip({ watts, bpm, mmol }) {
  return (
    <div className="flex flex-col text-xs text-center rounded-none max-w-[92px] text-stone-500">
      <div className="flex flex-col justify-center items-center px-3 py-2 bg-white rounded-lg border border-solid border-slate-100 shadow-[0px_12px_20px_rgba(0,0,0,0.1)]">
        <div className="font-semibold text-gray-900">Avg: {watts}W</div>
        <div>Avg: {bpm} Bpm</div>
        <div>Avg: {mmol} mmol/L</div>
      </div>
      <div className="flex shrink-0 self-center mt-5 w-3.5 bg-violet-500 rounded-full border-solid border-[3px] border-zinc-50 fill-violet-500 h-[11px] stroke-[3px] stroke-zinc-50" />
    </div>
  );
}

export default Tooltip;