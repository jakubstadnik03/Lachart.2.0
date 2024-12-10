import React from "react";
import { NavLink } from "react-router-dom";
import { mockUsers } from "../mock/users";

const Menu = ({ loggedInUserId }) => {
  const loggedInUser = mockUsers.find((user) => user._id === loggedInUserId);

  if (!loggedInUser) {
    return <p>No user found. Please log in.</p>;
  }

  const athleteList =
    loggedInUser.role === "coach"
      ? mockUsers.filter((user) => user.coachId === loggedInUserId)
      : [];

  return (
    <div className="h-screen w-64 bg-white shadow-md flex flex-col font-sans">
      {/* Logo a název */}
      <div className="flex items-center justify-center h-16 bg-purple-100">
        <img
          src="/icon/logo.svg"
          alt="LaChart Logo"
          className="w-8 h-8 mr-2"
        />
        <h1 className="text-xl font-bold text-purple-600">LaChart</h1>
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
            { name: "Dashboard", icon: "/icon/dashboard.svg", path: "/dashboard" },
            { name: "Testing", icon: "/icon/testing.svg", path: "/testing" },
            { name: "Training", icon: "/icon/training.svg", path: "/training" },
            { name: "Athletes", icon: "/icon/athletes.svg", path: "/athletes" },
            { name: "Profile", icon: "/icon/profile.svg", path: "/profile" },
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
                <img src={item.icon} alt={`${item.name} Icon`} className="w-5 h-5 mr-3" />
                {item.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* Seznam sportovců */}
      {loggedInUser.role === "coach" && (
        <div className="p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Athletes List</h2>
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
              <img src="/icon/settings.svg" alt="Settings" className="w-5 h-5 mr-3" />
              Settings
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
              <img src="/icon/support.svg" alt="Support" className="w-5 h-5 mr-3" />
              Support
            </NavLink>
          </li>
        </ul>
      </div>

      {/* Tlačítko Logout */}
      <div className="p-4 mt-auto">
        <button className="flex items-center w-full text-red-500 hover:text-red-600">
          <img src="/icon/logout.svg" alt="Logout" className="w-5 h-5 mr-3" />
          Log Out
        </button>
      </div>
    </div>
  );
};

export default Menu;
