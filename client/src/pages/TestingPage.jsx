// src/pages/TestingPage.js
import React from "react";
import Menu from "../components/Menu";

const TestingPage = () => {
  const loggedInUserId = "user1"; // Mockovaný přihlášený uživatel

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Menu vlevo */}
      <div className="w-64">
        <Menu loggedInUserId={loggedInUserId} />
      </div>

      {/* Obsah stránky */}
      <div className="flex-grow p-6">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Testing</h1>
        <p className="text-lg text-gray-700">
          Welcome to the Testing page! Select an option from the menu to
          continue.
        </p>
      </div>
    </div>
  );
};

export default TestingPage;
