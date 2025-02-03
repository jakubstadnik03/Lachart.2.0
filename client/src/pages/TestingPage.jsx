// src/pages/TestingPage.js
import React from "react";
import Menu from "../components/Menu";
import NewTestingButton from "../components/Testing-page/NewTestingButton";
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
const TestingPage = () => {
  const loggedInUserId = "user1"; // Mockovaný přihlášený uživatel

  return (
    <div>
      <SportsSelector />
      <NewTestingButton />
      <PreviousTestingComponent />
    </div>
  );
};

export default TestingPage;
