import React, { useState } from "react";
import Menu from "../components/Menu";
import NewTestingButton from "../components/Testing-page/NotificationBadge";
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import NewTestingComponent from "../components/Testing-page/NewTestingComponent";
import NotificationBadge from "../components/Testing-page/NotificationBadge";

const TestingPage = () => {
  const [showNewTesting, setShowNewTesting] = useState(false);

  return (
    <div className="max-w-[1600px] mx-auto mx-6 ">
      <SportsSelector />
      {/* Tlačítko pro zapnutí/vypnutí testování */}
      <NotificationBadge
        isActive={showNewTesting}
        onToggle={() => setShowNewTesting((prev) => !prev)}
      />
      {/* Zobrazíme jen pokud je aktivní */}
      {showNewTesting && <NewTestingComponent />}
      <PreviousTestingComponent />
    </div>
  );
};

export default TestingPage;
