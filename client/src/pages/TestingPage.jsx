import React, { useState } from "react";
import Menu from "../components/Menu";
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import NewTestingComponent from "../components/Testing-page/NewTestingComponent";
import NotificationBadge from "../components/Testing-page/NotificationBadge";

const TestingPage = () => {
  const [showNewTesting, setShowNewTesting] = useState(false);
  const [selectedSport, setSelectedSport] = useState("all");

  // Upravený seznam sportů podle hodnot v mockTests
  const sports = [
    { id: "all", name: "All Sports" },
    { id: "run", name: "Running" },
    { id: "bike", name: "Cycling" },
    { id: "swim", name: "Swimming" },
    { id: "strength", name: "Strength" },
  ];

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        {/* Sports Selector */}
        <div className="flex-1">
          <SportsSelector
            sports={sports}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
          />
        </div>

        {/* Notification Badge */}
        <div className="ml-4">
          <NotificationBadge
            isActive={showNewTesting}
            onToggle={() => setShowNewTesting((prev) => !prev)}
          />
        </div>
      </div>

      {/* Nové testování */}
      {showNewTesting && (
        <div className="mb-6">
          <NewTestingComponent selectedSport={selectedSport} />
        </div>
      )}

      {/* Předchozí testy */}
      <PreviousTestingComponent selectedSport={selectedSport} />
    </div>
  );
};

export default TestingPage;
