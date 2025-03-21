import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';

const Menu = ({ isMenuOpen, setIsMenuOpen }) => {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const { user, token, logout } = useAuth();
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const loadAthletes = async () => {
      if (user?.role === "coach") {
        try {
          const response = await api.get('/user/coach/athletes');
          setAthletes(response.data);
          if (!selectedAthleteId && response.data.length > 0) {
            setSelectedAthleteId(response.data[0]._id);
          }
        } catch (error) {
          console.error('Error loading athletes:', error);
        }
      }
    };

    if (user && token) {
      loadAthletes();
    }
  }, [user, token, selectedAthleteId]);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsMenuOpen(false);
    }
  }, [location.pathname, setIsMenuOpen]);

  const handleMenuItemClick = () => {
    if (window.innerWidth < 768) {
      setIsMenuOpen(false);
    }
  };

  const handleAthleteClick = (athleteId) => {
    setSelectedAthleteId(athleteId);
    navigate(`/dashboard/${athleteId}`);
    if (window.innerWidth < 768) {
      setIsMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/user/logout');
      logout();
      setIsMenuOpen(false);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Funkce pro určení avataru podle role a sportu
  const getAvatar = (user) => {
    if (user.role === 'coach') {
      return '/images/coach-avatar.webp';
    }
    
    const sportAvatars = {
      triathlon: '/images/triathlete-avatar.jpg',
      running: '/images/runner-avatar.jpg',
      cycling: '/images/cyclist-avatar.webp',
      swimming: '/images/swimmer-avatar.jpg'
    };

    return user.avatar || sportAvatars[user.sport?.toLowerCase()] || '/images/triathlete-avatar.jpg';
  };

  // Definice položek menu s dynamickými cestami pro trenéra
  const menuItems = [
    {
      name: "Dashboard",
      getPath: (athleteId) => user?.role === "coach" && athleteId ? `/dashboard/${athleteId}` : "/dashboard",
      icon: "/icon/dashboard.svg",
      iconWhite: "/icon/dashboard-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Training",
      getPath: (athleteId) => user?.role === "coach" && athleteId ? `/training/${athleteId}` : "/training",
      icon: "/icon/training.svg",
      iconWhite: "/icon/training-white.svg",
      showFor: ["coach", "athlete"]
    },
    {
      name: "Testing",
      getPath: (athleteId) => user?.role === "coach" && athleteId ? `/testing/${athleteId}` : "/testing",
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
    <>
      <div 
        ref={menuRef}
        className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-white shadow-md flex flex-col font-sans transform transition-transform duration-300 ease-in-out z-40 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Logo a název */}
        <div className="flex items-center justify-center h-16 border-b border-gray-200">
          <img src="/icon/logo.svg" alt="LaChart Logo" className="w-8 h-8 mr-2" />
          <h1 className="text-xl font-bold text-primary">LaChart</h1>
        </div>

        {/* Profil uživatele */}
        <div className="p-4 flex items-center border-b border-gray-200">
          <img
            src={getAvatar(user)}
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
                    to={item.getPath ? item.getPath(selectedAthleteId) : item.path}
                    onClick={handleMenuItemClick}
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
                    className={`w-full text-left flex items-center p-2 rounded-lg text-sm font-medium ${
                      selectedAthleteId === athlete._id
                        ? "bg-violet-100 text-violet-700"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <img
                      src={getAvatar(athlete)}
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
      
      {/* Overlay pro mobilní menu */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-30"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </>
  );
};

export default Menu;
