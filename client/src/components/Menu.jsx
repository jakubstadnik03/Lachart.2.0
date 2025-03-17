import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from '../context/AuthProvider';
import { API_ENDPOINTS } from '../config/api.config';

const Menu = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [athletes, setAthletes] = useState([]);
  const { user, token, logout } = useAuth();
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Načtení atletů pro trenéra
  useEffect(() => {
    const loadAthletes = async () => {
      if (user?.role === "coach") {
        try {
          const response = await fetch(API_ENDPOINTS.COACH_ATHLETES, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch athletes');
          }

          const data = await response.json();
          setAthletes(data);
        } catch (error) {
          console.error('Error loading athletes:', error);
        }
      }
    };

    if (user && token) {
      loadAthletes();
    }
  }, [user, token]);

  // Kliknutí mimo menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !event.target.closest('.menu-toggle-button')
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMenuOpen]);

  if (!user) {
    return null;
  }

  const handleAthleteClick = (athleteId) => {
    navigate(`/athlete/${athleteId}`);
    setIsMenuOpen(false);
  };

  const handleLogout = async () => {
    console.log('Logout started');
    try {
      const authToken = token;
      console.log('Token:', authToken);

      const response = await fetch('http://localhost:8000/user/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Logout response:', response);

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      // Vyčistit lokální stav
      logout();
      setIsMenuOpen(false);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Definice položek menu
  const menuItems = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: "/icon/dashboard.svg",
      iconWhite: "/icon/dashboard-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Training",
      path: "/training",
      icon: "/icon/training.svg",
      iconWhite: "/icon/training-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Testing",
      path: "/testing",
      icon: "/icon/testing.svg",
      iconWhite: "/icon/testing-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Athletes",
      path: "/athletes",
      icon: "/icon/athletes.svg",
      iconWhite: "/icon/athletes-white.svg",
      showFor: ["coach"]
    },
    {
      name: "Profile",
      path: "/profile",
      icon: "/icon/profile.svg",
      iconWhite: "/icon/profile-white.svg",
      showFor: ["coach", "athlete"]
    }
  ];

  return (
    <div className="h-screen sticky top-0">
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
        className={`h-full w-64 bg-white shadow-md flex flex-col font-sans fixed transform transition-transform duration-300 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo a název */}
        <div className="flex items-center justify-center h-16">
          <img src="/icon/logo.svg" alt="LaChart Logo" className="w-8 h-8 mr-2" />
          <h1 className="text-xl font-bold text-primary">LaChart</h1>
        </div>

        {/* Profil uživatele */}
        <div className="p-4 flex items-center border-b border-gray-200">
          <img
            src={user.avatar || "/icon/user-avatar.svg"}
            alt="User Avatar"
            className="w-12 h-12 rounded-full"
          />
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-800">
              {user.name} {user.surname}
            </p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
        </div>

        {/* Menu navigace */}
        <div className="p-4">
          <h2 className="text-lg text-gray-700 mb-3">Menu</h2>
          <ul className="space-y-2">
            {menuItems
              .filter(item => item.showFor.includes(user.role))
              .map((item) => (
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
                    {({ isActive }) => (
                      <>
                        <img
                          src={isActive ? item.iconWhite : item.icon}
                          alt={item.name}
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

        {/* Seznam atletů - pouze pro trenéry */}
        {user.role === "coach" && athletes.length > 0 && (
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
                      src={athlete.avatar || "/icon/user-avatar.svg"}
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
        <div className="mt-auto">
          <div className="p-4 border-t border-gray-200">
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

          {/* Logout tlačítko */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="flex items-center w-full text-sm font-medium p-3 rounded-lg text-red-600 hover:bg-red-50"
            >
              <img
                src="/icon/logout.svg"
                alt="Logout"
                className="w-5 h-5 mr-3"
              />
              Odhlásit se
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Menu;
