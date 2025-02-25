import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { fetchMockAthletes } from "../mock/mockApi";
import { useAuth } from '../context/AuthProvider';

const Menu = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(true); // Stav menu (otevřené/skryté)
  const [athletes, setAthletes] = useState([]); // Nový state pro atlety
  const { logout, currentUser } = useAuth();
  const menuRef = useRef(null);
  const navigate = useNavigate(); // Hook pro navigaci

  // Načtení atletů pro trenéra
  useEffect(() => {
    const loadAthletes = async () => {
      if (currentUser?.role === "coach") {
        const athletesList = await fetchMockAthletes();
        setAthletes(athletesList);
      }
    };
    loadAthletes();
  }, [currentUser]);


  useEffect(() => {
    const handleClickOutside = (event) => {
      // Pokud je menu otevřené a kliknutí je mimo menu a mimo toggle tlačítko
      if (
        isMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !event.target.closest('.menu-toggle-button')
      ) {
        setIsMenuOpen(false);
      }
    };

    // Přidáme event listener
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    // Cleanup při unmount
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMenuOpen]);

  if (!currentUser) {
    return <p>No user found. Please log in.</p>;
  }

  // Funkce pro navigaci na profil atleta
  const handleAthleteClick = (athleteId) => {
    navigate(`/athlete-profile/${athleteId}`);
    setIsMenuOpen(false); // Zavře menu na mobilních zařízeních
  };

  return (
    <div className="fixed z-[999]">
      {/* Tlačítko Toggle pro mobil */}
      <button
        className="menu-toggle-button absolute top-4 left-4 z-50 bg-white p-2 rounded-md shadow-md md:hidden"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
      >
        <img src="/icon/toggle.svg" alt="Toggle Menu" className="w-6 h-6" />
      </button>

      {/* Menu */}
      <div
        ref={menuRef}
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
              {currentUser.name} {currentUser.surname}
            </p>
            <p className="text-xs text-gray-500">{currentUser.email}</p>
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

        {/* Seznam atletů - zobrazí se pouze pro trenéry */}
        {currentUser.role === "coach" && athletes.length > 0 && (
          <div className="p-4 border-t border-gray-200">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Athletes</h2>
            <ul className="space-y-2">
              {athletes.map((athlete) => (
                <li key={athlete._id}>
                  <button
                    onClick={() => handleAthleteClick(athlete._id)}
                    className="w-full text-left flex items-center p-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    <img
                      src="/icon/user-avatar.svg"
                      alt="Athlete"
                      className="w-6 h-6 rounded-full mr-2"
                    />
                    {athlete.name} {athlete.surname}
                  </button>
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

        {/* Přidáme logout tlačítko na konec menu */}
        <div className="mt-auto pt-4 border-t border-gray-200 px-4">
          <button
            onClick={() => {
              logout();
              setIsMenuOpen(false); // Zavřeme menu po odhlášení
            }}
            className="flex items-center w-full text-sm font-medium p-3 rounded-lg text-red-600 hover:bg-red-50"
          >
            <img
              src="/icon/logout.svg"
              alt="Logout Icon"
              className="w-5 h-5 mr-3"
            />
            Odhlásit se
          </button>
        </div>
      </div>
    </div>
  );
};

export default Menu;
