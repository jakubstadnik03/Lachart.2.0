import React from "react";
import Menu from "../components/Menu";

const MainPage = () => {
  // Mockovaný přihlášený uživatel (trenér nebo sportovec)
  const loggedInUserId = "user1"; // Trenér (user1)

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Menu komponenta vlevo */}
      <div className="w-64">
        <Menu loggedInUserId={loggedInUserId} />
      </div>

      {/* Hlavní obsah */}
      <div className="flex-grow p-6">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Welcome to LaChart
        </h1>
        <p className="text-lg text-gray-700">
          Select an option from the menu to start working with your athletes.
        </p>
      </div>
    </div>
  );
};

export default MainPage;
