const CustomTooltip = ({ tooltip, datasets }) => {
    if (!tooltip?.dataPoints) return null;
  
    const index = tooltip.dataPoints[0]?.dataIndex;
    if (index === undefined) return null;
  
    const interval = index + 1;
    const label = tooltip.dataPoints[0]?.label || "N/A";
    const bpm = datasets[1]?.data?.[index] ?? "N/A";
    const mmol = datasets[0]?.data?.[index] ?? "N/A";
  
    const isNearRightEdge = tooltip.caretX > window.innerWidth * 0.7;
  
    return (
      <div
        className="absolute bg-white shadow-md p-2 rounded-md text-xs text-gray-800 border border-gray-200"
        style={{
          left: tooltip.caretX,
          top: tooltip.caretY,
          minWidth: "110px",
          transform: isNearRightEdge ? "translate(-100%, -120%)" : "translate(-50%, -120%)",
          position: "absolute",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        <div className="font-semibold text-gray-900">{interval}. {label}</div>
        <div className="text-blue-500">Lactate: {mmol} mmol/L</div>
        <div className="text-red-500">Heart Rate: {bpm} Bpm</div>
        <div
          className="absolute w-0 h-0 border-l-4 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-200"
          style={{
            left: "50%",
            bottom: "-8px",
            transform: "translateX(-50%)",
          }}
        ></div>
      </div>
    );
  };
  
  export default CustomTooltip