import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { mockUsers } from "../mock/users";

const Menu = ({ loggedInUserId }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(true); // Stav menu (otevřené/skryté)

  const loggedInUser = mockUsers.find((user) => user._id === loggedInUserId);

  if (!loggedInUser) {
    return <p>No user found. Please log in.</p>;
  }

  const athleteList =
    loggedInUser.role === "coach"
      ? mockUsers.filter((user) => user.coachId === loggedInUserId)
      : [];

  return (
    <div className="absolute md:fixed z-[999]">
      {/* Tlačítko Toggle pro mobil */}
      <button
        className="absolute top-4 left-4 z-50 bg-white p-2 rounded-md shadow-md md:hidden"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
      >
        <img src="/icon/toggle.svg" alt="Toggle Menu" className="w-6 h-6" />
      </button>

      {/* Menu */}
      <div
        className={`h-screen w-m-64 bg-white shadow-md flex flex-col font-sans transform transition-transform duration-300 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo a název */}
        <div className="flex items-center justify-center h-16">
          <img
            src="/icon/logo.svg"
            alt="LaChart Logo"
            className="w-8 h-8 mr-2"
          />
          <h1 className="text-xl font-bold text-primary">LaChart</h1>
        </div>

        {/* Profil uživatele */}
        <div className="p-4 flex items-center border-b border-gray-200">
          <img
            src="/icon/user-avatar.svg"
            alt="User Avatar"
            className="w-12 h-12 rounded-full"
          />
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-800">
              {loggedInUser.name} {loggedInUser.surname}
            </p>
            <p className="text-xs text-gray-500">{loggedInUser.email}</p>
          </div>
        </div>

        {/* Menu navigace */}
        <div className="p-4">
          <h2 className="text-lg text-gray-700 mb-3">Menu</h2>
          <ul className="space-y-2">
            {[
              {
                name: "Dashboard",
                icon: "/icon/dashboard.svg",
                iconWhite: "/icon/dashboard-white.svg",
                path: "/dashboard",
              },
              {
                name: "Testing",
                icon: "/icon/testing.svg",
                iconWhite: "/icon/testing-white.svg",
                path: "/testing",
              },
              {
                name: "Training",
                icon: "/icon/training.svg",
                iconWhite: "/icon/training-white.svg",
                path: "/training",
              },
              {
                name: "Athletes",
                icon: "/icon/athletes.svg",
                iconWhite: "/icon/athletes-white.svg",
                path: "/athletes",
              },
              {
                name: "Profile",
                icon: "/icon/profile.svg",
                iconWhite: "/icon/profile-white.svg",
                path: "/profile",
              },
            ].map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center text-sm font-medium p-3 rounded-lg ${
                      isActive
                        ? "bg-primary text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`
                  }
                >
                  {/* Dynamická změna ikony */}
                  {({ isActive }) => (
                    <>
                      <img
                        src={isActive ? item.iconWhite : item.icon}
                        alt={`${item.name} Icon`}
                        className="w-5 h-5 mr-3"
                      />
                      {item.name}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* Seznam sportovců */}
        {loggedInUser.role === "coach" && (
          <div className="p-4">
            <h2 className="text-sm font-bold text-gray-700 mb-3">
              Athletes List
            </h2>
            <ul className="space-y-2">
              {athleteList.map((athlete) => (
                <li
                  key={athlete._id}
                  className="text-sm font-medium text-gray-700 hover:text-purple-600 cursor-pointer"
                >
                  {athlete.name} {athlete.surname}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Další odkazy */}
        <div className="p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Other</h2>
          <ul className="space-y-2">
            <li>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center text-sm font-medium p-3 rounded-lg ${
                    isActive
                      ? "bg-primary text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <img
                      src={isActive ? "/icon/settings-white.svg" : "/icon/settings.svg"}
                      alt="Settings"
                      className="w-5 h-5 mr-3"
                    />
                    Settings
                  </>
                )}
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/support"
                className={({ isActive }) =>
                  `flex items-center text-sm font-medium p-3 rounded-lg ${
                    isActive
                      ? "bg-primary text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <img
                      src={isActive ? "/icon/support-white.svg" : "/icon/support.svg"}
                      alt="Support"
                      className="w-5 h-5 mr-3"
                    />
                    Support
                  </>
                )}
              </NavLink>
            </li>
          </ul>
        </div>

        {/* Tlačítko Logout */}
        <div className="p-4 mt-auto space-y-2">
          <ul>
            <li>
              <NavLink className="flex items-center w-full text-sm font-medium p-3 rounded-lg hover:text-red-600">
                <img
                  src="/icon/logout.svg"
                  alt="Logout"
                  className="w-5 h-5 mr-3"
                />
                Log Out
              </NavLink>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Menu;
